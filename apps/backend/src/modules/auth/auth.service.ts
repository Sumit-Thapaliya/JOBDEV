import { randomInt } from 'node:crypto';
import { AppDataSource } from '../../database/data-source.js';
import { ResumeVersion } from '../user/resume-version.entity.js';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppError } from '../../common/errors/AppError.js';
import { env } from '../../config/env.js';
import { User, UserRole } from '../user/user.entity.js';
import { UserRepository } from '../user/user.repository.js';
import type {
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  VerifyOtpInput,
} from './auth.schema.js';
import type { UpdateUserInput } from '../user/user.types.js';

export const COOKIE_NAME = 'jobdev_token';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const OTP_TTL_MS = 10 * 60 * 1000;
const TESTING_OTP = '123456';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmailIdentifier = (identifier: string) =>
  EMAIL_PATTERN.test(identifier.trim());

export const normalizePhone = (identifier: string) =>
  identifier.replace(/[\s()-]/g, '');

const randomDigits = (length: number) => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += randomInt(0, 10).toString();
  }
  return out;
};

export const toSafeUser = (user: User) => ({
  id: user.userId,
  identifier: user.email ?? user.mobile,
  email: user.email,
  phone: user.mobile,
  name: user.name,
  role: user.role.toLowerCase(),
  companyName: user.companyName,
  aboutCompany: user.aboutCompany ?? null,
  contactNumber: user.contactNumber,
  avatar: user.avatar,
  resumeFileName: user.resumeFileName ?? null,
  parsedProfile: user.parsedProfile ?? null,
  createdAt: user.createdAt,
});

export const signSession = (user: User) =>
  jwt.sign({ sub: user.userId, ver: user.sessionVersion }, env.JWT_SECRET, {
    algorithm: 'HS256', issuer: 'jobdev-cookie-v2', audience: 'jobdev-web',
    expiresIn: SESSION_TTL_SECONDS,
  });

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_SECONDS * 1000,
});

export class AuthService {
  private userRepo = new UserRepository();

  private async findByIdentifier(identifier: string) {
    return isEmailIdentifier(identifier)
      ? this.userRepo.findByEmail(identifier.trim().toLowerCase())
      : this.userRepo.findByMobile(normalizePhone(identifier));
  }

  private async issueOtp(user: User) {
    // There is no delivery provider in this repo yet. Do not pretend an OTP was
    // delivered, log it in production, or allow the public development bypass.
    if (env.NODE_ENV === 'production') throw new AppError(503, 'OTP delivery is not configured. Contact the administrator.');
    const otp =
      env.STATIC_OTP.length > 0
        ? env.STATIC_OTP
        : TESTING_OTP;
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + OTP_TTL_MS);
    await this.userRepo.updateOnly(user.userId, { otpHash, otpExpiry });

  }

  async register(input: RegisterInput) {
    if (env.NODE_ENV === 'production') throw new AppError(503, 'OTP delivery is not configured. Contact the administrator.');
    const role =
      input.role === 'recruiter' ? UserRole.RECRUITER : UserRole.CANDIDATE;

    let email: string | null = null;
    let mobile: string;

    if (isEmailIdentifier(input.identifier)) {
      email = input.identifier.trim().toLowerCase();
      if (await this.userRepo.findByEmail(email)) {
        throw new AppError(409, 'An account with this email already exists');
      }
      mobile = randomDigits(10);
      while (await this.userRepo.findByMobile(mobile)) {
        mobile = randomDigits(10);
      }
    } else {
      mobile = normalizePhone(input.identifier);
      if (await this.userRepo.findByMobile(mobile)) {
        throw new AppError(409, 'An account with this phone already exists');
      }
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);
    const user = await this.userRepo.create({
      email,
      mobile,
      password: hashedPassword,
      role,
    });

    await this.issueOtp(user);
    return user;
  }

  async startLogin(input: LoginInput) {
    const user = await this.findByIdentifier(input.identifier);
    if (!user || user.isDeleted) {
      throw new AppError(401, 'Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.password);
    if (!isMatch) {
      throw new AppError(401, 'Invalid email or password');
    }

    await this.issueOtp(user);
    return { identifier: user.email ?? user.mobile };
  }

  async verifyOtp(input: VerifyOtpInput) {
    if (env.NODE_ENV === 'production') throw new AppError(503, 'OTP delivery is not configured. Contact the administrator.');
    const user = await this.findByIdentifier(input.identifier);
    if (!user || user.isDeleted || !user.otpHash || !user.otpExpiry) {
      throw new AppError(400, 'Invalid or expired OTP');
    }

    if (user.otpExpiry.getTime() < Date.now()) {
      await this.userRepo.updateOnly(user.userId, { otpHash: null, otpExpiry: null });
      throw new AppError(400, 'Invalid or expired OTP');
    }

    const isMatch = await bcrypt.compare(input.otp, user.otpHash);
    if (!isMatch) {
      throw new AppError(400, 'Invalid or expired OTP');
    }

    const consumed = await AppDataSource.getRepository(User).createQueryBuilder().update(User)
      .set({ otpHash: null, otpExpiry: null })
      .where('"userId" = :id AND "otpHash" = :hash AND "otpExpiry" > NOW()', { id: user.userId, hash: user.otpHash }).execute();
    if (!consumed.affected) throw new AppError(400, 'Invalid or expired OTP');
    return user;
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.userRepo.findById(userId);
    if (!user || user.isDeleted) {
      throw new AppError(404, 'User not found');
    }
    // Zod already validated the request. Store JSON as JSON, not serialized text.
    return this.userRepo.update(userId, input);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findById(userId);
    if (!user || user.isDeleted) {
      throw new AppError(404, 'User not found');
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new AppError(400, 'Current password is incorrect');
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await AppDataSource.getRepository(User).createQueryBuilder().update(User)
      .set({ password: hashed, sessionVersion: () => '"sessionVersion" + 1' })
      .where('"userId" = :userId', { userId }).execute();
    return this.userRepo.findById(userId);
  }

  async uploadResume(
    userId: string,
    fileName: string,
    dataBase64: string,
    parsed?: Record<string, unknown> | null,
    /** The 1-page ATS PDF from the service — becomes users.resumePdf. */
    atsPdf?: Buffer | null,
  ) {
    const user = await this.userRepo.findById(userId);
    if (!user || user.isDeleted) {
      throw new AppError(404, 'User not found');
    }

    /* Pull the identity fields out of the extracted resume so the account
       profile (name, email, phone) mirrors the CV that was uploaded. */
    const resume =
      parsed?.raw_resume_data && typeof parsed.raw_resume_data === 'object'
        ? (parsed.raw_resume_data as Record<string, unknown>)
        : {};
    const basics =
      resume.basics && typeof resume.basics === 'object'
        ? (resume.basics as Record<string, unknown>)
        : {};
    const text = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : '';
    const cvName = text(basics.name) || text(parsed?.candidate_name);
    const rawEmail = text(basics.email).toLowerCase();
    const rawPhone = text(basics.phone);

    /* For now the CV only fills identity fields that are still empty, so an
       account's existing login credentials keep working after an upload. */
    let cvEmail = '';
    if (!user.email && rawEmail && EMAIL_PATTERN.test(rawEmail)) {
      const taken = await this.userRepo.findByEmail(rawEmail);
      if (!taken) cvEmail = rawEmail;
    }
    let cvPhone = '';
    if (!user.mobile && rawPhone) {
      const taken = await this.userRepo.findByMobile(rawPhone);
      if (!taken) cvPhone = rawPhone;
    }

    return AppDataSource.transaction(async manager => {
      const current = await manager.getRepository(User).findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
      if (!current) throw new AppError(404, 'User not found');
      await manager.delete(ResumeVersion, { userId });
      await manager.query('DELETE FROM resume_assets WHERE "userId" = $1', [userId]);
      Object.assign(current, {
        resumeCanvas: null,
        resumePdf: atsPdf ?? null,
        resumeFileName: fileName,
        resumeData: dataBase64,
        resumeUploadedAt: new Date(),
        parsedProfile: parsed ?? null,
        /* Auto-fill the profile straight from the CV: name, email and phone
           number come from the extracted basics when present and still free. */
        ...(cvName ? { name: cvName } : {}),
        ...(cvEmail ? { email: cvEmail } : {}),
        ...(cvPhone ? { mobile: cvPhone } : {}),
      });
      return manager.getRepository(User).save(current);
    });
  }
}
