"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { AlertTriangleIcon, CheckIcon, CopyIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { MessageSources, MessageToolCalls } from "@/components/agent-ui/message-tools";
import { Button } from "@/components/ui/button";
import { CodeCanvas } from "@/components/code-canvas/code-canvas";
import { parseSegments } from "@/lib/chat/segments";
import { useChatController } from "@/lib/chat/use-chat-controller";
import { getModel } from "@/lib/models";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { DiffusionText } from "./diffusion-text";
import { ModeIcon } from "./settings-controls";
import { copyText, formatDuration } from "./utils";

const STREAM_ANIMATION = { animation: "blurIn", duration: 220, sep: "word" } as const;

interface AssistantMessageProps {
  conversationId: string;
  message: ChatMessage;
  isLast: boolean;
}

export const AssistantMessage = memo(function AssistantMessage({
  conversationId,
  message,
  isLast,
}: AssistantMessageProps) {
  const { regenerate } = useChatController();
  const pending = !!message.pending;
  const diffusingLive = pending && message.mode === "diffusing";
  const toolCalls = message.toolCalls ?? [];
  const hasTools = toolCalls.length > 0;
  const toolsRunning = toolCalls.some((t) => t.status === "running");

  // Fade the final markdown in when a diffusion canvas resolves.
  const [wasDiffusing, setWasDiffusing] = useState(diffusingLive);
  const [fadeIn, setFadeIn] = useState(false);
  if (wasDiffusing !== diffusingLive) {
    setWasDiffusing(diffusingLive);
    if (!diffusingLive) setFadeIn(true);
  }

  const onRegenerate = useCallback(() => {
    void regenerate(message.id);
  }, [regenerate, message.id]);

  return (
    <Message from="assistant" className="max-w-full flex-row items-start gap-3">
      <BrandMark className="mt-0.5 hidden size-7 sm:inline-flex" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <MessageToolCalls message={message} />
        <MessageContent className="w-full overflow-visible text-[15px] leading-7">
          {pending && !message.content ? (
            // While tools run, their own status rows show progress.
            toolsRunning ? null : (
              <Shimmer className="text-sm" duration={1.6}>
                {hasTools ? "Writing the answer…" : message.mode === "diffusing" ? "Diffusing…" : "Thinking…"}
              </Shimmer>
            )
          ) : diffusingLive ? (
            <DiffusionText text={message.content} />
          ) : (
            <div
              className={cn(
                "flex min-w-0 flex-col gap-4",
                fadeIn && "fade-in-0 animate-in duration-500",
              )}
            >
              <Segments
                conversationId={conversationId}
                messageId={message.id}
                content={message.content}
                pending={pending}
              />
            </div>
          )}

          {message.error && !pending && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-start gap-2.5 text-destructive">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <span className="text-foreground/90">{message.error}</span>
              </div>
              {isLast && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-destructive/30 hover:bg-destructive/10"
                  onClick={onRegenerate}
                >
                  <RefreshCwIcon className="size-3.5" />
                  Retry
                </Button>
              )}
            </div>
          )}
        </MessageContent>

        <MessageSources message={message} />

        {!pending && (message.content || message.durationMs) ? (
          <AssistantFooter message={message} isLast={isLast} onRegenerate={onRegenerate} />
        ) : null}
      </div>
    </Message>
  );
});

/* -------------------------------------------------------------- segments */

const Segments = memo(function Segments({
  conversationId,
  messageId,
  content,
  pending,
}: {
  conversationId: string;
  messageId: string;
  content: string;
  pending: boolean;
}) {
  const segments = useMemo(() => parseSegments(content), [content]);
  const lastIdx = segments.length - 1;
  return segments.map((seg, i) =>
    seg.type === "code" ? (
      <CodeCanvas
        key={`code-${seg.index}`}
        conversationId={conversationId}
        messageId={messageId}
        blockIndex={seg.index}
        language={seg.language}
        code={seg.code}
        // An unclosed fence in a finished reply (stopped, token limit) gets
        // no more text, so it must become editable too.
        streaming={pending}
      />
    ) : (
      <MessageResponse
        key={`md-${i}`}
        isAnimating={pending && i === lastIdx}
        animated={STREAM_ANIMATION}
        caret={pending && i === lastIdx ? "block" : undefined}
      >
        {seg.text}
      </MessageResponse>
    ),
  );
});

/* ---------------------------------------------------------------- footer */

function AssistantFooter({
  message,
  isLast,
  onRegenerate,
}: {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyText(message.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Could not copy to clipboard");
    }
  };

  const model = message.model ? getModel(message.model)?.name ?? message.model : undefined;
  // Prefer the server-measured generation time: wall-clock duration includes
  // network time and the deliberate pacing of diffusion frames.
  const genMs = message.usage?.serverLatencyMs || message.durationMs;
  const tps =
    message.usage?.completionTokens && genMs
      ? message.usage.completionTokens / (genMs / 1000)
      : undefined;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 transition-opacity duration-200",
        isLast ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
      )}
    >
      <MessageActions className="-ml-1.5 gap-0.5">
        {message.content && (
          <MessageAction tooltip={copied ? "Copied" : "Copy"} label="Copy response" onClick={onCopy}>
            {copied ? <CheckIcon className="size-4 text-primary" /> : <CopyIcon className="size-4" />}
          </MessageAction>
        )}
        {isLast && (
          <MessageAction tooltip="Regenerate" label="Regenerate response" onClick={onRegenerate}>
            <RefreshCwIcon className="size-4" />
          </MessageAction>
        )}
      </MessageActions>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs tabular-nums">
        <span className="inline-flex items-center gap-1" title={message.mode === "diffusing" ? "Diffusion mode" : "Streaming mode"}>
          <ModeIcon mode={message.mode} className="size-3" />
          {model}
        </span>
        {message.durationMs ? (
          <>
            <Dot />
            <span>{formatDuration(message.durationMs)}</span>
          </>
        ) : null}
        {tps ? (
          <>
            <Dot />
            <span className="font-medium text-foreground/70">{Math.round(tps).toLocaleString()} tok/s</span>
          </>
        ) : null}
        {message.finishReason === "stopped" && (
          <>
            <Dot />
            <span className="inline-flex items-center gap-1">
              <SquareIcon className="size-2.5 fill-current" /> Stopped
            </span>
          </>
        )}
        {message.finishReason === "interrupted" && (
          <>
            <Dot />
            <span>Interrupted</span>
          </>
        )}
        {message.finishReason === "length" && (
          <>
            <Dot />
            <span>Hit token limit</span>
          </>
        )}
      </div>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="size-0.5 rounded-full bg-muted-foreground/60" />;
}
