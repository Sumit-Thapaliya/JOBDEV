import { Router } from 'express';
import { authMiddleware, requireRoles } from '../../middlewares/auth.middleware.js';
import { UserRole } from '../user/user.entity.js';
import {
  getApplicant,
  getApplicantResume,
  getApplicantResumePdf,
  listApplicants,
} from './applicant.controller.js';

/**
 * Recruiter-side applicant data.
 *
 *   GET /api/applicants              → applicants to my jobs (contact blurred)
 *   GET /api/applicants?jobId=…      → one job's applicants
 *   GET /api/applicants/:id          → one applicant (application id)
 *   GET /api/applicants/:id/resume   → the resume, contact lines tokenised
 *   GET /api/applicants/:id/resume/pdf → same resume as a watermarked PDF
 *
 * Mount in `app.ts`:  app.use('/api/applicants', applicantRoutes);
 */
export const applicantRoutes = Router();

applicantRoutes.use(
  authMiddleware,
  requireRoles(UserRole.RECRUITER, UserRole.ADMIN, UserRole.SUPERADMIN),
);

applicantRoutes.get('/', listApplicants);
applicantRoutes.get('/:id', getApplicant);
applicantRoutes.get('/:id/resume', getApplicantResume);
applicantRoutes.get('/:id/resume/pdf', getApplicantResumePdf);
