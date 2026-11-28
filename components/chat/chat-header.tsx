"use client";

import { useRef, type KeyboardEvent } from "react";
import { Code2Icon, MessageSquareIcon, SquarePenIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getModel } from "@/lib/models";
import { useChatStore } from "@/lib/store/chat-store";
import type { AppMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatedTitle } from "./animated-title";
import { ModeIcon, MODE_COPY } from "./settings-controls";
import { useStoreHydrated } from "./use-store-hydrated";
import { focusComposer, switchAppMode } from "./utils";

export function ChatHeader() {
  const hydrated = useStoreHydrated();
  const activeId = useChatStore((s) => s.activeId);
  const title = useChatStore((s) => (s.activeId ? s.conversations[s.activeId]?.title : undefined));
  const titleSource = useChatStore((s) => (s.activeId ? s.conversations[s.activeId]?.titleSource : undefined));
  const model = useChatStore((s) => s.settings.model);
  const mode = useChatStore((s) => s.settings.mode);
  const appMode = useChatStore((s) => s.settings.appMode);
  const streaming = useChatStore((s) => s.streaming !== null);
  const createConversation = useChatStore((s) => s.createConversation);
  const { isMobile, state } = useSidebar();
  const info = getModel(model);
  const isCode = hydrated && appMode === "code";
  const fallbackTitle = isCode ? "New project" : "New chat";

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-border/70 border-b bg-background/80 px-3 backdrop-blur-xl in-data-[sidebar-animating]:backdrop-blur-none supports-[backdrop-filter]:bg-background/65 sm:px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarTrigger className="-ml-1 size-8 text-muted-foreground hover:text-foreground" />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Toggle sidebar <kbd className="ml-1 font-mono text-[10px] opacity-70">Ctrl B</kbd>
        </TooltipContent>
      </Tooltip>
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1
          className={cn(
            "min-w-0 truncate font-medium text-sm tracking-tight transition-opacity duration-300",
            hydrated ? "opacity-100" : "opacity-0",
          )}
          title={title}
        >
          {hydrated ? (
            <AnimatedTitle id={activeId} title={title ?? fallbackTitle} source={titleSource} />
          ) : (
            " "
          )}
        </h1>
        {streaming && (
          <span className="relative flex size-2 shrink-0" aria-label="Generating">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="hidden h-7 gap-1.5 rounded-full border-border bg-background/60 px-2.5 font-medium text-foreground/80 lg:inline-flex"
            >
              <ModeIcon mode={mode} className={cn("size-3", mode === "diffusing" && "text-primary")} />
              {info?.name ?? model}
              {info?.badge && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">{info.badge}</span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            {info?.description} {MODE_COPY[mode].label} mode.
          </TooltipContent>
        </Tooltip>

        <AppModeSwitch value={hydrated ? appMode : "chat"} />

        {(isMobile || state === "collapsed") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={isCode ? "New project" : "New chat"}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  createConversation();
                  focusComposer();
                }}
              >
                <SquarePenIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isCode ? "New project" : "New chat"}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  );
}

/* --------------------------------------------------------- mode switch */

const APP_MODES: { id: AppMode; label: string; icon: typeof MessageSquareIcon; hint: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquareIcon, hint: "Chat with tools and web search" },
  { id: "code", label: "Code", icon: Code2Icon, hint: "Coding agent: build and preview web apps" },
];

/** Segmented Chat | Code control (radio group with arrow-key navigation). */
function AppModeSwitch({ value }: { value: AppMode }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = APP_MODES.findIndex((m) => m.id === value);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? APP_MODES.length - 1 : (index + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + APP_MODES.length) % APP_MODES.length;
    switchAppMode(APP_MODES[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="App mode"
      onKeyDown={onKeyDown}
      className="relative inline-flex h-8 items-center rounded-lg border border-border/70 bg-muted/60 p-0.5"
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-xs ring-1 ring-border/80 transition-transform duration-300 ease-(--ease-out-drawer) dark:bg-accent",
          index === 1 && "translate-x-full",
        )}
      />
      {APP_MODES.map((m, i) => {
        const active = m.id === value;
        return (
          <Tooltip key={m.id}>
            <TooltipTrigger asChild>
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => switchAppMode(m.id)}
                className={cn(
                  "relative z-10 inline-flex h-7 min-w-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 sm:min-w-16 font-medium text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <m.icon className={cn("size-3.5", active && "text-primary")} />
                <span className="hidden sm:inline">{m.label}</span>
                <span className="sr-only sm:hidden">{m.label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{m.hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
