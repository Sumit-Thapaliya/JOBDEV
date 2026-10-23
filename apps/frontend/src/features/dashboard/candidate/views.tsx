'use client';
import { useMutation } from '@tanstack/react-query';

import {
  Award,
  BellRing,
  Bookmark,
  Briefcase,
  Building2,
  CalendarCheck,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Compass,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Gauge,
  GraduationCap,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Shield,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { changePasswordRequest } from '@/features/auth/api';
import { useSession } from '@/features/auth/queries';
import { useCountUp } from '@/lib/use-count-up';
import { cn } from '@/lib/utils';

import {
  ApplicationsTrend,
  MatchDonut,
  PipelineFunnel,
  SkillDemandBars,
  SourcesDonut,
  WeeklyBars,
} from './charts';
import {
  ACTIVE_STATUSES,
  type Activity,
  ACTIVITY_STATUS,
  type Application,
  APPLICATION_STATUS_MEANINGS,
  type ApplicationStatus,
  type CandidateProfile,
  type ChecklistItem,
  type Conversation,
  type Interview,
  type JobPosting,
  PIPELINE_ORDER,
  PREP_CHECKLIST,
  SOURCES,
  type WorkMode,
} from './mock-data';
import { HelpCard } from './sidebar';

/* -------------------------------------------------------------------------- */
/*                              Shared primitives                             */
/* -------------------------------------------------------------------------- */

export function StatusChip({ status }: { status: ApplicationStatus }) {
  const tones: Record<ApplicationStatus, string> = {
    Applied: 'bg-muted text-muted-foreground',
    Shortlisted: 'bg-info/10 text-info',
    Interview: 'bg-warning/10 text-warning',
    Offer: 'bg-primary-light text-primary-dark',
    Hired: 'bg-success/10 text-success',
    Rejected: 'bg-destructive/10 text-destructive',
    Withdrawn: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      title={APPLICATION_STATUS_MEANINGS[status]}
      className={cn(
        'inline-flex cursor-help items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[status],
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
          className={cn(
            'h-full rounded-full transition-all duration-700',
            value >= 80 ? 'bg-primary' : value >= 65 ? 'bg-warning' : 'bg-destructive',
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{value}%</span>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  delay = 0,
  className,
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-sm',
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Briefcase;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-light">
        <Icon className="h-6 w-6 text-primary" />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

const WORK_MODE_ICON: Record<WorkMode, typeof MapPin> = {
  Remote: Compass,
  Hybrid: Building2,
  'On-site': MapPin,
};

/* -------------------------------------------------------------------------- */
/*                                Activity feed                               */
/* -------------------------------------------------------------------------- */

const ACTIVITY_ICON: Record<Activity['kind'], typeof Briefcase> = {
  status: TrendingUp,
  interview: CalendarCheck,
  view: Eye,
  saved: Bookmark,
  message: MessageSquare,
  badge: Award,
};

export function ActivityFeed({ items }: { items: Activity[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => {
        const Icon = ACTIVITY_ICON[item.kind];
        return (
          <li
            key={item.id}
            className="animate-fade-in-up flex gap-3"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                ACTIVITY_STATUS[item.kind],
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{item.text}</p>
              <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">{item.time}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Application drawer                              */
/* -------------------------------------------------------------------------- */

export function ApplicationDrawer({
  application,
  onClose,
  onWithdraw,
}: {
  application: Application | null;
  onClose: () => void;
  onWithdraw: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setConfirming(false);
  }, [application]);

  if (!application) return null;

  const active = ['Applied', 'Shortlisted', 'Interview', 'Offer'].includes(application.status);

  return (
    <div className="fixed inset-0 z-[60]">
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
            className="absolute right-4 top-4 rounded-lg bg-white/15 px-2 py-1 text-xs font-bold transition-colors hover:bg-white/25"
          >
            Close
          </button>
          <div className="flex items-center gap-4">
            <Avatar
              name={application.company}
              className="h-14 w-14 bg-white/20 text-base text-white ring-2 ring-white/40"
            />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold">{application.title}</h3>
              <p className="text-sm text-white/80">{application.company}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">
                  {application.status}
                </span>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">
                  {application.match}% match
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 p-6">
          {/* Facts */}
          <section className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Applied
              </p>
              <p className="mt-1 font-semibold">{application.appliedOn}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Salary
              </p>
              <p className="mt-1 font-semibold">{application.salary}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Setup
              </p>
              <p className="mt-1 font-semibold">
                {application.workMode} · {application.type}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Resume
              </p>
              <p className="mt-1 truncate font-semibold">{application.resumeVersion}</p>
            </div>
          </section>

          {application.nextStep ? (
            <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm font-semibold text-warning">
              <Zap className="mt-0.5 h-4 w-4 shrink-0" />
              {application.nextStep}
            </p>
          ) : null}

          {application.recruiterNote ? (
            <section>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Recruiter note
              </p>
              <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
                {application.recruiterNote}
              </p>
            </section>
          ) : null}

          {/* Timeline */}
          <section>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Timeline
            </p>
            <ol className="space-y-4">
              {application.timeline.map((event, index) => (
                <li key={`${event.status}-${index}`} className="relative flex gap-3">
                  {index < application.timeline.length - 1 ? (
                    <span className="absolute left-[13px] top-7 h-[calc(100%-0.5rem)] w-px bg-border" />
                  ) : null}
                  <span className="z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light">
                    <Check className="h-3.5 w-3.5 text-primary-dark" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {event.status}
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        {event.when}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">{event.note}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" /> {application.location}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4 text-primary" /> Source: {application.source}
            </p>
          </section>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card p-4">
          {active ? (
            confirming ? (
              <>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    onWithdraw(application.id);
                    onClose();
                  }}
                >
                  Yes, withdraw
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirming(true)}
              >
                Withdraw application
              </Button>
            )
          ) : (
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             My applications                                */
/* -------------------------------------------------------------------------- */

type StatusFilter = ApplicationStatus | 'All';
type SortKey = 'recent' | 'oldest' | 'match' | 'status';

const STATUS_ORDER: Record<ApplicationStatus, number> = {
  Offer: 0,
  Interview: 1,
  Shortlisted: 2,
  Applied: 3,
  Hired: 4,
  Rejected: 5,
  Withdrawn: 6,
};

export function ApplicationsView({
  applications,
  onOpen,
  onWithdraw,
  onBrowseJobs,
}: {
  applications: Application[];
  onOpen: (application: Application) => void;
  onWithdraw: (id: string) => void;
  onBrowseJobs: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [sort, setSort] = useState<SortKey>('recent');
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = applications
      .filter((application) => (statusFilter === 'All' ? true : application.status === statusFilter))
      .filter((application) =>
        q
          ? `${application.title} ${application.company} ${application.location}`
              .toLowerCase()
              .includes(q)
          : true,
      );

    return [...list].sort((a, b) => {
      if (sort === 'oldest') return b.appliedDaysAgo - a.appliedDaysAgo;
      if (sort === 'match') return b.match - a.match;
      if (sort === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return a.appliedDaysAgo - b.appliedDaysAgo;
    });
  }, [applications, statusFilter, sort, query]);

  const statusFilters: StatusFilter[] = [
    'All',
    'Applied',
    'Shortlisted',
    'Interview',
    'Offer',
    'Hired',
    'Rejected',
    'Withdrawn',
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="animate-fade-in-up">
          <h2 className="text-xl font-bold">My applications</h2>
          <p className="text-sm text-muted-foreground">
            Every application, its live stage and what happens next.
          </p>
        </div>
        <Button onClick={onBrowseJobs} className="animate-fade-in-up">
          <Compass className="h-4 w-4" />
          Find more jobs
        </Button>
      </div>

      {/* Filters */}
      <div className="animate-fade-in-up space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {statusFilters.map((status) => {
            const count =
              status === 'All'
                ? applications.length
                : applications.filter((application) => application.status === status).length;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                  statusFilter === status
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'bg-muted text-muted-foreground hover:bg-primary-light hover:text-primary-dark',
                )}
              >
                {status}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] font-bold',
                    statusFilter === status
                      ? 'bg-primary-foreground/20'
                      : 'bg-background/70',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by role, company or city…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full pl-9"
            />
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort applications"
            className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest first</option>
            <option value="match">Best match</option>
            <option value="status">Furthest along</option>
          </select>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Nothing matches those filters"
          body="Try another stage, or clear the search to see your full history."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setStatusFilter('All');
                setQuery('');
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((application, index) => {
            const Icon = WORK_MODE_ICON[application.workMode];
            const active = ACTIVE_STATUSES.includes(application.status);
            return (
              <li
                key={application.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="sheen-hover group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                  <button
                    type="button"
                    onClick={() => onOpen(application)}
                    className="w-full cursor-pointer p-4 text-left"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <Avatar
                        name={application.companyInitials}
                        className="h-11 w-11 bg-primary-light text-primary-dark"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold group-hover:text-primary-dark">
                            {application.title}
                          </h3>
                          <StatusChip status={application.status} />
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {application.company}
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon className="h-3.5 w-3.5" />
                            {application.location}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            applied {application.appliedDaysAgo}d ago
                          </span>
                          <span>{application.salary}</span>
                        </p>
                        {application.nextStep ? (
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-light px-2 py-1 text-xs font-semibold text-primary-dark">
                            <Zap className="h-3.5 w-3.5" />
                            {application.nextStep}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4">
                        <MatchBar value={application.match} />
                      </div>
                    </div>
                  </button>

                  {active ? (
                    <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
                      <span className="text-xs text-muted-foreground">
                        Applied {application.appliedOn} · {application.type}
                      </span>
                      {confirmId === application.id ? (
                        <span className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              onWithdraw(application.id);
                              setConfirmId(null);
                            }}
                          >
                            Confirm withdraw
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>
                            Keep it
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmId(application.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Withdraw
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {applications.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {filtered.length} of {applications.length} applications
          </span>
          <span>
            Tip: open a row to see the full timeline and recruiter notes.
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Interviews                                 */
/* -------------------------------------------------------------------------- */

export function InterviewsView({
  interviews,
  onOpenApplication,
}: {
  interviews: Interview[];
  onOpenApplication: (applicationId: string) => void;
}) {
  const [prep, setPrep] = useState(PREP_CHECKLIST);
  const [reminders, setReminders] = useState(false);

  const upcoming = interviews.filter((interview) => interview.inDays >= 0);
  const past = interviews.filter((interview) => interview.inDays < 0);
  const next = upcoming[0];
  const prepDone = prep.filter((item) => item.done).length;

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold">Interviews</h2>
        <p className="text-sm text-muted-foreground">
          Everything booked, plus the checklist we recommend before each round.
        </p>
      </div>

      {next ? (
        <div className="animate-fade-in-up relative overflow-hidden rounded-2xl border border-primary/30 bg-primary-light p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                <Video className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-dark/80">
                  Next up {next.inDays === 0 ? '· today' : next.inDays === 1 ? '· tomorrow' : `· in ${next.inDays} days`}
                </p>
                <h3 className="mt-0.5 text-lg font-bold">{next.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {next.company} · {next.stage} · {next.mode} · {next.durationMins} minutes
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {next.date} at {next.time}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {next.meetingUrl ? (
                <a
                  href={next.meetingUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
                >
                  <Video className="h-4 w-4" />
                  Join call
                </a>
              ) : null}
              <Button variant="outline" onClick={() => onOpenApplication(next.applicationId)}>
                Open application
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <SectionCard
            title="Upcoming interviews"
            subtitle={`${upcoming.length} scheduled`}
            delay={80}
          >
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="No interviews booked"
                body="Keep applying - screens usually land 5 to 10 days after a recruiter sees your profile."
              />
            ) : (
              <ul className="space-y-3">
                {upcoming.map((interview, index) => (
                  <li
                    key={interview.id}
                    className="animate-fade-in-up rounded-xl border border-border p-4 transition-colors hover:border-primary/40"
                    style={{ animationDelay: `${140 + index * 70}ms` }}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <Avatar
                        name={interview.companyInitials}
                        className="h-10 w-10 bg-muted"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold">{interview.title}</h4>
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                            {interview.stage}
                          </span>
                          {interview.inDays <= 2 ? (
                            <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                              {interview.inDays <= 0
                                ? 'Today'
                                : interview.inDays === 1
                                  ? 'Tomorrow'
                                  : `In ${interview.inDays} days`}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {interview.company} · {interview.interviewer}
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {interview.date} at {interview.time}
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {interview.durationMins} min · {interview.mode}
                          </span>
                        </p>
                        {interview.notes ? (
                          <p className="mt-2 text-xs text-muted-foreground">{interview.notes}</p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {interview.meetingUrl ? (
                            <a
                              href={interview.meetingUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                            >
                              <Video className="h-3.5 w-3.5" />
                              Join at {interview.time}
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              They will call you
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenApplication(interview.applicationId)}
                          >
                            Application
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {past.length > 0 ? (
            <SectionCard
              title="Past interviews"
              subtitle={`${past.length} completed`}
              delay={160}
            >
              <ul className="divide-y divide-border">
                {past.map((interview) => (
                  <li key={interview.id} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{interview.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {interview.company} · {interview.stage} · {interview.date}
                      </p>
                      {interview.notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">{interview.notes}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Preparation checklist"
            subtitle={`${prepDone} of ${prep.length} done`}
            delay={120}
          >
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(prepDone / prep.length) * 100}%` }}
              />
            </div>
            <ul className="space-y-2.5">
              {prep.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setPrep((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, done: !entry.done } : entry,
                        ),
                      )
                    }
                    className="flex w-full items-start gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        item.done
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card',
                      )}
                    >
                      {item.done ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span
                      className={cn(
                        'text-sm',
                        item.done ? 'text-muted-foreground line-through' : 'text-foreground',
                      )}
                    >
                      {item.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Interview stats" delay={200}>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CalendarCheck className="h-4 w-4 text-primary" />
                  Booked
                </span>
                <span className="font-bold">{upcoming.length}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  Completed
                </span>
                <span className="font-bold">{past.length}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Target className="h-4 w-4 text-primary" />
                  Screen pass rate
                </span>
                <span className="font-bold text-primary-dark">67%</span>
              </li>
            </ul>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setReminders((value) => !value)}
            >
              {reminders ? <CheckCheck className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
              {reminders ? 'Reminders on for all interviews' : 'Send me a reminder'}
            </Button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Jobs                                     */
/* -------------------------------------------------------------------------- */

export function JobsView({
  jobs,
  savedIds,
  appliedJobIds,
  onOpenJob,
  onToggleSave,
  onApply,
}: {
  jobs: JobPosting[];
  savedIds: string[];
  appliedJobIds: string[];
  onOpenJob: (job: JobPosting) => void;
  onToggleSave: (job: JobPosting) => void;
  onApply: (job: JobPosting) => void;
}) {
  const [workMode, setWorkMode] = useState<WorkMode | 'Any'>('Any');
  const [minMatch, setMinMatch] = useState(0);
  const [sort, setSort] = useState<'match' | 'recent' | 'salary'>('match');

  /* Text search happens upstream (single search bar on the jobs view);
     this card only applies the work-mode, match and sort controls. */
  const results = useMemo(() => {
    const list = jobs
      .filter((job) =>
        workMode === 'Any' ? true : job.workMode === workMode,
      )
      .filter((job) => job.match >= minMatch);

    return [...list].sort((a, b) => {
      if (sort === 'recent') return a.postedDaysAgo - b.postedDaysAgo;
      if (sort === 'salary') {
        const toNumber = (value: string) =>
          Number(value.replace(/[^0-9]/g, '').slice(0, 6)) || 0;
        return toNumber(b.salary) - toNumber(a.salary);
      }
      return b.match - a.match;
    });
  }, [jobs, workMode, minMatch, sort]);

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold">Find jobs</h2>
        <p className="text-sm text-muted-foreground">
          Every listing is scored against your profile. Open a card to see the
          reasoning behind the match.
        </p>
      </div>

      <div className="animate-fade-in-up space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
            {(['Any', 'Remote', 'Hybrid', 'On-site'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setWorkMode(mode)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  workMode === mode
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Min match
            <input
              type="range"
              min={0}
              max={95}
              step={5}
              value={minMatch}
              onChange={(event) => setMinMatch(Number(event.target.value))}
              className="h-1.5 w-28 cursor-pointer accent-[hsl(var(--primary))]"
            />
            <span className="w-9 font-bold text-foreground">{minMatch}%</span>
          </label>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            aria-label="Sort jobs"
            className="ml-auto h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="match">Best match</option>
            <option value="recent">Newest</option>
            <option value="salary">Highest salary</option>
          </select>
        </div>

        <p className="text-xs text-muted-foreground">
          {results.length} role{results.length === 1 ? '' : 's'} found
          {minMatch > 0 ? ` above ${minMatch}% match` : ''}.
        </p>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No roles match those filters"
          body="Widen the work mode or lower the match threshold to see more."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setWorkMode('Any');
                setMinMatch(0);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((job, index) => {
            const saved = savedIds.includes(job.id);
            const applied = appliedJobIds.includes(job.id);
            const Icon = WORK_MODE_ICON[job.workMode];

            return (
              <div
                key={job.id}
                className="animate-fade-in-up sheen-hover group flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={job.companyInitials} className="h-11 w-11 bg-primary-light text-primary-dark" />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onOpenJob(job)}
                      className="block w-full text-left"
                    >
                      <h3 className="truncate text-sm font-semibold group-hover:text-primary-dark">
                        {job.title}
                      </h3>
                      <p className="truncate text-sm text-muted-foreground">{job.company}</p>
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={saved ? 'Remove from saved jobs' : 'Save job'}
                    onClick={() => onToggleSave(job)}
                    className={cn(
                      'rounded-lg p-2 transition-all',
                      saved
                        ? 'bg-primary-light text-primary-dark'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Icon className="h-3.5 w-3.5" />
                    {job.location}
                  </span>
                  <span>{job.type}</span>
                  <span>posted {job.postedTimeText}</span>
                </div>

                <p className="mt-2 text-sm font-semibold">
                  {job.salary}
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    {job.applicants} applicants
                  </span>
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.matchedSkills.slice(0, 3).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-semibold text-primary-dark"
                    >
                      {skill}
                    </span>
                  ))}
                  {job.missingSkills.slice(0, 2).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                    >
                      {skill}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Match</span>
                    <span className={cn('text-sm font-bold', matchTone(job.match))}>
                      {job.match}%
                    </span>
                  </div>
                  {applied ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                      <CheckCheck className="h-3.5 w-3.5" />
                      Applied
                    </span>
                  ) : (
                    <Button size="sm" onClick={() => onApply(job)}>
                      Quick apply
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onOpenJob(job)}>
                    Details
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Saved jobs                                  */
/* -------------------------------------------------------------------------- */

export function SavedJobsView({
  jobs,
  onOpenJob,
  onToggleSave,
  onApply,
  appliedJobIds,
}: {
  jobs: JobPosting[];
  onOpenJob: (job: JobPosting) => void;
  onToggleSave: (job: JobPosting) => void;
  onApply: (job: JobPosting) => void;
  appliedJobIds: string[];
}) {
  if (jobs.length === 0) {
    return (
      <div className="space-y-5">
        <div className="animate-fade-in-up">
          <h2 className="text-xl font-bold">Saved jobs</h2>
          <p className="text-sm text-muted-foreground">
            Shortlist roles while you browse and compare them side by side here.
          </p>
        </div>
        <EmptyState
          icon={Bookmark}
          title="Your shortlist is empty"
          body="Tap the bookmark on any job card and it will show up here with its salary, setup and gaps."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold">Saved jobs</h2>
        <p className="text-sm text-muted-foreground">
          {jobs.length} role{jobs.length === 1 ? '' : 's'} on your shortlist.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {jobs.map((job, index) => {
          const applied = appliedJobIds.includes(job.id);
          const Icon = WORK_MODE_ICON[job.workMode];
          return (
            <div
              key={job.id}
              className="animate-fade-in-up sheen-hover rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="flex items-start gap-3">
                <Avatar name={job.companyInitials} className="h-11 w-11 bg-primary-light text-primary-dark" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">{job.title}</h3>
                  <p className="truncate text-sm text-muted-foreground">{job.company}</p>
                </div>
                <span className={cn('text-sm font-bold', matchTone(job.match))}>
                  {job.match}%
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Salary
                  </dt>
                  <dd className="mt-0.5 font-semibold">{job.salary}</dd>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Setup
                  </dt>
                  <dd className="mt-0.5 font-semibold">
                    {job.workMode} · {job.type}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Location
                  </dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-semibold">
                    <Icon className="h-3.5 w-3.5" />
                    {job.location}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Applicants
                  </dt>
                  <dd className="mt-0.5 font-semibold">{job.applicants}</dd>
                </div>
              </dl>

              {job.missingSkills.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Gaps to close:</span>{' '}
                  {job.missingSkills.join(', ')}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {applied ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                    <CheckCheck className="h-3.5 w-3.5" />
                    Applied
                  </span>
                ) : (
                  <Button size="sm" onClick={() => onApply(job)}>
                    Quick apply
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onOpenJob(job)}>
                  Details
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => onToggleSave(job)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Job drawer                                  */
/* -------------------------------------------------------------------------- */

export function JobDrawer({
  job,
  applied,
  saved,
  onClose,
  onApply,
  onToggleSave,
}: {
  job: JobPosting | null;
  applied: boolean;
  saved: boolean;
  onClose: () => void;
  onApply: (job: JobPosting) => void;
  onToggleSave: (job: JobPosting) => void;
}) {
  const [showReasons, setShowReasons] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setShowReasons(false);
  }, [job]);

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
            aria-label="Close job details"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg bg-white/15 px-2 py-1 text-xs font-bold transition-colors hover:bg-white/25"
          >
            Close
          </button>
          <div className="flex items-center gap-4">
            <Avatar
              name={job.companyInitials}
              className="h-14 w-14 bg-white/20 text-base text-white ring-2 ring-white/40"
            />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold">{job.title}</h3>
              <p className="text-sm text-white/80">
                {job.company} · {job.department}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {job.match}% match · {job.salary}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 p-6">
          <section className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 font-semibold">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {job.location}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 font-semibold">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              {job.type}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 font-semibold">
              <Compass className="h-3.5 w-3.5 text-primary" />
              {job.workMode}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 font-semibold">
              <Eye className="h-3.5 w-3.5 text-primary" />
              {job.views.toLocaleString()} views
            </span>
          </section>

          <section>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              About the role
            </p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.description}</p>
          </section>

          {job.minimumQualifications && <section><h4 className="mb-1.5 font-semibold">Minimum qualifications</h4><p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.minimumQualifications}</p></section>}
          {job.preferredQualifications && <section><h4 className="mb-1.5 font-semibold">Preferred qualifications</h4><p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.preferredQualifications}</p></section>}

          {job.requirements.length > 0 && <section>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Requirements
            </p>
            <ul className="space-y-1.5">
              {job.requirements.map((requirement) => (
                <li key={requirement} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {requirement}
                </li>
              ))}
            </ul>
          </section>}

          <section>
            <button
              type="button"
              onClick={() => setShowReasons((value) => !value)}
              className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/40"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Why this match?
              </span>
              <ChevronDown
                className={cn('h-4 w-4 text-muted-foreground transition-transform', showReasons && 'rotate-180')}
              />
            </button>

            {showReasons ? (
              <div className="animate-pop-in mt-2 space-y-3 rounded-xl bg-muted/50 p-3">
                <ul className="space-y-1.5">
                  {job.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {reason}
                    </li>
                  ))}
                </ul>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Skills
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {job.matchedSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"
                      >
                        {skill}
                      </span>
                    ))}
                    {job.missingSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="text-xs text-muted-foreground">
            Posted {job.postedOn} · {job.applicants} applicants so far ·{' '}
            {job.postedTimeText}
          </section>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card p-4">
          {applied ? (
            <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success/10 py-2.5 text-sm font-semibold text-success">
              <CheckCheck className="h-4 w-4" />
              Applied
            </span>
          ) : (
            <Button className="flex-1" onClick={() => onApply(job)}>
              Apply now
            </Button>
          )}
          <Button variant="outline" onClick={() => onToggleSave(job)}>
            <Bookmark className={cn('h-4 w-4', saved && 'fill-current text-primary')} />
            {saved ? 'Saved' : 'Save'}
          </Button>
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Messages                                  */
/* -------------------------------------------------------------------------- */

export function MessagesView({
  conversations,
  onSend,
  loading = false,
  error = null,
  sending = false,
  onMarkRead,
}: {
  conversations: Conversation[];
  onSend: (conversationId: string, text: string) => void;
  loading?: boolean;
  error?: string | null;
  sending?: boolean;
  onMarkRead?: (conversationId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? '');
  const [draft, setDraft] = useState('');

  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];

  /* A conversation the candidate cannot start: it exists because a recruiter
     wrote in. Opening it (or receiving into the open one) clears the badge. */
  const read = useRef(onMarkRead);
  read.current = onMarkRead;
  useEffect(() => {
    if (selected && selected.unread > 0) read.current?.(selected.id);
  }, [selected?.id, selected?.unread]);

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

  if (!conversations.length) {
    return (
      <div className="space-y-5">
        <div className="animate-fade-in-up">
          <h2 className="text-xl font-bold">Messages</h2>
          <p className="text-sm text-muted-foreground">
            Conversations with recruiters, in one thread per role.
          </p>
        </div>
        <div className="animate-fade-in-up flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <Send className="h-8 w-8 text-muted-foreground/50" />
          <h3 className="font-semibold">No conversations yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            When a recruiter messages you about a role, the conversation appears
            here. You can always apply to jobs — recruiters reach out after that.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold">Messages</h2>
        <p className="text-sm text-muted-foreground">
          Conversations with recruiters, in one thread per role.
        </p>
      </div>

      <div className="animate-fade-in-up grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => setSelectedId(conversation.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all',
                conversation.id === selectedId
                  ? 'bg-primary-light shadow-inner'
                  : 'hover:bg-muted',
              )}
            >
              <Avatar name={conversation.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{conversation.name}</p>
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
                <span className="ml-auto hidden items-center gap-1.5 text-xs font-medium text-muted-foreground sm:flex">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  Contact details stay hidden until you share them
                </span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-slim">
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
              <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
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
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Insights                                  */
/* -------------------------------------------------------------------------- */

export function InsightsView({
  counts,
  profilePercent,
  responseRate,
  avgReplyDays,
  avgMatch,
}: {
  counts: Record<ApplicationStatus, number>;
  profilePercent: number;
  responseRate: number;
  avgReplyDays: number;
  avgMatch: number;
}) {
  const totalApplications = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const views = useCountUp(0);
  const applications = useCountUp(totalApplications);
  const interviews = useCountUp((counts.Interview ?? 0) + (counts.Offer ?? 0));

  const buckets = [
    { label: '80–100', value: 4, tone: 'hsl(var(--primary))' },
    { label: '65–79', value: 2, tone: 'hsl(var(--warning))' },
    { label: '0–64', value: 2, tone: 'hsl(var(--destructive))' },
  ];

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold">Insights</h2>
        <p className="text-sm text-muted-foreground">
          How your search is actually performing, and what to fix next.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Profile views', value: views, hint: 'in the last 8 weeks', icon: Eye },
          { label: 'Applications', value: applications, hint: 'sent in 8 weeks', icon: Send },
          { label: 'Interviews', value: interviews, hint: 'booked from those', icon: CalendarCheck },
          {
            label: 'Response rate',
            value: responseRate,
            hint: `average reply in ${avgReplyDays} days`,
            icon: Gauge,
            suffix: '%',
          },
        ].map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="animate-fade-in-up sheen-hover rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg xl:p-5"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight xl:text-3xl">
                    {stat.value.toLocaleString()}
                    {stat.suffix}
                  </p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-muted-foreground">{stat.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Applications vs profile views"
          subtitle="Last 8 weeks"
          delay={120}
          action={
            <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Applications
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-info" />
                Profile views
              </span>
            </div>
          }
        >
          <ApplicationsTrend />
        </SectionCard>

        <SectionCard
          title="Your pipeline"
          subtitle="Where every application currently sits"
          delay={180}
        >
          <PipelineFunnel counts={counts} />
        </SectionCard>

        <SectionCard
          title="Applications per week"
          subtitle="Consistency beats bursts"
          delay={240}
        >
          <WeeklyBars />
        </SectionCard>

        <SectionCard
          title="Skills employers ask for"
          subtitle="Live demand across the roles you are matched to"
          delay={300}
        >
          <SkillDemandBars />
        </SectionCard>

        <SectionCard title="Where your applications came from" delay={360}>
          <SourcesDonut slices={SOURCES} />
        </SectionCard>

        <SectionCard
          title="How strong your matches are"
          subtitle={`Profile ${profilePercent}% complete`}
          delay={420}
        >
          <MatchDonut buckets={buckets} average={avgMatch} />
        </SectionCard>
      </div>

      
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Profile                                   */
/* -------------------------------------------------------------------------- */

export function ProfileView({
  profile,
  checklist,
  percent,
  onOpenSettings,
  atsReady = false,
  atsFileName = null,
  onOpenResume,
  onDownloadAts,
  onSaveProfile,
  onAddSkill,
  onRemoveSkill,
  onAddExperience,
}: {
  profile: CandidateProfile;
  checklist: ChecklistItem[];
  percent: number;
  onOpenSettings: () => void;
  /** True once an ATS-friendly resume has been generated and is downloadable. */
  atsReady?: boolean;
  atsFileName?: string | null;
  onOpenResume?: () => void;
  onDownloadAts?: () => void;
  onSaveProfile?: (fields: {
    headline: string;
    about: string;
    location: string;
    phone: string;
    expectedSalary: string;
    noticePeriod: string;
  }) => Promise<void>;
  onAddSkill?: (skill: string) => void;
  onRemoveSkill?: (skill: string) => void;
  onAddExperience?: (entry: { role: string; company: string; period: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState('');
  const [expDraft, setExpDraft] = useState({ role: '', company: '', period: '' });
  const [form, setForm] = useState({
    headline: profile.headline,
    about: profile.about,
    location: profile.location,
    phone: profile.phone,
    expectedSalary: profile.expectedSalary,
    noticePeriod: profile.noticePeriod,
  });

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      await onSaveProfile?.(form);
      setEditing(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2600);
    } catch (problem) {
      setProfileError(problem instanceof Error ? problem.message : 'Could not save the profile.');
    } finally { setProfileSaving(false); }
  }

  function addSkill() {
    const skill = skillDraft.trim();
    if (!skill) return;
    onAddSkill?.(skill);
    setSkillDraft('');
  }

  function addExperience() {
    if (!expDraft.role.trim() || !expDraft.company.trim()) return;
    onAddExperience?.({
      role: expDraft.role.trim(),
      company: expDraft.company.trim(),
      period: expDraft.period.trim() || '—',
    });
    setExpDraft({ role: '', company: '', period: '' });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="animate-fade-in-up">
          <h2 className="text-xl font-bold">My profile</h2>
          <p className="text-sm text-muted-foreground">
            Match scores, recruiter visibility and your apply flow all read from this.
          </p>
        </div>
        <Button
          onClick={() => setEditing((value) => !value)}
          variant={editing ? 'outline' : 'default'}
          className="animate-fade-in-up"
        >
          {editing ? 'Cancel' : 'Edit profile'}
        </Button>
      </div>

      {profileError && <p role="alert" className="text-sm text-destructive">{profileError}</p>}
      {profileSaving && <p role="status" className="text-sm text-muted-foreground">Saving profile…</p>}
      {saved ? (
        <p className="animate-pop-in flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm font-semibold text-success">
          <Check className="h-4 w-4" />
          Profile updated - recruiters see changes immediately.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {/* Main column */}
        <div className="space-y-4">
          <SectionCard delay={60}>
            <div className="flex flex-wrap items-start gap-5">
              <Avatar
                name={profile.name}
                className="h-16 w-16 bg-primary text-base text-primary-foreground ring-2 ring-primary/20"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold">{profile.name}</h3>
                <p className="text-sm text-muted-foreground">{profile.headline}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-semibold">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {profile.location}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-semibold">
                    <Briefcase className="h-3.5 w-3.5 text-primary" />
                    {profile.seniority} · {profile.experienceYears} yrs
                  </span>
                  {profile.openToWork ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 font-semibold text-success">
                      <Check className="h-3.5 w-3.5" />
                      Open to work
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">
                      Not looking
                    </span>
                  )}
                </div>
              </div>
            </div>

            {editing ? (
              <form onSubmit={save} className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">Headline</span>
                  <Input
                    value={form.headline}
                    onChange={(event) => setForm({ ...form, headline: event.target.value })}
                    className="mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">About</span>
                  <textarea
                    value={form.about}
                    onChange={(event) => setForm({ ...form, about: event.target.value })}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">Location</span>
                    <Input
                      value={form.location}
                      onChange={(event) => setForm({ ...form, location: event.target.value })}
                      className="mt-1"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">Phone</span>
                    <Input
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      className="mt-1"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Expected salary
                    </span>
                    <Input
                      value={form.expectedSalary}
                      onChange={(event) =>
                        setForm({ ...form, expectedSalary: event.target.value })
                      }
                      className="mt-1"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Notice period
                    </span>
                    <Input
                      value={form.noticePeriod}
                      onChange={(event) => setForm({ ...form, noticePeriod: event.target.value })}
                      className="mt-1"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">Save changes</Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">{form.about}</p>
            )}

            {!editing ? (
              <div className="mt-5 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4 text-primary" /> {profile.email}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 text-primary" /> {profile.phone}
                </p>
                {profile.expectedSalary ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Target className="h-4 w-4 text-primary" /> Wants {profile.expectedSalary}
                  </p>
                ) : null}
                {profile.noticePeriod ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 text-primary" /> {profile.noticePeriod} notice
                  </p>
                ) : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Skills" subtitle="Drives every match score" delay={120}>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <span
                  key={skill}
                  className="flex items-center gap-1 rounded-full bg-primary-light py-1 pl-3 pr-1.5 text-xs font-semibold text-primary-dark"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => onRemoveSkill?.(skill)}
                    aria-label={`Remove ${skill}`}
                    className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <span className="flex items-center gap-1">
                <Input
                  value={skillDraft}
                  onChange={(event) => setSkillDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="+ add a skill"
                  className="h-7 w-32 rounded-full border-dashed px-3 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-2.5 text-xs"
                  onClick={addSkill}
                  disabled={!skillDraft.trim()}
                >
                  Add
                </Button>
              </span>
            </div>
          </SectionCard>

          <SectionCard title="Experience" subtitle="What recruiters read first" delay={180}>
            {profile.experience.length === 0 ? (
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                <Input
                  value={expDraft.role}
                  onChange={(event) => setExpDraft({ ...expDraft, role: event.target.value })}
                  placeholder="Role"
                  className="h-8 text-xs"
                />
                <Input
                  value={expDraft.company}
                  onChange={(event) => setExpDraft({ ...expDraft, company: event.target.value })}
                  placeholder="Company"
                  className="h-8 text-xs"
                />
                <span className="flex gap-2">
                  <Input
                    value={expDraft.period}
                    onChange={(event) => setExpDraft({ ...expDraft, period: event.target.value })}
                    placeholder="Period (e.g. 2024 - now)"
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={addExperience}
                    disabled={!expDraft.role.trim() || !expDraft.company.trim()}
                  >
                    Add
                  </Button>
                </span>
              </div>
            ) : null}
            <ol className="space-y-5">
              {profile.experience.map((role) => (
                <li key={`${role.company}-${role.role}`} className="border-l-2 border-primary/30 pl-4">
                  <p className="text-sm font-semibold">
                    {role.role} · <span className="text-primary-dark">{role.company}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{role.period}</p>
                  <ul className="mt-2 space-y-1.5">
                    {role.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Education & links" delay={240}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5 text-primary" />
                  Education
                </p>
                {profile.education.map((entry, index) => (
                  <div key={`${entry.degree}-${entry.school}-${index}`}>
                    <p className="text-sm font-semibold">{entry.degree}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.school} · {entry.period}
                    </p>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  Links
                </p>
                <ul className="space-y-1.5">
                  {profile.links.map((link) => (
                    <li key={link.url}>
                      <a
                        href={`https://${link.url}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-1.5 text-sm font-medium text-primary-dark hover:text-primary-hover"
                      >
                        {link.label}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <span className="block text-xs text-muted-foreground">{link.url}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Resume" delay={160}>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light">
                <FileText className="h-5 w-5 text-primary-dark" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {atsReady && atsFileName ? atsFileName : profile.resumeFileName || 'No resume yet'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {atsReady
                    ? 'ATS-friendly version ready to download'
                    : profile.resumeFileName
                      ? 'Stored with your profile · not ATS-checked yet'
                      : 'Upload a PDF or DOCX to complete your profile'}
                </p>
              </div>
              {atsReady ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <FileCheck2 className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={onOpenResume}>
                <Upload className="h-3.5 w-3.5" />
                {atsReady ? 'Replace file' : 'Upload resume'}
              </Button>
              <Button variant="ghost" size="sm" onClick={onDownloadAts}>
                <Download className="h-3.5 w-3.5" />
                {atsReady ? 'Download PDF' : 'Get ATS PDF'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Upload a PDF or DOCX and download the ATS-friendly version as PDF.
            </p>
          </SectionCard>
        </div>

        {/* Side column */}
        <div className="space-y-4">
          <SectionCard title="Profile completeness" delay={100}>
            <div className="flex items-center gap-4">
              <svg viewBox="0 0 72 72" className="h-20 w-20 shrink-0 -rotate-90">
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="7"
                />
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div>
                <p className="text-2xl font-bold">{percent}%</p>
                <p className="text-xs text-muted-foreground">
                  {checklist.filter((item) => item.done).length} of {checklist.length} signals
                  complete
                </p>
                <p className="mt-1 text-xs font-semibold text-primary-dark">
                  {percent >= 90 ? 'Top tier profile' : 'Room to grow'}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Visibility" delay={220}>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Recruiter search</span>
                <span className="font-semibold text-success">Visible</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Profile views (30d)</span>
                <span className="font-semibold">0</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Saved by recruiters</span>
                <span className="font-semibold">0</span>
              </li>
            </ul>
            <Button variant="outline" className="mt-4 w-full" onClick={onOpenSettings}>
              <Shield className="h-4 w-4" />
              Privacy settings
            </Button>
          </SectionCard>

          <HelpCard />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Settings                                   */
/* -------------------------------------------------------------------------- */

export function SettingsView({ profile }: { profile?: CandidateProfile }) {
  const { data: user } = useSession();
  const [prefs, setPrefs] = useState({
    alerts: true,
    weekly: true,
    recruiterEmail: true,
    visible: true,
    hideSalary: false,
  });
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const changePassword = useMutation({ mutationFn: ({ current, next }: { current: string; next: string }) => changePasswordRequest(current, next) });
  const changingPw = changePassword.isPending;

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    try {
      await changePassword.mutateAsync({ current: currentPassword, next: newPassword });
      toast({ title: 'Password changed', variant: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setPwOpen(false);
    } catch {
      toast({ title: 'Network error. Please try again.', variant: 'destructive' });
    }
  }

  const rows: Array<{
    key: keyof typeof prefs;
    label: string;
    body: string;
  }> = [
    {
      key: 'alerts',
      label: 'Instant job alerts',
      body: 'Get notified the moment a role above 85% match is posted.',
    },
    {
      key: 'weekly',
      label: 'Weekly progress email',
      body: 'A Monday summary of views, applications and interviews.',
    },
    {
      key: 'recruiterEmail',
      label: 'Let recruiters email me',
      body: 'Recruiters can reach your inbox directly instead of messaging in-app.',
    },
    {
      key: 'visible',
      label: 'Open to work badge',
      body: 'Shows recruiters you are actively looking right now.',
    },
    {
      key: 'hideSalary',
      label: 'Hide my salary expectation',
      body: 'Recruiters will see your profile without your expected figure.',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Control what JobDev sends you and what recruiters can see.
        </p>
      </div>

      <SectionCard title="Notifications & visibility" delay={80}>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="text-sm font-semibold">{row.label}</p>
                <p className="text-sm text-muted-foreground">{row.body}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[row.key]}
                aria-label={row.label}
                onClick={() => setPrefs((current) => ({ ...current, [row.key]: !current[row.key] }))}
                className={cn(
                  'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
                  prefs[row.key] ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all',
                    prefs[row.key] ? 'left-[22px]' : 'left-0.5',
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Job preferences" delay={140}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Headline</dt>
              <dd className="font-semibold">{profile?.headline || '—'}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Working style</dt>
              <dd className="font-semibold">
                {profile?.workModes.length ? profile.workModes.join(' · ') : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Location</dt>
              <dd className="font-semibold">{profile?.location || '—'}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Expected salary</dt>
              <dd className="font-semibold">{profile?.expectedSalary || '—'}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            These come from your profile - update them under My profile.
          </p>
        </SectionCard>

        <SectionCard title="Account" delay={200}>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-semibold">{user?.email ?? '—'}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-semibold">{user?.phone ?? '—'}</span>
            </li>
          </ul>
          <div className="mt-4 space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setPwOpen((value) => !value)}
            >
              <Shield className="h-4 w-4" />
              {pwOpen ? 'Cancel' : 'Change password'}
            </Button>
            {pwOpen ? (
              <form onSubmit={handleChangePassword} className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pw-current">Current password</Label>
                  <Input
                    id="pw-current"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw-new">New password (min 8 characters)</Label>
                  <Input
                    id="pw-new"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={changingPw || !currentPassword || newPassword.length < 8}
                >
                  {changingPw ? 'Saving…' : 'Save new password'}
                </Button>
              </form>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Danger zone" delay={260}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div>
            <p className="text-sm font-semibold text-destructive">Delete account</p>
            <p className="text-sm text-muted-foreground">
              Removes your profile, applications and messages. This cannot be undone.
            </p>
          </div>
          <Button variant="outline" className="border-destructive/40 text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete account
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Help                                     */
/* -------------------------------------------------------------------------- */

const FAQS = [
  {
    q: 'How is the match score calculated?',
    a: 'Five signals, weighted and explained: skills overlap (55), experience band (20), your working-style preference (12), salary expectation (8) and how fresh the posting is (5). Open “Why this match?” on any job to see the exact arithmetic.',
  },
  {
    q: 'What happens after I apply?',
    a: 'The recruiter sees your profile and resume, and the application moves to Applied. When they open or shortlist it, the stage updates here automatically and you get a notification.',
  },
  {
    q: 'Can I withdraw an application?',
    a: 'Yes - open the application and choose Withdraw. Recruiters are notified politely and it will not count against you.',
  },
  {
    q: 'Do recruiters see my phone number?',
    a: 'Only after you accept a conversation with them inside Messages, or if you tick “Let recruiters email me” in Settings.',
  },
  {
    q: 'Why do I get fewer replies than expected?',
    a: 'In most cases the resume or the headline is the bottleneck, not the volume. Review your saved resume and profile for missing details before applying.',
  },
];

export function HelpView() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-5">
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold">Help & support</h2>
        <p className="text-sm text-muted-foreground">
          Short answers to the questions candidates ask most.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <SectionCard delay={80}>
          <ul className="divide-y divide-border">
            {FAQS.map((faq, index) => (
              <li key={faq.q}>
                <button
                  type="button"
                  onClick={() => setOpen(open === index ? null : index)}
                  aria-expanded={open === index}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left"
                >
                  <span className="text-sm font-semibold">{faq.q}</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      open === index && 'rotate-180',
                    )}
                  />
                </button>
                {open === index ? (
                  <p className="animate-fade-in pb-4 text-sm text-muted-foreground">{faq.a}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="space-y-4">
          <HelpCard />
          <SectionCard title="Quick links" delay={140}>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="mailto:support@jobdev.app"
                  className="flex items-center gap-2 font-medium text-primary-dark hover:text-primary-hover"
                >
                  <Mail className="h-4 w-4" />
                  support@jobdev.app
                </a>
              </li>
              <li>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  Average reply: under 1 business day
                </span>
              </li>
              <li>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4 text-primary" />
                  Report a suspicious recruiter
                </span>
              </li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Exported helpers / constants                      */
/* -------------------------------------------------------------------------- */

/** Shared status chips used by the overview cards. */
export function StagePills({
  counts,
  onPick,
}: {
  counts: Record<ApplicationStatus, number>;
  onPick?: (status: ApplicationStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PIPELINE_ORDER.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onPick?.(status)}
          className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold transition-all hover:bg-primary-light hover:text-primary-dark"
        >
          <StatusChip status={status} />
          <span className="font-bold">{counts[status]}</span>
        </button>
      ))}
    </div>
  );
}

export function CandidateProfileViewsView({
  views = [],
  totalViews = 0,
  isLoading = false,
  error,
  onRetry,
}: {
  views?: Array<{
    id: string;
    viewedAt: string;
    recruiterId: string;
    recruiterName: string;
    companyName: string;
    recruiterEmail: string;
  }>;
  totalViews?: number;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h2 className="text-xl font-bold">Profile Views</h2>
        {!isLoading && !error && <p className="text-sm text-muted-foreground">
          {totalViews === 1
            ? '1 recruiter has viewed your profile.'
            : `${totalViews} recruiters have viewed your profile.`}
        </p>}
      </div>

      <div className="space-y-3">
        {isLoading && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading view history…
          </p>
        )}
        {error && <div role="alert" className="text-sm text-destructive">{error} {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline">Retry</button>}</div>}
        {!isLoading && !error && views.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            <Eye className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <h3 className="font-semibold">No profile views yet</h3>
            <p className="text-sm text-muted-foreground">
              When recruiters view your profile or resume, they will appear here.
            </p>
          </div>
        )}
        {views.map((view) => (
          <div
            key={view.id}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {view.companyName?.[0]?.toUpperCase() ||
                  view.recruiterName?.[0]?.toUpperCase() ||
                  'R'}
              </span>
              <div>
                <p className="font-semibold">{view.recruiterName}</p>
                {(view.companyName || view.recruiterEmail) && <p className="text-sm text-muted-foreground">
                  {[view.companyName, view.recruiterEmail].filter(Boolean).join(' · ')}
                </p>}
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              Viewed on{' '}
              {view.viewedAt
                ? new Date(view.viewedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : 'Unknown date'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export { EmptyState,MatchBar,matchTone,SectionCard,WORK_MODE_ICON };
