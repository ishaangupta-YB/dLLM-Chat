"use client";

import { memo, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  BoxIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeXmlIcon,
  GlobeIcon,
  HistoryIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from "@/components/ai-elements/checkpoint";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from "@/components/ai-elements/task";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useCodeAgent } from "@/lib/code-agent/use-code-agent";
import { useProjectVersions, type ProjectVersion } from "@/lib/code-agent/versions";
import { useChatStore } from "@/lib/store/chat-store";
import type { ChatMessage, ToolCallRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FileIconFor } from "./code-pane";

export const CODE_COMPOSER_ID = "code-agent-input";

const SUGGESTIONS = [
  "Landing page for a coffee shop",
  "Pomodoro timer",
  "Animated 3D globe with three.js",
  "Expense tracker with a Chart.js dashboard",
  "Snake game",
];

const EMPTY: string[] = [];

export function focusCodeComposer() {
  requestAnimationFrame(() => document.getElementById(CODE_COMPOSER_ID)?.focus());
}

export function CodeChat({ conversationId }: { conversationId: string }) {
  const ids = useChatStore(useShallow((s) => s.conversations[conversationId]?.messages.map((m) => m.id) ?? EMPTY));
  const { send } = useCodeAgent();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {ids.length === 0 ? (
        <CodeEmptyState onPick={(p) => void send(p)} />
      ) : (
        <Conversation key={conversationId} className="min-h-0" initial="instant">
          <ConversationContent className="gap-5 px-4 pt-5 pb-8">
            {ids.map((id, i) => (
              <CodeMessageRow key={id} conversationId={conversationId} messageId={id} isLast={i === ids.length - 1} />
            ))}
          </ConversationContent>
          <ConversationScrollButton aria-label="Scroll to latest message" className="bottom-3 z-10 bg-background/80 shadow-lg backdrop-blur-md" />
        </Conversation>
      )}
      <CodeComposer />
    </div>
  );
}

function CodeEmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25">
        <CodeXmlIcon className="size-6" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-semibold text-xl tracking-tight">What do you want to build?</h2>
        <p className="mx-auto max-w-sm text-muted-foreground text-sm">
          Describe an app or a page. Mercury writes the HTML, CSS and JavaScript and runs it live in a secure preview.
        </p>
      </div>
      <div className="flex max-w-md flex-wrap justify-center gap-2" data-testid="code-suggestions">
        {SUGGESTIONS.map((s) => (
          <Suggestion key={s} suggestion={s} onClick={onPick} className="h-8 bg-card/70 text-[13px] font-normal" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- messages */

const CodeMessageRow = memo(function CodeMessageRow({
  conversationId,
  messageId,
  isLast,
}: {
  conversationId: string;
  messageId: string;
  isLast: boolean;
}) {
  const message = useChatStore((s) => s.conversations[conversationId]?.messages.find((m) => m.id === messageId));
  if (!message) return null;
  if (message.role === "user") {
    return (
      <Message from="user" className="max-w-[90%]">
        <MessageContent className="whitespace-pre-wrap rounded-2xl! px-3.5! py-2.5! leading-relaxed">{message.content}</MessageContent>
      </Message>
    );
  }
  return <AssistantTurn conversationId={conversationId} message={message} isLast={isLast} />;
});

function AssistantTurn({ conversationId, message, isLast }: { conversationId: string; message: ChatMessage; isLast: boolean }) {
  const versions = useProjectVersions(conversationId);
  const version = versions.find((v) => v.messageId === message.id);
  const { regenerate } = useCodeAgent();
  const streaming = useChatStore((s) => s.streaming !== null);
  const pending = !!message.pending;
  const tools = message.toolCalls ?? [];
  const hasText = message.content.trim().length > 0;
  // The agent writes one sentence before its tool calls and a summary after:
  // show the tool steps between them.
  const split = tools.length ? message.content.indexOf("\n\n") : -1;
  const intro = split > 0 ? message.content.slice(0, split) : message.content;
  const rest = split > 0 ? message.content.slice(split + 2).trim() : "";

  return (
    <Message from="assistant" className="max-w-full" data-testid="code-assistant-message">
      <MessageContent className="w-full gap-3">
        {pending && !hasText && !tools.length && <Shimmer className="text-sm">Thinking…</Shimmer>}
        {intro && (
          <MessageResponse className="text-[13.5px] leading-relaxed" isAnimating={pending && !rest}>
            {intro}
          </MessageResponse>
        )}
        {tools.length > 0 && <ToolSteps tools={tools} pending={pending} />}
        {rest && (
          <MessageResponse className="text-[13.5px] leading-relaxed" isAnimating={pending}>
            {rest}
          </MessageResponse>
        )}
        {message.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
            {message.error}
          </div>
        )}
      </MessageContent>
      {!pending && (
        <div className="flex items-center gap-1">
          {version && <VersionCheckpoint conversationId={conversationId} version={version} />}
          {isLast && (
            <MessageActions className="ml-auto opacity-70 transition-opacity hover:opacity-100">
              <MessageAction tooltip="Regenerate" label="Regenerate" disabled={streaming} onClick={() => void regenerate(message.id)}>
                <RefreshCwIcon className="size-3.5" />
              </MessageAction>
            </MessageActions>
          )}
        </div>
      )}
    </Message>
  );
}

const FILE_TOOLS: Record<string, { running: string; done: string }> = {
  write_file: { running: "Writing", done: "Wrote" },
  edit_file: { running: "Editing", done: "Edited" },
  delete_file: { running: "Deleting", done: "Deleted" },
  read_file: { running: "Reading", done: "Read" },
};

function toolPath(tc: ToolCallRecord): string | undefined {
  try {
    const a = JSON.parse(tc.args) as { path?: unknown };
    return typeof a.path === "string" ? a.path : undefined;
  } catch {
    return undefined;
  }
}

function ToolStatus({ status }: { status: ToolCallRecord["status"] }) {
  if (status === "running") return <Loader2Icon className="size-3 animate-spin text-primary" />;
  if (status === "error") return <AlertCircleIcon className="size-3 text-destructive" />;
  return <CheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" />;
}

function ToolChip({ tc }: { tc: ToolCallRecord }) {
  const file = FILE_TOOLS[tc.name];
  const path = toolPath(tc);
  const verb = file ? (tc.status === "running" ? file.running : file.done) : undefined;
  const text = file && path ? `${verb} ${path}` : (tc.label ?? tc.name.replace(/_/g, " "));
  const Icon = tc.name.includes("search") || tc.name.includes("fetch") ? GlobeIcon : WrenchIcon;
  return (
    <TaskItem className="flex flex-col gap-1">
      <TaskItemFile
        data-testid="tool-chip"
        data-status={tc.status}
        title={tc.error ?? tc.result}
        className={cn(
          "gap-1.5 rounded-lg border-border/80 bg-card py-1 pr-2 pl-1.5 font-normal",
          tc.status === "error" && "border-destructive/30 bg-destructive/5",
        )}
      >
        <ToolStatus status={tc.status} />
        {file && path ? <FileIconFor path={path} className="size-3.5" /> : <Icon className="size-3.5 text-muted-foreground" />}
        <span className="max-w-60 truncate">{text}</span>
        {tc.status === "done" && tc.name === "edit_file" && tc.result?.includes("·") && (
          <span className="font-mono text-[10px] text-muted-foreground">{tc.result.split("·")[1]?.trim()}</span>
        )}
      </TaskItemFile>
      {tc.status === "error" && tc.error && <span className="pl-1 text-[11px] text-destructive/90">{tc.error}</span>}
    </TaskItem>
  );
}

function ToolSteps({ tools, pending }: { tools: ToolCallRecord[]; pending: boolean }) {
  const changed = new Set(tools.filter((t) => t.status === "done" && ["write_file", "edit_file", "delete_file"].includes(t.name)).map(toolPath));
  const running = tools.some((t) => t.status === "running");
  const title = running
    ? "Working…"
    : changed.size
      ? `Changed ${changed.size} file${changed.size === 1 ? "" : "s"}`
      : `Used ${tools.length} tool${tools.length === 1 ? "" : "s"}`;
  return (
    <Task defaultOpen className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
      <TaskTrigger title={title}>
        <button type="button" className="group flex w-full items-center gap-2 text-left text-muted-foreground text-xs hover:text-foreground">
          {running || pending ? <SparklesIcon className="size-3.5 text-primary" /> : <BoxIcon className="size-3.5" />}
          {running ? <Shimmer className="text-xs">{title}</Shimmer> : <span className="font-medium">{title}</span>}
          <ChevronDownIcon className="ml-auto size-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </TaskTrigger>
      <TaskContent className="[&>div]:mt-2 [&>div]:flex [&>div]:flex-wrap [&>div]:gap-1.5 [&>div]:space-y-0 [&>div]:border-l-0 [&>div]:pl-0">
        {tools.map((tc) => (
          <ToolChip key={tc.id} tc={tc} />
        ))}
      </TaskContent>
    </Task>
  );
}

function sameFiles(a: Record<string, string>, b: Record<string, string>) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function VersionCheckpoint({ conversationId, version }: { conversationId: string; version: ProjectVersion }) {
  const files = useChatStore((s) => s.conversations[conversationId]?.project?.files);
  const streaming = useChatStore((s) => s.streaming !== null);
  const current = useMemo(() => !!files && sameFiles(files, version.files), [files, version.files]);
  return (
    <Checkpoint className="min-w-0 flex-1 gap-1 [&>[data-slot=separator]]:flex-1" data-testid="version-checkpoint">
      <CheckpointIcon className="size-3.5" />
      {current ? (
        <span className="px-2 font-medium text-[11px]">v{version.n} · Current</span>
      ) : (
        <CheckpointTrigger
          tooltip="Restore the project to this version"
          className="h-6 px-2 text-[11px]"
          disabled={streaming}
          onClick={() => restoreVersion(conversationId, version)}
        >
          <HistoryIcon className="size-3" />v{version.n} · Restore
        </CheckpointTrigger>
      )}
    </Checkpoint>
  );
}

export function restoreVersion(conversationId: string, version: ProjectVersion) {
  const s = useChatStore.getState();
  if (s.streaming) return;
  const activeFile = s.conversations[conversationId]?.project?.activeFile;
  s.setProject(conversationId, {
    files: { ...version.files },
    activeFile: activeFile && version.files[activeFile] != null ? activeFile : undefined,
    version: 0,
  });
  toast.success(`Restored version ${version.n}`);
}

/* ------------------------------------------------------------- composer */

function CodeComposer() {
  return (
    <div className="shrink-0 px-3 pt-1 pb-3">
      <PromptInputProvider>
        <ComposerForm />
      </PromptInputProvider>
    </div>
  );
}

function ComposerForm() {
  const streaming = useChatStore((s) => s.streaming !== null);
  const hasFiles = useChatStore((s) => {
    const c = s.activeId ? s.conversations[s.activeId] : undefined;
    return !!c && Object.keys(c.project?.files ?? {}).length > 0;
  });
  const { send, stop } = useCodeAgent();
  const { textInput } = usePromptInputController();
  const hasText = textInput.value.trim().length > 0;

  const onSubmit = useCallback(
    ({ text }: PromptInputMessage) => {
      if (useChatStore.getState().streaming) throw new Error("busy");
      if (!text.trim()) throw new Error("empty");
      void send(text);
      focusCodeComposer();
    },
    [send],
  );

  return (
    <PromptInput
      onSubmit={onSubmit}
      className={cn(
        "[&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-border/80 [&_[data-slot=input-group]]:bg-card",
        "[&_[data-slot=input-group]]:shadow-[0_8px_30px_-14px_rgb(0_0_0/0.18)] dark:[&_[data-slot=input-group]]:shadow-[0_8px_30px_-14px_rgb(0_0_0/0.6)]",
      )}
    >
      <PromptInputBody>
        <PromptInputTextarea
          id={CODE_COMPOSER_ID}
          aria-label="Describe what to build"
          placeholder={hasFiles ? "Ask for a change…" : "Describe the app you want to build…"}
          className="min-h-14 text-sm"
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <RuntimeMenu />
        </PromptInputTools>
        <PromptInputSubmit
          status={streaming ? "streaming" : undefined}
          onStop={stop}
          disabled={!streaming && !hasText}
          className="rounded-full"
        />
      </PromptInputFooter>
    </PromptInput>
  );
}

function RuntimeMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 rounded-full px-2.5 text-muted-foreground text-xs" data-testid="runtime-menu">
          <GlobeIcon className="size-3.5" />
          HTML · CSS · JS
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs">Runtime</DropdownMenuLabel>
        <DropdownMenuItem className="items-start gap-2.5">
          <GlobeIcon className="mt-0.5 size-4 text-primary" />
          <div className="flex-1">
            <div className="font-medium text-sm">Static web</div>
            <div className="text-muted-foreground text-xs">HTML, CSS and JavaScript with CDN libraries</div>
          </div>
          <CheckIcon className="mt-0.5 size-4" />
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="items-start gap-2.5" data-testid="sandbox-coming-soon">
          <BoxIcon className="mt-0.5 size-4" />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 font-medium text-sm">
              Sandbox (React, Node)
              <Badge variant="secondary" className="h-4 rounded-full px-1.5 text-[10px]">
                Coming soon
              </Badge>
            </div>
            <div className="text-muted-foreground text-xs">Full-stack apps in a cloud sandbox</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
