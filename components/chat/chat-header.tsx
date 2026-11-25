"use client";

import { SquarePenIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStoreHydrated } from "./use-store-hydrated";
import { getModel } from "@/lib/models";
import { useChatStore } from "@/lib/store/chat-store";
import { cn } from "@/lib/utils";
import { ModeIcon, MODE_COPY, SettingsMenu } from "./settings-controls";
import { focusComposer } from "./utils";

export function ChatHeader() {
  const hydrated = useStoreHydrated();
  const title = useChatStore((s) => (s.activeId ? s.conversations[s.activeId]?.title : undefined));
  const model = useChatStore((s) => s.settings.model);
  const mode = useChatStore((s) => s.settings.mode);
  const streaming = useChatStore((s) => s.streaming !== null);
  const createConversation = useChatStore((s) => s.createConversation);
  const { isMobile, state } = useSidebar();
  const info = getModel(model);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-border/60 border-b bg-background/75 px-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sm:px-4">
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
            "truncate font-medium text-sm transition-opacity duration-300",
            hydrated ? "opacity-100" : "opacity-0",
          )}
          title={title}
        >
          {hydrated ? (title ?? "New chat") : " "}
        </h1>
        {streaming && (
          <span className="relative flex size-2 shrink-0" aria-label="Generating">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="hidden h-6 gap-1.5 rounded-full border-border/80 bg-card/60 px-2.5 font-medium text-foreground/80 sm:inline-flex"
            >
              <ModeIcon mode={mode} className={cn("size-3", mode === "diffusing" && "text-primary")} />
              {info?.name ?? model}
              {info?.badge && (
                <span className="rounded-full bg-primary/12 px-1.5 text-[10px] text-primary">{info.badge}</span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64">
            {info?.description} {MODE_COPY[mode].label} mode.
          </TooltipContent>
        </Tooltip>
        {(isMobile || state === "collapsed") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New chat"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  createConversation();
                  focusComposer();
                }}
              >
                <SquarePenIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New chat</TooltipContent>
          </Tooltip>
        )}
        <SettingsMenu id="header-settings-trigger" className="text-muted-foreground hover:text-foreground" />
      </div>
    </header>
  );
}
