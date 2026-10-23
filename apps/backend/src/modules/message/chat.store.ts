import { randomUUID } from 'node:crypto';

/**
 * In-memory chat store — the demo phase.
 *
 * NOTHING here touches the database: no table, no migration, no TypeORM. One
 * thread per application, kept in the process. Restarting the backend empties
 * every conversation; a browser reload or a logout does not.
 */

export interface StoredMessage {
  messageId: string;
  senderId: string;
  senderRole: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface StoredThread {
  threadId: string;
  applicationId: string;
  candidateId: string;
  recruiterId: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  messages: StoredMessage[];
}

const threads = new Map<string, StoredThread>();
const byApplication = new Map<string, string>();

export const findThread = (threadId: string) => threads.get(threadId) ?? null;

export const findThreadByApplication = (applicationId: string) =>
  (byApplication.has(applicationId) ? threads.get(byApplication.get(applicationId)!) : null) ?? null;

/** Idempotent: re-opening an applicant's thread returns the existing one. */
export function openChatThread(data: {
  applicationId: string;
  candidateId: string;
  recruiterId: string;
}): StoredThread {
  const existing = findThreadByApplication(data.applicationId);
  if (existing) return existing;
  const thread: StoredThread = {
    threadId: randomUUID(),
    applicationId: data.applicationId,
    candidateId: data.candidateId,
    recruiterId: data.recruiterId,
    lastMessageAt: null,
    createdAt: new Date(),
    messages: [],
  };
  threads.set(thread.threadId, thread);
  byApplication.set(thread.applicationId, thread.threadId);
  return thread;
}

/** Newest activity first; just-opened (empty) threads sit at the top, like SQL. */
export function chatThreadsFor(userId: string, side: 'candidate' | 'recruiter'): StoredThread[] {
  const mine = [...threads.values()].filter((thread) =>
    side === 'candidate' ? thread.candidateId === userId : thread.recruiterId === userId,
  );
  return mine.sort((a, b) => {
    const at = a.lastMessageAt?.getTime() ?? a.createdAt.getTime();
    const bt = b.lastMessageAt?.getTime() ?? b.createdAt.getTime();
    return bt - at;
  });
}

export function addChatMessage(data: {
  threadId: string;
  senderId: string;
  senderRole: string;
  body: string;
}): StoredMessage {
  const thread = threads.get(data.threadId);
  if (!thread) throw new Error('Conversation not found');
  const message: StoredMessage = {
    messageId: randomUUID(),
    senderId: data.senderId,
    senderRole: data.senderRole,
    body: data.body,
    createdAt: new Date(),
    readAt: null,
  };
  thread.messages.push(message);
  thread.lastMessageAt = message.createdAt;
  return message;
}

/** Unread = the other side's messages this viewer has not opened. */
export const chatUnread = (thread: StoredThread, viewerId: string) =>
  thread.messages.filter((message) => message.senderId !== viewerId && !message.readAt).length;

export function markChatRead(thread: StoredThread, viewerId: string) {
  const at = new Date();
  for (const message of thread.messages) {
    if (message.senderId !== viewerId && !message.readAt) message.readAt = at;
  }
}
