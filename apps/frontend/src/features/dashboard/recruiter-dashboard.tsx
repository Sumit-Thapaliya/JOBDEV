'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Briefcase, CheckCheck, Eye, Plus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useSession } from '@/features/auth/queries';
import {
  apiGet,
  apiPatch,
  apiPost,
  type JobRow,
} from '@/features/dashboard/shared';
import { useCountUp } from '@/lib/use-count-up';
import { cn } from '@/lib/utils';

import { ViewedCandidatesView, ViewedCandidateDrawer, useRecordProfileView } from './recruiter/viewed-candidates';
import { ApplicationsChart } from './recruiter/charts';
import {
  INITIAL_JOBS,
  INITIAL_NOTIFICATIONS,
  type Applicant,
  type ApplicantStatus,
  type Job,
  type JobStatus,
  type Notification,
} from './recruiter/mock-data';
import { Sidebar, type RecruiterView } from './recruiter/sidebar';
import {
  AnalyticsView,
  ApplicantDrawer,
  ApplicantsView,
  Avatar,
  CompanyView,
  HelpView,
  JobDrawer,
  JobsView,
  mapApplicantRow,
  MessagesView,
  SettingsView,
  StatusChip,
  type ApplicantApiRow,
} from './recruiter/views';
import { useChat } from './chat/use-chat';

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const hoursSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
const formatPostedTime = (hours: number, days: number) => {
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
};

/* Map an API job row into the recruiter workspace Job shape. */
function mapApiJob(row: JobRow): Job {
  const metadata = row.metadata ?? {};
  const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const type = (str(metadata.employmentType) ?? 'Full-time') as Job['type'];
  return {
    id: row.id,
    title: row.title,
    department: str(metadata.department) ?? '',
    location: row.location ?? 'Remote',
    type,
    description: row.description ?? '',
    minimumQualifications: str(metadata.minimumQualifications) ?? '',
    preferredQualifications: str(metadata.preferredQualifications) ?? '',
    salary: str(metadata.salary) ?? 'Negotiable',
    status: row.status === 'paused' ? 'Paused' : row.status === 'closed' ? 'Closed' : 'Active',
    applicants: 0,
    views: 0,
    postedDaysAgo: daysSince(row.createdAt),
    postedHoursAgo: hoursSince(row.createdAt),
    postedTimeText: formatPostedTime(hoursSince(row.createdAt), daysSince(row.createdAt)),
    postedOn: new Date(row.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
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

export function RecruiterDashboard() {
  const { data: user } = useSession();
  const chat = useChat(!!user);
  /** The thread the Messages tab opens on (set when the drawer starts one). */
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);

  const [view, setView] = useState<RecruiterView>('overview');
  const client = useQueryClient();
  const jobsKey = ['account', user?.id, 'recruiter-jobs'];
  const applicantsKey = ['account', user?.id, 'applicants'];
  const jobsQuery = useQuery({ queryKey: jobsKey, enabled: !!user,
    queryFn: async ({ signal }) => (await apiGet<{ jobs: JobRow[] }>('/api/jobs/mine', signal)).jobs.map(mapApiJob) });
  const applicantsQuery = useQuery({ queryKey: applicantsKey, enabled: !!user,
    /* Always re-read: a candidate can replace their resume after applying, and
       the app default (30 s stale + no refetch on focus) kept showing the old
       one in an open tab. */
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    /* Masked at the source: contact values are one-way tokens already. */
    queryFn: async ({ signal }) => (await apiGet<{ applicants: ApplicantApiRow[] }>('/api/applicants', signal)).applicants.map(mapApplicantRow) });
  const jobs = jobsQuery.data ?? INITIAL_JOBS;
  const applicants = applicantsQuery.data ?? [];
  const setJobs = (update: (current: Job[]) => Job[]) => client.setQueryData(jobsKey, update(jobs));
  const setApplicants = (update: (current: Applicant[]) => Applicant[]) => client.setQueryData(applicantsKey, update(applicants));
  const createJob = useMutation({ mutationFn: (data: Record<string, unknown>) => apiPost<{ job: JobRow }>('/api/jobs', data) });
  const updateJob = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => apiPatch(`/api/jobs/${id}/status`, { status }) });
  // Notification view state is memory-only, never persisted alongside identity data.
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);

  const [notifOpen, setNotifOpen] = useState(false);

  /* The navbar bell + gear live in the shared layout; they drive this
     dashboard through custom events. */
  useEffect(() => {
    const onView = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) setView(detail as RecruiterView);
    };
    const onNotifications = () => setNotifOpen((value) => !value);
    window.addEventListener('jobdev:view', onView);
    window.addEventListener('jobdev:notifications', onNotifications);
    return () => {
      window.removeEventListener('jobdev:view', onView);
      window.removeEventListener('jobdev:notifications', onNotifications);
    };
  }, []);
  const [jobFilter, setJobFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApplicantStatus | 'All'>(
    'All',
  );
  const [postJobSignal, setPostJobSignal] = useState(0);
  const [selectedApplicant, setSelectedApplicant] =
    useState<Applicant | null>(null);
  const recordView = useRecordProfileView();
  const [viewedCandidateId, setViewedCandidateId] = useState<string | null>(null);
  const openApplicant = (applicant: Applicant) => {
    setSelectedApplicant(applicant);
    if (applicant.candidateId) recordView.mutate(applicant.candidateId);
  };
  const openViewedCandidate = (candidateId: string) => {
    setViewedCandidateId(candidateId);
    recordView.mutate(candidateId);
  };
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const firstName =
    (user?.name || user?.identifier || 'there').split(/[@\s]/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const stats = useMemo<
    Array<{
      label: string;
      value: number;
      delta: string;
      icon: typeof Briefcase;
      hint?: string;
      go?: () => void;
    }>
  >(
    () => [
      {
        label: 'Active jobs',
        value: jobs.filter((job) => job.status === 'Active').length,
        delta: `${jobs.length} total posted`,
        icon: Briefcase,
        hint: 'View your active jobs',
        go: () => setView('jobs'),
      },
      {
        label: 'Total applicants',
        value: applicants.length,
        delta: `${applicants.filter((a) => a.status === 'New').length} new in pipeline`,
        icon: Users,
        hint: 'View all applicants',
        go: () => {
          setStatusFilter('All');
          setView('applicants');
        },
      },
      /* { label: 'Interviews scheduled' ... omitted for now } */
      {
        label: 'Job views',
        value: jobs.reduce((sum, job) => sum + job.views, 0),
        delta: `Across ${jobs.length} job post${jobs.length === 1 ? '' : 's'}`,
        icon: Eye,
        hint: 'Open analytics',
        go: () => setView('analytics'),
      },
    ],
    [jobs, applicants],
  );

  /* Working global search: matches jobs + applicants, click to jump in. */


  async function addJob(job: Job) {
    try {
      const data = await createJob.mutateAsync({
        title: job.title,
        location: job.location,
        description: job.description ?? null,
        department: job.department || null,
        employmentType: job.type,
        salary: job.salary || null,
        minimumQualifications: job.minimumQualifications || null,
        preferredQualifications: job.preferredQualifications || null,
      });
      /* Saved job rows power the candidate side too - their keyword chips
         derive from these posts automatically. */
      setJobs((current) => [mapApiJob(data.job), ...current]);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'Could not post the job',
        variant: 'destructive',
      });
      throw error;
    }
  }

  async function setJobStatus(id: string, status: JobStatus) {
    const apiStatus =
      status === 'Active' ? 'open' : status === 'Paused' ? 'paused' : 'closed';
    try {
      await updateJob.mutateAsync({ id, status: apiStatus });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'Could not update the job',
        variant: 'destructive',
      });
      return;
    }
    const changedOn =
      status === 'Active'
        ? undefined
        : new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
    setJobs((current) =>
      current.map((job) =>
        job.id === id ? { ...job, status, statusChangedOn: changedOn } : job,
      ),
    );
    setSelectedJob((current) =>
      current && current.id === id
        ? { ...current, status, statusChangedOn: changedOn }
        : current,
    );
  }

  /* Schedule an interview: pick a date in the calendar → status Interview +
     date stored (candidate-side notification arrives with that module). */
  function scheduleInterview(id: string, dateLabel: string) {
    setApplicants((current) =>
      current.map((applicant) =>
        applicant.id === id
          ? { ...applicant, status: 'Interview', scheduledDate: dateLabel }
          : applicant,
      ),
    );
    setSelectedApplicant((current) =>
      current && current.id === id
        ? { ...current, status: 'Interview', scheduledDate: dateLabel }
        : current,
    );
  }

  function setApplicantStatus(id: string, status: ApplicantStatus) {
    setApplicants((current) =>
      current.map((applicant) =>
        applicant.id === id ? { ...applicant, status } : applicant,
      ),
    );
    setSelectedApplicant((current) =>
      current && current.id === id ? { ...current, status } : current,
    );
  }

  function viewApplicantsFor(jobTitle: string) {
    setJobFilter(jobTitle);
    setView('applicants');
  }

  const badges: Partial<Record<RecruiterView, number>> = {
    applicants: applicants.filter((a) => a.status === 'New').length,
    messages: chat.unread,
  };

  /** Opens (or re-uses) the conversation for one applicant and jumps to it. */
  async function openChat(applicant: Applicant) {
    try {
      const thread = await chat.openThread.mutateAsync(applicant.id);
      setChatThreadId(thread.id);
      setSelectedApplicant(null);
      setView('messages');
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'Could not open the conversation',
        variant: 'destructive',
      });
    }
  }

  const chatError =
    chat.threads.error instanceof Error
      ? chat.threads.error.message
      : chat.send.error instanceof Error
        ? chat.send.error.message
        : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <Sidebar
        active={view}
        onSelect={setView}
        badges={badges}
        onLogout={() => window.dispatchEvent(new CustomEvent('jobdev:logout'))}
      />

      <main className="min-w-0 flex-1 space-y-4">
        {(jobsQuery.isPending || applicantsQuery.isPending) && <p role="status" className="text-sm text-muted-foreground">Loading recruiter data…</p>}
        {(jobsQuery.error || applicantsQuery.error) && <div role="alert" className="text-sm text-destructive">{(jobsQuery.error ?? applicantsQuery.error)?.message} <button onClick={() => { void jobsQuery.refetch(); void applicantsQuery.refetch(); }}>Retry</button></div>}
        {/* Top bar */}
        {/* z-40 only while a dropdown is open so results float above cards;
            otherwise the bar stays low and scrolls under the sticky nav. */}
        <div
          className={cn(
            'animate-fade-in relative flex flex-wrap items-center justify-between gap-3',
            notifOpen ? 'z-40' : 'z-0',
          )}
        >
          <div className="min-w-0 w-full sm:w-auto">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              {greeting},{' '}
              <span className="text-primary">{firstName}</span>
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Here&apos;s what&apos;s happening with your hiring today.
            </p>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">

            {/* Notifications dropdown, opened from the navbar bell */}
            <div>
              {notifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setNotifOpen(false)}
                  />
                  <div className="animate-pop-in fixed right-4 top-16 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
                      <p className="text-sm font-bold">Notifications</p>
                      <button
                        type="button"
                        onClick={() =>
                          setNotifications((current) =>
                            current.map((n) => ({ ...n, read: true })),
                          )
                        }
                        className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                      </button>
                    </div>
                    <ul className="max-h-80 overflow-y-auto p-2 scrollbar-slim">
                      {notifications.length === 0 && (
                        <li className="p-4 text-center text-xs text-muted-foreground">
                          No notifications yet.
                        </li>
                      )}
                      {notifications.map((notification) => (
                        <li key={notification.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setNotifications((current) =>
                                current.map((n) =>
                                  n.id === notification.id
                                    ? { ...n, read: true }
                                    : n,
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
                                  : 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse-dot'
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

            <Button
              onClick={() => {
                setView('jobs');
                setPostJobSignal((signal) => signal + 1);
              }}
              className="hidden sm:inline-flex"
            >
              <Plus className="h-4 w-4" />
              Post a job
            </Button>
          </div>
        </div>

        {/* Mobile post-a-job */}
        <Button
          onClick={() => {
            setView('jobs');
            setPostJobSignal((signal) => signal + 1);
          }}
          className="w-full sm:hidden"
        >
          <Plus className="h-4 w-4" />
          Post a job
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

            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <div
                className="animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-sm"
                style={{ animationDelay: '200ms' }}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Application stats</h3>
                  <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      Applications
                    </span>
                     {/* <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info" />Interviews</span> */} 
                  </div>
                </div>
                <ApplicationsChart />
              </div>

              <div
                className="animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-sm"
                style={{ animationDelay: '280ms' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Recent applicants</h3>
                  <button
                    type="button"
                    onClick={() => setView('applicants')}
                    className="text-xs font-semibold text-primary hover:text-primary-hover"
                  >
                    View all
                  </button>
                </div>
                {applicants.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No applicants yet - they appear here as soon as someone applies.
                  </p>
                )}
                <ul className="max-h-80 space-y-3 overflow-y-auto pr-1 scrollbar-slim lg:max-h-64 xl:max-h-80">
                  {applicants.slice(0, 5).map((applicant, index) => (
                    <li
                      key={applicant.id}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${340 + index * 70}ms` }}
                    >
                      <button
                        type="button"
                        onClick={() => openApplicant(applicant)}
                        className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-primary-light"
                      >
                        <Avatar name={applicant.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {applicant.name}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {applicant.job}
                          </p>
                        </div>
                        <StatusChip status={applicant.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div
              className="animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-sm"
              style={{ animationDelay: '360ms' }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Live job posts</h3>
                <button
                  type="button"
                  onClick={() => setView('jobs')}
                  className="text-xs font-semibold text-primary hover:text-primary-hover"
                >
                  Manage jobs
                </button>
              </div>
              {jobs.filter((job) => job.status !== 'Closed').length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No live job posts yet - use “Post a job” to publish your first role.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {jobs
                  .filter((job) => job.status !== 'Closed')
                  .slice(0, 4)
                  .map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      title="Open job details"
                      onClick={() => setSelectedJob(job)}
                      className="group w-full cursor-pointer rounded-xl border border-border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold group-hover:text-primary-dark">
                          {job.title}
                        </p>
                        <StatusChip status={job.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {job.applicants} applicants ·{' '}
                        {job.views.toLocaleString()} views
                      </p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(job.applicants * 2, 100)}%`,
                          }}
                        />
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </>
        )}

        {view === 'jobs' && (
          <JobsView
            jobs={jobs}
            onAdd={addJob}
            posting={createJob.isPending}
            onSetStatus={setJobStatus}
            onViewApplicants={viewApplicantsFor}
            onOpenJob={setSelectedJob}
            openSignal={postJobSignal}
          />
        )}

        {view === 'harvested' && <ViewedCandidatesView onOpenProfile={openViewedCandidate} />}
        {viewedCandidateId && <ViewedCandidateDrawer candidateId={viewedCandidateId} onClose={() => setViewedCandidateId(null)} />}

        {view === 'applicants' && (
          <ApplicantsView
            applicants={applicants}
            onSetStatus={setApplicantStatus}
            filterJob={jobFilter}
            onClearJobFilter={() => setJobFilter(null)}
            onOpen={openApplicant}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onScheduleInterview={scheduleInterview}
          />
        )}

        {view === 'messages' && (
          <MessagesView
            conversations={chat.threads.data ?? []}
            onSend={(conversationId, text) => chat.send.mutate({ threadId: conversationId, text })}
            onMarkRead={(conversationId) => chat.markRead.mutate(conversationId)}
            selectedId={chatThreadId}
            onSelect={setChatThreadId}
            loading={chat.threads.isLoading}
            sending={chat.send.isPending}
            error={chatError}
          />
        )}

        {view === 'analytics' && <AnalyticsView />}
        {view === 'company' && <CompanyView />}
        {view === 'settings' && <SettingsView />}
        {view === 'help' && <HelpView />}

        <ApplicantDrawer
          applicant={selectedApplicant}
          onClose={() => setSelectedApplicant(null)}
          onSetStatus={setApplicantStatus}
          onScheduleInterview={scheduleInterview}
          onMessage={openChat}
          messageBusy={chat.openThread.isPending}
        />

        <JobDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onSetStatus={setJobStatus}
          onViewApplicants={viewApplicantsFor}
        />
      </main>
    </div>
  );
}