import { Router } from 'express';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { authMiddleware, requireRoles } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../common/errors/AppError.js';
import { contactSummary, redactContactText } from '../../common/crypto/contact-token.js';
import { UserRole } from '../user/user.entity.js';
import { JobRepository } from '../job/job.repository.js';
import { ApplicationRepository } from './application.repository.js';


import { accountFields, UserRepository } from '../user/user.repository.js';
import { AppDataSource } from '../../database/data-source.js';
import { Application } from './application.entity.js';
import { Job } from '../job/job.entity.js';
import { User } from '../user/user.entity.js';

const listRecruiterApplicants: RequestHandler = async (req, res, next) => {
  try {
    const jobRepo = AppDataSource.getRepository(Job);
    const appRepo = AppDataSource.getRepository(Application);
    const userRepo = AppDataSource.getRepository(User);
    
    // 1. Get all jobs posted by this recruiter
    const jobs = await jobRepo.find({ where: { postedBy: req.user!.userId, isDeleted: false } });
    const jobIds = jobs.map(j => j.id);
    const jobMap = new Map(jobs.map(j => [j.id, j.title]));
    
    // 2. Get all applications for those jobs
    let applications: Application[] = [];
    if (jobIds.length > 0) {
      applications = await appRepo.createQueryBuilder('app')
        .where('app.jobId IN (:...jobIds)', { jobIds })
        .getMany();
    }
    
    // 3. Get ALL candidates
    const allCandidates = await userRepo.find({ select: accountFields, where: { role: UserRole.CANDIDATE, isDeleted: false } });
    
    const applicants = [];
    
    for (const candidate of allCandidates) {
      // Find if this candidate applied to any of our jobs
      const candidateApps = applications.filter(a => a.candidateId === candidate.userId);
      
      let skills: string[] = [];
      let experience = [];
      let education = 'Not specified';
      let summary = 'No summary provided.';

      if (candidate.parsedProfile) {
        try {
          /* parsedProfile is jsonb now: older rows may still hold JSON text. */
          const envelope: any =
            typeof candidate.parsedProfile === 'string'
              ? JSON.parse(candidate.parsedProfile)
              : candidate.parsedProfile;
          const profile = envelope.raw_resume_data ?? envelope;
          const rawSkills = profile.skills;
          summary = profile.basics?.summary ?? profile.about ?? profile.summary ?? '';

          skills = Array.isArray(rawSkills)
            ? rawSkills
                .flatMap((entry: any) => typeof entry === 'string' ? [entry] : [...(entry.keywords ?? []), ...(entry.name && entry.name !== 'Other' ? [entry.name] : [])])
                .filter(Boolean)
            : Array.isArray(profile?.skills)
              ? profile.skills
              : [];
          profile.experience = profile.experience ?? profile.work;
          if (profile.experience && Array.isArray(profile.experience)) {
            experience = profile.experience.map((e: any) => ({
              role: e.title || e.role || e.position || '',
              company: e.company || e.name || '',
              period: e.duration || e.period || e.datesRaw || [e.startDate, e.endDate].filter(Boolean).join(' – ')
            }));
          }
          if (profile.education && Array.isArray(profile.education) && profile.education.length > 0) {
            education = profile.education[0].institution || profile.education[0].school || '';
          }
        } catch(e) {}
      }
      
      /* Contact data is replaced by one-way digests before the response is
         built, and prose mentioning an email/link/phone is swept: whatever the
         browser receives cannot show the real values. */
      const contact = contactSummary(candidate.parsedProfile);
      const baseApplicant = {
        candidateId: candidate.userId,
        appliedDaysAgo: 0,
        name: candidate.name || 'Unknown',
        email: contact.email.token ?? '',
        phone: contact.phone.token ?? '',
        location: 'Remote',
        summary: redactContactText(summary),
        skills,
        experience,
        education,
        resumeUrl: undefined as string | undefined
      };
      
      if (candidateApps.length > 0) {
        for (const app of candidateApps) {
          /* Real match: how many of the candidate's extracted skills appear in
             the job's title or description. No invented numbers. */
          const job = jobs.find((entry) => entry.id === app.jobId);
          const haystack = `${job?.title ?? ''} ${job?.description ?? ''}`.toLowerCase();
          const matched = skills.filter((skill) =>
            haystack.includes(String(skill).toLowerCase()),
          ).length;
          const matchScore = skills.length
            ? Math.round((matched / skills.length) * 100)
            : 0;
          applicants.push({
            ...baseApplicant,
            matchScore,
            match: matchScore,
            id: app.applicationId,
            jobId: app.jobId,
            job: jobMap.get(app.jobId) || 'Unknown Job',
            appliedAt: app.createdAt.toISOString(),
            appliedDaysAgo: Math.max(0, Math.floor((Date.now() - app.createdAt.getTime()) / 86400000)),
            status: app.status === 'NEW' ? 'New' : app.status
          });
        }
      } else {
        // Did not apply, but show as available
        applicants.push({
          ...baseApplicant,
          matchScore: 0,
          match: 0,
          id: candidate.userId, // use user id as unique key
          jobId: null,
          job: 'Available Candidate',
          appliedAt: new Date().toISOString(),
          status: 'New'
        });
      }
    }

    res.json({ success: true, data: { applicants } });
  } catch (error) {
    next(error);
  }
};

export const applySchema = z.object({
  jobId: z.string().uuid('Invalid job id'),
});

const applicationRepo = new ApplicationRepository();
const jobRepo = new JobRepository();

const listMyApplications: RequestHandler = async (req, res, next) => {
  try {
    const applications = await AppDataSource.getRepository(Application)
      .createQueryBuilder('application')
      .leftJoinAndMapOne('application.job', Job, 'job', 'job.id = application.jobId')
      .where('application.candidateId = :id', { id: req.user!.userId })
      .orderBy('application.createdAt', 'DESC').getMany() as Array<Application & { job: Job | null }>;

    res.json({
      success: true,
      data: {
        applications: applications.map((application) => ({
          id: application.applicationId,
          status: application.status,
          createdAt: application.createdAt,
          job: application.job ?? null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

const applyToJob: RequestHandler = async (req, res, next) => {
  try {
    const job = await jobRepo.findById(req.body.jobId as string);
    if (!job || job.isDeleted) {
      throw new AppError(404, 'Job not found');
    }

    const existing = await applicationRepo.findByJobAndCandidate(
      job.id,
      req.user!.userId,
    );
    if (existing) {
      throw new AppError(409, 'You have already applied to this job');
    }

    const application = await applicationRepo.create({
      jobId: job.id,
      candidateId: req.user!.userId,
    });

    res.status(201).json({
      success: true,
      data: { application: { id: application.applicationId, status: application.status } },
    });
  } catch (error) {
    next(error);
  }
};

export const applicationRoutes = Router();

// Global auth removed in favor of route-specific roles

applicationRoutes.get('/', authMiddleware, requireRoles(UserRole.CANDIDATE), listMyApplications);
applicationRoutes.get('/recruiter', authMiddleware, requireRoles(UserRole.RECRUITER), listRecruiterApplicants);
applicationRoutes.post('/', authMiddleware, requireRoles(UserRole.CANDIDATE), validate(applySchema), applyToJob);
