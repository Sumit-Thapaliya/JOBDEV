import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  DATABASE_URL: z.string().default('postgresql://jobdev:jobdev@localhost:5432/jobdev?schema=public'),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DB_SSL: booleanFromEnv.default('false'),
  DB_SSL_REJECT_UNAUTHORIZED: booleanFromEnv.default('true'),
  JWT_SECRET: z.string().default('supersecretjwtkey'),
  STATIC_OTP: z.string().default(''),
  ATS_ENDPOINT: z.string().default('https://ats-resume-api-cmkh.onrender.com'),
  ATS_API_KEY: z.string().default(''),
  ATS_MAX_PAGES: z.coerce.number().int().positive().default(2),
  /* Secret the recruiter view keys contact digests with (HMAC-SHA256).
     Change it and every token issued before stops matching. */
  CONTACT_PEPPER: z.string().default('jobdev-dev-contact-pepper-change-me'),
}).refine(({ DB_POOL_MIN, DB_POOL_MAX }) => DB_POOL_MIN <= DB_POOL_MAX, {
  message: 'DB_POOL_MIN must not exceed DB_POOL_MAX',
  path: ['DB_POOL_MIN'],
});

export const env = schema.parse(process.env);
if (env.NODE_ENV === 'production') {
  if (env.JWT_SECRET.length < 32 || env.JWT_SECRET === 'supersecretjwtkey') throw new Error('Production requires a strong JWT_SECRET of at least 32 characters.');
  if (env.STATIC_OTP) throw new Error('STATIC_OTP is development-only. Configure real OTP delivery before production login.');
  if (env.WEB_ORIGINS.split(',').some(origin => !origin.trim().startsWith('https://'))) throw new Error('Set WEB_ORIGINS to your exact HTTPS frontend origin(s) in production.');
}
