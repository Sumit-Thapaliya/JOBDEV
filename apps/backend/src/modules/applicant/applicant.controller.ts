import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/AppError.js';
import { UserRole } from '../user/user.entity.js';
import { UserRepository } from '../user/user.repository.js';
import { JobRepository } from '../job/job.repository.js';
import { ApplicationRepository } from '../application/application.repository.js';
import { toApplicantPayload, type ApplicantPayload } from './applicant.serializer.js';
import { renderApplicantPdf } from './resume-pdf.js';

/**
 * Recruiter-facing applicant endpoints.
 *
 * Two guarantees every handler here keeps:
 *   1. a recruiter only ever reads applications to **their own** jobs
 *      (`job.postedBy === req.user.userId`); admins read everything;
 *   2. the response is built by `toApplicantPayload`, so contact values are
 *      digests — the raw email / phone / LinkedIn never reaches the browser.
 */

const users = new UserRepository();
const jobs = new JobRepository();
const applications = new ApplicationRepository();

type Viewer = { userId: string; role: UserRole };

const isAdmin = (viewer: Viewer) =>
  viewer.role === UserRole.ADMIN || viewer.role === UserRole.SUPERADMIN;

/** Loads one application and proves the viewer may see it. */
async function loadForViewer(id: string, viewer: Viewer) {
  const application = await applications.findById(id);
  if (!application) throw new AppError(404, 'Applicant not found');

  const job = await jobs.findById(application.jobId);
  if (!job || job.isDeleted) throw new AppError(404, 'Applicant not found');

  if (!isAdmin(viewer) && job.postedBy !== viewer.userId) {
    throw new AppError(403, 'This applicant belongs to another recruiter’s job');
  }

  const candidate = await users.findById(application.candidateId);
  return { application, job, candidate };
}

const build = async (application: Parameters<typeof toApplicantPayload>[0]) => {
  const [job, candidate] = await Promise.all([
    jobs.findById(application.jobId),
    users.findById(application.candidateId),
  ]);
  return toApplicantPayload(application, candidate, job);
};

/** GET /api/applicants?jobId=… — everyone who applied to my jobs. */
export const listApplicants: RequestHandler = async (req, res, next) => {
  try {
    const viewer = { userId: req.user!.userId, role: req.user!.role };
    const jobFilter = typeof req.query.jobId === 'string' ? req.query.jobId : null;

    let jobIds: string[];
    if (jobFilter) {
      const job = await jobs.findById(jobFilter);
      if (!job || job.isDeleted) throw new AppError(404, 'Job not found');
      if (!isAdmin(viewer) && job.postedBy !== viewer.userId) {
        throw new AppError(403, 'That job belongs to another recruiter');
      }
      jobIds = [job.id];
    } else if (isAdmin(viewer)) {
      const allJobs = await jobs.findOpen();
      jobIds = allJobs.map((job) => job.id);
    } else {
      const mine = await jobs.findByPostedBy(viewer.userId);
      jobIds = mine.map((job) => job.id);
    }

    const found = await applications.findByJobIds(jobIds);
    const applicants: ApplicantPayload[] = [];
    for (const application of found) applicants.push(await build(application));

    res.json({ success: true, data: { applicants, total: applicants.length } });
  } catch (error) {
    next(error);
  }
};

/** GET /api/applicants/:id — one applicant (application id). */
export const getApplicant: RequestHandler = async (req, res, next) => {
  try {
    const { application, job, candidate } = await loadForViewer(req.params.id as string, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    res.json({ success: true, data: { applicant: toApplicantPayload(application, candidate, job) } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/applicants/:id/resume — the resume the recruiter may read.
 *
 * Served from the parsed JSON (`users.parsedProfile`) with its contact values
 * tokenised: the CV content is intact, the contact block stays blurred.
 * The stored file itself (`users.resumeData`) is deliberately NOT exposed —
 * a PDF's text layer cannot be blurred, so it is never handed out here.
 */
export const getApplicantResume: RequestHandler = async (req, res, next) => {
  try {
    const { application, job, candidate } = await loadForViewer(req.params.id as string, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    const payload = toApplicantPayload(application, candidate, job);
    res.json({
      success: true,
      data: {
        applicantId: payload.id,
        candidateName: payload.candidate.name,
        fileName: payload.candidate.resumeFileName,
        contactMode: payload.candidate.contactMode,
        contact: payload.candidate.contact,
        resume: payload.candidate.resume,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * The resume as a PDF — composed HERE from the masked payload, so the file the
 * recruiter opens never contained the email/phone/links in the first place.
 * (The stored ATS PDF and the original upload are NOT used: their bytes hold
 * the real values and a PDF cannot be blurred after it is built.)
 *
 *   GET /api/applicants/:id/resume/pdf   → application/pdf, inline
 */
export const getApplicantResumePdf: RequestHandler = async (req, res, next) => {
  try {
    const { application, job, candidate } = await loadForViewer(req.params.id as string, {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    const payload = toApplicantPayload(application, candidate, job);
    const bytes = await renderApplicantPdf(payload, req.user!.email ?? req.user!.name ?? 'Recruiter view');
    const slug = payload.candidate.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'candidate';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${slug}-jobdev-resume.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(bytes));
  } catch (error) {
    next(error);
  }
};
