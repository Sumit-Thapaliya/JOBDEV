/* Recruiter workspace data.
 * Everything starts EMPTY - jobs are created through "Post a job", applicants
 * arrive once the applications backend module lands. No seeded/demo rows. */

export type JobStatus = 'Active' | 'Paused' | 'Closed';

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
  salary: string;
  status: JobStatus;
  applicants: number;
  views: number;
  postedDaysAgo: number;
  postedHoursAgo: number;
  postedTimeText: string;
  postedOn: string;
  statusChangedOn?: string;
  description?: string;
  minimumQualifications?: string;
  preferredQualifications?: string;
  requirements?: string[];
}

export type ApplicantStatus =
  | 'New'
  | 'Shortlisted'
  | 'Interview'
  | 'Hired'
  | 'Rejected';

/** Human-readable meaning of each pipeline stage (used in tooltips/legend).
 * Workflow: New -> Shortlisted -> Interview -> Hired or Rejected. */
export const STATUS_MEANINGS: Record<ApplicantStatus, string> = {
  New: 'Applied and waiting for the resume screen.',
  Shortlisted: 'Resume screen passed, waiting for an interview call.',
  Interview: 'Interview scheduled or in progress, next: hire or reject.',
  Hired: 'Offer accepted, now part of your team.',
  Rejected: 'Not moving forward for this role.',
};

/**
 * A contact value the server deliberately withheld.
 *
 * The recruiter API sends the FIELD (so the UI can say "email exists") plus a
 * keyed digest instead of the value. `token` is a one-way HMAC-SHA256 — it is
 * rendered under a blur and cannot be turned back into an address.
 */
export interface MaskedField {
  label: string;
  state: 'blurred' | 'missing';
  token: string | null;
  length: number;
}

export interface MaskedContact {
  email: MaskedField;
  phone: MaskedField;
  linkedin: MaskedField;
  /** Other links found in the CV (GitHub, website, …), also blurred. */
  other: Array<{ label: string; token: string | null; length: number }>;
}

export interface ResumeView {
  name: string;
  headline: string;
  summary: string;
  experience: Array<{ role: string; company: string; period: string; details: string[] }>;
  education: string[];
  skills: string[];
  sections: Array<{ heading: string; lines: string[] }>;
}

export interface Applicant {
  id: string;
  candidateId?: string;
  resumeUrl?: string;
  name: string;
  job: string;
  match: number;
  status: ApplicantStatus;
  appliedDaysAgo: number;
  email: string;
  phone: string;
  /* When the API masks contact data these hold the blurred digest instead of
     the real value; `contactMasked` tells the UI to blur the row. */
  linkedin?: string;
  contactMasked?: boolean;
  contact?: MaskedContact;
  location: string;
  summary: string;
  skills: string[];
  experience: Array<{ role: string; company: string; period: string }>;
  education: string;
  scheduledDate?: string;
  /** The parsed CV, already contact-masked by the server. */
  resume?: ResumeView;
  resumeFileName?: string | null;
  hasResume?: boolean;
}

export interface Conversation {
  id: string;
  name: string;
  role: string;
  unread: number;
  messages: Array<{ from: 'them' | 'me'; text: string; time: string }>;
}

export interface Notification {
  id: string;
  text: string;
  time: string;
  read: boolean;
  view: 'applicants' | 'jobs';
}

export const INITIAL_JOBS: Job[] = [];

export const INITIAL_APPLICANTS: Applicant[] = [];

export const INITIAL_CONVERSATIONS: Conversation[] = [];

export const INITIAL_NOTIFICATIONS: Notification[] = [];

export const WEEKLY: Array<{ week: string; applications: number; interviews: number }> = [];

export const SOURCES: Array<{ label: string; value: number; colorClass: string }> = [];