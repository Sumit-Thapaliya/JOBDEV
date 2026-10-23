import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
export type UserRole = 'candidate' | 'recruiter' | 'admin' | 'superadmin';

export interface AuthUser {
  id: string;
  identifier: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: UserRole;
  companyName: string | null;
  aboutCompany: string | null;
  contactNumber: string | null;
  avatar: string | null;
  resumeFileName: string | null;
  parsedProfile: Record<string, unknown> | string | null;
  createdAt: string;
}

export interface RegisterPayload {
  identifier: string;
  password: string;
  role: 'candidate' | 'recruiter';
}

export interface UpdateProfilePayload {
  name?: string;
  companyName?: string;
  aboutCompany?: string | null;
  contactNumber?: string;
  avatar?: string;
  parsedProfile?: Record<string, unknown> | null;
}

type AuthResult = { user: AuthUser };
export type ResumeUploadResult = AuthResult & {
  parsed: Record<string, unknown> | null;
  atsError: string | null;
  /** Base64 of the 1-page ATS PDF the service built (null when unavailable). */
  atsPdfBase64: string | null;
};
export const registerRequest = (data: RegisterPayload) =>
  apiPost<{ requiresOtp: boolean; identifier: string }>(
    '/api/auth/register',
    data,
  );
export const loginRequest = (identifier: string, password: string) =>
  apiPost<{ requiresOtp: boolean; identifier: string }>('/api/auth/login', {
    identifier,
    password,
  });
export const verifyOtpRequest = (identifier: string, otp: string) =>
  apiPost<AuthResult>('/api/auth/verify-otp', { identifier, otp });
export const meRequest = async (signal?: AbortSignal) =>
  (await apiGet<AuthResult>('/api/auth/me', signal)).user;
export const logoutRequest = () => apiPost('/api/auth/logout');
export const updateProfileRequest = (data: UpdateProfilePayload) =>
  apiPatch<AuthResult>('/api/auth/profile', data);
export const uploadResumeRequest = (
  fileName: string,
  dataBase64: string,
  parsed?: Record<string, unknown> | null,
) =>
  apiPost<ResumeUploadResult>('/api/auth/resume', {
    fileName,
    dataBase64,
    ...(parsed ? { parsed } : {}),
  });
export const changePasswordRequest = (
  currentPassword: string,
  newPassword: string,
) => apiPost('/api/auth/change-password', { currentPassword, newPassword });
export const logSearchKeywordRequest = (keyword: string) =>
  apiPost('/api/auth/search-history', { keyword });
export const recruiterProfileIncomplete = (user?: AuthUser | null) =>
  !!user &&
  user.role === 'recruiter' &&
  (!user.companyName || !user.contactNumber || !user.avatar);
export const candidateProfileIncomplete = (user?: AuthUser | null) =>
  !!user && user.role === 'candidate' && !user.resumeFileName;
