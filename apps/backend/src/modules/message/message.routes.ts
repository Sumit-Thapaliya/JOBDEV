import { Router } from 'express';
import { authMiddleware, requireRoles } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.js';
import { UserRole } from '../user/user.entity.js';
import {
  issueWsTicket,
  listThreads,
  markThreadRead,
  openThread,
  postMessage,
} from './message.controller.js';
import { openThreadSchema, sendMessageSchema } from './message.schema.js';

/**
 * Chat between a recruiter and a candidate.
 *
 *   GET  /api/messages/threads          → my conversations (+ unread total)
 *   POST /api/messages/threads          → a recruiter opens a thread for an applicant
 *   POST /api/messages/threads/:id      → send a message (the only write path)
 *   POST /api/messages/threads/:id/read → clear the thread's unread badge
 *   POST /api/messages/ws-ticket        → 60-second pass for the push socket
 *
 * The push socket itself lives at `WS_PATH` in message.gateway.ts and is
 * attached to the HTTP server in `server.ts` — it is not an Express route.
 *
 * Mount in `app.ts`:  app.use('/api/messages', messageRoutes);
 */
export const messageRoutes = Router();

messageRoutes.use(authMiddleware);

messageRoutes.get('/threads', listThreads);
messageRoutes.post(
  '/threads',
  requireRoles(UserRole.RECRUITER, UserRole.ADMIN, UserRole.SUPERADMIN),
  validate(openThreadSchema),
  openThread,
);
messageRoutes.post('/threads/:id', validate(sendMessageSchema), postMessage);
messageRoutes.post('/threads/:id/read', markThreadRead);
messageRoutes.post('/ws-ticket', issueWsTicket);
