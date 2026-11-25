'use client';

// Lightweight read-only highlighted view used while a block streams and as the
// equal-height placeholder until CodeMirror has loaded. Mirrors the editor's
// metrics (font, 20px lines, gutter, paddings) so the swap causes no shift.
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '@codemirror/language';
import { loadLanguage } from '@/lib/editor/languages';
import { CANVAS_FONT, CANVAS_LINE_HEIGHT, CANVAS_VPAD } from '@/lib/editor/metrics';
import type { Token } from '@/lib/editor/static-highlight';
import { cn } from '@/lib/utils';

type HighlightModule = typeof import('@/lib/editor/static-highlight');

interface Loaded {
  mod: HighlightModule;
  language: Language | null;
  for: string;
}

const Line = memo(
  function Line({ tokens }: { tokens: Token[]; sig: string }) {
    return (
      <div className="whitespace-pre" style={{ padding: '0 16px 0 9px', minHeight: CANVAS_LINE_HEIGHT }}>
        {tokens.length === 0
          ? '\n'
          : tokens.map((t, i) =>
              t.cls ? (
                <span key={i} className={t.cls}>
                  {t.text}
                </span>
              ) : (
                t.text
              ),
            )}
      </div>
    );
  },
  (a, b) => a.sig === b.sig,
);

function signature(tokens: Token[]): string {
  let s = '';
  for (const t of tokens) s += t.cls + '\u0001' + t.text + '\u0002';
  return s;
}

export interface StaticCodeViewProps {
  code: string;
  language: string;
  /** Keep scrolled to the bottom while new lines arrive (unless the user scrolled up). */
  follow?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function StaticCodeView({ code, language, follow, className, style }: StaticCodeViewProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const deferred = useDeferredValue(code);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([import('@/lib/editor/static-highlight'), loadLanguage(language)])
      .then(([mod, ext]) => {
        if (!cancelled) setLoaded({ mod, language: mod.languageFromExtension(ext), for: language });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [language]);

  const lines = useMemo(() => {
    if (loaded && loaded.for === language) return loaded.mod.highlightLines(deferred, loaded.language);
    return deferred.split('\n').map((l) => (l ? [{ text: l, cls: '' }] : []));
  }, [deferred, loaded, language]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (follow && el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [lines, follow]);

  return (
    <div
      ref={scrollRef}
      className={cn('overflow-auto overscroll-contain', className)}
      style={style}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
      }}
      data-testid="code-canvas-static"
    >
      {loaded && (
        <style href="dllm-code-canvas-highlight" precedence="default">
          {loaded.mod.highlightCss}
        </style>
      )}
      <div
        className="grid w-max min-w-full text-[13px] text-foreground"
        style={{
          gridTemplateColumns: 'auto 1fr',
          fontFamily: CANVAS_FONT,
          lineHeight: `${CANVAS_LINE_HEIGHT}px`,
          padding: `${CANVAS_VPAD}px 0 ${CANVAS_VPAD}px 4px`,
        }}
      >
        <div
          aria-hidden
          className="select-none text-right tabular-nums text-muted-foreground/70"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {lines.map((_, i) => (
            <div key={i} style={{ padding: '0 12px 0 8px', minWidth: 32, boxSizing: 'border-box' }}>
              {i + 1}
            </div>
          ))}
        </div>
        <div>
          {lines.map((tokens, i) => (
            <Line key={i} tokens={tokens} sig={signature(tokens)} />
          ))}
        </div>
      </div>
    </div>
  );
}
