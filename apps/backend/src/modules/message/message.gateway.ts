import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';

import { env } from '../../config/env.js';
import { originAllowed } from '../../middlewares/csrf.middleware.js';
import type { User } from '../user/user.entity.js';
import { UserRepository } from '../user/user.repository.js';

/** Where the socket lives; the client learns it from `POST /api/messages/ws-ticket`. */
export const WS_PATH = '/api/messages/ws';

const ISSUER = 'jobdev-chat';
const AUDIENCE = 'jobdev-chat-ws';
export const TICKET_TTL_SECONDS = 60;

/**
 * The chat push socket.
 *
 * The browser only ever talks to the frontend origin (Next.js proxies
 * `/api/*` to this server), so it cannot present the session cookie to a
 * socket on this origin — the proxy does not forward WebSocket upgrades.
 * Instead the client asks `/api/messages/ws-ticket` for a 60-second ticket
 * over the normal proxied HTTP path (cookies + CSRF apply there) and presents
 * it in the upgrade request. The socket is read-only push: every command
 * still travels over HTTP, where validation and authorization live.
 *
 * One backend instance → this Map is the whole registry. Running two would
 * mean swapping it for Postgres LISTEN/NOTIFY or Redis.
 */
const sockets = new Map<string, Set<WebSocket>>();

/** Sends one event to every open socket of these users. */
export function publishTo(userIds: Array<string | null | undefined>, event: unknown) {
  const payload = JSON.stringify(event);
  for (const userId of userIds) {
    if (!userId) continue;
    for (const socket of sockets.get(userId) ?? []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
  }
}

/** The pass the client presents on the upgrade request. */
export function signChatTicket(user: Pick<User, 'userId' | 'sessionVersion'>) {
  return jwt.sign({ ver: user.sessionVersion }, env.JWT_SECRET, {
    subject: user.userId,
    expiresIn: TICKET_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
}

function register(socket: WebSocket, userId: string) {
  const mine = sockets.get(userId) ?? new Set<WebSocket>();
  mine.add(socket);
  sockets.set(userId, mine);
  socket.send(JSON.stringify({ type: 'ready' }));

  socket.on('message', (raw) => {
    /* The client only ever sends a heartbeat here; a pong proves the socket
       is still alive through proxies, and keeps the free instance awake. */
    try {
      const frame = JSON.parse(String(raw)) as { type?: string };
      if (frame.type === 'ping' && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
    } catch {
      // Ignore frames we do not understand.
    }
  });
  socket.on('close', () => {
    mine.delete(socket);
    if (!mine.size) sockets.delete(userId);
  });
  socket.on('error', () => socket.close());
}

export function attachChatGateway(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const users = new UserRepository();

  server.on('upgrade', (request, socket, head) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== WS_PATH || !originAllowed(request.headers.origin)) {
        socket.destroy();
        return;
      }
      const userId = await verifyTicket(url.searchParams.get('ticket'), users);
      if (!userId) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => register(ws, userId));
    })();
  });

  /* Protocol pings stop intermediaries from idling a quiet socket out. */
  const keepAlive = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.ping();
    }
  }, 30_000);
  wss.on('close', () => clearInterval(keepAlive));
}

/** Verifies the ticket AND that the session behind it is still current. */
async function verifyTicket(raw: string | null, users: UserRepository) {
  if (!raw) return null;
  try {
    const decoded = jwt.verify(raw, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof decoded === 'string' || !decoded.sub || !Number.isInteger(decoded.ver)) {
      return null;
    }
    const user = await users.findById(decoded.sub);
    if (!user || user.isDeleted || user.sessionVersion !== decoded.ver) return null;
    return user.userId;
  } catch {
    return null;
  }
}
