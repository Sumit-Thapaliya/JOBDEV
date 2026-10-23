import { serviceRequest } from '../../common/http.js';
import { hydratedCanvas } from '../resume/resume.controller.js';
import { SearchHistory } from '../user/search-history.entity.js';
import { AppDataSource } from '../../database/data-source.js';
import { User } from '../user/user.entity.js';
import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/AppError.js';
import { env } from '../../config/env.js';
import {
  AuthService,
  COOKIE_NAME,
  cookieOptions,
  signSession,
  toSafeUser,
} from './auth.service.js';

const authService = new AuthService();

export const register: RequestHandler = async (req, res, next) => {
  try {
    const user = await authService.register(req.body);
    res.status(201).json({
      success: true,
      data: { requiresOtp: true, identifier: user.email ?? user.mobile },
    });
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const result = await authService.startLogin(req.body);
    res.json({
      success: true,
      data: { requiresOtp: true, identifier: result.identifier },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp: RequestHandler = async (req, res, next) => {
  try {
    const user = await authService.verifyOtp(req.body);
    res
      .cookie(COOKIE_NAME, signSession(user), cookieOptions())
      .json({
        success: true,
        data: { user: toSafeUser(user) },
      });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser: RequestHandler = async (req, res) => {
  res.json({ success: true, data: { user: toSafeUser(req.user!) } });
};


/** Return only the authenticated candidate's own saved upload. */
export const getSavedResume: RequestHandler = async (req, res, next) => {
  try {
    if (req.user!.role.toLowerCase() !== 'candidate') throw new AppError(403, 'Only candidates can retrieve their resume');
    const user = await AppDataSource.getRepository(User).findOneByOrFail({ userId: req.user!.userId });
    res.setHeader('Cache-Control', 'private, no-store');
    if (!user.resumeFileName || (!user.resumeData && !user.resumePdf)) {
      res.json({ success: true, data: { resume: null } });
      return;
    }
    res.json({
      success: true,
      data: {
        resume: {
          fileName: user.resumeFileName,
          dataBase64: user.resumePdf?.toString('base64') ?? user.resumeData,
          canvas: await hydratedCanvas(user),
          uploadedAt: user.resumeUploadedAt,
          parsedProfile: user.parsedProfile,
          atsPdfBase64: user.resumePdf ? user.resumePdf.toString('base64') : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadResume: RequestHandler = async (req, res, next) => {
  try {
    if (req.user!.role.toLowerCase() !== 'candidate') {
      throw new AppError(403, 'Only candidates can upload a resume');
    }
    const { fileName, dataBase64, parsed } = req.body;

    /* Server-side extraction: send the file to the ATS resume service and
       store whatever it parses. The API key never leaves the backend. */
    let parsedProfile: Record<string, unknown> | null = parsed ?? null;
    let atsError: string | null = null;
    const fileBuffer = Buffer.from(String(dataBase64), 'base64');
    if (!parsedProfile && env.ATS_API_KEY.length > 0) {
      try {
        const form = new FormData();
        form.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), fileName);
        form.append('max_pages', String(env.ATS_MAX_PAGES));
        const atsRes = await serviceRequest(`${env.ATS_ENDPOINT}/v1/format`, {
          method: 'POST',
          headers: { 'X-API-Key': env.ATS_API_KEY },
          body: form,
        });
        if (!atsRes.ok) {
          atsError = `Extraction service replied ${atsRes.status}`;
        } else {
          parsedProfile = (await atsRes.json()) as Record<string, unknown>;
        }
      } catch {
        atsError = 'Extraction service is unreachable right now';
      }
    } else if (!parsedProfile) {
      atsError = 'Extraction service is not configured on the server';
    }

    /* The candidate's ATS-friendly copy: exactly 1 page, no brand stamp
       (`no_watermark=true` — verified live). Any failure here never blocks the
       upload or the saved parsed JSON. */
    let atsPdf: Buffer | null = null;
    if (parsedProfile && env.ATS_API_KEY.length > 0) {
      try {
        const form = new FormData();
        form.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), fileName);
        /* /v1/format/pdf is always exactly 1 page and takes no max_pages. */
        form.append('no_watermark', 'true');
        const pdfRes = await serviceRequest(`${env.ATS_ENDPOINT}/v1/format/pdf`, {
          method: 'POST',
          headers: { 'X-API-Key': env.ATS_API_KEY },
          body: form,
        });
        if (pdfRes.ok) atsPdf = Buffer.from(await pdfRes.arrayBuffer());
      } catch {
        /* Upload still succeeds; the studio falls back to a browser render. */
      }
    }

    const user = await authService.uploadResume(
      req.user!.userId,
      fileName,
      dataBase64,
      parsedProfile,
      atsPdf,
    );
    res.json({
      success: true,
      data: {
        user: toSafeUser(user),
        parsed: parsedProfile,
        atsError,
        atsPdfBase64: atsPdf ? atsPdf.toString('base64') : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword: RequestHandler = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    if (!user) throw new AppError(401, 'Session ended');
    res.cookie(COOKIE_NAME, signSession(user), cookieOptions());
    res.json({ success: true, data: { message: 'Password changed' } });
  } catch (error) {
    next(error);
  }
};

export const logoutUser: RequestHandler = async (req, res, next) => {
  try {
    // Invalidate copies of the old cookie, not just this browser's cookie jar.
    await AppDataSource.getRepository(User).increment({ userId: req.user!.userId }, 'sessionVersion', 1);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined })
      .json({ success: true, data: { message: 'Logged out' } });
  } catch (error) { next(error); }
};

export const updateProfile: RequestHandler = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user!.userId, req.body);
    res.json({ success: true, data: { user: toSafeUser(user) } });
  } catch (error) {
    next(error);
  }
};

export const logSearchHistory: RequestHandler = async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (keyword && typeof keyword === 'string' && req.user) {
      const repo = AppDataSource.getRepository(SearchHistory);
      await repo.save(repo.create({
        userId: req.user.userId,
        role: req.user.role,
        keyword: keyword.trim().slice(0, 255),
      }));
    }
    res.json({ success: true, data: { message: 'Logged' } });
  } catch (error) {
    next(error);
  }
};
