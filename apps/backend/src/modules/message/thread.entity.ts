import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One conversation per application (recruiter ⇄ candidate).
 *
 * The recruiter opens the thread from the applicant view. The candidate never
 * sees it until its first message exists — `lastMessageAt` is that switch, and
 * `listThreads` enforces it. One thread per application is a database unique
 * constraint, not a convention.
 */
@Entity({ name: 'threads' })
export class Thread {
  @PrimaryGeneratedColumn('uuid')
  threadId!: string;

  @Column({ type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'uuid' })
  candidateId!: string;

  /** The recruiter who owns the job the candidate applied to. */
  @Column({ type: 'uuid' })
  recruiterId!: string;

  /** Set with the first message; null while the thread is still empty. */
  @Column({ type: 'timestamp with time zone', nullable: true })
  lastMessageAt!: Date | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp with time zone' })
  createdAt!: Date;
}
