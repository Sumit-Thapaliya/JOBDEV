import { In, IsNull, Not } from 'typeorm';
import { AppDataSource } from '../../database/data-source.js';
import { Message } from './message.entity.js';
import { Thread } from './thread.entity.js';

const threads = () => AppDataSource.getRepository(Thread);
const messages = () => AppDataSource.getRepository(Message);

export class MessageRepository {
  async findThread(threadId: string) {
    return threads().findOneBy({ threadId });
  }

  async findThreadByApplication(applicationId: string) {
    return threads().findOneBy({ applicationId });
  }

  /** Idempotent: re-opening an applicant's thread returns the existing one. */
  async openThread(data: { applicationId: string; candidateId: string; recruiterId: string }) {
    const existing = await this.findThreadByApplication(data.applicationId);
    if (existing) return existing;
    return threads().save(threads().create(data));
  }

  /** Newest activity first. Postgres puts the empty (just-opened) threads at the
   *  top, which is exactly where the recruiter expects the one they just made. */
  async threadsFor(userId: string, side: 'candidate' | 'recruiter') {
    const where = side === 'candidate' ? { candidateId: userId } : { recruiterId: userId };
    return threads().find({ where, order: { lastMessageAt: 'DESC', createdAt: 'DESC' } });
  }

  /** The newest `limit` messages, oldest first — what a thread view renders. */
  async messagesFor(threadId: string, limit = 50) {
    const rows = await messages().find({
      where: { threadId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.reverse();
  }

  async addMessage(data: { threadId: string; senderId: string; senderRole: string; body: string }) {
    return messages().save(messages().create(data));
  }

  /** Moves the thread to the top of both lists and returns the fresh row. */
  async touch(threadId: string, at: Date) {
    await threads().update({ threadId }, { lastMessageAt: at });
    const thread = await this.findThread(threadId);
    return thread!;
  }

  /** Unread = the other side's messages that this viewer has not opened. */
  async unreadByThread(threadIds: string[], viewerId: string) {
    const counts = new Map<string, number>();
    if (!threadIds.length) return counts;
    const rows = await messages().find({
      where: { threadId: In(threadIds), senderId: Not(viewerId), readAt: IsNull() },
      select: { threadId: true },
    });
    for (const row of rows) {
      counts.set(row.threadId, (counts.get(row.threadId) ?? 0) + 1);
    }
    return counts;
  }

  /** Marks everything the other side sent as read; returns how many rows moved. */
  async markRead(threadId: string, viewerId: string) {
    const unread = await messages().find({
      where: { threadId, senderId: Not(viewerId), readAt: IsNull() },
      select: { messageId: true },
    });
    if (!unread.length) return 0;
    await messages().update(
      { messageId: In(unread.map((row) => row.messageId)) },
      { readAt: new Date() },
    );
    return unread.length;
  }
}
