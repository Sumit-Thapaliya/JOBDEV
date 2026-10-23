'use client';

import type { CSSProperties } from 'react';
import { Globe, Lock, Mail, Phone } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Applicant } from './mock-data';

/**
 * The resume, as the recruiter gets to see it: a plain sheet of paper rendered
 * from the JSON the API sent. Every contact value in that JSON is already a
 * keyed digest (or a `[hidden …]` marker when it sat inside a sentence), so this
 * component only has to lay the page out and blur the tokens.
 *
 * Nothing here is a PDF: a PDF's text layer cannot be blurred, and the stored
 * original is the candidate's file — so the recruiter reads this reflowed copy.
 */

/* --- the watermark -------------------------------------------------------- */
/**
 * Diagonal JOBDEV layer + one traceability line. It sits INSIDE the sheet, so
 * it cannot be scrolled away, and it carries who viewed the resume and when —
 * a screenshot or an edited copy still points back at the viewer.
 *
 * It is deterrence, not security: the DOM can be edited. The data protection is
 * the masking that already happened on the server (the payload only ever held
 * digests), so removing the watermark never exposes a contact value.
 */
function PaperWatermark({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden"
    >
      {/* ONE mark across the page, the way a paper stamp reads at a glance.
          `cqw` = % of the sheet width, so it stays proportional on mobile. */}
      <div className="-rotate-[30deg] text-center leading-none opacity-[0.08]">
        <p
          className="text-[80px] font-black uppercase tracking-[0.12em] text-neutral-900"
          style={{ fontSize: '21cqw' }}
        >
          JOBDEV
        </p>
        <p
          className="mt-4 text-[10px] font-semibold uppercase tracking-[0.34em] text-neutral-900"
          style={{ fontSize: '2.4cqw' }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

/* --- a value the server withheld ------------------------------------------ */
export function ContactRow({
  icon: Icon,
  value,
  label,
  masked,
  compact,
}: {
  icon: typeof Mail;
  value: string;
  label: string;
  masked?: boolean;
  compact?: boolean;
}) {
  if (!value) return null;
  return (
    <span className={cn('flex min-w-0 items-center', compact ? 'gap-1.5' : 'gap-2')}>
      <Icon className={cn('shrink-0 text-primary', compact ? 'h-3 w-3' : 'h-4 w-4')} />
      {masked ? (
        <>
          <span
            aria-hidden
            title={`${label} hidden — the recruiter view never receives the real value`}
            className="select-none truncate font-mono text-[10px] blur-[3px]"
          >
            {value}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Lock className="h-2.5 w-2.5" />
            {label}
          </span>
        </>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </span>
  );
}

/* --- the sheet ------------------------------------------------------------ */
export function ResumePaper({
  resume,
  contact,
  watermarkLabel,
}: {
  resume: NonNullable<Applicant['resume']>;
  contact?: Applicant['contact'];
  /** Who is viewing — printed in the watermark for traceability. */
  watermarkLabel?: string;
}) {
  const stamp = watermarkLabel?.trim() || 'Recruiter view';

  const contactLine = [
    contact?.email.token ? { icon: Mail, value: contact.email.token, label: 'Email' } : null,
    contact?.phone.token ? { icon: Phone, value: contact.phone.token, label: 'Phone' } : null,
    contact?.linkedin.token ? { icon: Globe, value: contact.linkedin.token, label: 'LinkedIn' } : null,
    ...(contact?.other ?? []).map((link) => ({ icon: Globe, value: link.token ?? '', label: link.label })),
  ].filter(Boolean) as Array<{ icon: typeof Mail; value: string; label: string }>;

  return (
    <div className="mt-3">
      {/* A4 WIDTH, growing height: the sheet starts page-sized and keeps growing
          with the content — a fixed aspect-ratio box used to clip everything
          past the first page (recruiters saw a resume that stopped mid-way). */}
      <div
        data-resume-paper
        className="relative mx-auto w-full max-w-[420px] rounded-sm border border-border bg-white shadow-sm"
        /* the sheet is the container: the watermark sizes itself with `cqw`,
           so one page = one big mark whatever the screen width is. */
        style={{ minHeight: '594px', containerType: 'inline-size' } as CSSProperties}
      >
        <PaperWatermark label={stamp} />
        <div className="relative z-10 flex min-h-[594px] flex-col px-[9%] py-[7%]">
        <div className="font-serif text-[10.5px] leading-[1.5] text-neutral-800">
          {/* header — the one block whose values are withheld */}
          <header className="border-b border-neutral-300 pb-2 text-center">
            <h4 className="text-[15px] font-bold uppercase tracking-wide text-neutral-900">
              {resume.name || 'Candidate'}
            </h4>
            {resume.headline ? (
              <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{resume.headline}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              {contactLine.length ? (
                contactLine.map((item) => (
                  <ContactRow
                    key={item.label}
                    icon={item.icon}
                    value={item.value}
                    label={item.label}
                    masked
                    compact
                  />
                ))
              ) : (
                <span className="text-[10px] italic text-neutral-400">No contact details on this resume</span>
              )}
            </div>
          </header>

          {resume.summary ? (
            <section className="mt-2.5">
              <PaperHeading>Summary</PaperHeading>
              <p className="text-justify">{resume.summary}</p>
            </section>
          ) : null}

          {resume.experience.length ? (
            <section className="mt-2.5">
              <PaperHeading>Experience</PaperHeading>
              <ul className="space-y-2">
                {resume.experience.map((entry, index) => (
                  <li key={`${entry.company}-${index}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold text-neutral-900">
                        {entry.role}
                        {entry.company ? <span className="font-normal"> · {entry.company}</span> : null}
                      </p>
                      {entry.period ? <span className="shrink-0 text-[9px] text-neutral-500">{entry.period}</span> : null}
                    </div>
                    {entry.details.length ? (
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                        {entry.details.map((detail, index) => (
                          <li key={`${detail}-${index}`}>{detail}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {resume.skills.length ? (
            <section className="mt-2.5">
              <PaperHeading>Skills</PaperHeading>
              <p>{resume.skills.join(' · ')}</p>
            </section>
          ) : null}

          {resume.education.length ? (
            <section className="mt-2.5">
              <PaperHeading>Education</PaperHeading>
              <ul className="space-y-0.5">
                {resume.education.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {resume.sections.map((section, index) => (
            <section key={`${section.heading}-${index}`} className="mt-2.5">
              <PaperHeading>{section.heading}</PaperHeading>
              <ul className="list-disc space-y-0.5 pl-4">
                {section.lines.map((line, lineIndex) => (
                  <li key={`${line}-${lineIndex}`}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
          </div>

          {/* Burned-in trace line: survives a screenshot. */}
          <p className="relative z-10 border-t border-neutral-200 px-2 py-1 text-center text-[7.5px] uppercase tracking-[0.14em] text-neutral-400">
            Shared through JobDev · {stamp} · {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Contact details stay hidden on the resume — the server sends a one-way digest, not the address.
      </p>
    </div>
  );
}

function PaperHeading({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="mb-1 border-b border-neutral-300 pb-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-neutral-700">
      {children}
    </h5>
  );
}
