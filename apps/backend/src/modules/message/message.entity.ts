import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One chat message.
 *
 * `senderRole` is stored with the row so a thread can be rendered without
 * joining users, and `readAt` drives the unread badge (unread = messages the
 * other side sent that I have not opened — no counter column to drift).
 */
@Entity({ name: 'messages' })
@Index(['threadId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  messageId!: string;

  @Column({ type: 'uuid' })
  threadId!: string;

  @Column({ type: 'uuid' })
  senderId!: string;

  @Column({ type: 'varchar', length: 16 })
  senderRole!: string;

  @Column({ type: 'text' })
  body!: string;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp with time zone' })
  createdAt!: Date;

  /** Null until the other party opens the thread. */
  @Column({ type: 'timestamp with time zone', nullable: true })
  readAt!: Date | null;
}
