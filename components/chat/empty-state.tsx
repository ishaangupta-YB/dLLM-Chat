"use client";

import { memo } from "react";
import { CodeIcon, GlobeIcon, LayoutTemplateIcon, WavesIcon, type LucideIcon } from "lucide-react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Suggestion } from "@/components/ai-elements/suggestion";
import type { ResponseMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

export interface StarterPrompt {
  title: string;
  prompt: string;
  icon: LucideIcon;
  /** Switch response mode before sending (showcases diffusion). */
  mode?: ResponseMode;
  /** Turn on web search for this prompt. */
  webSearch?: boolean;
  /** Switch the app to Code mode instead of sending. */
  switchToCode?: boolean;
  tag?: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  {
    title: "Detect a cycle in a linked list",
    prompt: "Write a Python function to detect a cycle in a linked list, with tests.",
    icon: CodeIcon,
  },
  {
    title: "What's new in Next.js 16?",
    prompt: "What's new in Next.js 16? Search the web and cite your sources.",
    icon: GlobeIcon,
    webSearch: true,
    tag: "Web search",
  },
  {
    title: "Watch a story diffuse",
    prompt: "Write a vivid 200-word short story about a lighthouse keeper who discovers the light is talking back.",
    icon: WavesIcon,
    mode: "diffusing",
    tag: "Diffusion",
  },
  {
    title: "Build a landing page",
    prompt: "Opens the coding agent: describe an app and preview it live.",
    icon: LayoutTemplateIcon,
    switchToCode: true,
    tag: "Code mode",
  },
];

export const ChatEmptyState = memo(function ChatEmptyState({
  onPick,
}: {
  onPick: (p: StarterPrompt) => void;
}) {
  return (
    <ConversationEmptyState className="mx-auto max-w-[var(--chat-max-w)] gap-0 px-4 py-10 sm:py-16">
      <div className="fade-in-0 slide-in-from-bottom-2 flex animate-in flex-col items-center duration-700">
        <div className="relative mb-6">
          <div aria-hidden className="absolute inset-0 rounded-[30%] bg-primary opacity-30 blur-xl" />
          <BrandMark className="animate-float-slow relative size-14 sm:size-16" />
        </div>
        <h1 className="pb-1 font-semibold text-4xl text-foreground tracking-tight sm:text-5xl">
          dLLM <span className="text-primary">Chat</span>
        </h1>
        <p className="mt-3 max-w-lg text-balance text-muted-foreground text-sm leading-relaxed sm:text-base">
          Inception&apos;s <span className="font-medium text-foreground">Mercury 3</span> diffusion LLM at{" "}
          <span className="font-medium text-foreground">~1000 tokens/s</span>, with tools, web search and a coding
          agent that builds apps you can preview.
        </p>
      </div>

      <div className="fade-in-0 slide-in-from-bottom-3 mt-10 grid w-full max-w-2xl animate-in grid-cols-1 gap-2.5 delay-150 duration-700 fill-mode-both sm:grid-cols-2">
        {STARTER_PROMPTS.map((p) => (
          <Suggestion
            key={p.title}
            suggestion={p.prompt}
            onClick={() => onPick(p)}
            variant="outline"
            className={cn(
              "group/suggestion h-auto w-full justify-start gap-3 whitespace-normal rounded-xl bg-card px-3.5 py-3 text-left font-normal shadow-xs",
              "transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card hover:shadow-md",
              "focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduce:hover:translate-y-0",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary transition-colors group-hover/suggestion:bg-primary group-hover/suggestion:text-primary-foreground">
              <p.icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 font-medium text-sm">
                {p.title}
                {p.tag && (
                  <span className="rounded-full bg-primary/12 px-1.5 py-px font-medium text-[10px] text-primary">
                    {p.tag}
                  </span>
                )}
              </span>
              <span className="line-clamp-1 text-muted-foreground text-xs">{p.prompt.split("\n")[0]}</span>
            </span>
          </Suggestion>
        ))}
      </div>
    </ConversationEmptyState>
  );
});
