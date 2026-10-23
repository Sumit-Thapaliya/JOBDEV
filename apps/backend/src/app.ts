import { csrfProtection, originAllowed } from './middlewares/csrf.middleware.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { AppDataSource } from './database/data-source.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { globalRateLimiter } from './middlewares/rateLimiter.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { applicationRoutes } from './modules/application/application.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { candidateRoutes } from './modules/candidate/candidate.routes.js';
import { applicantRoutes } from './modules/applicant/applicant.routes.js';
import { jobRoutes } from './modules/job/job.routes.js';
import { messageRoutes } from './modules/message/message.routes.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: (origin, callback) => callback(null, originAllowed(origin)), credentials: true }));
app.use('/api', csrfProtection);
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
app.use('/api/auth/resume/current', express.json({ limit: '25mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(globalRateLimiter);

app.get('/health', async (_req, res) => {
  let dbStatus = 'disconnected';
  try {
    if (!AppDataSource.isInitialized) {
      throw new Error('Database connection has not been initialized');
    }
    await AppDataSource.query('SELECT 1');
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: { database: dbStatus },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/applicants', applicantRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);
