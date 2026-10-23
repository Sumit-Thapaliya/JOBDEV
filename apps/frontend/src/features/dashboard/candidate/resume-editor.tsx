'use client';

/**
 * Resume canvas editor — the "Edit" button next to Download PDF.
 *
 * Canva-style, built from browser primitives only: the sheet is a div of the
 * real A4 size in points, every line of text or image is an absolutely
 * positioned element, dragging and resizing use pointer events, and text is
 * typed straight into a `contentEditable` box. No canvas engine, no editor
 * library, no PDF library.
 *
 * Saving never edits a PDF: the object list goes back to the studio, which
 * renders a fresh file with the writer whose numbers this editor mirrors
 * (A4 595 x 842 pt, 56 pt margins, base-14 fonts, everything in points).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  Copy,
  ImagePlus,
  Italic,
  List,
  Maximize,
  Plus,
  Redo2,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RESUME_CONTENT,
  RESUME_PAGE,
  canvasLineHeight,
  canvasTextHeight,
  fontStack,
  parseColor,
  pruneCanvas,
  wrapCanvasText,
} from './demo-resume-pdf';
import type {
  CanvasAsset,
  CanvasDocument,
  CanvasFont,
  CanvasObject,
  CanvasTextObject,
  CanvasTextStyle,
  ResumeAlign,
  ResumeDocument,
} from './demo-resume-pdf';
import { RESUME_TEMPLATES, fillWithTemplate } from './templates';

/* -------------------------------------------------------------------------- */
/*                              Numbers we share                              */
/* -------------------------------------------------------------------------- */

const PAGE_W = RESUME_PAGE.width;
const PAGE_H = RESUME_PAGE.height;
const MARGIN = RESUME_PAGE.margin;
const CONTENT_W = RESUME_CONTENT.width;
const CONTENT_H = RESUME_CONTENT.height;

const PAGE_GAP = 26; // pt between sheets on screen
const SNAP = 6; // pt — how close a dragged line gets before it sticks
const MIN_W = 30;
const MIN_SIZE = 5;
const MAX_SIZE = 72;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.6;
const DEFAULT_LINE_HEIGHT = 1.35;

const TEXT_COLORS = ['#000000', '#334155', '#64748b', '#1d4ed8', '#166534', '#b91c1c'];
/** Snap-to-grid step, in points. */
/** The marquee has to move this far before it counts as a drag, not a click. */
const CLICK_SLOP = 3;

const FONT_OPTIONS: Array<{ label: string; value: CanvasFont }> = [
  { label: 'Helvetica', value: 'helvetica' },
  { label: 'Times', value: 'times' },
  { label: 'Courier', value: 'courier' },
];
const SIZE_OPTIONS = [8, 9, 9.5, 10, 10.5, 11, 12, 14, 16, 18, 22, 28, 36, 48];

/** 5-point star outline, for the SVG preview (the PDF draws its own). */
const STAR_POINTS = Array.from({ length: 10 }, (_, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI) / 5;
  const radius = index % 2 === 0 ? 48 : 48 * 0.382;
  return `${(50 + Math.cos(angle) * radius).toFixed(2)},${(50 + Math.sin(angle) * radius).toFixed(2)}`;
}).join(' ');

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type HandleId = (typeof HANDLES)[number];

const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

/* -------------------------------------------------------------------------- */
/*                              Small helpers                                 */
/* -------------------------------------------------------------------------- */

/** A dragged object remembered in absolute space (sheet index folded in). */
interface DragEntry {
  id: string;
  pageIndex: number;
  x: number;
  y0: number;
  w: number;
  h: number;
}

type EditObject = CanvasObject & {
  id: string;
  /** Set on the pieces that were flowed onto a following sheet. */
  flowOf?: string;
};

/** '\u2022 ' — the marker a list line starts with. */
const BULLET = '\u2022 ';
const bulleted = (line: string) => line.startsWith(BULLET) || /^[-*] /.test(line);
interface EditPage {
  id: string;
  /** '#rrggbb' sheet colour. */
  background?: string;
  objects: EditObject[];
}
interface EditCanvas {
  pages: EditPage[];
  assets: Record<string, CanvasAsset>;
}

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

function toEdit(canvas: CanvasDocument): EditCanvas {
  return {
    assets: { ...(canvas.assets ?? {}) },
    pages: (canvas.pages.length ? canvas.pages : [{ objects: [] }]).map((page) => ({
      id: uid('page'),
      ...(page.background ? { background: page.background } : {}),
      objects: page.objects.map((object) => ({ ...object, id: object.id ?? uid('obj') }) as EditObject),
    })),
  };
}

/** Editor state → the plain document the writer consumes. */
function toCanvas(document: EditCanvas): CanvasDocument {
  return {
    assets: document.assets,
    pages: document.pages.map((page) => ({
      ...(page.background ? { background: page.background } : {}),
      objects: page.objects.map((object) => {
        const copy: Record<string, unknown> = { ...object };
        delete copy.id;
        return copy as unknown as CanvasObject;
      }),
    })),
  };
}

function sameDocument(a: CanvasDocument, b: CanvasDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** One object's box, in points. Text height follows its wrapped text. */
function boxOf(object: EditObject): { w: number; h: number } {
  if (object.type === 'text') {
    return { w: object.w, h: canvasTextHeight(object.text || ' ', object.style, object.w) };
  }
  if (object.type === 'image') return { w: object.w, h: object.h };
  if (object.type === 'rect') return { w: object.w, h: object.h };
  return { w: object.w, h: Math.max(1, object.thickness ?? 0.7) };
}

/** The object plus everything that was flowed out of it, in reading order. */
function flowChain(document: EditCanvas, id: string): EditObject[] {
  const order: EditObject[] = [];
  for (const page of document.pages) {
    for (const object of page.objects) order.push(object);
  }
  const chain = order.filter(
    (object) => object.id === id || (object.type === 'text' && isDescendant(order, object, id)),
  );
  return chain.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function isDescendant(order: EditObject[], object: EditObject, id: string): boolean {
  let parent = object.flowOf;
  let hops = 0;
  while (parent && hops < 32) {
    if (parent === id) return true;
    parent = order.find((candidate) => candidate.id === parent)?.flowOf;
    hops += 1;
  }
  return false;
}

/**
 * Typing past the bottom of a sheet must not lose anything, so a text block is
 * cut at a whole line: what fits stays, the rest continues on the sheet below
 * (a sheet is created when there is none). The pieces are stitched back
 * together and re-cut on every edit, so shrinking the block again pulls the
 * text back up.
 *
 * `printSafe` = cut at the print margin (a growing block, where the user is
 * typing) instead of at the bare page edge (a block that was dragged).
 */
function flowText(
  draft: EditCanvas,
  id: string,
  printSafe: boolean,
): { lastId: string; spilled: boolean } {
  const limit = printSafe ? PAGE_H - MARGIN : PAGE_H;
  let lastId = id;
  let spilled = false;

  for (let guard = 0; guard < 32; guard += 1) {
    const found = findObject(draft, lastId);
    if (!found || found.object.type !== 'text') break;
    const object = found.object;
    const room = limit - object.y;
    if (!object.text.trim() || boxOf(object).h <= room) break;

    const lines = wrapCanvasText(object.text, object.style, object.w);
    const lineHeight = canvasLineHeight(object.style);
    const fit = Math.max(1, Math.floor(room / lineHeight));
    if (fit >= lines.length) break;

    object.text = lines.slice(0, fit).join('\n');
    const rest = lines.slice(fit).join('\n');

    const nextIndex = found.pageIndex + 1;
    while (draft.pages.length <= nextIndex) draft.pages.push({ id: uid('page'), objects: [] });
    const nextPage = draft.pages[nextIndex];
    const lowest = nextPage.objects.reduce((max, other) => Math.max(max, other.y + boxOf(other).h), 0);
    const y = nextPage.objects.length
      ? Math.max(0, Math.min(lowest + 8, limit - 3 * lineHeight))
      : 24;
    const continuation = {
      ...clone(object),
      id: uid('obj'),
      text: rest,
      y,
      flowOf: id,
    } as EditObject;
    nextPage.objects.push(continuation);
    spilled = true;
    lastId = continuation.id;
  }

  return { lastId, spilled };
}

/** Pull a block's flowed pieces back into it, so the text can be re-cut. */
function mergeFlow(draft: EditCanvas, id: string): void {
  const chain = flowChain(draft, id);
  if (chain.length < 2) return;
  const [head, ...rest] = chain;
  if (head.type !== 'text') return;
  head.text = [head.text, ...rest.map((piece) => (piece.type === 'text' ? piece.text : ''))]
    .filter((text) => text !== '')
    .join('\n');
  const doomed = new Set(rest.map((piece) => piece.id));
  for (const page of draft.pages) {
    page.objects = page.objects.filter((object) => !doomed.has(object.id));
  }
}

/** Re-cut every text block that no longer fits its sheet. */
function reflowDocument(draft: EditCanvas, printSafe: boolean): boolean {
  let spilled = false;
  for (let pageIndex = 0; pageIndex < draft.pages.length; pageIndex += 1) {
    const ids = draft.pages[pageIndex].objects
      .filter((object) => object.type === 'text' && !object.flowOf)
      .map((object) => object.id);
    for (const id of ids) {
      const result = flowTextAfterMerge(draft, id, printSafe);
      spilled = result.spilled || spilled;
    }
  }
  return spilled;
}

function flowTextAfterMerge(
  draft: EditCanvas,
  id: string,
  printSafe: boolean,
): { lastId: string; spilled: boolean } {
  const found = findObject(draft, id);
  if (!found || found.object.type !== 'text') return { lastId: id, spilled: false };
  const limit = printSafe ? PAGE_H - MARGIN : PAGE_H;
  if (boxOf(found.object).h <= limit - found.object.y && !hasFlow(draft, id)) {
    return { lastId: id, spilled: false };
  }
  mergeFlow(draft, id);
  return flowText(draft, id, printSafe);
}

function hasFlow(draft: EditCanvas, id: string): boolean {
  return draft.pages.some((page) => page.objects.some((object) => object.flowOf === id));
}

function findObject(
  document: EditCanvas,
  id: string | null,
): { pageIndex: number; index: number; object: EditObject } | null {
  if (!id) return null;
  for (let pageIndex = 0; pageIndex < document.pages.length; pageIndex += 1) {
    const index = document.pages[pageIndex].objects.findIndex((object) => object.id === id);
    if (index >= 0) {
      return { pageIndex, index, object: document.pages[pageIndex].objects[index] };
    }
  }
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/** What the user sees in a text box, soft breaks included. */
function readEditableText(element: HTMLElement): string {
  const inner = (element as HTMLElement & { innerText?: string }).innerText;
  const text = typeof inner === 'string' && inner.length > 0 ? inner : element.textContent ?? '';
  return text.replace(/\u00a0/g, ' ');
}

/* -------------------------------------------------------------------------- */
/*                        Text that can be typed in place                     */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately UNCONTROLLED: React must never rewrite the text while the caret
 * is inside, or the DOM re-sets it on every keystroke and typing comes out in
 * the wrong order. The model updates on `input`; the DOM syncs when unfocused.
 */
/** Where the caret sits inside an element's text, 0 when there is no range. */
function caretOffset(element: HTMLElement): number {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return readEditableText(element).length;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return readEditableText(element).length;
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function EditableText({
  value,
  active,
  onChange,
  onDone,
  className,
  style,
  placeholder,
}: {
  value: string;
  active: boolean;
  onChange: (next: string) => void;
  onDone: () => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  /**
   * The DOM owns the text while the caret is inside — that is the whole trick.
   * If React rendered `value` as children, every keystroke would re-set the text
   * node, the caret would jump back to the start and typing would come out
   * backwards (and Enter would look broken). So: no children here, and the text
   * is synced only when this box is NOT focused (mount, undo, a re-opened file).
   * `useLayoutEffect` so the first paint already shows the text.
   */
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || document.activeElement === element) return;
    if (readEditableText(element) !== value) element.textContent = value;
  }, [value, active]);

  useEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    if (document.activeElement === element) return;
    element.focus();
    const selection = window.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [active]);

  return (
    <div
      ref={ref}
      contentEditable={active}
      suppressContentEditableWarning
      role="textbox"
      spellCheck={false}
      data-placeholder={placeholder}
      onInput={(event) => {
        const element = event.currentTarget;
        if ((element.textContent ?? '') === '' && element.innerHTML !== '') element.innerHTML = '';
        onChange(readEditableText(element));
      }}
      onBlur={() => {
        onDone();
        const element = ref.current;
        if (element && readEditableText(element) !== value) element.textContent = value;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.blur();
          return;
        }
        if (event.key === 'Enter') {
          /**
           * Enter = one more line inside the same box. A bullet continues
           * itself; a line without a bullet stays plain; pressing Enter on an
           * empty bullet ends the list, which is what people expect.
           */
          event.preventDefault();
          const element = ref.current;
          if (!element) return;
          const text = readEditableText(element);
          const caret = caretOffset(element);
          const lineStart = text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
          const nextBreak = text.indexOf('\n', caret);
          const lineEnd = nextBreak === -1 ? text.length : nextBreak;
          const line = text.slice(lineStart, lineEnd);
          const marker = /^[-*] /.test(line) ? '\u2022 ' : line.startsWith('\u2022 ') ? '\u2022 ' : '';
          const emptyBullet = marker !== '' && caret <= lineStart + marker.length;

          let next: string;
          let place: number;
          if (emptyBullet) {
            /* End the list: drop the marker, stay on this (now plain) line. */
            next = text.slice(0, lineStart) + text.slice(lineStart + marker.length);
            place = lineStart;
          } else {
            const insert = `\n${marker}`;
            next = text.slice(0, caret) + insert + text.slice(caret);
            place = caret + insert.length;
          }

          element.textContent = next;
          const range = document.createRange();
          const target = element.firstChild;
          if (target) {
            range.setStart(target, Math.min(place, next.length));
            range.collapse(true);
            const selection = window.getSelection?.();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
          onChange(next);
          return;
        }

        /* Typing "- " or "* " at the start of a line turns it into a real bullet. */
        if (event.key === ' ') {
          const element = ref.current;
          if (!element) return;
          const text = readEditableText(element);
          const caret = caretOffset(element);
          const lineStart = text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
          const typed = text.slice(lineStart, caret);
          if (typed === '-' || typed === '*') {
            event.preventDefault();
            const next = `${text.slice(0, lineStart)}\u2022 ${text.slice(caret)}`;
            element.textContent = next;
            const range = document.createRange();
            const target = element.firstChild;
            if (target) {
              range.setStart(target, lineStart + 2);
              range.collapse(true);
              const selection = window.getSelection?.();
              if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
              }
            }
            onChange(next);
            return;
          }
        }
        /* The editor's own shortcuts must not fire while typing. */
        event.stopPropagation();
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        try {
          document.execCommand('insertText', false, text);
          const element = ref.current;
          if (element) onChange(readEditableText(element));
        } catch {
          onChange(`${value}${text}`);
        }
      }}
      className={cn(
        'w-full whitespace-pre-wrap outline-none',
        'empty:before:text-muted-foreground/50 empty:before:content-[attr(data-placeholder)]',
        className,
      )}
      style={style}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Editor                                    */
/* -------------------------------------------------------------------------- */

export function ResumeEditor({
  canvas,
  resumeDocument = null,
  onSave,
  onCancel,
  saving = false,
  saveError,
}: {
  canvas: CanvasDocument;
  /** The extracted resume — powers the in-editor Templates panel. */
  resumeDocument?: ResumeDocument | null;
  saving?: boolean;
  saveError?: string | null;
  onSave: (canvas: CanvasDocument) => void;
  onCancel: () => void;
}) {
  const [doc, setDoc] = useState<EditCanvas>(() => toEdit(canvas));
  const [past, setPast] = useState<EditCanvas[]>([]);
  const [future, setFuture] = useState<EditCanvas[]>([]);
  /* Selection can hold several objects; the last one picked is the "primary"
     (what the toolbar and the resize handles act on). `selectedId` stays
     available so the older single-selection code paths keep working. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const [marquee, setMarquee] = useState<{
    pointerId: number;
    pageIndex: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    additive: boolean;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** When the last nudge happened — a burst of arrow presses is one undo step. */
  /** Latest gesture handlers, for the window listeners below. */
  const moveHandler = useRef<(event: PointerEvent) => void>(() => {});
  const endHandler = useRef<(event: PointerEvent) => void>(() => {});

  const lastNudge = useRef(0);
  const lastTyped = useRef(0);
  const typingId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const original = useRef<CanvasDocument>(toCanvas(toEdit(canvas)));

  const dirty = useMemo(() => !sameDocument(toCanvas(doc), original.current), [doc]);
  const selected = useMemo(() => findObject(doc, selectedId), [doc, selectedId]);
  const canvasNow = useMemo(() => toCanvas(doc), [doc]);
  /** Every selected object, in selection order. */
  const selectedObjects = useMemo(() => {
    const found: Array<{ pageIndex: number; object: EditObject }> = [];
    for (const id of selectedIds) {
      const hit = findObject(doc, id);
      if (hit) found.push({ pageIndex: hit.pageIndex, object: hit.object });
    }
    return found;
  }, [doc, selectedIds]);
  const multi = selectedObjects.length > 1;
  /** The page the panel and the layers list speak about. */
  /**
   * Which sheet the page tools (background, layers, Add) work on. It follows
   * the selection, and a click on a bare sheet moves it — otherwise you could
   * never add something to the second page of a multi-page document.
   */
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    const pageIndex = selected?.pageIndex;
    if (pageIndex !== undefined) setActivePage(pageIndex);
  }, [selected?.pageIndex]);

  useEffect(() => {
    setActivePage((current) => Math.min(current, Math.max(0, doc.pages.length - 1)));
  }, [doc.pages.length]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }, []);

  /* ------------------------------- history -------------------------------- */

  const snapshot = useCallback(() => {
    setPast((stack) => [...stack.slice(-49), clone(doc)]);
    setFuture([]);
  }, [doc]);

  /** Change without touching history — used while typing and dragging. */
  const live = useCallback((mutate: (draft: EditCanvas) => void) => {
    setDoc((current) => {
      const draft = clone(current);
      mutate(draft);
      return draft;
    });
  }, []);

  /** Change that can be undone. */
  const edit = useCallback(
    (mutate: (draft: EditCanvas) => void) => {
      snapshot();
      live(mutate);
    },
    [live, snapshot],
  );

  const undo = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setPast((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setFuture((redoStack) => [...redoStack, clone(doc)]);
      setDoc(previous);
      return stack.slice(0, -1);
    });
  }, [doc]);

  const redo = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setFuture((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setPast((undoStack) => [...undoStack, clone(doc)]);
      setDoc(next);
      return stack.slice(0, -1);
    });
  }, [doc]);

  /* ------------------------------- templates ------------------------------- */

  /** Pour the extracted resume into a template; one undo step. */
  const applyTemplate = useCallback(
    (id: string) => {
      if (!resumeDocument) return;
      const filled = fillWithTemplate(id, resumeDocument);
      if (!filled) return;
      setEditingId(null);
      setSelectedIds([]);
      snapshot();
      setDoc(toEdit(filled));
      setActivePage(0);
      setNotice('Template applied — Ctrl+Z brings your previous layout back.');
    },
    [resumeDocument, snapshot],
  );

  /* ------------------------------- zoom / fit ------------------------------ */

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const apply = () => {
      if (!fit) return;
      const width = container.clientWidth;
      if (!width) return;
      setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (width - 72) / PAGE_W)));
    };
    apply();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
    observer?.observe(container);
    return () => observer?.disconnect();
  }, [fit]);

  /* ---------------------------- pointer geometry -------------------------- */

  /** Pointer position in page points, for the page it is over. */
  const pointInPage = useCallback(
    (clientX: number, clientY: number, pageIndex: number) => {
      const element = pageRefs.current[pageIndex];
      if (!element) return { x: 0, y: 0 };
      const rect = element.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / (zoom || 1),
        y: (clientY - rect.top) / (zoom || 1),
      };
    },
    [zoom],
  );


  /** Snap a moving box to the margins, the centre and every other object. */
  const snapPosition = useCallback(
    (
      document_: EditCanvas,
      pageIndex: number,
      objectId: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const xs = [MARGIN, MARGIN + CONTENT_W / 2, PAGE_W - MARGIN];
      const ys = [MARGIN, MARGIN + CONTENT_H / 2, PAGE_H - MARGIN];
      for (const other of document_.pages[pageIndex]?.objects ?? []) {
        if (other.id === objectId) continue;
        const box = boxOf(other);
        xs.push(other.x, other.x + box.w / 2, other.x + box.w);
        ys.push(other.y, other.y + box.h / 2, other.y + box.h);
      }
      const guideX: number[] = [];
      const guideY: number[] = [];
      let snappedX = x;
      let snappedY = y;

      for (const candidate of xs) {
        if (Math.abs(x - candidate) <= SNAP) {
          snappedX = candidate;
          guideX.push(candidate);
          break;
        }
        if (Math.abs(x + w / 2 - candidate) <= SNAP) {
          snappedX = candidate - w / 2;
          guideX.push(candidate);
          break;
        }
        if (Math.abs(x + w - candidate) <= SNAP) {
          snappedX = candidate - w;
          guideX.push(candidate);
          break;
        }
      }
      for (const candidate of ys) {
        if (Math.abs(y - candidate) <= SNAP) {
          snappedY = candidate;
          guideY.push(candidate);
          break;
        }
        if (Math.abs(y + h / 2 - candidate) <= SNAP) {
          snappedY = candidate - h / 2;
          guideY.push(candidate);
          break;
        }
      }
      return { x: snappedX, y: snappedY, guideX, guideY };
    },
    [],
  );

  /* ------------------------------- dragging -------------------------------- */

  const dragRef = useRef<{
    pointerId: number;
    mode: 'move' | 'resize' | 'rotate';
    objectId: string;
    group: string[];
    /** One row per dragged object, in absolute (top-sheet) coordinates. */
    entries: DragEntry[];
    pageIndex: number;
    startX: number;
    startY: number;
    handle?: HandleId;
    center?: { x: number; y: number };
    startAngle?: number;
    startRotation?: number;
    origin: { x: number; y: number; w: number; h: number; size?: number };
  } | null>(null);

  /**
   * Where a pointer is, in ONE fixed space: the top sheet's content box.
   * Every page sits at the same x, and each one is PAGE_H + PAGE_GAP lower, so
   * a single coordinate space keeps a drag smooth while the object hops between
   * sheets (the old code re-read the *current* page and flung the object away).
   */
  const pointInFrame = useCallback(
    (clientX: number, clientY: number) => {
      const element = pageRefs.current[0];
      if (!element) return { x: 0, y: 0 };
      const rect = element.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / (zoom || 1),
        y: (clientY - rect.top) / (zoom || 1),
      };
    },
    [zoom],
  );

  /** Keep an object on its sheet: a sliver must always stay grabbable. */
  const clampPosition = (object: EditObject, w: number, h: number, x: number, y: number) => {
    const margin = 24; // at least this much of the box stays on the sheet
    /* Absolute page coordinates: any side may hang off, but a sliver stays. */
    const minX = -w + margin;
    const maxX = PAGE_W - margin;
    const keep = object.type === 'text' ? 0 : -h + 24;
    return {
      x: Math.round(Math.max(minX, Math.min(maxX, x)) * 10) / 10,
      y: Math.round(Math.max(keep, Math.min(PAGE_H - 24, y)) * 10) / 10,
    };
  };

  /**
   * Which sheet the pointer is over. Dragging clearly past the bottom of the
   * last sheet asks for one more sheet (the caller creates it) — that is the
   * "just drag it down" way to add a page.
   */
  const pageUnderPointer = useCallback((clientY: number, fallback: number) => {
    const elements = pageRefs.current.filter(Boolean) as HTMLDivElement[];
    if (!elements.length) return fallback;
    for (let index = 0; index < elements.length; index += 1) {
      const rect = elements[index].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return index;
    }
    const first = elements[0].getBoundingClientRect();
    if (clientY < first.top) return 0;
    const last = elements[elements.length - 1].getBoundingClientRect();
    /* 40 pt below the sheet edge = "put it on the next sheet". */
    if (clientY > last.bottom + 40 * (zoom || 1)) return elements.length;
    return elements.length - 1;
  }, [zoom]);

  /* A drag must not depend on the element it started on: with a sheet hop the
     element is re-created and a pointer capture dies with it. Window listeners
     keep the gesture alive no matter how fast the pointer moves. */
  useEffect(() => {
    const move = (event: PointerEvent) => moveHandler.current(event);
    const done = (event: PointerEvent) => endHandler.current(event);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
    };
  }, []);

  const marqueeRef = useRef(marquee);
  useEffect(() => {
    moveHandler.current = (event) => {
      const current = marqueeRef.current;
      if (current && current.pointerId === event.pointerId) {
        /* Keep the selection rectangle following the pointer even when it
           leaves the sheet (it used to freeze there). */
        const point = pointInPage(event.clientX, event.clientY, current.pageIndex);
        setMarquee({ ...current, x1: point.x, y1: point.y });
        return;
      }
      onPointerMove(event);
    };
    endHandler.current = (event) => {
      if (marqueeRef.current && marqueeRef.current.pointerId === event.pointerId) {
        finishMarquee();
        return;
      }
      endDrag(event);
    };
  });

  useEffect(() => {
    marqueeRef.current = marquee;
  }, [marquee]);

  const startMove = useCallback(
    (event: React.PointerEvent<HTMLElement>, pageIndex: number, object: EditObject) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (editingId === object.id) return;
      if (object.locked) {
        setNotice('That object is locked.');
        setSelectedId(object.id);
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      /* Shift extends the selection instead of dragging right away. */
      if (event.shiftKey) {
        toggleSelected(object.id);
        return;
      }

      /* Dragging something inside a multi-selection moves the whole group. */
      const group = selectedIds.includes(object.id) ? selectedIds : [object.id];
      if (!selectedIds.includes(object.id)) setSelectedIds([object.id]);

      const point = pointInFrame(event.clientX, event.clientY);
      const entries: DragEntry[] = [];
      for (const id of group) {
        const found = findObject(doc, id);
        if (!found) continue;
        const box = boxOf(found.object);
        entries.push({
          id,
          pageIndex: found.pageIndex,
          x: found.object.x,
          /* Absolute y: the sheet index is folded in, so the maths never care
             which sheet the object is on. */
          y0: found.object.y + found.pageIndex * (PAGE_H + PAGE_GAP),
          w: box.w,
          h: box.h,
        });
      }
      if (!entries.length) return;

      dragRef.current = {
        pointerId: event.pointerId,
        mode: 'move',
        objectId: object.id,
        group,
        entries,
        pageIndex,
        startX: point.x,
        startY: point.y,
        origin: {
          x: object.x,
          y: object.y,
          w: boxOf(object).w,
          h: boxOf(object).h,
          size: object.type === 'text' ? object.style.size : undefined,
        },
      };
      /* One undo per drag. */
      snapshot();
    },
    [doc, editingId, pointInFrame, selectedIds, setSelectedId, snapshot],
  );

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLElement>, pageIndex: number, object: EditObject, handle: HandleId) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const box = boxOf(object);
      const point = pointInFrame(event.clientX, event.clientY);
      dragRef.current = {
        pointerId: event.pointerId,
        mode: 'resize',
        handle,
        objectId: object.id,
        group: [object.id],
        entries: [],
        pageIndex,
        startX: point.x,
        startY: point.y - pageIndex * (PAGE_H + PAGE_GAP),
        origin: {
          x: object.x,
          y: object.y,
          w: box.w,
          h: box.h,
          size: object.type === 'text' ? object.style.size : undefined,
        },
      };
      snapshot();
    },
    [pointInFrame, snapshot],
  );

  /** The little handle above the box: drag to turn the object. */
  const onPointerMove = useCallback(
    (event: PointerEvent | React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if ('preventDefault' in event) event.preventDefault();

      const point = pointInFrame(event.clientX, event.clientY);
      const { origin } = drag;

      /* ------------------------------- turning ----------------------------- */
      if (drag.mode === 'rotate') {
        const local = { x: point.x, y: point.y - drag.pageIndex * (PAGE_H + PAGE_GAP) };
        const center = drag.center ?? { x: origin.x + origin.w / 2, y: origin.y + origin.h / 2 };
        const angle = (Math.atan2(local.y - center.y, local.x - center.x) * 180) / Math.PI;
        const delta = angle - (drag.startAngle ?? 0);
        live((draft) => {
          const target = draft.pages[drag.pageIndex].objects.find((item) => item.id === drag.objectId);
          if (!target) return;
          const raw = (drag.startRotation ?? 0) + delta;
          target.rotation = event.shiftKey ? Math.round(raw / 15) * 15 : Math.round(raw);
        });
        return;
      }

      /* ------------------------------- moving ------------------------------ */
      if (drag.mode === 'move') {
        const entries = drag.entries ?? [];
        if (!entries.length) return;
        const dx = point.x - drag.startX;
        const dy = point.y - drag.startY;

        /* The sheet under the pointer decides where the dragged block lives. */
        const pointerPage = pageUnderPointer(event.clientY, drag.pageIndex);

        live((draft) => {
          for (const entry of entries) {
            const found = findObject(draft, entry.id);
            if (!found) continue;
            const target = found.object;
            /* Everything moves in absolute space; only the dragged block may
               change sheet, so a group never gets torn apart by accident. */
            const page = entry.id === drag.objectId ? pointerPage : entry.pageIndex;
            const rawX = entry.x + dx;
            const rawY = entry.y0 + dy - page * (PAGE_H + PAGE_GAP);
            const isPrimary = entry.id === drag.objectId;
            /* Dragging past the last sheet: the sheet is made first, then used. */
            while (draft.pages.length <= page) draft.pages.push({ id: uid('page'), objects: [] });

            let x = rawX;
            let y = rawY;
            if (isPrimary) {
              const snapped = snapPosition(
                draft,
                page,
                entry.id,
                rawX,
                rawY,
                entry.w,
                entry.h,
              );
              x = snapped.x;
              y = snapped.y;
              setGuides({ x: snapped.guideX, y: snapped.guideY });
            }
            const clamped = clampPosition(target, entry.w, entry.h, x, y);
            target.x = clamped.x;
            target.y = clamped.y;
            if (found.pageIndex !== page) {
              draft.pages[found.pageIndex].objects = draft.pages[found.pageIndex].objects.filter(
                (item) => item.id !== entry.id,
              );
              while (draft.pages.length <= page) draft.pages.push({ id: uid('page'), objects: [] });
              draft.pages[page].objects.push(target);
            }
          }
        });
        return;
      }

      /* ------------------------------ resizing ----------------------------- */
      const handle = drag.handle ?? 'se';
      const west = handle.includes('w');
      const east = handle.includes('e');
      const north = handle.includes('n');
      const south = handle.includes('s');
      const dx = point.x - drag.startX;
      const dy = point.y - drag.pageIndex * (PAGE_H + PAGE_GAP) - drag.startY;

      live((draft) => {
        const page = draft.pages[drag.pageIndex];
        if (!page) return;
        const index = page.objects.findIndex((object) => object.id === drag.objectId);
        if (index < 0) return;
        const object = page.objects[index];
        const isCorner = (west || east) && (north || south) && handle.length === 2;

        if (object.type === 'text') {
          if (isCorner) {
            /* Corner = scale the type: the box grows, the text grows with it. */
            const nextW = Math.max(MIN_W, origin.w + (east ? dx : -dx));
            const factor = nextW / origin.w;
            const size = Math.min(
              MAX_SIZE,
              Math.max(MIN_SIZE, (origin.size ?? object.style.size) * factor),
            );
            const grown = Math.max(MIN_W, origin.w * (size / (origin.size ?? object.style.size)));
            object.w = grown;
            object.style = { ...object.style, size: Math.round(size * 10) / 10 };
            if (west) object.x = origin.x + origin.w - grown;
            if (north) object.y = origin.y + origin.h - canvasTextHeight(object.text, object.style, grown);
          } else if (east || west) {
            const nextW = Math.max(MIN_W, origin.w + (east ? dx : -dx));
            object.w = nextW;
            if (west) object.x = origin.x + origin.w - nextW;
          } else {
            /* Top / bottom on text = move it (height follows the wording). */
            object.y = Math.max(0, origin.y + (south ? dy : -dy));
          }
          object.w = Math.min(object.w, CONTENT_W + 40);
          object.x = Math.max(-object.w + 24, Math.min(PAGE_W - 24, object.x));
          object.y = Math.max(0, Math.min(PAGE_H - 24, object.y));
          return;
        }

        if (object.type === 'image' || object.type === 'rect' || object.type === 'shape') {
          const ratio = origin.w / Math.max(1, origin.h);
          let nextW = origin.w + (east ? dx : west ? -dx : 0);
          let nextH = origin.h + (south ? dy : north ? -dy : 0);
          const keepShape = object.type === 'image' && !event.shiftKey;
          if (isCorner && keepShape) {
            /* Images keep their shape unless Shift says otherwise. */
            if (Math.abs(dx) > Math.abs(dy)) nextH = nextW / ratio;
            else nextW = nextH * ratio;
          }
          nextW = Math.max(MIN_W, nextW);
          nextH = Math.max(MIN_W / ratio, nextH);
          if (west) object.x = origin.x + origin.w - nextW;
          if (north) object.y = origin.y + origin.h - nextH;
          object.w = nextW;
          object.h = nextH;
          return;
        }

        /* line */
        object.w = Math.max(MIN_W, origin.w + (east ? dx : west ? -dx : 0));
        if (west) object.x = origin.x + origin.w - object.w;
      });
    },
    [clampPosition, live, pageUnderPointer, pointInFrame, snapPosition],
  );

  const endDrag = useCallback(
    (event: PointerEvent | React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setGuides({ x: [], y: [] });

      /* Dragging or resizing a text block so that it runs off the sheet: what
         no longer fits follows onto the next sheet instead of being cut. */
      const moved = drag.group?.length ? drag.group : [drag.objectId];
      if (!moved.length) return;
      const draft = clone(doc);
      let spilled = false;
      for (const id of moved) {
        const found = findObject(draft, id);
        if (!found || found.object.type !== 'text') continue;
        if (boxOf(found.object).h > PAGE_H - found.object.y || hasFlow(draft, id)) {
          spilled = flowTextAfterMerge(draft, id, false).spilled || spilled;
        }
      }
      if (spilled) {
        setDoc(draft);
        setNotice('That block ran off the sheet — the rest continues below.');
      }
    },
    [doc],
  );

  /* ------------------------------- mutations ------------------------------- */

  const addText = useCallback(
    (pageIndex?: number) => {
      const target = pageIndex ?? activePage;
      const object: EditObject = {
        id: uid('obj'),
        type: 'text',
        x: MARGIN,
        y: MARGIN,
        w: 220,
        text: '',
        style: { font: 'helvetica', size: 11, lineHeight: DEFAULT_LINE_HEIGHT },
      };
      edit((draft) => {
        const page = draft.pages[target];
        if (!page) return;
        /* Drop it under whatever is already on the sheet. */
        const lowest = page.objects.reduce((max, other) => {
          const box = boxOf(other);
          return Math.max(max, other.y + box.h);
        }, 0);
        object.y = Math.min(PAGE_H - MARGIN - 40, page.objects.length ? lowest + 8 : MARGIN + 24);
        page.objects.push(object);
      });
      setSelectedId(object.id);
      setEditingId(object.id);
    },
    [activePage, edit, setSelectedId],
  );

  /** Drop a text box exactly where the paper was double-clicked. */
  const addTextAt = useCallback(
    (pageIndex: number, x: number, y: number) => {
      const object: EditObject = {
        id: uid('obj'),
        type: 'text',
        x: Math.max(MARGIN, Math.min(PAGE_W - MARGIN - 220, x - 40)),
        y: Math.max(MARGIN, Math.min(PAGE_H - MARGIN - 60, y - 10)),
        w: 220,
        text: '',
        style: { font: 'helvetica', size: 11, lineHeight: DEFAULT_LINE_HEIGHT },
      };
      edit((draft) => {
        while (draft.pages.length <= pageIndex) draft.pages.push({ id: uid('page'), objects: [] });
        draft.pages[pageIndex].objects.push(object);
      });
      setActivePage(pageIndex);
      setSelectedId(object.id);
      setEditingId(object.id);
    },
    [edit, setSelectedId],
  );

  /** Finish a marquee: select everything it touched. */
  const finishMarquee = useCallback(() => {
    const current = marquee;
    if (!current) return;
    const page = doc.pages[current.pageIndex];
    const left = Math.min(current.x0, current.x1);
    const right = Math.max(current.x0, current.x1);
    const top = Math.min(current.y0, current.y1);
    const bottom = Math.max(current.y0, current.y1);
    setMarquee(null);
    if (!page) return;
    if (right - left <= CLICK_SLOP && bottom - top <= CLICK_SLOP) return;
    const caught = page.objects
      .filter((object) => !object.hidden)
      .filter((object) => {
        const box = boxOf(object);
        return object.x < right && object.x + box.w > left && object.y < bottom && object.y + box.h > top;
      })
      .map((object) => object.id);
    if (caught.length) setSelectedIds((ids) => [...new Set([...ids, ...caught])]);
  }, [doc, marquee, setSelectedIds]);

  const addImage = useCallback(
    async (file: File) => {
      setBusy(true);
      setNotice(null);
      try {
        let asset: CanvasAsset;
        if (file.type === 'image/jpeg') {
          /* Already a JPEG: keep the exact bytes, the writer embeds them as-is. */
          const src = await readAsDataUrl(file);
          const image = await loadImage(src);
          asset = { src, pxW: image.naturalWidth, pxH: image.naturalHeight };
        } else {
          /* Anything else is flattened onto white and re-encoded once. */
          const url = URL.createObjectURL(file);
          try {
            const image = await loadImage(url);
            const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
            const factor = Math.min(1, 1600 / longest);
            const pxW = Math.max(1, Math.round(image.naturalWidth * factor));
            const pxH = Math.max(1, Math.round(image.naturalHeight * factor));
            const scratch = document.createElement('canvas');
            scratch.width = pxW;
            scratch.height = pxH;
            const context = scratch.getContext('2d');
            if (!context) throw new Error('This browser cannot read images.');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, pxW, pxH);
            context.drawImage(image, 0, 0, pxW, pxH);
            asset = { src: scratch.toDataURL('image/jpeg', 0.92), pxW, pxH };
          } finally {
            URL.revokeObjectURL(url);
          }
        }

        const assetId = uid('asset');
        const width = Math.min(220, CONTENT_W / 2);
        const height = Math.max(12, (width * (asset.pxH ?? 300)) / (asset.pxW ?? 300));
        const object: EditObject = {
          id: uid('obj'),
          type: 'image',
          x: MARGIN + (CONTENT_W - width) / 2,
          y: MARGIN + 20,
          w: width,
          h: height,
          assetId,
        };
        setDoc((current) => {
          const draft = clone(current);
          draft.assets[assetId] = asset;
          const page = draft.pages[activePage];
          page?.objects.push(object);
          return draft;
        });
        setPast((stack) => [...stack.slice(-49), clone(doc)]);
        setFuture([]);
        setSelectedId(object.id);
        setNotice('Image added — drag it anywhere, or pull a corner to resize.');
      } catch (problem) {
        setNotice(problem instanceof Error ? problem.message : 'Could not add that image.');
      } finally {
        setBusy(false);
      }
    },
    [activePage, doc, setSelectedId],
  );

  /**
   * Start typing in a block — the one place a caret is ever placed.
   * Double-clicking the text, a resize handle or the selection box all land
   * here, so typing is never a coin flip. While one block is being typed in,
   * double-clicking another simply hands the caret over; the first keeps its
   * text (every keystroke is already committed).
   */
  const startEditing = useCallback(
    (id: string) => {
      setSelectedId(id);
      setEditingId(id);
    },
    [setSelectedId],
  );

  const removeObject = useCallback(
    (id: string) => {
      edit((draft) => {
        for (const page of draft.pages) {
          page.objects = page.objects.filter((object) => object.id !== id);
        }
      });
      if (selectedId === id) setSelectedId(null);
      if (editingId === id) setEditingId(null);
    },
    [edit, editingId, selectedId],
  );

  const duplicateObject = useCallback(
    (id: string) => {
      const found = findObject(doc, id);
      if (!found) return;
      const copy: EditObject = { ...clone(found.object), id: uid('obj'), y: found.object.y + 12 };
      edit((draft) => {
        draft.pages[found.pageIndex].objects.splice(found.index + 1, 0, copy);
      });
      setSelectedId(copy.id);
    },
    [doc, edit],
  );

  /** Copy everything selected; the copies become the new selection. */
  const duplicateSelection = useCallback(() => {
    if (!selectedObjects.length) return;
    const copies: string[] = [];
    edit((draft) => {
      for (const item of selectedObjects) {
        const page = draft.pages[item.pageIndex];
        const index = page.objects.findIndex((object) => object.id === item.object.id);
        if (index < 0) continue;
        const copy = { ...clone(item.object), id: uid('obj'), y: item.object.y + 12 } as EditObject;
        copies.push(copy.id);
        page.objects.splice(index + 1, 0, copy);
      }
    });
    if (copies.length) setSelectedIds(copies);
  }, [edit, selectedObjects]);

  /** Delete everything selected. */
  const removeSelection = useCallback(() => {
    if (!selectedIds.length) return;
    const ids = new Set(selectedIds);
    edit((draft) => {
      for (const page of draft.pages) {
        page.objects = page.objects.filter((object) => !ids.has(object.id));
      }
    });
    setSelectedIds([]);
    setEditingId(null);
  }, [edit, selectedIds]);

  /** Show / hide, lock / unlock — used by the layers list. */
  /** Align the whole selection to the print-safe area. */
  const moveLayer = useCallback(
    (id: string, direction: -1 | 1) => {
      const found = findObject(doc, id);
      if (!found) return;
      edit((draft) => {
        const objects = draft.pages[found.pageIndex].objects;
        const target = found.index + direction;
        if (target < 0 || target >= objects.length) return;
        const [moved] = objects.splice(found.index, 1);
        objects.splice(target, 0, moved);
      });
    },
    [doc, edit],
  );

  const patchSelected = useCallback(
    (patch: Partial<Record<string, unknown>>) => {
      if (!selected) return;
      const { pageIndex, object } = selected;
      edit((draft) => {
        const target = draft.pages[pageIndex].objects.find((candidate) => candidate.id === object.id) as
          | (EditObject & Record<string, unknown>)
          | undefined;
        if (!target) return;
        if (typeof patch.x === 'number') target.x = patch.x;
        if (typeof patch.y === 'number') target.y = patch.y;
        if (typeof patch.rotation === 'number') target.rotation = patch.rotation;
        if (typeof patch.opacity === 'number') target.opacity = patch.opacity;
        if (typeof patch.fill === 'string') target.fill = patch.fill;
        if (typeof patch.stroke === 'string') target.stroke = patch.stroke;
        if (typeof patch.color === 'string') target.color = patch.color;
        if (typeof patch.thickness === 'number') target.thickness = patch.thickness;
        if (typeof patch.radius === 'number') target.radius = patch.radius;

        if (target.type === 'text') {
          if (typeof patch.w === 'number') target.w = Math.max(MIN_W, patch.w);
          const style: Record<string, unknown> = { ...patch };
          for (const key of ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'fill', 'stroke', 'thickness', 'radius']) {
            delete style[key];
          }
          target.style = { ...target.style, ...(style as Partial<CanvasTextStyle>) };
        } else if (target.type === 'image' && typeof patch.w === 'number') {
          const ratio = target.h / Math.max(1, target.w);
          target.w = Math.max(MIN_W, patch.w);
          target.h = target.w * ratio;
        }
      });
    },
    [edit, selected],
  );

  const alignOnPage = useCallback(
    (where: 'left' | 'centre' | 'right') => {
      if (!selected) return;
      const { object, pageIndex } = selected;
      const box = boxOf(object);
      const x =
        where === 'left'
          ? MARGIN
          : where === 'right'
            ? PAGE_W - MARGIN - box.w
            : MARGIN + (CONTENT_W - box.w) / 2;
      edit((draft) => {
        const target = draft.pages[pageIndex].objects.find((candidate) => candidate.id === object.id);
        if (target) target.x = Math.max(MARGIN, x);
      });
    },
    [edit, selected],
  );

  /** Change a whole page (its background, for now). */
  const addPage = useCallback(() => {
    edit((draft) => {
      draft.pages.push({ id: uid('page'), objects: [] });
    });
  }, [edit]);

  const removePage = useCallback(
    (pageIndex: number) => {
      if (doc.pages.length <= 1) return;
      edit((draft) => {
        draft.pages.splice(pageIndex, 1);
      });
      setSelectedId(null);
      setEditingId(null);
    },
    [doc.pages.length, edit],
  );

  /**
   * Every keystroke goes into the model. The first one of a burst snapshots
   * (so Ctrl+Z undoes the whole word, not one letter), and if the block has
   * grown past the bottom of its sheet the flow engine moves the tail down.
   */
  const commitText = useCallback(
    (id: string, text: string) => {
      const now = Date.now();
      if (typingId.current !== id || now - lastTyped.current > 800) snapshot();
      typingId.current = id;
      lastTyped.current = now;

      let continued: string | null = null;
      live((draft) => {
        const found = findObject(draft, id);
        if (!found || found.object.type !== 'text') return;
        const chain = flowChain(draft, id);
        const tail = chain
          .slice(1)
          .map((piece) => (piece.type === 'text' ? piece.text : ''))
          .filter((value) => value !== '');
        /* The typed text replaces this block; whatever was flowed out of it
           follows on, then the whole thing is cut again. */
        found.object.text = [text, ...tail].join('\n');
        if (chain.length > 1) {
          const doomed = new Set(chain.slice(1).map((piece) => piece.id));
          for (const page of draft.pages) {
            page.objects = page.objects.filter((object) => !doomed.has(object.id));
          }
        }
        const result = flowText(draft, id, true);
        if (result.spilled && result.lastId !== id) continued = result.lastId;
      });

      if (continued) {
        /* Keep typing where the caret actually is now — on the sheet below. */
        const next = continued as string;
        setEditingId(next);
        setSelectedId(next);
        setNotice('That block ran out of room — it continues on the next sheet.');
      }
    },
    [live, setSelectedId, snapshot],
  );

  /** Bullet the selected block's lines, or take the bullets back out. */
  const toggleBullets = useCallback(() => {
    if (!selected || selected.object.type !== 'text') return;
    const { object, pageIndex } = selected;
    const lines = object.text.split('\n');
    const filled = lines.filter((line) => line.trim() !== '');
    const allBulleted = filled.length > 0 && filled.every((line) => bulleted(line));
    const next = lines
      .map((line) => {
        if (line.trim() === '') return line;
        if (allBulleted) return line.replace(/^\u2022\s?/, '');
        return bulleted(line) ? line : `${BULLET}${line}`;
      })
      .join('\n');
    edit((draft) => {
      const target = draft.pages[pageIndex].objects.find((candidate) => candidate.id === object.id);
      if (target && target.type === 'text') target.text = next;
    });
  }, [edit, selected]);

  const save = useCallback(() => {
    if (saving) return;
    /* Safety net: nothing is ever lost off the bottom of a sheet. */
    const draft = clone(doc);
    const spilled = reflowDocument(draft, false);
    if (spilled) {
      setPast((stack) => [...stack.slice(-49), clone(doc)]);
      setFuture([]);
      setDoc(draft);
      setNotice('A block ran past the sheet edge — the extra sheet was added for you.');
    }
    const cleaned = pruneCanvas(toCanvas(draft));
    /* Only keep the images something still points at. */
    const used = new Set<string>();
    for (const page of cleaned.pages) {
      for (const object of page.objects) {
        if (object.type === 'image') used.add(object.assetId);
      }
    }
    cleaned.assets = Object.fromEntries(
      Object.entries(cleaned.assets).filter(([key]) => used.has(key)),
    );
    /* `flowOf` is editor bookkeeping, not part of the saved document. */
    for (const page of cleaned.pages) {
      for (const object of page.objects) delete (object as { flowOf?: string }).flowOf;
    }
    onSave(cleaned);
  }, [doc, onSave, saving]);

  /* ------------------------------- shortcuts ------------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (saving) { event.preventDefault(); return; }
      const meta = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.isContentEditable) || target?.tagName === 'INPUT';
      const key = event.key.toLowerCase();

      if (meta && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && key === 's') {
        event.preventDefault();
        save();
        return;
      }
      if (typing) return;

      if (meta && key === 'a') {
        event.preventDefault();
        const page = doc.pages[activePage];
        if (page) setSelectedIds(page.objects.filter((object) => !object.hidden && !object.locked).map((o) => o.id));
        return;
      }
      if (meta && key === 'd' && selectedIds.length) {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) {
        event.preventDefault();
        removeSelection();
        return;
      }
      if (event.key === 'Escape') {
        if (editingId) setEditingId(null);
        else if (selectedIds.length) setSelectedIds([]);
        return;
      }
      if (!selectedIds.length) return;

      const step = event.shiftKey ? 10 : 1;
      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const nudge = nudges[event.key];
      if (!nudge) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastNudge.current > 600) snapshot();
      lastNudge.current = now;
      const ids = new Set(selectedIds);
      setDoc((current) => {
        const draft = clone(current);
        for (const page of draft.pages) {
          for (const object of page.objects) {
            if (!ids.has(object.id)) continue;
            object.x += nudge[0];
            object.y += nudge[1];
          }
        }
        return draft;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activePage,
    saving,
    doc,
    duplicateSelection,
    editingId,
    redo,
    removeSelection,
    save,
    selectedIds,
    setSelectedId,
    snapshot,
    undo,
  ]);

  /* --------------------------------- view ---------------------------------- */

  const selectedBox = selected ? boxOf(selected.object) : null;
  /* A narrowed handle for the contextual bar: TypeScript keeps the flavour. */
  const selectedText =
    selected && selected.object.type === 'text' ? (selected.object as CanvasTextObject) : null;
  const outsideSafety =
    selected && selectedBox
      ? selected.object.x < MARGIN - 1 ||
        selected.object.y < MARGIN - 1 ||
        selected.object.x + selectedBox.w > PAGE_W - MARGIN + 1 ||
        selected.object.y + selectedBox.h > PAGE_H - MARGIN + 1
      : false;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background">
      {saving && <div role="status" aria-live="polite" className="absolute inset-0 z-[100] flex items-center justify-center bg-background/80"><p className="rounded-xl border border-border bg-card p-5 text-sm font-semibold">Saving your latest resume and updating profile fields…</p></div>}
      {/* ------------------------------- top bar ------------------------------ */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold">Editing resume</h2>
          {dirty ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              unsaved changes
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              saved
            </span>
          )}
          <span
            className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
            title="Every sheet is a real A4 page — drag a line past the bottom to move it to the next one"
          >
            {doc.pages.length} page{doc.pages.length === 1 ? '' : 's'}
          </span>
        </div>
        <span className="hidden text-xs text-muted-foreground md:inline">
          Tools are in the panel on the left · double-click text to type · drag to move · corners resize
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* --------------------------- tools (left panel) ---------------------- */}
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card md:flex">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-slim">
            <div>
              <h3 className="text-sm font-semibold">Add</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Text and images. Double-click the sheet to drop text exactly there.
              </p>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => addText()}>
                  <Type className="h-4 w-4" />
                  Text
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  Image
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Adding to sheet {activePage + 1} of {doc.pages.length} · click a sheet to switch
              </p>
            </div>

            {resumeDocument ? (
              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold">Templates</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Fill the sheet from your extracted details again — Ctrl+Z undoes it.
                </p>
                <div className="mt-2 space-y-1.5">
                  {RESUME_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => applyTemplate(template.id)}
                      className="w-full rounded-lg border border-border px-2.5 py-1.5 text-left transition hover:border-primary hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: template.accent }}
                        />
                        {template.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">{template.tagline}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-t border-border pt-3">
              <h3 className="text-sm font-semibold">Zoom</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Fit shows the whole page. Zoom in to type finely.
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  title="Zoom out"
                  className="px-2.5"
                  onClick={() => {
                    setFit(false);
                    setZoom((value) => Math.max(ZOOM_MIN, Math.round((value - 0.1) * 100) / 100));
                  }}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="flex-1 text-center text-xs tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  title="Zoom in"
                  className="px-2.5"
                  onClick={() => {
                    setFit(false);
                    setZoom((value) => Math.min(ZOOM_MAX, Math.round((value + 0.1) * 100) / 100));
                  }}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={fit ? 'default' : 'outline'}
                  title="Fit the page to the window"
                  className="px-2.5"
                  onClick={() => setFit((value) => !value)}
                >
                  <Maximize className="h-4 w-4" />
                </Button>
              </div>
            </div>


            <div className="border-t border-border pt-3">
              <h3 className="text-sm font-semibold">Undo</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Every change can be undone, including typing.
              </p>
              <div className="mt-2 flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={undo}
                  disabled={!past.length}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="h-4 w-4" />
                  Undo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={redo}
                  disabled={!future.length}
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <Redo2 className="h-4 w-4" />
                  Redo
                </Button>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <h3 className="text-sm font-semibold">Selected block</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Type exact numbers, or just drag the block on the sheet.
              </p>
              {multi ? (
                <>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedObjects.length} objects — drag one to move them all
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={duplicateSelection}>
                      <Copy className="h-4 w-4" />
                      Copy all
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={removeSelection}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete all
                    </Button>
                  </div>
                </>
              ) : selected ? (
                <>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedText
                      ? `Text · ${selectedText.style.size} pt`
                      : selected.object.type === 'image'
                        ? 'Image'
                        : selected.object.type === 'line'
                          ? 'Divider'
                          : selected.object.type === 'shape'
                            ? `Shape · ${selected.object.kind}`
                            : 'Box'}
                    {selected.object.locked ? ' · locked' : ''}
                  </p>
                  {outsideSafety ? (
                    <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-700">
                      Outside the print-safe area — most printers and ATS parsers cut this off.
                    </p>
                  ) : null}

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'x', label: 'X', value: Math.round(selected.object.x) },
                        { key: 'y', label: 'Y', value: Math.round(selected.object.y) },
                        { key: 'w', label: 'Width', value: Math.round(selectedBox?.w ?? 0) },
                      ] as const
                    ).map((field) => (
                      <label key={field.key} className="text-[11px] font-medium text-muted-foreground">
                        {field.label}
                        <input
                          type="number"
                          className="mt-0.5 h-8 w-full rounded-md border border-input bg-card px-2 text-xs text-foreground"
                          value={field.value}
                          onChange={(event) => patchSelected({ [field.key]: Number(event.target.value) })}
                        />
                      </label>
                    ))}
                    <div className="flex flex-col justify-end text-[11px] font-medium text-muted-foreground">
                      Height
                      <div className="mt-0.5 flex h-8 items-center rounded-md border border-dashed border-input px-2 text-xs text-muted-foreground">
                        {Math.round(selectedBox?.h ?? 0)} pt{selectedText ? ' · auto' : ''}
                      </div>
                    </div>
                  </div>

                </>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click anything on the page — a line, an image, a divider.
                </p>
              )}
            </div>

            {selected && !multi ? (
              <>

                {selectedText ? (
                  <div className="border-t border-border pt-3">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                      Text style
                      <button
                        type="button"
                        title="Bullet list — Enter keeps the bullets going"
                        aria-label="Bullet list"
                        className={cn(
                          'ml-auto flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium',
                          bulleted(selectedText.text)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input text-muted-foreground hover:bg-accent',
                        )}
                        onClick={toggleBullets}
                      >
                        <List className="h-3.5 w-3.5" />
                        List
                      </button>
                    </h3>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <select
                        aria-label="Font"
                        className="h-8 rounded-md border border-input bg-card px-1 text-xs"
                        value={selectedText.style.font ?? 'helvetica'}
                        onChange={(event) => patchSelected({ font: event.target.value as CanvasFont })}
                      >
                        {FONT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Text size"
                        className="h-8 rounded-md border border-input bg-card px-1 text-xs"
                        value={String(selectedText.style.size)}
                        onChange={(event) => patchSelected({ size: Number(event.target.value) })}
                      >
                        {SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>
                            {size} pt
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {(
                        [
                          { key: 'bold', icon: Bold, title: 'Bold', on: selectedText.style.bold },
                          { key: 'italic', icon: Italic, title: 'Italic', on: selectedText.style.italic },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          title={item.title}
                          aria-label={item.title}
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-md border',
                            item.on
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:bg-accent',
                          )}
                          onClick={() => patchSelected({ [item.key]: !item.on } as Partial<CanvasTextStyle>)}
                        >
                          <item.icon className="h-4 w-4" />
                        </button>
                      ))}
                      <span className="mx-1 h-5 w-px bg-border" />
                      {(
                        [
                          { value: 'left', icon: AlignLeft, title: 'Align left' },
                          { value: 'center', icon: AlignCenter, title: 'Align centre' },
                          { value: 'right', icon: AlignRight, title: 'Align right' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          title={item.title}
                          aria-label={item.title}
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-md border',
                            (selectedText.style.align ?? 'left') === item.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:bg-accent',
                          )}
                          onClick={() => patchSelected({ align: item.value as ResumeAlign })}
                        >
                          <item.icon className="h-4 w-4" />
                        </button>
                      ))}
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      {TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          title={`Colour ${color}`}
                          aria-label={`Colour ${color}`}
                          className={cn(
                            'h-6 w-6 rounded-full border-2',
                            selectedText.style.color === color ? 'border-primary' : 'border-border',
                          )}
                          style={{ background: color }}
                          onClick={() => patchSelected({ color })}
                        />
                      ))}
                      <button
                        type="button"
                        title="Default black"
                        aria-label="Default black"
                        className={cn(
                          'h-6 rounded-md border border-border px-2 text-[10px] font-semibold',
                          selectedText.style.color === undefined
                            ? 'border-primary text-primary'
                            : 'text-muted-foreground',
                        )}
                        onClick={() => patchSelected({ color: undefined as unknown as string })}
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-border pt-3">
                  <h3 className="text-sm font-semibold">
                    {selectedText ? 'Placement' : 'Size & order'}
                  </h3>
                  {selectedText && !multi ? (
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => alignOnPage('left')}>
                        Left
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => alignOnPage('centre')}>
                        Centre
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => alignOnPage('right')}>
                        Right
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.object.type === 'image' ? (
                      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                        <ImagePlus className="h-4 w-4" />
                        Swap image
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => duplicateObject(selected.object.id)}>
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => moveLayer(selected.object.id, 1)}>
                      <ArrowUp className="h-4 w-4" />
                      Forward
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => moveLayer(selected.object.id, -1)}>
                      <ArrowDown className="h-4 w-4" />
                      Backward
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => removeObject(selected.object.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>


                </div>
              </>
            ) : null}

            <div className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Shortcuts</p>
              <p className="mt-1">
                <kbd className="rounded border border-border px-1">double-click</kbd> type ·{' '}
                <kbd className="rounded border border-border px-1">Ctrl</kbd>+
                <kbd className="rounded border border-border px-1">D</kbd> copy ·{' '}
                <kbd className="rounded border border-border px-1">Del</kbd> delete · arrows nudge
                (Shift = 10 pt)
              </p>
              <p className="mt-1">
                Drag a line past the bottom of a sheet and it moves to the next page. Empty sheets are
                not saved.
              </p>
            </div>
          </div>

          <div className="space-y-2 border-t border-border bg-card p-4">
            {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
            <Button className="w-full" disabled={saving || busy} onClick={save} title="Download (Ctrl+S) — renders your edit as a PDF on your device. Nothing is saved to your profile.">
              <Check className="h-4 w-4" />
              {saving ? 'Rendering your PDF…' : 'Download edited PDF'}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (!dirty || window.confirm('Discard your changes?')) onCancel();
              }}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </aside>

        {/* ------------------------------ the sheets --------------------------- */}
        <div ref={scrollRef} className="relative flex-1 overflow-auto bg-muted/50 p-6 scrollbar-slim">
          <div className="mx-auto mb-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-border bg-card/95 px-4 py-1.5 text-[11px] text-muted-foreground shadow-sm">
            <span>
              <b className="font-semibold text-foreground">Click</b> a block to select
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              <b className="font-semibold text-foreground">Double-click</b> text to type
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              <b className="font-semibold text-foreground">Drag</b> to move · corners to resize
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              <b className="font-semibold text-foreground">Double-click</b> empty paper to add text
            </span>
          </div>

          {notice ? (
            <div className="pointer-events-none sticky top-0 z-30 mx-auto mb-3 w-fit rounded-full bg-foreground/90 px-3 py-1 text-[11px] font-medium text-background shadow">
              {notice}
            </div>
          ) : null}

          {doc.pages.map((page, pageIndex) => (
            <div
              key={page.id}
              className="relative mx-auto"
              style={{ width: PAGE_W * zoom, height: PAGE_H * zoom, marginBottom: PAGE_GAP * zoom }}
            >
              <div
                ref={(element) => {
                  pageRefs.current[pageIndex] = element;
                }}
                data-page-layer={pageIndex}
                className="absolute left-0 top-0 text-neutral-900 shadow-[0_2px_18px_rgba(15,23,42,0.18)] ring-1 ring-black/10"
                style={{
                  width: PAGE_W,
                  height: PAGE_H,
                  background: page.background ?? '#ffffff',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  touchAction: 'none',
                }}
                onPointerDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  setActivePage(pageIndex);
                  setEditingId(null);
                  /* A press on the bare sheet starts a marquee: drag it over
                     several blocks to select them, or just click to clear. */
                  setMarquee({
                    pointerId: event.pointerId,
                    pageIndex,
                    x0: pointInPage(event.clientX, event.clientY, pageIndex).x,
                    y0: pointInPage(event.clientX, event.clientY, pageIndex).y,
                    x1: pointInPage(event.clientX, event.clientY, pageIndex).x,
                    y1: pointInPage(event.clientX, event.clientY, pageIndex).y,
                    additive: event.shiftKey,
                  });
                  if (!event.shiftKey) setSelectedIds([]);
                }}
                onDoubleClick={(event) => {
                  /* Double-clicking empty paper drops a text box right there. */
                  if (event.target !== event.currentTarget) return;
                  const point = pointInPage(event.clientX, event.clientY, pageIndex);
                  addTextAt(pageIndex, point.x, point.y);
                }}
              >
                {/* print-safe area — always on: it is what stops text being cut off */}
                <div
                  className="pointer-events-none absolute border border-dashed border-neutral-200"
                  style={{ left: MARGIN, top: MARGIN, width: CONTENT_W, height: CONTENT_H }}
                />

                {/* marquee rectangle */}
                {marquee && marquee.pageIndex === pageIndex ? (
                  <div
                    data-marquee
                    className="pointer-events-none absolute border border-primary bg-primary/10"
                    style={{
                      left: Math.min(marquee.x0, marquee.x1),
                      top: Math.min(marquee.y0, marquee.y1),
                      width: Math.abs(marquee.x1 - marquee.x0),
                      height: Math.abs(marquee.y1 - marquee.y0),
                    }}
                  />
                ) : null}

                {/* snap guides */}
                {guides.x.map((x) => (
                  <div
                    key={`gx-${x}`}
                    className="pointer-events-none absolute top-0 w-px bg-primary/70"
                    style={{ left: x, height: PAGE_H }}
                  />
                ))}
                {guides.y.map((y) => (
                  <div
                    key={`gy-${y}`}
                    className="pointer-events-none absolute left-0 h-px bg-primary/70"
                    style={{ top: y, width: PAGE_W }}
                  />
                ))}

                {page.objects.map((object) => {
                  const box = boxOf(object);
                  const isSelected = object.id === selectedId;
                  const isEditing = object.id === editingId;
                  const style = object.type === 'text' ? object.style : null;
                  const outside =
                    object.x < MARGIN - 1 ||
                    object.y < MARGIN - 1 ||
                    object.x + box.w > PAGE_W - MARGIN + 1 ||
                    object.y + box.h > PAGE_H - MARGIN + 1;

                  return (
                    <div
                      key={object.id}
                      data-object-id={object.id}
                      data-object-type={object.type}
                      className={cn(
                        'group absolute',
                        isEditing ? 'cursor-text' : object.locked ? 'cursor-not-allowed' : 'cursor-move',
                        isEditing
                          ? 'outline outline-1 outline-primary'
                          : isSelected
                            ? outside
                              ? 'outline outline-1 outline-offset-0 outline-amber-500'
                              : 'outline outline-1 outline-offset-0 outline-primary'
                            : 'hover:outline hover:outline-1 hover:outline-primary/40',
                        object.hidden && 'opacity-30',
                      )}
                      style={{
                        left: object.x,
                        top: object.y,
                        width: Math.max(4, box.w),
                        height: Math.max(4, box.h),
                        transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
                        transformOrigin: 'center',
                        opacity: object.hidden ? undefined : object.opacity,
                        touchAction: 'none',
                      }}
                      onPointerDown={(event) => {
                        /* Selection is decided inside `startMove`: plain press
                           selects, Shift extends, press-inside-a-group keeps it. */
                        startMove(event, pageIndex, object);
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        if (object.type === 'text') startEditing(object.id);
                      }}
                    >
                      {/* A thin block is hard to catch with a mouse: this pad
                          adds a few invisible points of grabbable area. */}
                      <div
                        aria-hidden
                        className="absolute -inset-[5px]"
                        style={{ zIndex: 0 }}
                      />

                      {object.type === 'text' ? (
                        <EditableText
                          key={`${object.id}-${isEditing ? 'edit' : 'view'}`}
                          active={isEditing}
                          value={object.text}
                          placeholder={isSelected ? 'Type here…' : ''}
                          onChange={(text) => commitText(object.id, text)}
                          /* An old box losing focus must not end a newer edit. */
                          onDone={() =>
                            setEditingId((current) => (current === object.id ? null : current))
                          }
                          style={{
                            fontFamily: fontStack(style?.font),
                            fontSize: style?.size ?? 11,
                            lineHeight: style?.lineHeight ?? DEFAULT_LINE_HEIGHT,
                            letterSpacing: style?.letterSpacing ? `${style.letterSpacing}px` : undefined,
                            fontWeight: style?.bold ? 700 : 400,
                            fontStyle: style?.italic ? 'italic' : 'normal',
                            color: style?.color ?? '#000000',
                            textAlign: style?.align ?? 'left',
                          }}
                        />
                      ) : null}

                      {object.type === 'image' ? (
                        <img
                          src={doc.assets[object.assetId]?.src}
                          alt=""
                          draggable={false}
                          className="pointer-events-none h-full w-full select-none object-fill"
                        />
                      ) : null}

                      {object.type === 'line' ? (
                        <div
                          className="pointer-events-none w-full"
                          style={{
                            height: object.thickness ?? 0.7,
                            background: object.color ?? '#bfbfbf',
                            marginTop: Math.max(0, box.h / 2),
                          }}
                        />
                      ) : null}

                      {object.type === 'rect' ? (
                        <div
                          className="pointer-events-none h-full w-full"
                          style={{
                            background: object.fill ?? 'transparent',
                            border: object.stroke ? `${object.thickness ?? 1}px solid ${object.stroke}` : undefined,
                          }}
                        />
                      ) : null}

                      {object.type === 'shape' ? (
                        <svg
                          className="pointer-events-none h-full w-full overflow-visible"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                        >
                          {object.kind === 'rect' ? (
                            <rect
                              x={1}
                              y={1}
                              width={98}
                              height={98}
                              rx={object.radius ? Math.max(0, (object.radius / Math.max(1, box.w)) * 100) : 0}
                              fill={object.fill ?? 'none'}
                              stroke={object.stroke}
                              strokeWidth={object.stroke ? (object.thickness ?? 1) * (100 / Math.max(1, box.w)) : undefined}
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : null}
                          {object.kind === 'ellipse' ? (
                            <ellipse
                              cx={50}
                              cy={50}
                              rx={48}
                              ry={48}
                              fill={object.fill ?? 'none'}
                              stroke={object.stroke}
                              strokeWidth={object.thickness ?? 1}
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : null}
                          {object.kind === 'triangle' ? (
                            <polygon
                              points="50,2 98,98 2,98"
                              fill={object.fill ?? 'none'}
                              stroke={object.stroke}
                              strokeWidth={object.thickness ?? 1}
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : null}
                          {object.kind === 'star' ? (
                            <polygon
                              points={STAR_POINTS}
                              fill={object.fill ?? 'none'}
                              stroke={object.stroke}
                              strokeWidth={object.thickness ?? 1}
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : null}
                        </svg>
                      ) : null}
                    </div>
                  );
                })}

                {/* the other selected objects: a quiet outline each */}
                {multi
                  ? selectedObjects
                      .filter((item) => item.pageIndex === pageIndex && item.object.id !== selectedId)
                      .map((item) => {
                        const box = boxOf(item.object);
                        return (
                          <div
                            key={`multi-${item.object.id}`}
                            className="pointer-events-none absolute border border-dashed border-primary/60"
                            style={{
                              left: item.object.x,
                              top: item.object.y,
                              width: box.w,
                              height: box.h,
                              transform: item.object.rotation
                                ? `rotate(${item.object.rotation}deg)`
                                : undefined,
                              transformOrigin: 'center',
                            }}
                          />
                        );
                      })
                  : null}

                {/* selection box + resize handles (single selection) */}
                {selected && selected.pageIndex === pageIndex && !editingId && selectedBox && !multi ? (
                  <>
                    <div
                      className="absolute"
                      style={{
                        left: selected.object.x,
                        top: selected.object.y,
                        width: selectedBox.w,
                        height: selectedBox.h,
                        transform: selected.object.rotation
                          ? `rotate(${selected.object.rotation}deg)`
                          : undefined,
                        transformOrigin: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <div
                        className="absolute -inset-px border border-primary/70"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          if (selected.object.type === 'text') startEditing(selected.object.id);
                        }}
                      />

                      {HANDLES.map((handle) => {
                        const size = 12 / zoom; // stays ~12 px on screen at any zoom
                        const left = handle.includes('w') ? 0 : handle.includes('e') ? selectedBox.w : selectedBox.w / 2;
                        const top = handle.includes('n') ? 0 : handle.includes('s') ? selectedBox.h : selectedBox.h / 2;
                        return (
                          <div
                            key={handle}
                            data-handle={handle}
                            className="pointer-events-auto absolute rounded-[2px] border border-primary bg-white shadow-sm"
                            style={{
                              left: left - size / 2,
                              top: top - size / 2,
                              width: size,
                              height: size,
                              cursor: HANDLE_CURSORS[handle],
                            }}
                            onPointerDown={(event) => startResize(event, pageIndex, selected.object, handle)}
                            /* A double-click landing on a handle still means
                               "type in this block", never "resize it". */
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              if (selected.object.type === 'text') startEditing(selected.object.id);
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Contextual bar. It floats just ABOVE the block, and its
                        empty wrapper ignores the mouse — so the click that follows
                        a single click still lands on the text and starts typing.
                        Near the top of the sheet it flips below the block. */}
                    {(() => {
                      const fitsAbove = selected.object.y * zoom > 56;
                      return (
                        <div
                          data-floating-bar
                          className="pointer-events-none absolute z-20"
                          style={{
                            left: selected.object.x + selectedBox.w / 2,
                            top: fitsAbove
                              ? selected.object.y - 8
                              : selected.object.y + selectedBox.h + 8,
                          }}
                        >
                          <div
                            className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-card/95 px-1.5 py-1 shadow-lg backdrop-blur"
                            style={{
                              transform: `translate(-50%, ${fitsAbove ? '-100%' : '0'}) scale(${1 / zoom})`,
                              transformOrigin: fitsAbove ? 'bottom center' : 'top center',
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            {selectedText ? (
                              <>
                                <select
                                  aria-label="Font"
                                  className="h-8 rounded-md border border-input bg-card px-1 text-xs"
                                  value={selectedText.style.font ?? 'helvetica'}
                                  onChange={(event) =>
                                    patchSelected({ font: event.target.value as CanvasFont })
                                  }
                                >
                                  {FONT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  aria-label="Text size"
                                  className="h-8 rounded-md border border-input bg-card px-1 text-xs"
                                  value={String(selectedText.style.size)}
                                  onChange={(event) => patchSelected({ size: Number(event.target.value) })}
                                >
                                  {SIZE_OPTIONS.map((size) => (
                                    <option key={size} value={size}>
                                      {size}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  title="Bullet list"
                                  aria-label="Bullet list"
                                  className={cn(
                                    'flex h-8 w-8 items-center justify-center rounded-md border',
                                    bulleted(selectedText.text)
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-transparent text-muted-foreground hover:bg-accent',
                                  )}
                                  onClick={toggleBullets}
                                >
                                  <List className="h-4 w-4" />
                                </button>
                                {(
                                  [
                                    { key: 'bold', icon: Bold, title: 'Bold', on: selectedText.style.bold },
                                    { key: 'italic', icon: Italic, title: 'Italic', on: selectedText.style.italic },
                                  ] as const
                                ).map((item) => (
                                  <button
                                    key={item.key}
                                    type="button"
                                    title={item.title}
                                    aria-label={item.title}
                                    className={cn(
                                      'flex h-8 w-8 items-center justify-center rounded-md border',
                                      item.on
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-transparent text-muted-foreground hover:bg-accent',
                                    )}
                                    onClick={() => patchSelected({ [item.key]: !item.on } as Partial<CanvasTextStyle>)}
                                  >
                                    <item.icon className="h-4 w-4" />
                                  </button>
                                ))}
                                {(
                                  [
                                    { value: 'left', icon: AlignLeft, title: 'Align left' },
                                    { value: 'center', icon: AlignCenter, title: 'Align centre' },
                                    { value: 'right', icon: AlignRight, title: 'Align right' },
                                  ] as const
                                ).map((item) => (
                                  <button
                                    key={item.value}
                                    type="button"
                                    title={item.title}
                                    aria-label={item.title}
                                    className={cn(
                                      'flex h-8 w-8 items-center justify-center rounded-md border',
                                      (selectedText.style.align ?? 'left') === item.value
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-transparent text-muted-foreground hover:bg-accent',
                                    )}
                                    onClick={() => patchSelected({ align: item.value as ResumeAlign })}
                                  >
                                    <item.icon className="h-4 w-4" />
                                  </button>
                                ))}
                                <span className="mx-0.5 h-5 w-px bg-border" />
                                {TEXT_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    title={`Colour ${color}`}
                                    aria-label={`Colour ${color}`}
                                    className={cn(
                                      'h-6 w-6 rounded-full border-2',
                                      parseColor(selectedText.style.color) &&
                                      selectedText.style.color === color
                                        ? 'border-primary'
                                        : 'border-border',
                                    )}
                                    style={{ background: color }}
                                    onClick={() => patchSelected({ color })}
                                  />
                                ))}
                              </>
                            ) : null}

                            {selected && selected.object.type === 'image' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => fileRef.current?.click()}
                                title="Swap this image"
                              >
                                Swap image
                              </Button>
                            ) : null}

                            <span className="mx-0.5 h-5 w-px bg-border" />
                            <button
                              type="button"
                              title="Delete"
                              aria-label="Delete"
                              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeObject(selected.object.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                  </>
                ) : null}

                {/* multi-selection: how many are picked */}
                {multi && selected && selected.pageIndex === pageIndex && !editingId && selectedBox ? (
                  <div
                    data-multi-badge
                    className="pointer-events-none absolute rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow"
                    style={{
                      left: selected.object.x + selectedBox.w / 2,
                      top: selected.object.y - 24 / zoom,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {selectedObjects.length} selected
                  </div>
                ) : null}
              </div>

              {/* sheet footer */}
              <div
                className="absolute left-0 flex w-full items-center justify-between text-[11px] text-muted-foreground"
                style={{ top: PAGE_H * zoom + 4 }}
              >
                <span>
                  Page {pageIndex + 1} of {doc.pages.length}
                  {page.objects.length === 0 && pageIndex === doc.pages.length - 1 ? (
                    <em className="ml-2 not-italic text-amber-600">
                      empty sheet — not saved (drop something on it, or remove the page)
                    </em>
                  ) : null}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded px-1 hover:text-foreground"
                    onClick={() => addText(pageIndex)}
                  >
                    + text here
                  </button>
                  {doc.pages.length > 1 ? (
                    <button
                      type="button"
                      className="rounded px-1 hover:text-destructive"
                      onClick={() => removePage(pageIndex)}
                    >
                      remove page
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-center pb-10">
            <Button variant="outline" size="sm" onClick={addPage}>
              <Plus className="h-4 w-4" />
              Add page
            </Button>
          </div>
        </div>

      </div>

      {/* ---------------------------- phone toolbar -------------------------- */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div
          className="flex items-center gap-2 px-2 py-2"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
        >
          <Button size="sm" className="h-10 flex-1" variant="outline" onClick={() => addText()}>
            <Type className="h-4 w-4" />
            Text
          </Button>
          <Button
            size="sm"
            className="h-10 flex-1"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            Image
          </Button>
          <Button size="sm" className="h-10 px-3" variant="outline" onClick={undo} disabled={!past.length} aria-label="Undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" className="h-10 px-3" variant="outline" onClick={redo} disabled={!future.length} aria-label="Redo">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" className="h-10 flex-1" onClick={save}>
            <Check className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void addImage(file);
        }}
      />
      <span className="hidden" data-canvas-state={canvasNow.pages.length} />
    </div>
  );
}
