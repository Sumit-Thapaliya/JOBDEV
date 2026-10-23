import { recruiterResume } from '../resume/resume.controller.js';
import { Router } from 'express';
import {
  authMiddleware,
  requireRoles,
} from '../../middlewares/auth.middleware.js';
import { UserRole } from '../user/user.entity.js';
import {
  getCandidate,
  getProfileViews,
  getOwnProfileViews,
  recordProfileView,
  listCandidates,
  softDeleteCandidate,
} from './candidate.controller.js';

export const candidateRoutes = Router();

candidateRoutes.use(authMiddleware);
candidateRoutes.get(
  '/views/me',
  requireRoles(UserRole.CANDIDATE),
  getOwnProfileViews,
);
candidateRoutes.use(
  requireRoles(UserRole.RECRUITER, UserRole.ADMIN, UserRole.SUPERADMIN),
);

/* The raw directory is an admin lookup now: it used to hand any recruiter
   every candidate row (email, mobile, parsed profile). Recruiters read their
   own applicants from /api/applicants, where contact values are replaced by
   one-way digests before they leave the server. `/:id` still works for a
   recruiter — candidate.controller blurs the contact fields for that role. */
candidateRoutes.get('/', requireRoles(UserRole.ADMIN, UserRole.SUPERADMIN), listCandidates);
candidateRoutes.get(
  '/views',
  requireRoles(UserRole.RECRUITER),
  getProfileViews,
);
candidateRoutes.post(
  '/:id/views',
  requireRoles(UserRole.RECRUITER),
  recordProfileView,
);
/* Watermarked PDF only — never the clean uploaded bytes (resume.controller.ts). */
candidateRoutes.get('/:id/resume', recruiterResume);
candidateRoutes.get('/:id', getCandidate);
candidateRoutes.delete(
  '/:id',
  requireRoles(UserRole.ADMIN, UserRole.SUPERADMIN),
  softDeleteCandidate,
);
