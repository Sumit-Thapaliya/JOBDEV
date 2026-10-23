'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SavedResume } from './candidate/saved-resume';
import { parseStoredProfile, profileChecklist } from './candidate/profile-data';

import {
  Bookmark,
  Briefcase,
  CheckCheck,
  Compass,
  Download,
  Eye,
  FileCheck2,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  logSearchKeywordRequest,
  updateProfileRequest,
} from '@/features/auth/api';
import { useAccountQuery, useSession, useSetSession } from '@/features/auth/queries';
import { CandidateProfileGate } from '@/features/dashboard/candidate-profile-gate';
import { apiGet, apiPost, type JobRow } from '@/features/dashboard/shared';
import { useCountUp } from '@/lib/use-count-up';
import { cn } from '@/lib/utils';

import dynamic from 'next/dynamic';
import {
  type AtsGenerationResult,
  type AtsUploadedFile,
  triggerDownload,
} from './candidate/ats-service';
import {
  ACTIVE_STATUSES,
  type Application,
  type ApplicationStatus,
  type CandidateProfile,
  INITIAL_APPLICATIONS,
  INITIAL_INTERVIEWS,
  INITIAL_JOBS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PROFILE,
  INITIAL_SAVED_IDS,
  type JobPosting,
  type Notification,
  PIPELINE_ORDER,
  profileCompleteness,
} from './candidate/mock-data';
import {
  Sidebar as CandidateSidebar,
  type CandidateView,
} from './candidate/sidebar';
import {
  ApplicationDrawer,
  ApplicationsView,
  CandidateProfileViewsView,
  EmptyState,
  HelpView,
  InterviewsView,
  JobDrawer,
  JobsView,
  MessagesView,
  ProfileView,
  SavedJobsView,
  SectionCard,
  SettingsView,
} from './candidate/views';
import { useChat } from './chat/use-chat';

const ResumeStudioView = dynamic(() => import('./candidate/resume-studio').then(module => module.ResumeStudioView), { loading: () => <p role="status">Opening resume studio…</p> });

/* Accepts either our own Save format (CandidateProfile-shaped) or the raw JSON
   the ATS extraction service returns (an envelope around JSON-Resume data),
   and normalizes both into profile fields. */

const LIVE_STATUS: Record<string, ApplicationStatus> = {
  NEW: 'Applied',
  REVIEWING: 'Shortlisted',
  INTERVIEW: 'Interview',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
};

const initialsOf = (value: string) =>
  value
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'JD';

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const hoursSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
const formatPostedTime = (hours: number, days: number) => {
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
};

function mapLiveJob(job: JobRow): JobPosting {
  const metadata = job.metadata ?? {};
  const str = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;
  const location = job.location || 'Nepal';
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companyInitials: initialsOf(job.company),
    department: str(metadata.department) ?? '',
    location,
    workMode: /remote/i.test(location) ? 'Remote' : 'On-site',
    type: (str(metadata.employmentType) as JobPosting['type'] | null) ?? 'Full-time',
    salary: str(metadata.salary) ?? 'Negotiable',
    postedDaysAgo: daysSince(job.createdAt),
    postedHoursAgo: hoursSince(job.createdAt),
    postedTimeText: formatPostedTime(hoursSince(job.createdAt), daysSince(job.createdAt)),
    postedOn: new Date(job.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    applicants: 0,
    views: 0,
    match: 0,
    matchedSkills: [],
    missingSkills: [],
    reasons: [],
    description: job.description ?? '',
    minimumQualifications: str(metadata.minimumQualifications) ?? '',
    preferredQualifications: str(metadata.preferredQualifications) ?? '',
    requirements: [],
  };
}

function mapLiveApplication(application: {
  id: string;
  status: string;
  createdAt: string;
  job: JobRow | null;
}): Application {
  const job = application.job;
  return {
    id: application.id,
    jobId: job?.id ?? '',
    title: job?.title ?? 'Removed job',
    company: job?.company ?? '',
    companyInitials: initialsOf(job?.company ?? 'Job Dev'),
    location: job?.location ?? '',
    workMode: 'On-site',
    type: 'Full-time',
    salary: 'Negotiable',
    status: LIVE_STATUS[application.status] ?? 'Applied',
    match: 0,
    appliedDaysAgo: daysSince(application.createdAt),
    appliedOn: new Date(application.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    resumeVersion: 'My resume',
    source: 'JobDev',
    timeline: [
      {
        status: 'Applied',
        when: new Date(application.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
        note: 'Application submitted with your uploaded resume.',
      },
    ],
  };
}

function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  delay,
  onClick,
  hint,
}: {
  label: string;
  value: number;
  delta: string;
  icon: typeof Briefcase;
  delay: number;
  onClick?: () => void;
  hint?: string;
}) {
  const count = useCountUp(value);
  const body = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight xl:text-3xl">
            {count.toLocaleString()}
          </p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-success">{delta}</p>
    </>
  );
  const base =
    'sheen-hover group animate-fade-in-up w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg xl:p-5';

  /* Cards with a destination are buttons; the rest stay plain. */
  if (!onClick) {
    return (
      <div className={base} style={{ animationDelay: `${delay}ms` }}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        base,
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {body}
    </button>
  );
}

function countByStatus(applications: Application[]): Record<ApplicationStatus, number> {
  const counts = PIPELINE_ORDER.reduce(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {} as Record<ApplicationStatus, number>,
  );
  counts.Rejected = 0;
  counts.Withdrawn = 0;
  for (const application of applications) {
    counts[application.status] = (counts[application.status] ?? 0) + 1;
  }
  return counts;
}

export function CandidateDashboard() {
  const { data: user } = useSession();
  /* Conversations a recruiter has started; the candidate never opens one. */
  const chat = useChat(!!user);
  const setUser = useSetSession();

  const [view, setView] = useState<CandidateView>('overview');
  const [savedIds, setSavedIds] = useState<string[]>(INITIAL_SAVED_IDS);

  const [toast, setToast] = useState<string | null>(null);

  const client = useQueryClient();
  const jobsKey = ['account', user?.id, 'jobs'];
  const applicationsKey = ['account', user?.id, 'applications'];
  const profileViewsQuery = useAccountQuery<{
    totalViews: number;
    views: Array<{
      id: string;
      viewedAt: string;
      recruiterId: string;
      recruiterName: string;
      companyName: string;
      recruiterEmail: string;
    }>;
  }>('/api/candidates/views/me');
  const jobsQuery = useQuery({ queryKey: jobsKey, enabled: !!user,
    queryFn: async ({ signal }) => (await apiGet<{ jobs: JobRow[] }>('/api/jobs', signal)).jobs.map(mapLiveJob) });
  const applicationsQuery = useQuery({ queryKey: applicationsKey, enabled: !!user,
    queryFn: async ({ signal }) => (await apiGet<{ applications: Array<{ id: string; status: string; createdAt: string; job: JobRow | null }> }>('/api/applications', signal)).applications.map(mapLiveApplication) });
  const jobs = useMemo(() => (jobsQuery.data ?? INITIAL_JOBS).map(job => ({ ...job, saved: savedIds.includes(job.id) })), [jobsQuery.data, savedIds]);
  const applications = applicationsQuery.data ?? INITIAL_APPLICATIONS;
  const setApplications = (update: (current: Application[]) => Application[]) => client.setQueryData(applicationsKey, update(applications));
  const profile = useMemo<CandidateProfile>(() => {
    const stored = parseStoredProfile(user?.parsedProfile);
    return { ...INITIAL_PROFILE, ...stored, name: user?.name || stored.name || '',
      email: user?.email ?? '', phone: user?.phone ?? '', resumeFileName: user?.resumeFileName ?? '' };
  }, [user]);
  const checklist = useMemo(() => profileChecklist(profile), [profile]);
  const profileMutation = useMutation({ mutationFn: updateProfileRequest, onSuccess: data => setUser(data.user) });
  const applyMutation = useMutation({ mutationFn: (jobId: string) => apiPost('/api/applications', { jobId }),
    onSuccess: () => client.invalidateQueries({ queryKey: applicationsKey }) });
  const searchMutation = useMutation({ mutationFn: logSearchKeywordRequest });
  async function persistProfile(next: CandidateProfile) {
    await profileMutation.mutateAsync({ parsedProfile: next as unknown as Record<string, unknown> });
  }

  /* ATS resume: the uploaded file and the generated download live here so they
     survive switching views (the studio itself is unmounted on navigation). */
  const [atsFile, setAtsFile] = useState<AtsUploadedFile | null>(null);
  const [atsResult, setAtsResult] = useState<AtsGenerationResult | null>(null);

  /* The ATS resume lives in the database (users.resumePdf + parsedProfile).
     The in-memory `atsResult` dies on reload, so read the saved copy back and
     let the profile card keep saying "ready" after a refresh or a new login. */
  const savedResumeQuery = useQuery<SavedResume | null>({
    queryKey: ['account', user?.id, 'resume'],
    queryFn: async ({ signal }) =>
      (await apiGet<{ resume: SavedResume | null }>('/api/auth/resume', signal)).resume,
    enabled: !!user,
    gcTime: 60_000,
  });
  const savedAts = savedResumeQuery.data ?? null;
  const savedAtsName =
    savedAts && (savedAts.atsPdfBase64 || savedAts.canvas || savedAts.parsedProfile)
      ? `${savedAts.fileName.replace(/\.[^.]+$/, '')}-ats-resume.pdf`
      : null;
  const atsReady = Boolean(atsResult) || Boolean(savedAtsName);
  const atsName = atsResult?.fileName ?? savedAtsName;

  // Notification view state is memory-only, never persisted alongside identity data.
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);

  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);

  const [keywordFilters, setKeywordFilters] = useState<string[]>([]);
  /* `searchDraft` is what the user types; `jobSearch` is the applied query,
     committed only when the Search button is clicked or Enter is pressed. */
  const [searchDraft, setSearchDraft] = useState('');
  const [jobSearch, setJobSearch] = useState('');

  const keywordOptions = useMemo(() => {
    const DEFAULT_KEYWORDS = [
      'Remote',
      'Hybrid',
      'On-site',
      'Full-time',
      'Part-time',
      'Internship',
      'Frontend',
      'Backend',
      'Full-stack',
      'React',
      'Node.js',
      'TypeScript',
      'Engineer',
      'Designer',
    ];
    const derived = new Map<string, number>();
    for (const job of jobs) {
      const candidates = [
        job.company,
        job.location,
        job.type,
        job.workMode,
        ...job.title.split(/\s+/),
      ];
      for (const raw of candidates) {
        const clean = raw.trim();
        if (clean.length < 3) continue;
        derived.set(clean, (derived.get(clean) ?? 0) + 1);
      }
    }
    const derivedSorted = [...derived.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([token]) => token);
    return [...new Set([...derivedSorted, ...DEFAULT_KEYWORDS])].slice(0, 14);
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const text = jobSearch.trim().toLowerCase();
    return jobs.filter((job) => {
      const haystack =
        `${job.title} ${job.company} ${job.location} ${job.type} ${job.workMode} ${job.description} ${job.minimumQualifications ?? ''} ${job.preferredQualifications ?? ''}`.toLowerCase();
      const keywordMatch = keywordFilters.every((keyword) =>
        haystack.includes(keyword.toLowerCase()),
      );
      const textMatch = !text || haystack.includes(text);
      return keywordMatch && textMatch;
    });
  }, [jobs, keywordFilters, jobSearch]);

  /* Keyword boxes: curated job-market keywords plus anything derived from the
     live job list; picking one adds it to the search box and filters the grid. */
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* The navbar bell + gear live in the shared layout; they drive this
     dashboard through custom events so every role keeps its own UI. */
  useEffect(() => {
    const onView = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) setView(detail as CandidateView);
    };
    const onNotifications = () => setNotifOpen((value) => !value);
    window.addEventListener('jobdev:view', onView);
    window.addEventListener('jobdev:notifications', onNotifications);
    return () => {
      window.removeEventListener('jobdev:view', onView);
      window.removeEventListener('jobdev:notifications', onNotifications);
    };
  }, []);

  const firstName =
    (user?.name || user?.identifier || 'there').split(/[@\s]/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const counts = useMemo(() => countByStatus(applications), [applications]);
  const appliedJobIds = useMemo(
    () => applications.map((application) => application.jobId),
    [applications],
  );
  const completeness = useMemo(() => profileCompleteness(checklist), [checklist]);
  const missingSignals = checklist.filter((item) => !item.done).length;

  const upcomingInterviews = INITIAL_INTERVIEWS.filter((interview) => interview.inDays >= 0);
  const activeApplications = applications.filter((application) =>
    ACTIVE_STATUSES.includes(application.status),
  );


  const stats: Array<{
    label: string;
    value: number;
    delta: string;
    icon: typeof Briefcase;
    hint: string;
    go: () => void;
  }> = [
    {
      label: 'Active applications',
      value: activeApplications.length,
      delta: `${counts.Applied} awaiting a reply`,
      icon: Briefcase,
      hint: 'Open your applications',
      go: () => setView('applications'),
    },
    /* { label: 'Interviews scheduled' ... } */
    {
      label: 'Saved jobs',
      value: savedIds.length,
      delta: `${jobs.filter((job) => job.match >= 85).length} roles above 85% match`,
      icon: Bookmark,
      hint: 'Open your shortlist',
      go: () => setView('saved'),
    },
    {
      label: 'Profile views',
      value: profileViewsQuery.data?.totalViews ?? 0,
      delta: `Profile ${completeness}% complete`,
      icon: Eye,
      hint: 'See who viewed your profile',
      go: () => setView('views'),
    },
  ];

  /* Working global search: matches open roles + your applications, click to jump in. */



  /* ------------------------------- mutations ------------------------------ */

  function toggleSave(job: JobPosting) {
    const saved = savedIds.includes(job.id);
    setSavedIds((current) =>
      saved ? current.filter((id) => id !== job.id) : [job.id, ...current],
    );
    setToast(
      saved
        ? `Removed “${job.title}” from saved jobs`
        : `Saved “${job.title}” for later`,
    );
  }

  async function applyToJob(job: JobPosting) {
    if (appliedJobIds.includes(job.id)) {
      setToast('You have already applied to this role');
      return;
    }
    try {
      await applyMutation.mutateAsync(job.id);
      setToast(`Applied to “${job.title}” — we will track it for you`);
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  function withdrawApplication(id: string) {
    setApplications((current) =>
      current.map((application) =>
        application.id === id
          ? {
              ...application,
              status: 'Withdrawn',
              nextStep: undefined,
              timeline: [
                ...application.timeline,
                {
                  status: 'Withdrawn',
                  when: 'Today',
                  note: 'You withdrew from this application.',
                },
              ],
            }
          : application,
      ),
    );
    setToast('Application withdrawn — the recruiter has been notified');
  }


  async function downloadAtsResume() {
    try {
      const saved = client.getQueryData<SavedResume | null>(['account', user?.id, 'resume']);
      const result = atsResult ?? (saved ? (await import('./candidate/saved-resume')).restoreResult(saved) : null);
      if (!result) { setView('resume'); return; }
      triggerDownload(result.blob, result.fileName);
      setToast(`Downloading ${result.fileName}`);
    } catch (error) { setToast((error as Error).message); }
  }

  function openApplicationById(applicationId: string) {
    const application = applications.find((entry) => entry.id === applicationId);
    if (!application) return;
    setView('applications');
    setSelectedApplication(application);
  }

  const recommended = useMemo(
    () =>
      jobs
        .filter((job) => !appliedJobIds.includes(job.id))
        .sort((a, b) => b.match - a.match)
        .slice(0, 3),
    [jobs, appliedJobIds],
  );

  const refreshJob = selectedJob
    ? jobs.find((job) => job.id === selectedJob.id) ?? null
    : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <CandidateProfileGate />
      <CandidateSidebar
        active={view}
        onSelect={setView}
        badges={{
          applications: activeApplications.length,
          interviews: upcomingInterviews.length,
          saved: savedIds.length,
          views: profileViewsQuery.data?.totalViews,
          messages: chat.unread,
        }}
        strengthPercent={completeness}
        missingSignals={missingSignals}
        onLogout={() => window.dispatchEvent(new CustomEvent('jobdev:logout'))}
      />

      <main className="min-w-0 flex-1 space-y-4">
        {(jobsQuery.isPending || applicationsQuery.isPending || profileViewsQuery.isPending) && <p role="status" className="text-sm text-muted-foreground">Loading dashboard data…</p>}
        {(jobsQuery.error || applicationsQuery.error || profileViewsQuery.error) && <div role="alert" className="text-sm text-destructive">{(jobsQuery.error ?? applicationsQuery.error ?? profileViewsQuery.error)?.message} <button onClick={() => { void jobsQuery.refetch(); void applicationsQuery.refetch(); void profileViewsQuery.refetch(); }}>Retry</button></div>}
        {/* Greeting + global actions */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="animate-fade-in-up">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting}, <span className="text-primary">{firstName}</span>
            </h1>
            
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
            <div>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                  <div className="animate-pop-in fixed right-4 top-16 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
                      <p className="text-sm font-bold">Notifications</p>
                      <button
                        type="button"
                        onClick={() =>
                          setNotifications((current) =>
                            current.map((notification) => ({ ...notification, read: true })),
                          )
                        }
                        className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                      </button>
                    </div>
                    <ul className="max-h-80 overflow-y-auto p-2 scrollbar-slim">
                      {notifications.map((notification) => (
                        <li key={notification.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setNotifications((current) =>
                                current.map((entry) =>
                                  entry.id === notification.id ? { ...entry, read: true } : entry,
                                ),
                              );
                              setView(notification.view);
                              setNotifOpen(false);
                            }}
                            className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary-light"
                          >
                            <span
                              className={
                                notification.read
                                  ? 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border'
                                  : 'mt-1.5 h-2 w-2 shrink-0 animate-pulse-dot rounded-full bg-primary'
                              }
                            />
                            <span>
                              <span className="block text-sm font-medium leading-snug">
                                {notification.text}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {notification.time}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            <Button className="hidden sm:inline-flex" onClick={() => setView('jobs')}>
              <Compass className="h-4 w-4" />
              Find jobs
            </Button>
          </div>
        </div>

        {/* Mobile primary action */}
        <Button className="w-full sm:hidden" onClick={() => setView('jobs')}>
          <Compass className="h-4 w-4" />
          Find jobs
        </Button>

        {view === 'overview' && (
          <>
            <div className="animate-fade-in-up overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <img
                src="/jobdev-poster.png"
                alt="JobDev - find work that fits, apply in one click"
                className="h-auto w-full object-cover"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat, index) => (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  delta={stat.delta}
                  icon={stat.icon}
                  delay={index * 90}
                  onClick={stat.go}
                  hint={stat.hint}
                />
              ))}
            </div>

            {/* ATS resume shortcut */}
            <SectionCard
              title="ATS-friendly resume"
              subtitle="Upload the resume you send out and download the ATS-friendly version"
              delay={220}
            >
              {atsReady ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                    <FileCheck2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{atsName}</p>
                    <p className="text-sm text-muted-foreground">
                      PDF · {atsResult?.pages ?? 1} page{(atsResult?.pages ?? 1) === 1 ? '' : 's'} ·
                      saved with your profile
                    </p>
                  </div>
                  <Button onClick={downloadAtsResume}>
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                    <FileCheck2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {user?.resumeFileName ? 'Your saved resume is ready to open' : 'No ATS resume generated yet'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {user?.resumeFileName
                        ? 'Build resume will use your existing upload — no need to upload it again.'
                        : 'Upload a PDF, DOCX or DOC and download a single-column, parser-safe version.'}
                    </p>
                  </div>
                  <Button onClick={() => setView('resume')}>
                    <UploadCloud className="h-4 w-4" />
                    {user?.resumeFileName ? 'Open saved resume' : 'Upload resume'}
                  </Button>
                </div>
              )}
            </SectionCard>

            {/* Recommendations */}
            <SectionCard
              title="Recommended for you"
              subtitle="Ranked by skills, experience, working style and salary fit"
              delay={400}
              action={
                <button
                  type="button"
                  onClick={() => setView('jobs')}
                  className="text-xs font-semibold text-primary hover:text-primary-hover"
                >
                  Browse all
                </button>
              }
            >
              {recommended.length === 0 ? (
                <EmptyState
                  icon={Compass}
                  title="No fresh matches right now"
                  body="Add a few more skills to your profile and new roles will appear here within minutes."
                />
              ) : (
                <ul className="space-y-3">
                  {recommended.map((job, index) => (
                    <li
                      key={job.id}
                      className="animate-fade-in-up rounded-xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-primary-light/20"
                      style={{ animationDelay: `${460 + index * 70}ms` }}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-xs font-bold text-primary-dark">
                          {job.companyInitials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold">{job.title}</h4>
                            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                              {job.match}% match
                            </span>
                            {job.postedDaysAgo <= 3 ? (
                              <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-semibold text-primary-dark">
                                New
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {job.company} · {job.location} · {job.workMode} · {job.salary}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {job.matchedSkills.slice(0, 3).map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"
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
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button size="sm" onClick={() => applyToJob(job)}>
                            Quick apply
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setSelectedJob(job)}>
                            Details
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </>
        )}

        {view === 'applications' && (
          <ApplicationsView
            applications={applications}
            onOpen={setSelectedApplication}
            onWithdraw={withdrawApplication}
            onBrowseJobs={() => setView('jobs')}
          />
        )}

        {view === 'views' && (
          <CandidateProfileViewsView
            views={profileViewsQuery.data?.views ?? []}
            totalViews={profileViewsQuery.data?.totalViews ?? 0}
            isLoading={profileViewsQuery.isPending}
            error={profileViewsQuery.error?.message}
            onRetry={() => { void profileViewsQuery.refetch(); }}
          />
        )}

        {view === 'messages' && (
          <MessagesView
            conversations={chat.threads.data ?? []}
            onSend={(conversationId, text) => chat.send.mutate({ threadId: conversationId, text })}
            onMarkRead={(conversationId) => chat.markRead.mutate(conversationId)}
            loading={chat.threads.isLoading}
            sending={chat.send.isPending}
            error={
              chat.threads.error instanceof Error
                ? chat.threads.error.message
                : chat.send.error instanceof Error
                  ? chat.send.error.message
                  : null
            }
          />
        )}

        {view === 'interviews' && (
          <InterviewsView
            interviews={INITIAL_INTERVIEWS}
            onOpenApplication={openApplicationById}
          />
        )}

        {view === 'saved' && (
          <SavedJobsView
            jobs={jobs.filter((job) => savedIds.includes(job.id))}
            onOpenJob={setSelectedJob}
            onToggleSave={toggleSave}
            onApply={applyToJob}
            appliedJobIds={appliedJobIds}
          />
        )}

        {view === 'resume' && (
          <ResumeStudioView
            profile={profile}
            file={atsFile}
            onFileChange={setAtsFile}
            result={atsResult}
            onResultChange={setAtsResult}
            onNotify={setToast}
            onSave={persistProfile}
          />
        )}

        {view === 'jobs' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const applied = searchDraft.trim();
                  setJobSearch(applied);
                  if (applied) searchMutation.mutate(applied);
                }}
              >
                <div className="flex min-w-[200px] flex-1 flex-wrap items-center gap-2 rounded-lg border border-input bg-background px-2 py-1.5">
                  {keywordFilters.map((keyword) => (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() =>
                        setKeywordFilters((current) =>
                          current.filter((item) => item !== keyword),
                        )
                      }
                      className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
                    >
                      {keyword}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                  <input
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    placeholder="Search jobs by keyword…"
                    className="h-7 min-w-[140px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <Button type="submit" className="gap-1.5">
                  <Search className="h-4 w-4" />
                  Search
                </Button>
              </form>
              <div className="mt-2 flex flex-wrap gap-2">
                {keywordOptions
                  .filter((keyword) => !keywordFilters.includes(keyword))
                  .map((keyword) => (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() => {
                        setKeywordFilters((current) => [...current, keyword]);
                        searchMutation.mutate(keyword);
                      }}
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary-dark"
                    >
                      + {keyword}
                    </button>
                  ))}
              </div>
            </div>
            <JobsView
              jobs={filteredJobs}
              savedIds={savedIds}
              appliedJobIds={appliedJobIds}
              onOpenJob={setSelectedJob}
              onToggleSave={toggleSave}
              onApply={applyToJob}
            />
          </div>
        )}



        {view === 'profile' && (
          <ProfileView
            profile={profile}
            checklist={checklist}
            percent={completeness}
            onOpenSettings={() => setView('settings')}
            atsReady={atsReady}
            atsFileName={atsName}
            onOpenResume={() => setView('resume')}
            onDownloadAts={downloadAtsResume}
            onSaveProfile={(fields) => persistProfile({ ...profile, ...fields })}
            onAddSkill={(skill) => {
              if (!profile.skills.some(value => value.toLowerCase() === skill.toLowerCase()))
                void persistProfile({ ...profile, skills: [...profile.skills, skill] }).catch(error => setToast(error.message));
            }}
            onRemoveSkill={(skill) => {
              void persistProfile({ ...profile, skills: profile.skills.filter(value => value !== skill) }).catch(error => setToast(error.message));
            }}
            onAddExperience={(entry) => {
              void persistProfile({ ...profile, experience: [...profile.experience, { ...entry, highlights: [] }] }).catch(error => setToast(error.message));
            }}
          />
        )}

        {view === 'settings' && <SettingsView profile={profile} />}
        {view === 'help' && <HelpView />}
      </main>

      <ApplicationDrawer
        application={selectedApplication}
        onClose={() => setSelectedApplication(null)}
        onWithdraw={withdrawApplication}
      />

      <JobDrawer
        job={refreshJob}
        applied={refreshJob ? appliedJobIds.includes(refreshJob.id) : false}
        saved={refreshJob ? savedIds.includes(refreshJob.id) : false}
        onClose={() => setSelectedJob(null)}
        onApply={applyToJob}
        onToggleSave={toggleSave}
      />

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="animate-pop-in fixed bottom-6 right-6 z-[80] flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-xl"
        >
          <CheckCheck className="h-4 w-4 text-success" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
