'use client';
// Tool calls and web sources of an assistant message, built from AI Elements
// (Tool, Sources) and shadcn primitives. Contract: docs/ROADMAP-v2.md.
//   <MessageToolCalls message/>  above the answer: one card per call; more
//                                than two calls are grouped in a collapsible
//                                step list that stays open while tools run.
//   <MessageSources message/>    below the answer: numbered sources matching
//                                the [n] citations in the text.
import { memo, useMemo, useState } from 'react';
import { ChevronDownIcon, ExternalLinkIcon, LayersIcon, LoaderCircleIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { Tool, ToolContent, ToolInput, ToolOutput, getStatusBadge } from '@/components/ai-elements/tool';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { normalizeUrl } from '@/lib/agent/tools/citations';
import { useChatStore } from '@/lib/store/chat-store';
import type { ChatMessage, CustomMcpServer, SourceRef, ToolCallRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { domainOf, formatDuration, parseArgs, sourceLabel, ToolIcon, toolTitle } from './tool-meta';

const EMPTY: CustomMcpServer[] = [];
const GROUP_THRESHOLD = 3;

function stateOf(call: ToolCallRecord) {
  return call.status === 'running' ? 'input-available' : call.status === 'error' ? 'output-error' : 'output-available';
}

const ToolCallCard = memo(function ToolCallCard({ call, custom }: { call: ToolCallRecord; custom: CustomMcpServer[] }) {
  const title = toolTitle(call);
  const running = call.status === 'running';
  const args = useMemo(() => parseArgs(call.args), [call.args]);
  const sqlQuery = call.name === 'run_sql_query' && typeof args.query === 'string' ? args.query : null;
  const duration = call.endedAt ? formatDuration(call.endedAt - call.startedAt) : null;

  return (
    <Tool
      data-testid="tool-call"
      data-tool-name={call.name}
      data-status={call.status}
      className="mb-0 overflow-hidden rounded-xl bg-card/60 shadow-xs transition-colors hover:bg-card"
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground',
            running && 'text-primary',
            call.status === 'error' && 'text-destructive',
          )}
        >
          <ToolIcon call={call} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {running ? (
            <Shimmer as="span" duration={1.6}>
              {title}
            </Shimmer>
          ) : (
            title
          )}
        </span>
        <Badge variant="outline" className="hidden shrink-0 rounded-full px-2 text-[11px] font-normal text-muted-foreground sm:inline-flex">
          {sourceLabel(call.source, custom)}
        </Badge>
        <span className="shrink-0 [&_[data-slot=badge]]:h-5 [&_[data-slot=badge]]:px-1.5 [&_[data-slot=badge]]:text-[11px]">
          {getStatusBadge(stateOf(call))}
        </span>
        {duration && <span className="hidden w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:inline">{duration}</span>}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <ToolContent className="space-y-3 border-t bg-background/40 p-3">
        {sqlQuery ? (
          <div className="space-y-2">
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Query</h4>
            <CodeBlock code={sqlQuery} language="sql" />
          </div>
        ) : (
          <ToolInput input={args} />
        )}
        {(call.result || call.error) && (
          <ToolOutput
            errorText={call.error}
            output={
              call.result ? (
                <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                  {call.result}
                </pre>
              ) : undefined
            }
          />
        )}
        {running && !call.result && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3.5 animate-spin" /> Waiting for the result…
          </p>
        )}
      </ToolContent>
    </Tool>
  );
});

function ToolGroup({ calls, custom }: { calls: ToolCallRecord[]; custom: CustomMcpServer[] }) {
  const runningCount = calls.filter((c) => c.status === 'running').length;
  const errors = calls.filter((c) => c.status === 'error').length;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? runningCount > 0;
  const start = Math.min(...calls.map((c) => c.startedAt));
  const end = Math.max(...calls.map((c) => c.endedAt ?? c.startedAt));
  const sources = [...new Set(calls.map((c) => sourceLabel(c.source, custom)))];

  return (
    <Collapsible
      open={open}
      onOpenChange={setUserOpen}
      data-testid="tool-group"
      className="group/tools not-prose w-full rounded-xl border bg-card/40"
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
          {runningCount ? <LoaderCircleIcon className="size-3.5 animate-spin text-primary" /> : <LayersIcon className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {runningCount ? (
            <Shimmer as="span" duration={1.6}>{`Running tools… ${calls.length - runningCount}/${calls.length}`}</Shimmer>
          ) : (
            <>
              Used {calls.length} tools
              <span className="font-normal text-muted-foreground">
                {' '}
                · {formatDuration(end - start)}
                {errors ? ` · ${errors} failed` : ''}
              </span>
            </>
          )}
        </span>
        <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:inline">{sources.join(' · ')}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tools:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <ol className="relative flex flex-col gap-2 px-3 pb-3 before:absolute before:top-0 before:bottom-3 before:left-[23px] before:w-px before:bg-border">
          {calls.map((c) => (
            <li key={c.id} className="relative pl-7">
              <span
                aria-hidden
                className={cn(
                  'absolute top-[15px] left-[8px] size-[7px] rounded-full ring-4 ring-card',
                  c.status === 'running' ? 'animate-pulse bg-primary' : c.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground/50',
                )}
              />
              <ToolCallCard call={c} custom={custom} />
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MessageToolCalls({ message }: { message: ChatMessage }) {
  const custom = useChatStore((s) => s.settings.tools.customMcp) ?? EMPTY;
  const calls = message.toolCalls ?? [];
  if (!calls.length) return null;
  if (calls.length >= GROUP_THRESHOLD) return <ToolGroup calls={calls} custom={custom} />;
  return (
    <div className="not-prose flex w-full flex-col gap-2" data-testid="tool-calls">
      {calls.map((c) => (
        <ToolCallCard key={c.id} call={c} custom={custom} />
      ))}
    </div>
  );
}

/** Deduplicate by URL keeping first-seen order (= citation numbers). */
export function uniqueSources(sources: SourceRef[] | undefined): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const s of sources ?? []) {
    if (!s?.url) continue;
    const k = normalizeUrl(s.url);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function Monogram({ domain, className }: { domain: string; className?: string }) {
  // Favicons would need a third-party img-src in the CSP (and leak browsing);
  // a tinted monogram keeps the list recognisable without network requests.
  let h = 0;
  for (const ch of domain) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white uppercase ring-2 ring-background',
        className,
      )}
      style={{ backgroundColor: `oklch(62% 0.12 ${h})` }}
    >
      {domain.charAt(0)}
    </span>
  );
}

export function MessageSources({ message }: { message: ChatMessage }) {
  const sources = useMemo(() => uniqueSources(message.sources), [message.sources]);
  if (!sources.length) return null;
  const domains = [...new Set(sources.map((s) => domainOf(s.url)))];

  return (
    <Sources className="mb-0 text-foreground" data-testid="message-sources">
      <SourcesTrigger
        count={sources.length}
        className="group/src inline-flex items-center gap-2 rounded-full border bg-card/60 py-1 pr-3 pl-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span className="flex -space-x-1.5">
          {domains.slice(0, 4).map((d) => (
            <Monogram key={d} domain={d} />
          ))}
        </span>
        <span className="font-medium">
          {sources.length} {sources.length === 1 ? 'source' : 'sources'}
        </span>
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]/src:rotate-180" />
      </SourcesTrigger>
      <SourcesContent className="mt-2 grid w-full gap-1.5 sm:grid-cols-2">
        {sources.map((s, i) => {
          const domain = domainOf(s.url);
          return (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="source-item"
              className="group/item flex min-w-0 items-start gap-2.5 rounded-lg border bg-card/50 p-2.5 transition-colors hover:border-primary/40 hover:bg-accent/60"
            >
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-[13px] font-medium text-foreground">{s.title || domain}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Monogram domain={domain} className="size-3.5 text-[8px] ring-0" />
                  <span className="truncate">{domain}</span>
                  <ExternalLinkIcon className="size-3 shrink-0 opacity-0 transition-opacity group-hover/item:opacity-100" />
                </span>
                {s.snippet && <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{s.snippet}</span>}
              </span>
            </a>
          );
        })}
      </SourcesContent>
    </Sources>
  );
}
