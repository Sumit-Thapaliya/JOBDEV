import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateThreadsAndMessages1791500000000 implements MigrationInterface {
  name = 'CreateThreadsAndMessages1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "threads" (
        "threadId" uuid NOT NULL DEFAULT gen_random_uuid(),
        "applicationId" uuid NOT NULL,
        "candidateId" uuid NOT NULL,
        "recruiterId" uuid NOT NULL,
        "lastMessageAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_threads" PRIMARY KEY ("threadId"),
        CONSTRAINT "UQ_threads_application" UNIQUE ("applicationId")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_threads_candidate" ON "threads" ("candidateId")`);
    await queryRunner.query(`CREATE INDEX "IDX_threads_recruiter" ON "threads" ("recruiterId")`);

    await queryRunner.query(`
      CREATE TABLE "messages" (
        "messageId" uuid NOT NULL DEFAULT gen_random_uuid(),
        "threadId" uuid NOT NULL,
        "senderId" uuid NOT NULL,
        "senderRole" character varying(16) NOT NULL,
        "body" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "readAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_messages" PRIMARY KEY ("messageId")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_messages_thread_created" ON "messages" ("threadId", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP INDEX "IDX_threads_candidate"`);
    await queryRunner.query(`DROP INDEX "IDX_threads_recruiter"`);
    await queryRunner.query(`DROP TABLE "threads"`);
  }
}
