'use client';

import {
  BadgeCheck,
  Briefcase,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Globe,
  GraduationCap,
  Mail,
  MapPin,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession, useSetSession } from '@/features/auth/queries';
import { cn } from '@/lib/utils';
import { SourcesDonut, WeeklyBars } from './charts';
import { ContactRow, ResumePaper } from './resume-paper';

import { RecruiterProfileForm } from '../recruiter-profile-form';
import {
  SOURCES,
  STATUS_MEANINGS,
  type Applicant,
  type ApplicantStatus,
  type Conversation,
  type Job,
  type JobStatus,
} from './mock-data';
import { HelpCard } from './sidebar';

/* --- shared bits ------------------------------------------------------- */

export function StatusChip({
  status,
}: {
  status: JobStatus | ApplicantStatus;
}) {
  const tones: Record<string, string> = {
    Active: 'bg-success/10 text-success',
    Paused: 'bg-warning/10 text-warning',
    Closed: 'bg-muted text-muted-foreground',
    New: 'bg-primary-light text-primary-dark',
    Shortlisted: 'bg-muted text-muted-foreground',
    Interview: 'bg-warning/10 text-warning',
    Hired: 'bg-success/10 text-success',
    Rejected: 'bg-destructive/10 text-destructive',
  };
  return (
    <span
      title={STATUS_MEANINGS[status as ApplicantStatus]}
      className={cn(
        'inline-flex cursor-help items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[status] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {status}
    </span>
  );
}

/* Plain colored % - minimal, like the reference design. */
function matchTone(value: number) {
  if (value >= 80) return 'text-primary';
  if (value >= 65) return 'text-warning';
  return 'text-destructive';
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground',
        className,
      )}
    >
      {initials}
    </span>
  );
}

function MatchBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-muted-foreground">
        {value}%
      </span>
    </div>
  );
}

/* Applicant details come from /api/applicants. Contact values arrive as one-way
 * digests — the real email / phone / LinkedIn never reach the browser — and the
 * CV renders from the parsed JSON as a paper page (a PDF's text layer cannot be
 * blurred, so no resume file is served to recruiters here). */

interface DrawerProps {
  applicant: Applicant | null;
  onClose: () => void;
  onSetStatus?: (id: string, status: ApplicantStatus) => void;
  onScheduleInterview?: (id: string, dateLabel: string) => void;
  /** Opens (or re-uses) the chat thread for this applicant and switches tab. */
  onMessage?: (applicant: Applicant) => void;
  messageBusy?: boolean;
  profileOnly?: boolean;
}

export function ApplicantDrawer({
  applicant,
  onClose,
  onSetStatus,
  onScheduleInterview,
  onMessage,
  messageBusy = false,
  profileOnly = false,
}: DrawerProps) {
  const [scheduling, setScheduling] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const { data: viewer } = useSession();
  useEffect(() => { setResumeOpen(false); }, [applicant?.id]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { if (resumeOpen) setResumeOpen(false); else onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, resumeOpen]);

  if (!applicant) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {resumeOpen && (
        <div role="dialog" aria-modal="true" aria-label="Candidate resume" className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/50 p-3 sm:p-6">
          <section className="flex h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold">{applicant.name} — JobDev resume</h3>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setResumeOpen(false)} aria-label="Close resume"><X className="h-4 w-4" /></Button>
              </div>
            </div>
            {applicant.resume ? (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 scrollbar-slim">
                <ResumePaper
                  resume={applicant.resume}
                  contact={applicant.contact}
                  watermarkLabel={viewer?.email ?? viewer?.name ?? 'Recruiter view'}
                />
              </div>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                No parsed resume on this profile yet — contact details stay hidden either way.
              </p>
            )}
          </section>
        </div>
      )}
      <div
        className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="animate-slide-in-right absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card shadow-2xl scrollbar-slim">
        {/* Header */}
        <div className="relative bg-primary p-6 text-primary-foreground">
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg bg-white/15 p-1.5 transition-colors hover:bg-white/25"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-4">
            <Avatar name={applicant.name} className="h-14 w-14 text-base ring-2 ring-white/40" />
            <div>
              <h3 className="text-lg font-bold">{applicant.name}</h3>
              <p className="text-sm text-white/80">{applicant.job}</p>
              <div className="mt-1.5">
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">
                  {profileOnly ? 'Viewed profile' : applicant.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 p-6">
          {/* Contact — the API replaces email / phone / links with a one-way
              digest before they are sent; location stays readable on purpose
              (screening data, not contact data). */}
          <section className="space-y-2 text-sm">
            <p>
              <ContactRow icon={Mail} value={applicant.email} label="Email" masked={applicant.contactMasked} />
            </p>
            <p>
              <ContactRow icon={Phone} value={applicant.phone} label="Phone" masked={applicant.contactMasked} />
            </p>
            {applicant.linkedin ? (
              <p>
                <ContactRow icon={Globe} value={applicant.linkedin} label="LinkedIn" masked={applicant.contactMasked} />
              </p>
            ) : null}
            {(applicant.contact?.other ?? []).map((link) => (
              <p key={link.label}>
                <ContactRow icon={Globe} value={link.token ?? ''} label={link.label} masked={applicant.contactMasked} />
              </p>
            ))}
            {(applicant.location || !profileOnly) && <p className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" /> {applicant.location}{!profileOnly && ' · '}
              {!profileOnly && <>applied {applicant.appliedDaysAgo}d ago</>}
            </p>}
          </section>

          {applicant.scheduledDate && (
            <p className="flex items-center gap-2 rounded-xl bg-warning/10 p-3 text-sm font-semibold text-warning">
              <CalendarCheck className="h-4 w-4 shrink-0" />
              Interview scheduled · {applicant.scheduledDate}
            </p>
          )}

          {!profileOnly && <section>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold">ATS match score</span>
              <MatchBar value={applicant.match} />
            </div>
          </section>}

          {applicant.summary && <section>
            <h4 className="mb-1.5 text-sm font-bold">Summary</h4>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {applicant.summary}
            </p>
          </section>}

          {applicant.skills.length > 0 && <section>
            <h4 className="mb-2 text-sm font-bold">Skills</h4>
            <div className="flex flex-wrap gap-1.5">
              {applicant.skills.map((skill, index) => (
                <span
                  key={`${skill}-${index}`}
                  className="animate-pop-in rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary-dark"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>}

          {applicant.experience.length > 0 && <section>
            <h4 className="mb-2 text-sm font-bold">Experience</h4>
            <ul className="space-y-2.5">
              {applicant.experience.map((entry, index) => (
                <li
                  key={`${entry.company}-${entry.period}-${index}`}
                  className="rounded-xl border border-border p-3"
                >
                  <p className="text-sm font-semibold">{entry.role}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.company} · {entry.period}
                  </p>
                </li>
              ))}
            </ul>
          </section>}

          {applicant.education && <section>
            <h4 className="mb-1.5 flex items-center gap-2 text-sm font-bold">
              <GraduationCap className="h-4 w-4 text-primary" /> Education
            </h4>
            <p className="text-sm text-muted-foreground">{applicant.education}</p>
          </section>}

          <section>
            <h4 className="mb-1.5 font-semibold">Resume / CV</h4>
            <Button variant="outline" className="w-full" disabled={!applicant.resume} onClick={() => setResumeOpen(true)}>
              <FileText className="h-4 w-4" />
              {applicant.resume ? 'View resume' : 'No resume uploaded'}
            </Button>
            {applicant.resume && (
              <p className="mt-2 text-xs text-muted-foreground">
                Parsed from {applicant.resumeFileName ?? 'the uploaded file'} · contact details hidden
              </p>
            )}
          </section>

          <section>
            <h4 className="mb-1.5 font-semibold">Messages</h4>
            <Button
              className="w-full"
              disabled={!onMessage || messageBusy}
              onClick={() => onMessage?.(applicant)}
            >
              <MessageSquare className="h-4 w-4" />
              {messageBusy ? 'Opening…' : 'Message candidate'}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              The candidate can reply once you send the first message.
            </p>
          </section>
        </div>

        {/* Workflow actions per stage:
            New = Shortlist/Reject, Shortlisted = Interview/Reject,
            Interview = Hire/Reschedule/Reject, Hired/Rejected = terminal. */}
        {!profileOnly && <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card p-4">
          {applicant.status === 'New' && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onSetStatus?.(applicant.id, 'Shortlisted')}
            >
              <Check className="h-4 w-4" />
              Shortlist
            </Button>
          )}
          {applicant.status === 'Shortlisted' && (
            <Button className="flex-1" onClick={() => setScheduling(true)}>
              <CalendarCheck className="h-4 w-4" />
              Interview
            </Button>
          )}
          {applicant.status === 'Interview' && (
            <>
              <Button
                className="flex-1"
                onClick={() => onSetStatus?.(applicant.id, 'Hired')}
              >
                <BadgeCheck className="h-4 w-4" />
                Hire
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setScheduling(true)}
              >
                <CalendarCheck className="h-4 w-4" />
                Reschedule
              </Button>
            </>
          )}
          {(applicant.status === 'New' ||
            applicant.status === 'Shortlisted' ||
            applicant.status === 'Interview') && (
            <Button
              variant="ghost"
              className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onSetStatus?.(applicant.id, 'Rejected')}
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
          )}
          {(applicant.status === 'Hired' ||
            applicant.status === 'Rejected') && (
            <p className="flex-1 py-2 text-center text-xs text-muted-foreground">
              {applicant.status === 'Hired'
                ? 'Hired. This pipeline is complete.'
                : 'Rejected. Use the reopen action on the list to reconsider.'}
            </p>
          )}
        </div>}
      </aside>

      {scheduling && (
        <ScheduleModal
          name={applicant.name}
          onClose={() => setScheduling(false)}
          onPick={(label) => {
            onScheduleInterview?.(applicant.id, label);
            setScheduling(false);
          }}
        />
      )}
    </div>
  );
}

/* --- Jobs --------------------------------------------------------------- */

const EMPTY_FORM = {
  title: '',
  department: 'Engineering',
  location: '',
  type: 'Full-time',
  salary: '',
  description: '',
  minimumQualifications: '',
  preferredQualifications: '',
};

interface JobsViewProps {
  jobs: Job[];
  onAdd: (job: Job) => Promise<void>;
  posting: boolean;
  onSetStatus: (id: string, status: JobStatus) => void;
  onViewApplicants: (jobTitle: string) => void;
  onOpenJob: (job: Job) => void;
  openSignal: number;
}

export function JobsView({
  jobs,
  onAdd,
  posting,
  onSetStatus,
  onViewApplicants,
  onOpenJob,
  openSignal,
}: JobsViewProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (posting || !form.title.trim() || !form.description.trim() || !form.minimumQualifications.trim()) return;
    try { await onAdd({
      id: `job-${Date.now()}`,
      title: form.title.trim(),
      department: form.department,
      location: form.location.trim() || 'Remote',
      type: form.type as Job['type'],
      salary: form.salary.trim() || 'Negotiable',
      description: form.description.trim(),
      minimumQualifications: form.minimumQualifications.trim(),
      preferredQualifications: form.preferredQualifications.trim(),
      status: 'Active',
      applicants: 0,
      views: 0,
      postedDaysAgo: 0,
      postedHoursAgo: 0,
      postedTimeText: '0 hours ago',
      postedOn: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    }); } catch { return; } // Keep the full draft open after a failed mutation.
    setForm(EMPTY_FORM);
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="animate-fade-in-up text-xl font-bold">My Jobs</h2>
          <p className="text-sm text-muted-foreground">
            {jobs.filter((job) => job.status === 'Active').length} active ·{' '}
            {jobs.reduce((sum, job) => sum + job.applicants, 0)} total
            applicants
          </p>
        </div>
        <Button onClick={() => setOpen((value) => !value)}>
          {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {open ? 'Cancel' : 'Post a job'}
        </Button>
      </div>

      {open && (
        <form
          onSubmit={submit}
          className="animate-fade-in-up grid gap-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-lg sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="job-title">Job title</Label>
            <Input
              id="job-title"
              placeholder="e.g. Java developer"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="job-dept">Department</Label>
            <Input
              id="job-dept"
              value={form.department}
              onChange={(event) =>
                setForm({ ...form, department: event.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="job-type">Employment type</Label>
            <select
              id="job-type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {['Full-time', 'Part-time', 'Contract', 'Internship'].map(
                (type) => (
                  <option key={type}>{type}</option>
                ),
              )}
            </select>
          </div>
          <div>
            <Label htmlFor="job-loc">Location</Label>
            <Input
              id="job-loc"
              placeholder="Kathmandu / Remote"
              value={form.location}
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="job-salary">Minimum salary or range (Optional)</Label>
            <Input
              id="job-salary"
              placeholder="Rs 80k–120k"
              value={form.salary}
              onChange={(event) => setForm({ ...form, salary: event.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="job-desc">Job description</Label>
            <Textarea id="job-desc" placeholder="What will this person do on a day-to-day basis?" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="min-h-[80px]" required maxLength={20000} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="job-min-qual">Minimum qualifications</Label>
            <Textarea id="job-min-qual" placeholder="e.g. Bachelors degree, 3+ years experience" value={form.minimumQualifications} onChange={event => setForm({ ...form, minimumQualifications: event.target.value })} className="min-h-[80px]" required maxLength={12000} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="job-pref-qual">Preferred qualifications (Optional)</Label>
            <Textarea id="job-pref-qual" placeholder="e.g. React Query experience is a plus" value={form.preferredQualifications} onChange={event => setForm({ ...form, preferredQualifications: event.target.value })} className="min-h-[80px]"  maxLength={12000} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" className="w-full" disabled={posting}>
              <Briefcase className="h-4 w-4" />
              {posting ? 'Publishing…' : 'Publish job post'}
            </Button>
          </div>
        </form>
      )}

      {jobs.length === 0 && !open && (
        <div className="animate-fade-in-up flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <Briefcase className="h-8 w-8 text-muted-foreground/50" />
          <h3 className="font-semibold">No job posts yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Publish your first role with “Post a job” - it takes under a
            minute and goes live immediately.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {jobs.map((job, index) => (
          <div
            key={job.id}
            role="button"
            tabIndex={0}
            title="Open job details"
            onClick={() => onOpenJob(job)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onOpenJob(job);
            }}
            className="sheen-hover group animate-fade-in-up cursor-pointer rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="font-semibold transition-colors group-hover:text-primary-dark">
                    {job.title}
                  </h3>
                  <StatusChip status={job.status} />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{job.department}</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {job.location}
                  </span>
                  <span>{job.type}</span>
                  <span className="font-medium text-primary-dark">
                    {job.salary}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Posted {job.postedOn}
                  </span>
                  {job.status === 'Paused' && job.statusChangedOn && (
                    <span className="font-medium text-warning">
                      Paused {job.statusChangedOn}
                    </span>
                  )}
                  {job.status === 'Closed' && job.statusChangedOn && (
                    <span className="font-medium text-destructive">
                      Closed {job.statusChangedOn}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {job.views.toLocaleString()}
                </span>
                <span className="font-semibold text-foreground">
                  {job.applicants} applicants
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onViewApplicants(job.title);
                }}
              >
                View applicants
              </Button>
              {job.status !== 'Closed' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetStatus(
                      job.id,
                      job.status === 'Active' ? 'Paused' : 'Active',
                    );
                  }}
                >
                  {job.status === 'Active' ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {job.status === 'Active' ? 'Pause' : 'Activate'}
                </Button>
              )}
              {job.status !== 'Closed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetStatus(job.id, 'Closed');
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Applicants ---------------------------------------------------------- */

const APPLICANT_FILTERS: Array<ApplicantStatus | 'All'> = [
  'All',
  'New',
  'Shortlisted',
  'Interview',
  'Hired',
  'Rejected',
];

interface ApplicantsViewProps {
  applicants: Applicant[];
  onSetStatus: (id: string, status: ApplicantStatus) => void;
  filterJob: string | null;
  onClearJobFilter: () => void;
  onOpen: (applicant: Applicant) => void;
  statusFilter: ApplicantStatus | 'All';
  onStatusFilterChange: (status: ApplicantStatus | 'All') => void;
  onScheduleInterview: (id: string, dateLabel: string) => void;
}

export function ApplicantsView({
  applicants,
  onSetStatus,
  filterJob,
  onClearJobFilter,
  onOpen,
  statusFilter,
  onStatusFilterChange,
  onScheduleInterview,
}: ApplicantsViewProps) {
  const [query, setQuery] = useState('');
  const [scheduling, setScheduling] = useState<Applicant | null>(null);

  const keywordOptions = useMemo(() => {
    const DEFAULT_KEYWORDS = ['Frontend', 'Backend', 'Full-stack', 'React', 'Node.js', 'Java', 'Python', 'Designer'];
    const derived = new Map<string, number>();
    for (const app of applicants) {
      const candidates = [app.job, ...(app.skills || [])];
      for (const raw of candidates) {
        if (!raw || typeof raw !== 'string') continue;
        const kw = raw.trim();
        if (kw.length < 2 || kw.length > 20) continue;
        derived.set(kw, (derived.get(kw) ?? 0) + 1);
      }
    }
    DEFAULT_KEYWORDS.forEach((kw) => derived.set(kw, (derived.get(kw) ?? 0) + 1));
    return Array.from(derived.entries())
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0])
      .slice(0, 15);
  }, [applicants]);

  const visible = useMemo(
    () => {
      const q = query.trim().toLowerCase();
      return applicants.filter(
        (applicant) =>
          (statusFilter === 'All' || applicant.status === statusFilter) &&
          (!filterJob || applicant.job === filterJob) &&
          (applicant.name.toLowerCase().includes(q) || 
           (applicant.skills || []).some(s => s.toLowerCase().includes(q)) || 
           (applicant.job || '').toLowerCase().includes(q))
      );
    },
    [applicants, statusFilter, filterJob, query],
  );

  return (
    <>
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold">Applicants</h2>
        <p className="text-sm text-muted-foreground">
          {filterJob ? (
            <>
              Filtered to <span className="font-semibold text-primary-dark">{filterJob}</span>{' '}
              <button type="button" onClick={onClearJobFilter} className="ml-1 underline underline-offset-2 hover:text-destructive">
                clear
              </button>
            </>
          ) : (
            `${applicants.length} people in your pipeline - click a name for details`
          )}
        </p>
      </div>

      <div className="animate-fade-in-up space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, role, or skill…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full pl-9"
            />
          </div>
          <Button 
            type="button" 
            variant="default" 
            onClick={() => {
              // search hit
            }}
          >
            <Search className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Search</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border w-full">
          {keywordOptions
            .map((keyword) => (
              <button
                key={keyword}
                type="button"
                onClick={() => {
                  const newQuery = query ? `${query} ${keyword}` : keyword;
                  setQuery(newQuery);
                }}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary-dark"
              >
                + {keyword}
              </button>
            ))}
        </div>
      </div>

      {/* Pipeline legend - hover any chip anywhere for its meaning */}
      <div className="animate-fade-in flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <span className="font-semibold uppercase tracking-wider">Pipeline:</span>
        {(Object.keys(STATUS_MEANINGS) as ApplicantStatus[]).map((status) => (
          <span
            key={status}
            title={STATUS_MEANINGS[status]}
            className="cursor-help rounded-full border border-border bg-card px-2.5 py-1 font-medium transition-colors hover:border-primary/40 hover:text-primary-dark"
          >
            {status}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {APPLICANT_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => onStatusFilterChange(filter)}
            className={cn(
              'rounded-full px-3.5 py-2 text-sm font-semibold transition-all',
              statusFilter === filter
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-card text-muted-foreground hover:bg-primary-light hover:text-primary-dark',
            )}
          >
            {filter}
            <span className="ml-1 opacity-70">
              {filter === 'All'
                ? applicants.length
                : applicants.filter((a) => a.status === filter).length}
            </span>
          </button>
        ))}
      </div>

      {/* Minimal divided rows - flat, hairline separators, hover accent bar. */}
      <div className="animate-fade-in-up overflow-hidden rounded-2xl border border-border bg-card">
        {visible.map((applicant) => (
          <div
            key={applicant.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(applicant)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onOpen(applicant);
            }}
            className="group relative flex cursor-pointer flex-wrap items-center gap-3 border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/40 sm:gap-4 sm:px-5"
          >
            <span className="absolute inset-y-0 left-0 w-[3px] bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
            <Avatar name={applicant.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{applicant.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {applicant.job} · applied {applicant.appliedDaysAgo}d ago
                {applicant.status === 'Interview' && applicant.scheduledDate && (
                  <span className="font-medium text-warning">
                    {' '}· interview {applicant.scheduledDate}
                  </span>
                )}
              </p>
            </div>
            <span
              className={cn(
                'w-12 text-right text-sm font-bold',
                matchTone(applicant.match),
              )}
            >
              {applicant.match}%
            </span>
            <span className="flex w-28 justify-center">
              <StatusChip status={applicant.status} />
            </span>
            {/* Workflow actions: New = shortlist/reject, Shortlisted = interview/
                reject, Interview = hire/reject, Hired/Rejected = terminal.
                Fixed width keeps every row's columns perfectly aligned. */}
            <div className="flex w-28 justify-end gap-1.5 transition-opacity duration-200 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
              {applicant.status === 'New' && (
                <button
                  type="button"
                  title="Shortlist"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetStatus(applicant.id, 'Shortlisted');
                  }}
                  className="rounded-lg bg-primary-light p-2 text-primary-dark transition-all hover:scale-110 hover:bg-primary hover:text-primary-foreground"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
              {applicant.status === 'Shortlisted' && (
                <button
                  type="button"
                  title="Schedule interview"
                  onClick={(event) => {
                    event.stopPropagation();
                    setScheduling(applicant);
                  }}
                  className="rounded-lg bg-warning/10 p-2 text-warning transition-all hover:scale-110 hover:bg-warning hover:text-warning-foreground"
                >
                  <CalendarCheck className="h-4 w-4" />
                </button>
              )}
              {applicant.status === 'Interview' && (
                <button
                  type="button"
                  title="Hire"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetStatus(applicant.id, 'Hired');
                  }}
                  className="rounded-lg bg-success/10 p-2 text-success transition-all hover:scale-110 hover:bg-success hover:text-success-foreground"
                >
                  <BadgeCheck className="h-4 w-4" />
                </button>
              )}
              {(applicant.status === 'New' ||
                applicant.status === 'Shortlisted' ||
                applicant.status === 'Interview') && (
                <button
                  type="button"
                  title="Reject"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetStatus(applicant.id, 'Rejected');
                  }}
                  className="rounded-lg bg-destructive/10 p-2 text-destructive transition-all hover:scale-110 hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {applicant.status === 'Rejected' && (
                <button
                  type="button"
                  title="Reopen (back to Shortlisted)"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetStatus(applicant.id, 'Shortlisted');
                  }}
                  className="rounded-lg bg-muted p-2 text-muted-foreground transition-all hover:scale-110 hover:bg-primary hover:text-primary-foreground"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No applicants match these filters yet.
          </p>
        )}
      </div>
    </div>

      {scheduling && (
        <ScheduleModal
          name={scheduling.name}
          onClose={() => setScheduling(null)}
          onPick={(label) => {
            onScheduleInterview(scheduling.id, label);
            setScheduling(null);
          }}
        />
      )}
    </>
  );
}

/* --- Messages -------------------------------------------------------------
 * Live conversations from `/api/messages/threads`. A thread is opened from the
 * applicant drawer and is invisible to the candidate until the recruiter sends
 * the first message; updates arrive over the chat socket. */

export function MessagesView({
  conversations,
  onSend,
  loading = false,
  error = null,
  sending = false,
  selectedId,
  onSelect,
  onMarkRead,
}: {
  conversations: Conversation[];
  onSend: (conversationId: string, text: string) => void;
  loading?: boolean;
  error?: string | null;
  sending?: boolean;
  selectedId?: string | null;
  onSelect?: (conversationId: string) => void;
  onMarkRead?: (conversationId: string) => void;
}) {
  const [ownId, setOwnId] = useState('');
  const [draft, setDraft] = useState('');
  const activeId = selectedId ?? ownId;
  const selected =
    conversations.find((conversation) => conversation.id === activeId) ?? conversations[0];

  /* Reading a thread — by choosing it or by receiving into the open one —
     clears its badge exactly once. */
  const read = useRef(onMarkRead);
  read.current = onMarkRead;
  useEffect(() => {
    if (selected && selected.unread > 0) read.current?.(selected.id);
  }, [selected?.id, selected?.unread]);

  function choose(conversationId: string) {
    setOwnId(conversationId);
    onSelect?.(conversationId);
    onMarkRead?.(conversationId);
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !selected || sending) return;
    onSend(selected.id, draft.trim());
    setDraft('');
  }

  if (loading && !conversations.length) {
    return (
      <p role="status" className="animate-fade-in-up text-sm text-muted-foreground">
        Loading conversations…
      </p>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="animate-fade-in-up flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Send className="h-8 w-8 text-muted-foreground/50" />
        <h3 className="font-semibold">No conversations yet</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Open an applicant and choose “Message candidate” to start one — it
          appears here, and again whenever they reply.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => choose(conversation.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all',
              conversation.id === selected?.id
                ? 'bg-primary-light shadow-inner'
                : 'hover:bg-muted',
            )}
          >
            <Avatar name={conversation.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {conversation.name}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {conversation.role}
              </p>
            </div>
            {conversation.unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {conversation.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex min-h-[420px] flex-col rounded-2xl border border-border bg-card shadow-sm">
        {error && (
          <p role="alert" className="border-b border-border p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {selected && (
          <>
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Avatar name={selected.name} />
              <div>
                <p className="text-sm font-semibold">{selected.name}</p>
                <p className="text-xs text-muted-foreground">{selected.role}</p>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-slim">
              {selected.messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Write the first message — the candidate can answer it.
                </p>
              )}
              {selected.messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'animate-fade-in-up max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[75%]',
                    message.from === 'me'
                      ? 'ml-auto rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted',
                  )}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  {message.text}
                  <span
                    className={cn(
                      'mt-1 block text-right text-[10px]',
                      message.from === 'me'
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground',
                    )}
                  >
                    {message.time}
                  </span>
                </div>
              ))}
            </div>
            <form
              onSubmit={send}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <Input
                placeholder="Write a message…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button type="submit" size="icon" aria-label="Send message" disabled={sending || !draft.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* --- Analytics ------------------------------------------------------------- */

/* --- Company profile / Settings / Help ------------------------------------- */

export function CompanyView() {
  const { data: user } = useSession();
  const setUser = useSetSession();
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  return (
    <div className="animate-fade-in-up max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-bold">Company profile</h2>
      <p className="text-sm text-muted-foreground">
        This is what candidates see on your job posts.
      </p>
      <RecruiterProfileForm
        user={user}
        onSaved={(nextUser) => {
          setUser(nextUser);
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        }}
      />
      {saved && (
        <span className="animate-pop-in inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <Check className="h-4 w-4" /> Saved
        </span>
      )}
    </div>
  );
}

const PREFS_KEY = 'jobdev-recruiter-prefs';

const DEFAULT_PREFS = {
  emailOnApply: true,
  emailDigest: true,
  smsAlerts: false,
};

export function SettingsView() {
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_PREFS;
    try {
      const encoded = document.cookie.split('; ').find(part => part.startsWith(`${PREFS_KEY}=`))?.slice(PREFS_KEY.length + 1);
      const raw = encoded ? decodeURIComponent(encoded) : null;
      if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<typeof DEFAULT_PREFS>) };
    } catch {
      /* fall back to defaults */
    }
    return DEFAULT_PREFS;
  });

  function toggle(key: keyof typeof prefs) {
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
  }

  function save() {
    try {
      document.cookie = `${PREFS_KEY}=${encodeURIComponent(JSON.stringify(prefs))}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    } catch {
      /* storage may be unavailable; the in-memory values still apply */
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="animate-fade-in-up max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-bold">Settings</h2>
      {(
        [
          ['emailOnApply', 'Email me when someone applies'],
          ['emailDigest', 'Weekly applicant digest'],
          ['smsAlerts', 'SMS alerts for 90%+ matches'],
        ] as Array<[keyof typeof prefs, string]>
      ).map(([key, label]) => (
        <label
          key={key}
          className="flex cursor-pointer items-center justify-between rounded-xl border border-border p-4 transition-colors hover:bg-muted"
        >
          <span className="text-sm font-medium">{label}</span>
          <button
            type="button"
            role="switch"
            aria-checked={prefs[key]}
            onClick={() => toggle(key)}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors',
              prefs[key] ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all',
                prefs[key] ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </button>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save}>
          Save preferences
        </Button>
        {saved && (
          <span className="animate-pop-in inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

export function HelpView() {
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="animate-fade-in-up text-xl font-bold">Help & support</h2>
      <HelpCard />
      <div
        className="animate-fade-in-up space-y-2 rounded-2xl border border-border bg-card p-6 shadow-sm"
        style={{ animationDelay: '120ms' }}
      >
        {[
          [
            'How do match scores work?',
            'We rank applicants against your job requirements using resume keywords, experience and location.',
          ],
          [
            'Can I edit a live job post?',
            'Yes - pausing a post hides it from candidates while you edit.',
          ],
          [
            'How do I export applicants?',
            'CSV export arrives with the ATS integration ticket.',
          ],
        ].map(([question, answer]) => (
          <details
            key={question}
            className="group rounded-xl border border-border p-4 open:bg-muted"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold transition-colors group-open:text-primary-dark">
              {question}
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>
      <p
        className="animate-fade-in-up flex items-center gap-2 text-xs text-muted-foreground"
        style={{ animationDelay: '200ms' }}
      >
        <Mail className="h-3.5 w-3.5" /> support@jobdev.app · replies within 1
        business day
      </p>
    </div>
  );
}

/* --- Schedule interview (calendar date picker) ----------------------------
 * Picking a date marks the applicant "Interview" and stores the date.
 * Honest demo note: the candidate will actually be notified once the
 * candidate side ships (backend notifications module). */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function ScheduleModal({
  name,
  onClose,
  onPick,
}: {
  name: string;
  onClose: () => void;
  onPick: (dateLabel: string) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const startDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: startDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const isPast = (day: number) =>
    new Date(year, month, day) <
    new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isToday = (day: number) =>
    year === today.getFullYear() &&
    month === today.getMonth() &&
    day === today.getDate();

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-pop-in w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold">Schedule interview</p>
            <p className="text-xs text-muted-foreground">{name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calendar"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary-dark"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">
            {MONTH_NAMES[month]} {year}
          </p>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary-dark"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEK_DAYS.map((day) => (
            <span
              key={day}
              className="py-1 text-[10px] font-bold uppercase text-muted-foreground"
            >
              {day}
            </span>
          ))}
          {cells.map((day, index) =>
            day === null ? (
              <span key={`empty-${index}`} />
            ) : (
              <button
                key={day}
                type="button"
                disabled={isPast(day)}
                onClick={() =>
                  onPick(
                    new Date(year, month, day).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }),
                  )
                }
                className={cn(
                  'rounded-lg py-1.5 text-xs font-semibold transition-all',
                  isPast(day)
                    ? 'cursor-not-allowed text-muted-foreground/40'
                    : 'hover:bg-primary hover:text-primary-foreground',
                  isToday(day) && 'bg-primary-light text-primary-dark',
                )}
              >
                {day}
              </button>
            ),
          )}
        </div>

        <p className="mt-3 rounded-lg bg-muted/60 p-2 text-[11px] leading-snug text-muted-foreground">
          The candidate gets this date as a notification once the candidate
          side ships - for now it is saved on your pipeline.
        </p>
      </div>
    </div>
  );
}

/* --- Job detail drawer -----------------------------------------------------
 * Same pattern as the applicant drawer: click any job card to inspect it. */

export function JobDrawer({
  job,
  onClose,
  onSetStatus,
  onViewApplicants,
}: {
  job: Job | null;
  onClose: () => void;
  onSetStatus: (id: string, status: JobStatus) => void;
  onViewApplicants: (jobTitle: string) => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!job) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="animate-slide-in-right absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card shadow-2xl scrollbar-slim">
        <div className="relative bg-primary p-6 text-primary-foreground">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close job details"
            className="absolute right-4 top-4 rounded-full bg-primary-foreground/15 p-2 transition-all hover:rotate-90 hover:bg-primary-foreground/25"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-foreground/15">
              <Briefcase className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold">{job.title}</h2>
              <p className="text-sm text-primary-foreground/80">
                {job.department}
              </p>
              <span className="mt-2 inline-block">
                <StatusChip status={job.status} />
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 p-6">
          <section className="space-y-2.5 text-sm">
            <p className="flex items-center gap-2.5 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              {job.location}
            </p>
            <p className="flex items-center gap-2.5 text-muted-foreground">
              <Briefcase className="h-4 w-4 shrink-0 text-primary" />
              {job.type} · {job.salary}
            </p>
            <p className="flex items-center gap-2.5 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              Posted {job.postedOn}
            </p>
            {job.status === 'Paused' && job.statusChangedOn && (
              <p className="flex items-center gap-2.5 font-medium text-warning">
                <Pause className="h-4 w-4 shrink-0" />
                Paused on {job.statusChangedOn}
              </p>
            )}
            {job.status === 'Closed' && job.statusChangedOn && (
              <p className="flex items-center gap-2.5 font-medium text-destructive">
                <X className="h-4 w-4 shrink-0" />
                Closed on {job.statusChangedOn}
              </p>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
              <p className="text-2xl font-bold">{job.applicants}</p>
              <p className="text-xs text-muted-foreground">applicants</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
              <p className="text-2xl font-bold">{job.views.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">views</p>
            </div>
          </div>

          <section>
            <h4 className="mb-1.5 font-semibold">About the role</h4>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {job.description ?? 'No description provided for this posting yet.'}
            </p>
          </section>

          {job.minimumQualifications && <section><h4 className="mb-1.5 font-semibold">Minimum qualifications</h4><p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.minimumQualifications}</p></section>}
          {job.preferredQualifications && <section><h4 className="mb-1.5 font-semibold">Preferred qualifications</h4><p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.preferredQualifications}</p></section>}

          {job.requirements && job.requirements.length > 0 && (
            <section>
              <h4 className="mb-1.5 font-semibold">What we look for</h4>
              <ul className="space-y-1.5">
                {job.requirements.map((requirement) => (
                  <li
                    key={requirement}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {requirement}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-border bg-card p-4">
          <Button
            variant="outline"
            onClick={() => {
              onViewApplicants(job.title);
              onClose();
            }}
          >
            View applicants
          </Button>
          {job.status !== 'Closed' ? (
            <Button
              onClick={() =>
                onSetStatus(job.id, job.status === 'Active' ? 'Paused' : 'Active')
              }
            >
              {job.status === 'Active' ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {job.status === 'Active' ? 'Pause job' : 'Reopen job'}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onSetStatus(job.id, 'Active')}>
              <Play className="h-4 w-4" />
              Reopen job
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

/* --- Analytics -------------------------------------------------------------
 * Deeper numbers than the overview charts: weekly bars + source donut. */

export function AnalyticsView() {
  return (
    <div className="space-y-5">
      <h2 className="animate-fade-in-up text-xl font-bold">Analytics</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Applications per week</h3>
          <WeeklyBars />
        </div>
        <div
          className="animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-sm"
          style={{ animationDelay: '120ms' }}
        >
          <h3 className="mb-3 text-sm font-semibold">Applicant sources</h3>
          <SourcesDonut slices={SOURCES} />
        </div>
      </div>
    </div>
  );
}


/* --- /api/applicants row → Applicant ----------------------------------- */

/** One row of `GET /api/applicants` (masked contact + parsed CV). */
export interface ApplicantApiRow {
  id: string;
  status: string;
  appliedAt: string;
  job: { id: string; title: string; company: string; location: string | null } | null;
  candidate: {
    id: string;
    name: string;
    location: string | null;
    contactMode: 'blurred';
    contact: {
      email: { token: string | null };
      phone: { token: string | null };
      linkedin: { token: string | null };
      other: Array<{ label: string; token: string | null }>;
    };
    resumeFileName: string | null;
    hasResume: boolean;
    resume: NonNullable<Applicant['resume']>;
  };
}

const APPLICANT_STATUS_MAP: Record<string, ApplicantStatus> = {
  NEW: 'New',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
};

export function mapApplicantRow(row: ApplicantApiRow): Applicant {
  const applied = row.appliedAt ? new Date(row.appliedAt) : null;
  const days = applied ? Math.max(0, Math.round((Date.now() - applied.getTime()) / 86_400_000)) : 0;
  const resume = row.candidate.resume;
  return {
    id: row.id,
    candidateId: row.candidate.id,
    name: row.candidate.name,
    job: row.job?.title ?? '',
    match: 0,
    status: APPLICANT_STATUS_MAP[row.status.toUpperCase()] ?? 'New',
    appliedDaysAgo: days,
    email: row.candidate.contact.email.token ?? '',
    phone: row.candidate.contact.phone.token ?? '',
    linkedin: row.candidate.contact.linkedin.token ?? '',
    contactMasked: row.candidate.contactMode === 'blurred',
    contact: row.candidate.contact as Applicant['contact'],
    location: row.candidate.location ?? '',
    summary: resume.summary,
    skills: resume.skills,
    experience: resume.experience.map((entry) => ({
      role: entry.role,
      company: entry.company,
      period: entry.period,
    })),
    education: resume.education.join(' · '),
    resume,
    resumeFileName: row.candidate.resumeFileName,
    hasResume: row.candidate.hasResume,
  };
}
