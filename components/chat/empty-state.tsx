"use client";

import { memo } from "react";
import { BugIcon, CodeIcon, LightbulbIcon, WavesIcon, type LucideIcon } from "lucide-react";
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
  tag?: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  {
    title: "Detect a cycle in a linked list",
    prompt: "Write a Python function to detect a cycle in a linked list, with tests.",
    icon: CodeIcon,
  },
  {
    title: "Watch a story diffuse into place",
    prompt: "Write a vivid 200-word short story about a lighthouse keeper who discovers the light is talking back.",
    icon: WavesIcon,
    mode: "diffusing",
    tag: "Diffusion",
  },
  {
    title: "Explain diffusion LLMs simply",
    prompt:
      "Explain how diffusion language models like Mercury generate text differently from autoregressive models. Use an analogy and a short comparison table.",
    icon: LightbulbIcon,
  },
  {
    title: "Fix a race condition",
    prompt:
      "Find and fix the bug in this JavaScript and explain it:\n\n```js\nlet count = 0;\nasync function inc() {\n  const v = count;\n  await new Promise((r) => setTimeout(r, 10));\n  count = v + 1;\n}\nawait Promise.all([inc(), inc(), inc()]);\nconsole.log(count);\n```",
    icon: BugIcon,
  },
];

export const ChatEmptyState = memo(function ChatEmptyState({
  onPick,
}: {
  onPick: (p: StarterPrompt) => void;
}) {
  return (
    <ConversationEmptyState className="mx-auto max-w-3xl gap-0 px-4 py-10 sm:py-16">
      <div className="fade-in-0 slide-in-from-bottom-2 flex animate-in flex-col items-center duration-700">
        <div className="relative mb-6">
          <div aria-hidden className="brand-gradient-bg absolute inset-0 rounded-[30%] opacity-40 blur-xl" />
          <BrandMark className="animate-float-slow relative size-14 sm:size-16" />
        </div>
        <h1 className="brand-gradient-text pb-1 font-semibold text-4xl tracking-tight sm:text-5xl">dLLM Chat</h1>
        <p className="mt-3 max-w-md text-balance text-muted-foreground text-sm sm:text-base">
          Powered by Inception&apos;s <span className="font-medium text-foreground">Mercury 3</span>, a diffusion LLM
          that drafts whole answers at once at <span className="font-medium text-foreground">~1000 tokens/s</span>.
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
              "group/suggestion h-auto w-full justify-start gap-3 whitespace-normal rounded-xl bg-card/60 px-3.5 py-3 text-left font-normal shadow-xs backdrop-blur-sm",
              "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover/suggestion:bg-primary group-hover/suggestion:text-primary-foreground">
              <p.icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-medium text-sm">
                {p.title}
                {p.tag && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-px font-medium text-[10px] text-primary">
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
