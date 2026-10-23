import 'reflect-metadata';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { env } from '../config/env.js';
import { ProfileView } from '../modules/candidate/profile-view.entity.js';
import { User } from '../modules/user/user.entity.js';
import { SearchHistory } from '../modules/user/search-history.entity.js';
import { ResumeVersion } from '../modules/user/resume-version.entity.js';
import { Job } from '../modules/job/job.entity.js';
import { Application } from '../modules/application/application.entity.js';
import { Message } from '../modules/message/message.entity.js';
import { Thread } from '../modules/message/thread.entity.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.DATABASE_URL,
  entities: [User, Job, Application, SearchHistory, ResumeVersion, ProfileView, Thread, Message],
  migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
  /* Additive migrations only — boot-time run keeps every environment
     (laptop, Render, fresh clones) schema-current with zero manual steps. */
  migrationsRun: true,
  synchronize: false,
  logging: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  ssl: env.DB_SSL ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED } : undefined,
  extra: {
    min: env.DB_POOL_MIN,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  },
});
