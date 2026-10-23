import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/AppError.js';
import { UserRole } from '../user/user.entity.js';
import { UserRepository } from '../user/user.repository.js';
import { toSafeUser } from '../auth/auth.service.js';
import { contactTokenShort } from '../../common/crypto/contact-token.js';

import { z } from 'zod';
import { AppDataSource } from '../../database/data-source.js';
import { User } from '../user/user.entity.js';
import { ProfileView } from './profile-view.entity.js';

/** A recruiter gets the FIELD, never the value: it becomes a one-way digest. */
const blurred = (value?: string | null) => (value && value.trim() ? contactTokenShort(value) : '');

const candidateIdSchema = z.string().uuid('Invalid candidate id');
const userRepo = new UserRepository();

export const listCandidates: RequestHandler = async (_req, res, next) => {
  try {
    const candidates = await userRepo.findByRole(UserRole.CANDIDATE);
    res.json({
      success: true,
      data: { candidates: candidates.map(toSafeUser) },
    });
  } catch (error) {
    next(error);
  }
};

export const getCandidate: RequestHandler = async (req, res, next) => {
  try {
    const user = await userRepo.findById(
      candidateIdSchema.parse(req.params.id),
    );
    if (!user || user.isDeleted || user.role !== UserRole.CANDIDATE) {
      throw new AppError(404, 'Candidate not found');
    }
    const safe = toSafeUser(user);
    if (req.user!.role === UserRole.RECRUITER) {
      res.json({
        success: true,
        data: {
          candidate: {
            ...safe,
            identifier: blurred(safe.identifier),
            email: blurred(safe.email),
            phone: blurred(safe.phone),
            contactNumber: blurred(safe.contactNumber),
          },
        },
      });
      return;
    }
    res.json({ success: true, data: { candidate: safe } });
  } catch (error) {
    next(error);
  }
};

export const softDeleteCandidate: RequestHandler = async (req, res, next) => {
  try {
    const user = await userRepo.findById(
      candidateIdSchema.parse(req.params.id),
    );
    if (!user || user.isDeleted || user.role !== UserRole.CANDIDATE) {
      throw new AppError(404, 'Candidate not found');
    }
    if (req.user?.userId === user.userId) {
      throw new AppError(409, 'You cannot delete your own account here');
    }
    await userRepo.update(user.userId, { isDeleted: true });
    res.json({ success: true, data: { message: 'Candidate deleted' } });
  } catch (error) {
    next(error);
  }
};

/** Writes use POST and the existing global cookie/Origin/CSRF guards, never GET. */
export const recordProfileView: RequestHandler = async (req, res, next) => {
  try {
    const candidateId = candidateIdSchema.parse(req.params.id);
    const candidate = await userRepo.findById(candidateId);
    if (
      !candidate ||
      candidate.isDeleted ||
      candidate.role !== UserRole.CANDIDATE
    )
      throw new AppError(404, 'Candidate not found');
    const inserted = await AppDataSource.getRepository(ProfileView)
      .createQueryBuilder()
      .insert()
      .values({ recruiterId: req.user!.userId, candidateId })
      .orIgnore()
      .returning('id')
      .execute();
    res.json({
      success: true,
      data: { recorded: true, created: inserted.raw.length > 0 },
    });
  } catch (error) {
    next(error);
  }
};

export const getProfileViews: RequestHandler = async (req, res, next) => {
  try {
    const views = await AppDataSource.getRepository(ProfileView)
      .createQueryBuilder('view')
      .innerJoin(
        User,
        'candidate',
        'candidate.userId = view.candidateId AND candidate.isDeleted = false AND candidate.role = :role',
        { role: UserRole.CANDIDATE },
      )
      .where('view.recruiterId = :recruiterId', {
        recruiterId: req.user!.userId,
      })
      .select([
        'view.id AS "id"',
        'view.createdAt AS "viewedAt"',
        'candidate.userId AS "candidateId"',
        'candidate.name AS "candidateName"',
        'candidate.email AS "candidateEmail"',
      ])
      .orderBy('view.createdAt', 'DESC')
      .addOrderBy('view.id', 'DESC')
      .getRawMany();
    /* The list may show the field, never the address. */
    const masked = views.map((view: { candidateEmail?: string | null }) => ({
      ...view,
      candidateEmail: blurred(view.candidateEmail),
    }));
    res.json({ success: true, data: { totalViews: masked.length, views: masked } });
  } catch (error) {
    next(error);
  }
};

export const getOwnProfileViews: RequestHandler = async (req, res, next) => {
  try {
    const views = await AppDataSource.getRepository(ProfileView)
      .createQueryBuilder('view')
      .innerJoin(
        User,
        'recruiter',
        'recruiter.userId = view.recruiterId AND recruiter.isDeleted = false AND recruiter.role = :role',
        { role: UserRole.RECRUITER },
      )
      .where('view.candidateId = :candidateId', {
        candidateId: req.user!.userId,
      })
      .select([
        'view.id AS "id"',
        'view.createdAt AS "viewedAt"',
        'recruiter.userId AS "recruiterId"',
        'recruiter.name AS "recruiterName"',
        'recruiter.companyName AS "companyName"',
        'recruiter.email AS "recruiterEmail"',
      ])
      .orderBy('view.createdAt', 'DESC')
      .addOrderBy('view.id', 'DESC')
      .getRawMany();

    res.json({
      success: true,
      data: {
        totalViews: views.length,
        views: views.map((v) => ({
          id: v.id,
          viewedAt: v.viewedAt,
          recruiterId: v.recruiterId,
          recruiterName: v.recruiterName || 'Recruiter',
          companyName: v.companyName || '',
          recruiterEmail: v.recruiterEmail || '',
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
