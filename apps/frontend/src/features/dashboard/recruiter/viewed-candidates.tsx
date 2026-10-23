'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import type { AuthUser } from '@/features/auth/api';
import { useSession } from '@/features/auth/queries';
import { apiGet, apiPost } from '@/lib/api-client';
import { parseStoredProfile } from '../candidate/profile-data';
import type { Applicant } from './mock-data';
import { ApplicantDrawer } from './views';

interface ProfileViewRow {
  id: string;
  candidateId: string;
  candidateName: string | null;
  candidateEmail: string | null;
  viewedAt: string;
}
interface ProfileViews {
  totalViews: number;
  views: ProfileViewRow[];
}
const viewsKey = (userId?: string) =>
  ['account', userId, 'viewed-candidates'] as const;

/** Called by explicit profile-open actions, never a data-loading effect. */
export function useRecordProfileView() {
  const { data: user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (candidateId: string) =>
      apiPost<{ created: boolean }>(`/api/candidates/${candidateId}/views`),
    onSuccess: (data) =>
      data.created
        ? client.invalidateQueries({ queryKey: viewsKey(user?.id) })
        : undefined,
    onError: (error) =>
      toast({
        title: 'Could not save profile view',
        description: error.message,
        variant: 'destructive',
      }),
  });
}

export function ViewedCandidatesView({
  onOpenProfile,
}: {
  onOpenProfile: (candidateId: string) => void;
}) {
  const { data: user } = useSession();
  const history = useQuery({
    queryKey: viewsKey(user?.id),
    queryFn: ({ signal }) =>
      apiGet<ProfileViews>('/api/candidates/views', signal),
    enabled: !!user,
  });
  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <h2 className="text-xl font-bold">Viewed Candidates</h2>
        {history.data && (
          <p className="text-sm text-muted-foreground">
            You have viewed {history.data.totalViews} candidate profiles.
          </p>
        )}
      </div>
      {history.isPending && <p role="status">Loading viewed candidates…</p>}
      {history.isError && (
        <div role="alert">
          <p>{history.error.message}</p>
          <Button variant="outline" onClick={() => history.refetch()}>
            Retry history
          </Button>
        </div>
      )}
      {history.data?.views.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <h3 className="font-semibold">No views yet</h3>
          <p className="text-sm text-muted-foreground">
            Candidates you view will appear here.
          </p>
        </div>
      )}
      <div className="space-y-3">
        {history.data?.views.map((view) => (
          <div
            key={view.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div>
              <p className="font-semibold">
                {view.candidateName || 'Unnamed candidate'}
              </p>
              {view.candidateEmail && (
                <p className="text-sm text-muted-foreground">
                  <span aria-hidden className="select-none font-mono text-[10px] blur-[3px]" title="Email hidden">
                    {view.candidateEmail}
                  </span>
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                First viewed on {new Date(view.viewedAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenProfile(view.candidateId)}
            >
              View Profile
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Reopen the real saved profile; do not invent a job, application, or profile fields. */
export function ViewedCandidateDrawer({
  candidateId,
  onClose,
}: {
  candidateId: string;
  onClose: () => void;
}) {
  const { data: viewer } = useSession();
  const detail = useQuery({
    queryKey: ['account', viewer?.id, 'candidate', candidateId],
    queryFn: ({ signal }) =>
      apiGet<{ candidate: AuthUser }>(`/api/candidates/${candidateId}`, signal),
    enabled: !!viewer,
  });
  if (!detail.data)
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Candidate profile"
          className="space-y-4 rounded-xl border border-border bg-card p-6"
        >
          {detail.isError ? (
            <>
              <p role="alert">{detail.error.message}</p>
              <Button onClick={() => detail.refetch()}>Retry profile</Button>
            </>
          ) : (
            <p role="status">Loading candidate profile…</p>
          )}
          <Button variant="outline" onClick={onClose}>
            Close details
          </Button>
        </section>
      </div>
    );
  const user = detail.data.candidate;
  const profile = parseStoredProfile(user.parsedProfile);
  const applicant: Applicant = {
    id: user.id,
    candidateId: user.id,
    name: user.name || profile.name || 'Unnamed candidate',
    job: profile.headline || 'Candidate profile',
    status: 'New',
    match: 0,
    appliedDaysAgo: 0,
    /* The API already blurred these for a recruiter (one-way digests). */
    email: user.email ?? '',
    phone: user.phone ?? '',
    contactMasked: true,
    location: profile.location ?? '',
    summary: profile.about ?? '',
    skills: profile.skills ?? [],
    experience: profile.experience ?? [],
    education: (profile.education ?? [])
      .map((item) =>
        [item.degree, item.school, item.period].filter(Boolean).join(' · '),
      )
      .join('\n'),
    resumeUrl: user.resumeFileName
      ? `/api/candidates/${user.id}/resume`
      : undefined,
  };
  return (
    <ApplicantDrawer applicant={applicant} onClose={onClose} profileOnly />
  );
}
