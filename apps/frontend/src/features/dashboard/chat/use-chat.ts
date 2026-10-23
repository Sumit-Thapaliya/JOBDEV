'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { apiGet, apiPost } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/*                            Chat with the API                              */
/* -------------------------------------------------------------------------- */

export interface ChatMessage {
  from: 'me' | 'them';
  text: string;
  time: string;
}

/** Matches both dashboards' `Conversation` type, plus the fields the list uses. */
export interface ChatThread {
  id: string;
  applicationId: string;
  jobTitle: string;
  lastMessageAt: string | null;
  name: string;
  role: string;
  unread: number;
  messages: ChatMessage[];
}

/** Wire shape: the server sends ISO timestamps and decides `from` per viewer. */
interface ThreadRow {
  id: string;
  applicationId: string;
  jobTitle: string;
  lastMessageAt: string | null;
  name: string;
  role: string;
  unread: number;
  messages: Array<{ id: string; from: 'me' | 'them'; text: string; at: string }>;
}

const THREADS_KEY = ['chat', 'threads'] as const;
/** Just under Render's 15-minute idle window for free instances. */
const HEARTBEAT_MS = 4 * 60 * 1000;

/** "14:05" today, "12 Oct" earlier — bubbles and the thread list share it. */
export function formatChatTime(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const sameDay = at.toDateString() === new Date().toDateString();
  return sameDay
    ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function toThread(row: ThreadRow): ChatThread {
  return {
    id: row.id,
    applicationId: row.applicationId,
    jobTitle: row.jobTitle,
    lastMessageAt: row.lastMessageAt,
    name: row.name,
    role: row.role,
    unread: row.unread,
    messages: row.messages.map((message) => ({
      from: message.from,
      text: message.text,
      time: formatChatTime(message.at),
    })),
  };
}

/** The API host the browser can reach directly — the Next proxy only carries HTTP. */
function socketBase() {
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  return api.replace(/\/+$/, '').replace(/^http/, 'ws');
}

const backoff = (attempt: number) => Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));

/**
 * Conversations for the signed-in user.
 *
 * History and every write go over HTTP (`/api/messages/*`, cookies + CSRF);
 * the WebSocket exists only to push the updated thread, so a lost socket
 * costs latency, never a message. Each reconnect asks for a fresh 60-second
 * ticket, and the 60-second read is the catch-up after any gap.
 */
export function useChat(enabled = true) {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);

  const threads = useQuery({
    queryKey: THREADS_KEY,
    queryFn: async ({ signal }) =>
      (await apiGet<{ threads: ThreadRow[] }>('/api/messages/threads', signal)).threads.map(toThread),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    /* Fallback for when the socket cannot connect; usually a no-op. */
    refetchInterval: 60_000,
  });

  /** Replaces one thread in the cache — the same "apply" for socket and HTTP. */
  const apply = (thread: ChatThread) => {
    client.setQueryData<ChatThread[]>(THREADS_KEY, (current) => {
      const list = current ?? [];
      const at = list.findIndex((item) => item.id === thread.id);
      if (at === -1) return [thread, ...list];
      const next = [...list];
      next[at] = thread;
      return next;
    });
  };

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let beat: ReturnType<typeof setInterval> | undefined;

    const scheduleRetry = () => {
      if (stopped) return;
      retry = setTimeout(() => void connect(), backoff(attempt++));
    };

    async function connect() {
      if (stopped) return;
      try {
        const { ticket, path } = await apiPost<{ ticket: string; path: string }>(
          '/api/messages/ws-ticket',
        );
        socket = new WebSocket(`${socketBase()}${path}?ticket=${encodeURIComponent(ticket)}`);
      } catch {
        /* Offline or logged out — try again with backoff; HTTP still works. */
        scheduleRetry();
        return;
      }
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        /* A heartbeat keeps the socket (and an idle free instance) alive. */
        beat = setInterval(() => socket?.send(JSON.stringify({ type: 'ping' })), HEARTBEAT_MS);
      };
      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(String(event.data)) as { type?: string; thread?: ThreadRow };
          if (frame.type === 'thread' && frame.thread) apply(toThread(frame.thread));
        } catch {
          // Ignore frames we do not understand.
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (beat) clearInterval(beat);
        scheduleRetry();
      };
      socket.onerror = () => socket?.close();
    }

    void connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (beat) clearInterval(beat);
      socket?.close();
    };
    /* `apply` only touches the query cache, so the effect depends on the
       client and the flag alone. */
  }, [client, enabled]);

  const send = useMutation({
    mutationFn: async ({ threadId, text }: { threadId: string; text: string }) =>
      toThread(
        (await apiPost<{ thread: ThreadRow }>(`/api/messages/threads/${threadId}`, { body: text }))
          .thread,
      ),
    /* The bubble shows the moment Enter is pressed; the server's copy replaces
       it when the reply lands (and the socket push keeps the other side live). */
    onMutate: ({ threadId, text }: { threadId: string; text: string }) => {
      const previous = client.getQueryData<ChatThread[]>(THREADS_KEY);
      const at = new Date().toISOString();
      client.setQueryData<ChatThread[]>(THREADS_KEY, (current) => {
        const list = current ?? [];
        const found = list.find((thread) => thread.id === threadId);
        if (!found) return list;
        const ahead: ChatThread = {
          ...found,
          lastMessageAt: at,
          messages: [...found.messages, { from: 'me' as const, text, time: formatChatTime(at) }],
        };
        return [ahead, ...list.filter((thread) => thread.id !== threadId)];
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(THREADS_KEY, context.previous);
    },
    onSuccess: apply,
  });

  const markRead = useMutation({
    mutationFn: async (threadId: string) =>
      toThread(
        (await apiPost<{ thread: ThreadRow }>(`/api/messages/threads/${threadId}/read`)).thread,
      ),
    onSuccess: apply,
  });

  /** Recruiter only: opens (or re-uses) the thread for one applicant. */
  const openThread = useMutation({
    mutationFn: async (applicationId: string) =>
      toThread(
        (await apiPost<{ thread: ThreadRow }>('/api/messages/threads', { applicationId })).thread,
      ),
    onSuccess: apply,
  });

  return {
    threads,
    connected,
    send,
    markRead,
    openThread,
    unread: (threads.data ?? []).reduce((sum, thread) => sum + thread.unread, 0),
  };
}
