'use client';

/**
 * The template pickers. `TemplatePreview` renders a real fill of a sample
 * resume as a miniature SVG, so a card can never drift from the template it
 * advertises.
 */
import { useMemo } from 'react';

import { canvasLineHeight, canvasTextWidth, wrapCanvasText, type CanvasObject } from '../demo-resume-pdf';
import { PAGE_H, PAGE_W, SAMPLE_DOCUMENT, type TemplateMeta } from './kit';
import { RESUME_TEMPLATES } from './index';

function previewNode(object: CanvasObject, key: number) {
  if (object.hidden) return null;
  if (object.type === 'rect') {
    return (
      <rect
        key={key}
        x={object.x}
        y={object.y}
        width={object.w}
        height={object.h}
        fill={object.fill ?? 'none'}
        opacity={object.opacity ?? 1}
      />
    );
  }
  if (object.type === 'line') {
    return (
      <rect
        key={key}
        x={object.x}
        y={object.y}
        width={object.w}
        height={Math.max(0.6, object.thickness ?? 0.7)}
        fill={object.color ?? '#BBBBBB'}
        opacity={object.opacity ?? 1}
      />
    );
  }
  if (object.type !== 'text') return null;
  const style = object.style;
  const lineHeight = canvasLineHeight(style);
  const barHeight = Math.max(1.6, (style.size ?? 11) * 0.72);
  const lines = wrapCanvasText(object.text, style, object.w).slice(0, 3);
  const fill = style.color ?? '#111111';
  return (
    <g key={key} opacity={(object.opacity ?? 1) * 0.85}>
      {lines.map((line, lineIndex) => {
        if (!line.trim()) return null;
        const width = Math.max(4, Math.min(object.w, canvasTextWidth(line, style)));
        const y = object.y + lineIndex * lineHeight + Math.max(0, (lineHeight - barHeight) / 2);
        const align = style.align ?? 'left';
        const x =
          align === 'center'
            ? object.x + (object.w - width) / 2
            : align === 'right'
              ? object.x + object.w - width
              : object.x;
        return <rect key={lineIndex} x={x} y={y} width={width} height={barHeight} rx={barHeight / 3} fill={fill} />;
      })}
    </g>
  );
}

export function TemplatePreview({ template, className }: { template: TemplateMeta; className?: string }) {
  const canvas = useMemo(() => template.build(SAMPLE_DOCUMENT), [template]);
  const page = canvas.pages[0];
  return (
    <svg
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      className={className}
      role="img"
      aria-label={`${template.name} layout preview`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill={page?.background ?? '#FFFFFF'} />
      {(page?.objects ?? []).slice(0, 160).map((object, index) => previewNode(object, index))}
    </svg>
  );
}

export function TemplateStrip({ onPick, busy }: { onPick: (id: string) => void; busy?: string | null }) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      {RESUME_TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          disabled={busy != null}
          onClick={() => onPick(template.id)}
          className="group rounded-xl border border-border bg-card p-2 text-left transition hover:border-primary hover:shadow-sm disabled:cursor-wait disabled:opacity-70"
        >
          <span className="block overflow-hidden rounded-lg border border-border/70 bg-white">
            <TemplatePreview template={template} className="block h-36 w-full" />
          </span>
          <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: template.accent }} />
            {template.name}
          </span>
          <span className="block text-[11px] leading-snug text-muted-foreground">{template.tagline}</span>
        </button>
      ))}
    </div>
  );
}
