'use client';

// Editable code canvas rendered for every fenced code block of an assistant
// message. Contract (props + export name) is fixed: see docs/ARCHITECTURE.md.
//
// - streaming: lightweight highlighted <StaticCodeView>, no CodeMirror
// - done: CodeMirror is lazy-loaded (dynamic import, client only) once the card
//   is near the viewport; the static view stays as an equal-height placeholder
// - the EditorView DOM node is moved (not re-created) between the inline card
//   and the maximized overlay, so history/selection/ghost text survive
// - save: button, Mod+S, pointer/focus leaving the canvas, unmount, pagehide
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Minimize2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { extensionFor } from '@/lib/chat/segments';
import type { CanvasEditor } from '@/lib/editor/create-editor';
import { indentUnitFor, languageLabel, loadLanguage } from '@/lib/editor/languages';
import { CANVAS_AUTO_MAX_HEIGHT, clampHeight } from '@/lib/editor/metrics';
import { createStatusStore } from '@/lib/editor/status-store';
import { useChatStore } from '@/lib/store/chat-store';
import { cn } from '@/lib/utils';
import { CanvasFooter, CanvasHeader, ResizeHandle, SYNTAX_VARS } from './canvas-parts';
import { StaticCodeView } from './static-code-view';

export interface CodeCanvasProps {
  conversationId: string;
  messageId: string;
  blockIndex: number;
  language: string;
  code: string;
  /** true while the block is still streaming (read-only, no editor yet). */
  streaming: boolean;
}

type SaveReason = 'button' | 'shortcut' | 'blur' | 'unmount';

/** Parsing a saved fence drops one trailing newline; treat those as equal. */
const sameCode = (a: string, b: string) => a.replace(/\n$/, '') === b.replace(/\n$/, '');

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

export function CodeCanvas({ conversationId, messageId, blockIndex, language, code, streaming }: CodeCanvasProps) {
  const fimEnabled = useChatStore((s) => s.settings.fimEnabled);
  const setSettings = useChatStore((s) => s.setSettings);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const cardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CanvasEditor | null>(null);
  const savedRef = useRef(code);
  const dirtyRef = useRef(false);
  const movingRef = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ conversationId, messageId, blockIndex, dark, fimEnabled });
  useEffect(() => {
    latest.current = { conversationId, messageId, blockIndex, dark, fimEnabled };
  });

  const [status] = useState(() => createStatusStore({ fim: fimEnabled ? { kind: 'idle' } : { kind: 'off' } }));
  const [editorReady, setEditorReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copied, setCopied] = useState(false);
  const [maximizedState, setMaximized] = useState(false);
  const [userHeight, setUserHeight] = useState<number | null>(null);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [inlineSlot, setInlineSlot] = useState<HTMLDivElement | null>(null);
  const [overlaySlot, setOverlaySlot] = useState<HTMLDivElement | null>(null);

  const label = languageLabel(language);
  const ext = extensionFor(language.toLowerCase());
  const filename = `snippet.${ext}`;
  const unit = indentUnitFor(language);
  const indentLabel = unit === '\t' ? 'Tabs' : `Spaces: ${unit.length}`;
  const maximized = maximizedState && !streaming;
  const lineCount = useMemo(() => code.split('\n').length, [code]);

  // ------------------------------------------------------------------ save

  const save = useCallback((reason: SaveReason): boolean => {
    const ed = editorRef.current;
    if (!ed) return false;
    const text = ed.getText();
    const explicit = reason === 'button' || reason === 'shortcut';
    if (text === savedRef.current) {
      if (explicit) toast('No changes to save', { duration: 1200 });
      return false;
    }
    const { conversationId: c, messageId: m, blockIndex: b } = latest.current;
    useChatStore.getState().updateCodeBlock(c, m, b, text);
    savedRef.current = text;
    dirtyRef.current = false;
    if (reason !== 'unmount') {
      setDirty(false);
      setSavedFlash(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedFlash(false), 1800);
      if (explicit) toast.success('Saved to chat', { duration: 1400 });
    }
    return true;
  }, []);

  // ------------------------------------------------------------------ lazy mount

  useEffect(() => {
    if (nearViewport) return;
    const el = cardRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setNearViewport(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNearViewport(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nearViewport]);

  const shouldMount = !streaming && nearViewport;

  useEffect(() => {
    if (!shouldMount) return;
    let cancelled = false;
    let ed: CanvasEditor | null = null;
    Promise.all([import('@/lib/editor/create-editor'), loadLanguage(language)])
      .then(([mod, languageExtension]) => {
        if (cancelled) return;
        ed = mod.createCanvasEditor({
          doc: savedRef.current,
          language,
          languageExtension,
          dark: latest.current.dark,
          fimEnabled: latest.current.fimEnabled,
          onDocChange: () => {
            const cur = editorRef.current;
            if (!cur) return;
            const d = cur.getText() !== savedRef.current;
            if (d !== dirtyRef.current) {
              dirtyRef.current = d;
              setDirty(d);
            }
          },
          onSave: () => save('shortcut'),
          onCursor: (line, col) => status.set({ line, col }),
          onFimStatus: (fim) => {
            if (latest.current.fimEnabled) status.set({ fim });
          },
          onGhostChange: (ghost) => status.set({ ghost }),
        });
        editorRef.current = ed;
        setEditorReady(true);
      })
      .catch((err) => console.error('[code-canvas] failed to load editor', err));
    return () => {
      cancelled = true;
      if (ed) {
        if (dirtyRef.current) save('unmount');
        ed.destroy();
        editorRef.current = null;
        dirtyRef.current = false;
        setEditorReady(false);
        setDirty(false);
      }
    };
  }, [shouldMount, language, save, status]);

  // Place the editor DOM in the inline card or the maximized overlay.
  useLayoutEffect(() => {
    const ed = editorRef.current;
    if (!editorReady || !ed) return;
    const target = maximized ? overlaySlot : inlineSlot;
    if (!target || ed.view.dom.parentElement === target) return;
    const hadFocus = ed.view.hasFocus;
    movingRef.current = true;
    target.appendChild(ed.view.dom);
    ed.view.requestMeasure();
    if (hadFocus || maximized) ed.focus();
    const t = setTimeout(() => {
      movingRef.current = false;
    }, 0);
    return () => clearTimeout(t);
  }, [editorReady, maximized, inlineSlot, overlaySlot]);

  useEffect(() => {
    editorRef.current?.setDark(dark);
  }, [dark, editorReady]);

  useEffect(() => {
    editorRef.current?.setFimEnabled(fimEnabled);
    if (!fimEnabled) status.set({ fim: { kind: 'off' }, ghost: false });
    else if (status.get().fim.kind === 'off') status.set({ fim: { kind: 'idle' } });
  }, [fimEnabled, editorReady, status]);

  // External code changes (regeneration, edits elsewhere) when there are no local edits.
  useEffect(() => {
    if (sameCode(code, savedRef.current)) return;
    if (dirtyRef.current) return;
    savedRef.current = code;
    editorRef.current?.setText(code);
  }, [code]);

  // ------------------------------------------------------------------ autosave triggers

  const isInside = useCallback((n: EventTarget | null) => {
    if (!(n instanceof Node)) return false;
    return !!(cardRef.current?.contains(n) || overlayRef.current?.contains(n));
  }, []);

  useEffect(() => {
    if (!editorReady) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dirtyRef.current && !isInside(e.target)) save('blur');
    };
    const onPageHide = () => {
      if (dirtyRef.current) save('unmount');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [editorReady, isInside, save]);

  const onBlurCapture = (e: React.FocusEvent) => {
    if (movingRef.current || !dirtyRef.current) return;
    if (!isInside(e.relatedTarget)) save('blur');
  };

  // ------------------------------------------------------------------ maximize

  const toggleMaximize = useCallback(() => {
    if (!maximized) setPlaceholderHeight(bodyRef.current?.getBoundingClientRect().height ?? 0);
    setMaximized(!maximized);
  }, [maximized]);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        setMaximized(false);
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [maximized]);

  // ------------------------------------------------------------------ actions

  const onCopy = useCallback(async () => {
    const text = editorRef.current?.getText() ?? code;
    try {
      await copyText(text);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
      toast.success('Copied to clipboard', { duration: 1400 });
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }, [code]);

  const onDownload = useCallback(() => {
    const text = editorRef.current?.getText() ?? code;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [code, filename]);

  const onReset = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.setText(savedRef.current, { undoable: true });
    toast('Reverted to last saved', { duration: 1400 });
  }, []);

  const onToggleFim = useCallback((v: boolean) => setSettings({ fimEnabled: v }), [setSettings]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // ------------------------------------------------------------------ resize

  const drag = useRef<{ startY: number; startH: number; raf: number; next: number } | null>(null);

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (maximized || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const body = bodyRef.current;
    if (!body) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startH: body.getBoundingClientRect().height, raf: 0, next: 0 };
    setDragging(true);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.next = clampHeight(d.startH + (e.clientY - d.startY), window.innerHeight);
    if (!d.raf) {
      d.raf = requestAnimationFrame(() => {
        if (!drag.current) return;
        drag.current.raf = 0;
        setUserHeight(drag.current.next);
      });
    }
  };
  const onHandleUp = () => {
    const d = drag.current;
    if (!d) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    if (d.next) setUserHeight(d.next);
    drag.current = null;
    setDragging(false);
  };
  const onHandleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const cur = bodyRef.current?.getBoundingClientRect().height ?? CANVAS_AUTO_MAX_HEIGHT;
    setUserHeight(clampHeight(cur + (e.key === 'ArrowDown' ? 40 : -40), window.innerHeight));
  };

  // ------------------------------------------------------------------ render

  const showStatic = !editorReady;
  const editable = editorReady && !streaming;
  const bodyStyle: React.CSSProperties = maximized
    ? { height: placeholderHeight }
    : userHeight !== null
      ? { height: userHeight }
      : { maxHeight: CANVAS_AUTO_MAX_HEIGHT };
  const fillStyle: React.CSSProperties = {
    height: userHeight !== null && !maximized ? '100%' : undefined,
    maxHeight: 'inherit',
  };

  const header = (
    <CanvasHeader
      languageLabel={label}
      filename={filename}
      streaming={streaming}
      editable={editable}
      dirty={dirty}
      savedFlash={savedFlash}
      copied={copied}
      fimEnabled={fimEnabled}
      maximized={maximized}
      onToggleFim={onToggleFim}
      onSave={() => save('button')}
      onReset={onReset}
      onCopy={onCopy}
      onDownload={onDownload}
      onToggleMaximize={toggleMaximize}
    />
  );
  const footer = (
    <CanvasFooter
      status={status}
      streaming={streaming}
      editable={editable}
      lineCount={lineCount}
      indentLabel={indentLabel}
    />
  );

  return (
    <TooltipProvider delayDuration={350}>
      <div
        ref={cardRef}
        className={cn(
          'group/canvas not-prose relative my-3 w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs transition-[border-color,box-shadow] duration-200',
          'focus-within:border-ring/50 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_12%,transparent)]',
          dragging && 'select-none border-ring/50',
          SYNTAX_VARS,
        )}
        onBlurCapture={onBlurCapture}
        onPointerEnter={() => setNearViewport(true)}
        data-testid="code-canvas"
        data-state={editable ? 'editor' : streaming ? 'streaming' : 'static'}
      >
        {header}
        <div ref={bodyRef} className="relative min-w-0" style={bodyStyle}>
          {showStatic && (
            <StaticCodeView
              code={code}
              language={language}
              follow={streaming}
              style={fillStyle}
              className={cn(userHeight !== null && 'h-full')}
            />
          )}
          <div
            ref={setInlineSlot}
            className={cn('min-w-0', !editorReady && 'hidden')}
            style={fillStyle}
            data-testid="code-canvas-editor-slot"
          />
          {maximized && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/30 text-xs text-muted-foreground">
              <span>Editing in expanded view</span>
              <Button size="xs" variant="outline" onClick={toggleMaximize}>
                <Minimize2Icon /> Restore
              </Button>
            </div>
          )}
        </div>
        {footer}
        {!maximized && (
          <ResizeHandle
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onDoubleClick={() => setUserHeight(null)}
            onKeyDown={onHandleKey}
            active={dragging}
          />
        )}

        {maximized &&
          createPortal(
            <div className={cn('fixed inset-0 z-50 flex items-stretch justify-center p-2 sm:p-6 lg:p-10', SYNTAX_VARS)}>
              <div
                className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in-0 duration-150"
                onClick={() => setMaximized(false)}
                aria-hidden
              />
              <div
                ref={overlayRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${label} editor`}
                className="relative flex w-full max-w-6xl min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl animate-in fade-in-0 zoom-in-[0.98] duration-150"
                data-testid="code-canvas-overlay"
              >
                {header}
                <div
                  ref={setOverlaySlot}
                  className="min-h-0 min-w-0 flex-1 [&>.cm-editor]:h-full [&>.cm-editor]:max-h-none"
                />
                {footer}
              </div>
            </div>,
            document.body,
          )}
      </div>
    </TooltipProvider>
  );
}
