'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseStoredProfile } from './profile-data';
import { restoreFile, restoreResult, type SavedResume } from './saved-resume';

import {
  Briefcase,
  CheckCircle2,
  CircleAlert,
  Download,
  Eye,
  FileCheck2,
  FileText,
  FileUp,
  Gauge,
  GraduationCap,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { uploadResumeRequest, type AuthUser } from '@/features/auth/api';
import { useSession, useSetSession } from '@/features/auth/queries';
import { apiGet } from '@/lib/api-client';
import { fileAsBase64 } from '@/lib/files';

import {
  ATS_ACCEPT_ATTR,
  ATS_ACCEPTED_LABEL,
  formatBytes,
  toResumeDocument,
  toUploadedFile,
  triggerDownload,
  validateAtsUpload,
  type AtsGenerationResult,
  type AtsUploadedFile,
} from './ats-service';
import {
  flowToCanvas,
  resumePdf,
  resumePdfFromCanvas,
  type CanvasDocument,
  type ResumeDocument,
} from './demo-resume-pdf';
import { fillWithTemplate } from './templates';
import { TemplateStrip } from './templates/template-gallery';

import dynamic from 'next/dynamic';
import type { CandidateProfile } from './mock-data';
const ResumeEditor = dynamic(() => import('./resume-editor').then(module => module.ResumeEditor), { ssr: false, loading: () => <p role="status">Opening editor…</p> });

/** Base64 → PDF blob (the ATS PDF the backend stored on the profile). */
function base64Pdf(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}

/* The sketch caps the uploaded resume at 1 MB (PDF or Word). */
const MAX_RESUME_BYTES = 1_000_000;

type StudioTab = 'preview' | 'experience' | 'qualifications' | 'skills' | 'review';

const TABS: Array<{ id: StudioTab; label: string; icon: typeof Eye }> = [
  { id: 'preview', label: 'ATS preview', icon: Eye },
  { id: 'experience', label: 'Experience', icon: Briefcase },
  { id: 'qualifications', label: 'Qualifications', icon: GraduationCap },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'review', label: 'Overall review', icon: Gauge },
];

function fileKindLabel(kind: AtsUploadedFile['kind']): string {
  return kind === 'pdf' ? 'PDF' : 'Word';
}

/** The paper preview. Deliberately white-on-black-text: this is the printed page. */
function ResumePreview({ document }: { document: ResumeDocument }) {
  return (
    <article className="mx-auto w-full max-w-[720px] rounded-lg bg-white px-8 py-9 text-neutral-900 shadow-md ring-1 ring-black/10">
      <h2 className="text-center text-[19px] font-bold leading-tight">{document.name}</h2>
      <p className="mt-1 text-center text-[11.5px]">{document.headline}</p>
      <p className="mt-1 text-center text-[10.5px] text-neutral-600">
        {document.contacts.join('  |  ')}
      </p>

      {document.sections.map((section) => (
        <section key={section.title} className="mt-5">
          <h3 className="border-b border-neutral-300 pb-1 text-[11px] font-bold uppercase tracking-wide">
            {section.title}
          </h3>
          {section.blocks.map((block, index) => (
            <p
              key={`${section.title}-${index}`}
              className={cn(
                'mt-1.5 whitespace-pre-line text-[11.5px] leading-relaxed',
                block.kind === 'entry' && 'font-bold',
                block.kind === 'bullet' && '-indent-3 pl-3',
              )}
            >
              {block.kind === 'bullet' ? `- ${block.text}` : block.text}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   View                                     */
/* -------------------------------------------------------------------------- */

interface StudioProps {
  profile: CandidateProfile;
  file: AtsUploadedFile | null;
  onFileChange: (file: AtsUploadedFile | null) => void;
  result: AtsGenerationResult | null;
  onResultChange: (result: AtsGenerationResult | null) => void;
  onNotify?: (message: string) => void;
  onSave: (next: CandidateProfile) => Promise<void>;
}
export function ResumeStudioView(props: StudioProps) {
  const { data: user } = useSession();
  const saved = useQuery({ queryKey: ['account', user?.id, 'resume'], enabled: !!user?.resumeFileName,
    queryFn: async ({ signal }) => (await apiGet<{ resume: SavedResume | null }>('/api/auth/resume', signal)).resume,
    gcTime: 60_000 });
  if (user?.resumeFileName && saved.isPending) return <p role="status">Loading your saved resume…</p>;
  if (saved.isError) return <div role="alert"><p>{saved.error.message}</p><Button onClick={() => saved.refetch()}>Retry loading saved resume</Button></div>;
  return <ResumeStudioEditor key={user?.id} {...props} savedResume={saved.data ?? null} />;
}
function ResumeStudioEditor({ profile, file: incomingFile, onFileChange, result: incomingResult, onResultChange, onNotify, onSave, savedResume }: StudioProps & { savedResume: SavedResume | null }) {
  const { data: user } = useSession();
  const setUser = useSetSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [initialFile] = useState(() => restoreFile(savedResume));
  const rawFileRef = useRef<File | null>(initialFile);
  const [usingSaved, setUsingSaved] = useState(true);
  const [restoredResult] = useState(() => restoreResult(savedResume));
  const file = incomingFile ?? (rawFileRef.current ? toUploadedFile(rawFileRef.current) : null);
  const result = incomingResult ?? (usingSaved ? restoredResult : null);
  const client = useQueryClient();
  const upload = useMutation({ mutationFn: (args: Parameters<typeof uploadResumeRequest>) => uploadResumeRequest(...args) });
  const [tab, setTab] = useState<StudioTab>('preview');
  /* Local working copy; the Save button pushes it up (and to the database). */
  const [draft, setDraft] = useState<CandidateProfile>(profile);
  const [skillInput, setSkillInput] = useState('');

  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ step: string; percent: number }>({ step: '', percent: 0 });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CanvasDocument | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  /* The extracted resume in document form — powers the editor's Templates
     panel. Prefers the live result, falls back to the saved profile. */
  const editorDocument = useMemo<ResumeDocument | null>(() => {
    if (result?.document) return result.document;
    if (!savedResume?.parsedProfile) return null;
    const document = toResumeDocument(savedResume.parsedProfile);
    return document.sections.length ? document : null;
  }, [result?.document, savedResume?.parsedProfile]);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* Shown after an extraction: download the ATS PDF, edit it, or skip. */
  const [needsDecision, setNeedsDecision] = useState(false);
  const saveLock = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (!result || result.document) {
      setPdfPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    setPdfPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  const pdfPreviewSrc = pdfPreviewUrl
    ? `${pdfPreviewUrl}#toolbar=0&navpanes=0&statusbar=0&view=FitH`
    : null;

  const canEmbedPreview =
    !!result &&
    !result.document &&
    (result.blob.type === 'application/pdf' || result.fileName.toLowerCase().endsWith('.pdf'));

  /* ------------------------------ file handling ---------------------------- */

  function acceptFile(candidate: File) {
    if (candidate.size > MAX_RESUME_BYTES) {
      setError(
        `That file is ${formatBytes(candidate.size)}. Keep it under 1 MB (PDF or Word).`,
      );
      return;
    }
    const problem = validateAtsUpload(candidate);
    if (problem) {
      setError(problem);
      return;
    }
    const uploaded = toUploadedFile(candidate);
    if (!uploaded) {
      setError('Only PDF and Word files are supported. Export your resume to one of those first.');
      return;
    }
    setUsingSaved(false);
    setError(null);
    onFileChange(uploaded);
    rawFileRef.current = candidate;
    if (result) onResultChange(null);
    void extract(candidate);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
  }

  /* Upload to our backend: it forwards the file to the ATS extraction
     service, stores the parsed data on the account and hands it back. */
  async function extract(candidate: File | null) {
    if (!candidate || busy) return;
    setBusy(true);
    setError(null);
    setProgress({ step: 'Extracting resume…', percent: 40 });
    try {
      const dataBase64 = await fileAsBase64(candidate);
      const data = await upload.mutateAsync([candidate.name, dataBase64]);
      setUser(data.user);
      setDraft(current => ({ ...current, ...parseStoredProfile(data.user.parsedProfile) }));
      client.setQueryData(['account', user?.id, 'resume'], { fileName: candidate.name, dataBase64, parsedProfile: data.user.parsedProfile, canvas: null, uploadedAt: new Date().toISOString() });
      setProgress({ step: 'Saved', percent: 100 });
      if (data.parsed) {
        const document = toResumeDocument(data.parsed);
        const slug = candidate.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const fileName = `${slug || 'resume'}-ats-resume.pdf`;
        const base = {
          fileName,
          generatedAt: new Date().toISOString(),
          engine: 'service' as const,
          canvas: flowToCanvas(document),
        };
        /* Preferred: the 1-page ATS PDF the service built — already stored on
           the profile. The browser render is only a fallback for when the
           service is not configured. */
        if (data.atsPdfBase64) {
          onResultChange({
            ...base,
            blob: base64Pdf(data.atsPdfBase64),
            pages: 1,
            note: 'Your 1-page ATS resume is saved to your profile — download it, or edit it in the canvas editor.',
          });
        } else {
          const { blob, pages } = resumePdf(document);
          onResultChange({
            ...base,
            blob,
            pages,
            note: 'Data extracted and saved to your account.',
            document,
          });
        }
        setNeedsDecision(true);
        setTab('preview');
        onNotify?.('Resume extracted and saved to your account.');
      } else {
        onNotify?.(
          data.atsError
            ? `Resume saved. ${data.atsError}.`
            : 'Resume saved to your account.',
        );
      }
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : 'Could not save the resume. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    triggerDownload(result.blob, result.fileName);
    onNotify?.(`Downloading ${result.fileName}`);
  }

  async function openEditor() {
    if (editBusy) return;
    setError(null);
    setSaveError(null);

    /* The canvas restored from our database is authoritative after a save. */
    if (result?.canvas) {
      setEditing(result.canvas);
      return;
    }
    if (result?.document) {
      setEditing(flowToCanvas(result.document));
      return;
    }
    setEditBusy(true);
    try {
      let parsed = savedResume?.parsedProfile;
      if (rawFileRef.current) {
        const current = rawFileRef.current;
        const base64 = await fileAsBase64(current);
        const data = await upload.mutateAsync([current.name, base64]);
        setUser(data.user);
        parsed = data.parsed;
        client.setQueryData(['account', user?.id, 'resume'], { fileName: current.name, dataBase64: base64, parsedProfile: data.user.parsedProfile, canvas: null, uploadedAt: new Date().toISOString() });
        if (!parsed) throw new Error(data.atsError ?? 'No structured resume sections are available.');
      }
      const document = toResumeDocument(parsed);
      if (!document.sections.length) throw new Error('No structured resume sections are available. Please retry extraction.');
      setEditing(flowToCanvas(document));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not open the editor.');
    } finally {
      setEditBusy(false);
    }
  }

  /* Template pick: fill from the extracted details (never from layout edits). */
  async function applyTemplate(id: string) {
    if (editBusy || templateBusy) return;
    setError(null);
    setSaveError(null);
    setTemplateBusy(id);
    try {
      /* The saved profile already holds the extraction — fill straight from
         it. Re-uploading to the ATS service on every click was the wait;
         only a newly picked, not-yet-extracted file needs that round-trip. */
      let document = result?.document ?? editorDocument ?? null;
      if (rawFileRef.current && rawFileRef.current !== initialFile) {
        const current = rawFileRef.current;
        const base64 = await fileAsBase64(current);
        const data = await upload.mutateAsync([current.name, base64]);
        setUser(data.user);
        client.setQueryData(['account', user?.id, 'resume'], { fileName: current.name, dataBase64: base64, parsedProfile: data.user.parsedProfile, canvas: null, uploadedAt: new Date().toISOString() });
        if (!data.parsed) throw new Error(data.atsError ?? 'No structured resume sections are available.');
        document = toResumeDocument(data.parsed);
      }
      if (!document || !document.sections.length) throw new Error('No structured resume sections are available. Please retry extraction.');
      const filled = fillWithTemplate(id, document);
      if (!filled) throw new Error('That template is unavailable.');
      setEditing(filled);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not apply that template.');
    } finally {
      setTemplateBusy(null);
    }
  }

  /* The editor's action: render the canvas and hand the file to the device.
     Nothing is written to the profile — the saved ATS resume stays as it is. */
  async function saveEdit(canvas: CanvasDocument) {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const { blob, pages } = resumePdfFromCanvas(canvas);
      const fileName = result?.fileName ?? 'edited-resume.pdf';
      triggerDownload(blob, fileName);
      onResultChange({
        fileName,
        blob,
        pages,
        generatedAt: new Date().toISOString(),
        engine: 'service',
        note: 'Edited in the canvas editor and downloaded to your device — this copy is not saved to your profile.',
        canvas,
      });
      setEditing(null);
      setNeedsDecision(false);
      setTab('preview');
      onNotify?.('Edited resume downloaded to your device.');
    } catch (problem) {
      setSaveError(problem instanceof Error ? problem.message : 'Could not render the edited resume. Your changes are still open in the editor.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  /* ------------------------------ draft editing ---------------------------- */

  function patchDraft(patch: Partial<CandidateProfile>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function patchExperience(index: number, patch: Partial<CandidateProfile['experience'][number]>) {
    patchDraft({
      experience: draft.experience.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    });
  }

  function patchEducation(index: number, patch: Partial<CandidateProfile['education'][number]>) {
    patchDraft({
      education: draft.education.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    });
  }

  function addSkill() {
    const skill = skillInput.trim();
    if (!skill) return;
    if (draft.skills.some((item) => item.toLowerCase() === skill.toLowerCase())) {
      setSkillInput('');
      return;
    }
    patchDraft({ skills: [...draft.skills, skill] });
    setSkillInput('');
  }

  /* ------------------------------- overall review -------------------------- */

  const reviewItems: Array<{ ok: boolean; label: string; hint: string }> = [
    {
      ok: Boolean(draft.headline.trim()),
      label: 'Professional headline',
      hint: 'One line under your name on the resume.',
    },
    {
      ok: draft.skills.length > 0,
      label: `Skills (${draft.skills.length})`,
      hint: 'Recruiters filter by skills first.',
    },
    {
      ok: draft.experience.length > 0,
      label: `Experience entries (${draft.experience.length})`,
      hint: 'Role, company and period for each job.',
    },
    {
      ok: draft.education.length > 0,
      label: `Qualifications (${draft.education.length})`,
      hint: 'Degree, school and period.',
    },
    {
      ok: Boolean(file),
      label: 'Resume file uploaded',
      hint: 'PDF or Word, under 1 MB.',
    },
    {
      ok: Boolean(result),
      label: 'ATS-friendly resume generated',
      hint: 'The parser-safe version you send out.',
    },
  ];
  const doneCount = reviewItems.filter((item) => item.ok).length;

  /* ---------------------------------- render ------------------------------- */

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* ------------------------- Left: resume file ------------------------- */}
      <aside className="animate-fade-in-up space-y-3 self-start rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">Your resume file</h3>
        <p className="text-xs text-muted-foreground">
          {file
            ? 'Already uploaded — PDF or Word, under 1 MB.'
            : 'Upload a PDF or Word file, under 1 MB.'}
        </p>

        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light">
              <FileText className="h-5 w-5 text-primary-dark" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {fileKindLabel(file.kind)} · {formatBytes(file.size)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              className="text-destructive hover:bg-destructive/10"
              onClick={() => {
                setUsingSaved(false);
                rawFileRef.current = null;
                onFileChange(null);
                onResultChange(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
              dragActive ? 'border-primary bg-primary-light' : 'border-border bg-muted/30',
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light">
              <UploadCloud className="h-5 w-5 text-primary-dark" />
            </span>
            <p className="text-sm font-semibold">Drag your resume here</p>
            <p className="text-xs text-muted-foreground">{ATS_ACCEPTED_LABEL} · under 1 MB</p>
            <Button size="sm" className="mt-1" onClick={() => inputRef.current?.click()}>
              <FileUp className="h-3.5 w-3.5" />
              Upload
            </Button>
          </div>
        )}

        {file && !result && (
          <Button size="sm" disabled={busy} onClick={() => void extract(rawFileRef.current)}>
            {busy ? 'Extracting…' : 'Extract saved resume'}
          </Button>
        )}
        {file && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Replace file
          </Button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ATS_ACCEPT_ATTR}
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) acceptFile(picked);
            event.target.value = '';
          }}
        />

        <Button
          className="w-full"
          onClick={() => extract(rawFileRef.current)}
          disabled={!file || busy || !rawFileRef.current}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
          {busy ? 'Extracting…' : result ? 'Re-run extraction' : 'Extract & save'}
        </Button>

        {busy && (
          <div className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{progress.step || 'Working…'}</p>
          </div>
        )}

        {error && (
          <p className="animate-pop-in flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs font-medium text-destructive">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </aside>

      {/* ------------------------------ Main column -------------------------- */}
      <section className="min-w-0 space-y-4">
        {/* Candidate header bar */}
        <div className="animate-fade-in-up rounded-2xl border border-border bg-card px-5 py-4 text-center shadow-sm">
          <h2 className="text-lg font-bold tracking-tight">{draft.name || 'Candidate'}</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {draft.headline || 'Add a headline in the review tab'}
            {draft.email ? ` · ${draft.email}` : ''}
          </p>
        </div>

        {/* Tabs */}
        <div className="animate-fade-in-up flex flex-wrap gap-2">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'bg-card text-muted-foreground hover:bg-primary-light hover:text-primary-dark',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div className="animate-fade-in-up min-h-[440px] rounded-2xl border border-border bg-card p-5 shadow-sm">
          {tab === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">ATS preview</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {result
                      ? 'Saved to your profile · 1-page ATS resume'
                      : 'Extract your resume — the ATS version appears here and is saved to your profile.'}
                  </p>
                </div>
                {/* The design entry point lives on the header row, out of the
                    action stack: pick a template and the editor opens filled. */}
                <Button
                  size="sm"
                  variant={templatesOpen ? 'default' : 'outline'}
                  className="shrink-0"
                  onClick={() => setTemplatesOpen((open) => !open)}
                >
                  <LayoutTemplate className="h-4 w-4" />
                  Templates
                </Button>
              </div>

              {templatesOpen ? (
                <div className="rounded-2xl border border-primary/40 bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Pick a design — your extracted details fill it and it opens in the canvas editor.
                  </p>
                  <TemplateStrip
                    busy={templateBusy}
                    onPick={(id) => {
                      setTemplatesOpen(false);
                      void applyTemplate(id);
                    }}
                  />
                </div>
              ) : null}

              {/* One column, in order: download the saved copy (once there is
                  one), edit in the canvas, or skip. The editor is offered from
                  the start — the preview area itself stays blank until an ATS
                  resume exists. Editing renders a PDF on your device only. */}
              <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-3">
                {result && (
                  <Button className="w-full" onClick={download}>
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={editBusy}
                  onClick={openEditor}
                >
                  {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                  {editBusy ? 'Opening editor…' : 'Edit in canvas'}
                </Button>
                {result && needsDecision && (
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => setNeedsDecision(false)}
                  >
                    Skip — keep the saved ATS resume
                  </Button>
                )}
              </div>

              {result?.document ? (
                <div className="rounded-2xl bg-muted/40 p-4">
                  <ResumePreview document={result.document} />
                </div>
              ) : canEmbedPreview && pdfPreviewSrc ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                  <iframe
                    title={`Preview of ${result?.fileName ?? 'resume'}`}
                    src={pdfPreviewSrc}
                    className="h-[560px] w-full"
                  />
                </div>
              ) : result ? (
                <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  This file cannot be previewed in the page — use Download PDF to open it.
                </p>
              ) : null}
            </div>
          )}

          {tab === 'experience' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Experience</h3>
              {draft.experience.length === 0 && (
                <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                  No experience added yet — use “Add experience” below.
                </p>
              )}
              {draft.experience.map((entry, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <Input
                      value={entry.role}
                      placeholder="Frontend Engineer"
                      onChange={(event) => patchExperience(index, { role: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company</Label>
                    <Input
                      value={entry.company}
                      placeholder="Company name"
                      onChange={(event) => patchExperience(index, { company: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Period</Label>
                    <Input
                      value={entry.period}
                      placeholder="2022 – now"
                      onChange={(event) => patchExperience(index, { period: event.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-end text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      patchDraft({ experience: draft.experience.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patchDraft({
                    experience: [
                      ...draft.experience,
                      { role: '', company: '', period: '', highlights: [] },
                    ],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add experience
              </Button>
            </div>
          )}

          {tab === 'qualifications' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Qualifications</h3>
              {draft.education.length === 0 && (
                <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                  No qualifications added yet — use “Add qualification” below.
                </p>
              )}
              {draft.education.map((entry, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs">Degree</Label>
                    <Input
                      value={entry.degree}
                      placeholder="BSc CSIT"
                      onChange={(event) => patchEducation(index, { degree: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">School</Label>
                    <Input
                      value={entry.school}
                      placeholder="Tribhuvan University"
                      onChange={(event) => patchEducation(index, { school: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Period</Label>
                    <Input
                      value={entry.period}
                      placeholder="2018 – 2022"
                      onChange={(event) => patchEducation(index, { period: event.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-end text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      patchDraft({ education: draft.education.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patchDraft({
                    education: [...draft.education, { degree: '', school: '', period: '' }],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add qualification
              </Button>
            </div>
          )}

          {tab === 'skills' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Skills</h3>
              {draft.skills.length === 0 ? (
                <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                  No skills yet — add the ones recruiters should find you for.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {draft.skills.map((skill, index) => (
                    <button
                      key={`${skill}-${index}`}
                      type="button"
                      title={`Remove ${skill}`}
                      onClick={() =>
                        patchDraft({ skills: draft.skills.filter((item) => item !== skill) })
                      }
                      className="flex items-center gap-1.5 rounded-full bg-primary-light px-3 py-1.5 text-xs font-semibold text-primary-dark transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      {skill}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex max-w-sm items-center gap-2">
                <Input
                  value={skillInput}
                  placeholder="Add a skill and press Enter"
                  onChange={(event) => setSkillInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addSkill();
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={addSkill}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>
          )}

          {tab === 'review' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Overall review</h3>
                <span className="text-xs font-semibold text-muted-foreground">
                  {doneCount} of {reviewItems.length} complete
                </span>
              </div>
              <ul className="space-y-2">
                {reviewItems.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-start gap-3 rounded-xl border border-border p-3"
                  >
                    {item.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.hint}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Structured profile fields are separate from the canvas PDF layout. */}
        {tab !== 'preview' && <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground">These fields update your profile. Use “Edit in canvas” on the ATS preview tab to change the resume PDF.</p>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSave(draft);
                onNotify?.('Profile fields saved. Use Edit to change your resume layout and PDF.');
              } catch (problem) {
                setError(problem instanceof Error ? problem.message : 'Could not save your profile fields.');
              } finally { setSaving(false); }
            }}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save profile fields'}
          </Button>
        </div>}
      </section>

      {editing ? (
        <ResumeEditor
          canvas={editing}
          resumeDocument={editorDocument}
          saving={saving}
          saveError={saveError}
          onSave={saveEdit}
          onCancel={() => { if (!saving) setEditing(null); }}
        />
      ) : null}
    </div>
  );
}
