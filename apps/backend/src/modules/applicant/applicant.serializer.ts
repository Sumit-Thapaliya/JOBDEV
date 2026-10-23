import type { Application } from '../application/application.entity.js';
import type { Job } from '../job/job.entity.js';
import type { User } from '../user/user.entity.js';
import {
  contactSummary,
  maskContactFields,
  redactContactTextDeep,
  type MaskedContact,
} from '../../common/crypto/contact-token.js';

/**
 * What a recruiter receives about one applicant.
 *
 * The rule this file exists to enforce: **contact fields are shown, their
 * values are not.** Email / phone / LinkedIn arrive as keyed digests, and the
 * raw values never leave the server — masking in the browser protects nothing,
 * because the browser already has whatever the network handed it.
 */

export type ResumeLine = { heading: string; lines: string[] };

export type ResumeView = {
  name: string;
  headline: string;
  summary: string;
  experience: Array<{ role: string; company: string; period: string; details: string[] }>;
  education: string[];
  skills: string[];
  /** Everything else the parser found, kept as headed lines. */
  sections: ResumeLine[];
};

export type ApplicantPayload = {
  id: string;
  status: string;
  appliedAt: string;
  job: { id: string; title: string; company: string; location: string | null } | null;
  candidate: {
    id: string;
    name: string;
    location: string | null;
    contactMode: 'blurred';
    contact: MaskedContact;
    resumeFileName: string | null;
    resumeUploadedAt: string | null;
    hasResume: boolean;
    resume: ResumeView;
  };
};

/* ------------------------------------------------------------------ helpers */

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : '';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** `{ resume: { … } }`, `{ data: { … } }`, `{ raw_resume_data: { … } }` … */
const ENVELOPES = ['resume', 'data', 'result', 'parsed', 'document', 'profile', 'output', 'payload', 'raw_resume_data', 'resume_data', 'response', 'content'];

function inner(parsed: Record<string, unknown>): Record<string, unknown> {
  for (const key of ENVELOPES) {
    const candidate = object(parsed[key]);
    if (Object.keys(candidate).length) return candidate;
  }
  return parsed;
}

const firstOf = (source: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return '';
};

const listOf = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [item.trim()];
      if (item && typeof item === 'object') {
        const record = object(item);
        const line = firstOf(record, ['text', 'detail', 'description', 'bullet', 'name', 'value']);
        return line ? [line] : [];
      }
      return [];
    });
  }
  const single = text(value);
  return single ? single.split(/\s*[|•·]\s*/).filter(Boolean) : [];
};

/** The column is jsonb today, but rows written by older code hold a JSON
 *  *string* (occasionally stringified twice). Decode through strings so both
 *  shapes render identically instead of coming out blank. */
function decodeJson(value: unknown): unknown {
  let current = value;
  for (let step = 0; step < 3 && typeof current === 'string'; step += 1) {
    const trimmed = current.trim();
    if (!trimmed || !'{["'.includes(trimmed[0])) break;
    try {
      current = JSON.parse(trimmed);
    } catch {
      break;
    }
  }
  return current;
}

/**
 * Rows saved by the OLD editor hold their canvas (`{ pages: [...] }`) as the
 * parsed profile. There is no semantic structure to recover, so the text runs
 * are replayed in reading order — an old row shows its content instead of a
 * blank sheet with junk headings.
 */
function canvasTextLines(payload: Record<string, unknown>): string[] {
  const runs: Array<{ y: number; x: number; size: number; text: string }> = [];
  for (const page of array(payload.pages)) {
    for (const item of array(object(page).objects)) {
      const run = object(item);
      if (typeof run.text !== 'string') continue;
      const line = text(run.text);
      if (!line) continue;
      runs.push({
        y: Number(run.y ?? 0),
        x: Number(run.x ?? 0),
        size: Number(object(run.style).size ?? 0),
        text: line,
      });
    }
  }
  runs.sort((a, b) => a.y - b.y || a.x - b.x);
  return runs.map((run) => run.text);
}

/* ------------------------------------------------------------------- resume */

/**
 * Turns the parsed-resume JSON into the recruiter's read-only view: the CV's
 * content stays, every contact value inside it is tokenised first.
 */
export function buildResumeView(parsedProfile: unknown): ResumeView {
  const root = inner(object(decodeJson(parsedProfile)));

  /* Legacy canvas row: replay its text instead of inventing sections. */
  const canvasLines = canvasTextLines(root);
  if (canvasLines.length) {
    const [firstLine, ...rest] = canvasLines;
    const sweptName = redactContactTextDeep(firstLine) as string;
    const sweptLines = redactContactTextDeep(rest.length ? rest : canvasLines) as string[];
    return {
      name: sweptName,
      headline: '',
      summary: '',
      experience: [],
      education: [],
      skills: [],
      sections: [{ heading: 'Saved resume', lines: sweptLines }],
    };
  }

  const basics = (() => {
    const direct = object(root.basics);
    return Object.keys(direct).length ? direct : root;
  })();

  const name =
    firstOf(basics, ['name', 'full_name', 'fullName']) ||
    firstOf(root, ['candidate_name', 'name', 'full_name', 'fullName']);
  const headline =
    firstOf(basics, ['headline', 'title', 'label', 'role']) ||
    firstOf(root, ['headline', 'title', 'label']);
  const summary =
    firstOf(basics, ['summary', 'about', 'profile', 'objective']) ||
    firstOf(root, ['summary', 'about', 'profile', 'objective', 'professional_summary']);

  const workSource = [
    ...array(root.work),
    ...array(root.experience),
    ...array(root.work_experience),
    ...array(root.workExperience),
    ...array(root.employment),
    ...array(root.positions),
  ];
  const experience = workSource.map((item) => {
    const record = object(item);
    const company = firstOf(record, ['company', 'employer', 'organisation', 'organization', 'name']);
    const role = firstOf(record, ['role', 'position', 'title', 'job_title', 'designation']);
    const start = firstOf(record, ['start_date', 'startDate', 'from', 'start']);
    const end = firstOf(record, ['end_date', 'endDate', 'to', 'end']);
    const period =
      firstOf(record, ['period', 'dates', 'duration']) ||
      [start, end].filter(Boolean).join(' — ');
    const details = [
      ...listOf(record.highlights),
      ...listOf(record.bullets),
      ...listOf(record.achievements),
      ...listOf(record.details),
      ...listOf(record.description),
    ];
    return { role: role || company, company: company && role ? company : '', period, details };
  });

  const education = [
    ...listOf(root.education),
    ...array(root.education)
      .map((item) => {
        const record = object(item);
        const title = firstOf(record, ['degree', 'studyType', 'title', 'qualification']);
        const organisation = firstOf(record, ['institution', 'school', 'university', 'organisation', 'organization', 'name']);
        const year = firstOf(record, ['end_date', 'endDate', 'year', 'graduation_date']);
        return [title, organisation, year].filter(Boolean).join(' · ');
      })
      .filter(Boolean),
    ...listOf(root.qualifications),
  ];

  const skills = [
    ...listOf(root.skills),
    ...array(root.skills)
      .map((item) => {
        const record = object(item);
        return firstOf(record, ['name', 'skill', 'text']);
      })
      .filter(Boolean),
    ...listOf(root.technical_skills),
    ...listOf(root.technologies),
  ];

  /* Headed sections for whatever else the parser produced. */
  const known = new Set([
    'basics', 'name', 'full_name', 'fullName', 'candidate_name', 'headline', 'title', 'label', 'role',
    'summary', 'about', 'profile', 'objective', 'professional_summary',
    'work', 'experience', 'work_experience', 'workExperience', 'employment', 'positions',
    'education', 'qualifications', 'skills', 'technical_skills', 'technologies', ...ENVELOPES,
    /* meta of our own saves — never resume content */
    'kind', 'version', 'app', 'savedAt', 'jobId', 'canvas', 'assets', 'pages', 'objects',
    'id', 'userId', 'fileName', 'uploadedAt', 'createdAt', 'updatedAt', 'meta',
    /* shown elsewhere (drawer / contact block) or withheld from this view */
    'location', 'city', 'country', 'region', 'address',
    'email', 'email_address', 'phone', 'mobile', 'phone_number', 'contact_number', 'contact',
    'linkedin', 'github', 'website', 'url', 'portfolio', 'links',
    'expectedSalary', 'noticePeriod', 'seniority', 'workModes', 'openToWork', 'avatar',
  ]);
  const sections: ResumeLine[] = [];
  for (const [key, value] of Object.entries(root)) {
    if (known.has(key)) continue;
    const lines = listOf(value);
    if (!lines.length) continue;
    sections.push({ heading: key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()), lines });
  }

  /*
   * Two passes, because contact data hides in two places:
   *   1. under a key  — `email`, `phone`, `linkedin` … → keyed digest;
   *   2. inside a sentence — "reach me at x@y.com" → `[hidden email]`.
   * A CV written by hand has plenty of the second kind, so no string leaves
   * this function un-swept.
   */
  const withoutContacts = maskContactFields({ experience, education, skills, sections });
  const swept = redactContactTextDeep({
    headline,
    summary,
    sections: withoutContacts as {
      experience: ResumeView['experience'];
      education: string[];
      skills: string[];
      sections: ResumeLine[];
    },
  });

  /* The parser can repeat a skill (it appears in two CV sections); the sheet
     shows each one once. */
  const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

  return {
    name,
    headline: swept.headline,
    summary: swept.summary,
    experience: swept.sections.experience,
    education: unique(swept.sections.education),
    skills: unique(swept.sections.skills),
    sections: swept.sections.sections.map((section) => ({ ...section, lines: unique(section.lines) })),
  };
}

/* ---------------------------------------------------------------- applicant */

export function toApplicantPayload(
  application: Application,
  candidate: User | null,
  job: Job | null,
): ApplicantPayload {
  const parsed = decodeJson(candidate?.parsedProfile ?? null);
  return {
    id: application.applicationId,
    status: application.status,
    appliedAt: application.createdAt?.toISOString?.() ?? String(application.createdAt ?? ''),
    job: job
      ? { id: job.id, title: job.title, company: job.company, location: job.location ?? null }
      : null,
    candidate: {
      id: application.candidateId,
      /* Name and location are not secret — the recruiter has to know who they
         are looking at. Everything reachable by email/phone/link is blurred. */
      name: candidate?.name ?? 'Candidate',
      /* Location stays readable on purpose — it is screening data, not contact
         data, and it is not one of the fields this round is hiding. */
      location: readableLocation(parsed),
      contactMode: 'blurred',
      contact: contactSummary(parsed),
      resumeFileName: candidate?.resumeFileName ?? null,
      resumeUploadedAt: candidate?.resumeUploadedAt?.toISOString?.() ?? null,
      hasResume: Boolean(parsed || candidate?.resumeFileName),
      resume: buildResumeView(parsed),
    },
  };
}

function readableLocation(parsedProfile: unknown): string | null {
  const root = inner(object(decodeJson(parsedProfile)));
  const basics = object(root.basics);
  const source = Object.keys(basics).length ? { ...root, ...basics } : root;
  for (const key of ['location', 'city', 'country', 'region']) {
    const value = text(source[key]);
    if (value) return value;
  }
  return null;
}

export const maskForOwner = (parsedProfile: unknown) => maskContactFields(decodeJson(parsedProfile));
