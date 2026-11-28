"use client";

import { memo, useState } from "react";
import {
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeXmlIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  WavesIcon,
  ZapIcon,
} from "lucide-react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  PromptInputButton,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
} from "@/components/ai-elements/prompt-input";
import { SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHAT_MODELS, REASONING_EFFORTS, getModel, isChatModelId, isReasoningEffort } from "@/lib/models";
import { useChatStore } from "@/lib/store/chat-store";
import type { ResponseMode } from "@/lib/types";
import { cn } from "@/lib/utils";

export const MODE_COPY: Record<ResponseMode, { label: string; hint: string }> = {
  streaming: {
    label: "Streaming",
    hint: "Text appears left to right as it is generated.",
  },
  diffusing: {
    label: "Diffusion",
    hint: "Watch the whole answer denoise into place, the way a diffusion LLM actually generates it.",
  },
};

export function ModeIcon({ mode, className }: { mode: ResponseMode | undefined; className?: string }) {
  return mode === "diffusing" ? (
    <WavesIcon className={cn("size-3.5", className)} />
  ) : (
    <ZapIcon className={cn("size-3.5", className)} />
  );
}

/* ------------------------------------------------------------------ model */

export const ModelPicker = memo(function ModelPicker({ className }: { className?: string }) {
  const model = useChatStore((s) => s.settings.model);
  const setSettings = useChatStore((s) => s.setSettings);
  const [open, setOpen] = useState(false);
  const current = getModel(model);

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <PromptInputButton
          size="sm"
          className={cn("gap-1.5 font-medium text-foreground/80", className)}
          aria-label={`Model: ${current?.name ?? model}. Change model`}
        >
          <SparklesIcon className="size-4 text-primary" />
          <span className="max-w-28 truncate">{current?.name ?? model}</span>
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </PromptInputButton>
      </ModelSelectorTrigger>
      <ModelSelectorContent title="Choose a model" className="sm:max-w-md">
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList>
          <ModelSelectorEmpty>No model found.</ModelSelectorEmpty>
          <ModelSelectorGroup heading="Inception Mercury">
            {CHAT_MODELS.map((m) => (
              <ModelSelectorItem
                key={m.id}
                value={`${m.name} ${m.id}`}
                onSelect={() => {
                  if (isChatModelId(m.id)) setSettings({ model: m.id });
                  setOpen(false);
                }}
                className="items-start gap-3 py-2.5"
              >
                <span className="brand-gradient-bg mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-primary-foreground">
                  <SparklesIcon className="size-3.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-medium">
                    {m.name}
                    {m.badge && (
                      <Badge className="h-4 px-1.5 text-[10px] leading-none">{m.badge}</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">{m.description}</span>
                </span>
                <CheckIcon className={cn("mt-1 size-4 text-primary", m.id === model ? "opacity-100" : "opacity-0")} />
              </ModelSelectorItem>
            ))}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
});

/* ------------------------------------------------------------------- mode */

export const ResponseModeToggle = memo(function ResponseModeToggle({ className }: { className?: string }) {
  const mode = useChatStore((s) => s.settings.mode);
  const setSettings = useChatStore((s) => s.setSettings);

  return (
    <div
      role="radiogroup"
      aria-label="Response mode"
      className={cn("relative inline-flex h-8 items-center rounded-lg bg-muted/70 p-0.5", className)}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm ring-1 ring-border/60 transition-transform duration-300 ease-out",
          mode === "diffusing" && "translate-x-full",
        )}
      />
      {(["streaming", "diffusing"] as const).map((m) => (
        <Tooltip key={m}>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setSettings({ mode: m })}
              className={cn(
                "relative z-10 inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 font-medium text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ModeIcon mode={m} className={mode === m && m === "diffusing" ? "text-primary" : undefined} />
              <span className="@lg:inline hidden">{MODE_COPY[m].label}</span>
              <span className="sr-only @lg:hidden">{MODE_COPY[m].label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-60">
            <span className="font-medium">{MODE_COPY[m].label}:</span> {MODE_COPY[m].hint}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
});

/* ----------------------------------------------------------------- effort */

export const EffortSelect = memo(function EffortSelect({ className }: { className?: string }) {
  const effort = useChatStore((s) => s.settings.reasoningEffort);
  const setSettings = useChatStore((s) => s.setSettings);
  return (
    <PromptInputSelect
      value={effort}
      onValueChange={(v) => isReasoningEffort(v) && setSettings({ reasoningEffort: v })}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PromptInputSelectTrigger
            aria-label="Reasoning effort"
            className={cn("h-8 gap-1.5 px-2 text-xs font-medium", className)}
          >
            <BrainIcon className="size-3.5 text-muted-foreground" />
            <SelectValue>{REASONING_EFFORTS.find((e) => e.id === effort)?.label ?? effort}</SelectValue>
          </PromptInputSelectTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Reasoning effort</TooltipContent>
      </Tooltip>
      <PromptInputSelectContent position="popper" align="start" side="top">
        {REASONING_EFFORTS.map((e) => (
          <PromptInputSelectItem key={e.id} value={e.id} textValue={e.label}>
            <span className="font-medium">{e.label}</span>
            <span className="ml-1 text-muted-foreground text-xs">{e.hint}</span>
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
});

/* -------------------------------------------------------------------- FIM */

export const FimToggle = memo(function FimToggle({ className }: { className?: string }) {
  const fim = useChatStore((s) => s.settings.fimEnabled);
  const setSettings = useChatStore((s) => s.setSettings);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label
          className={cn(
            "inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          <CodeXmlIcon className="size-3.5" />
          <span>Autocomplete</span>
          <Switch
            size="sm"
            checked={fim}
            onCheckedChange={(v) => setSettings({ fimEnabled: v })}
            aria-label="FIM autocomplete in code canvas"
          />
        </label>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60">
        Fill-in-the-middle ghost-text suggestions (mercury-edit-2) while you edit code blocks.
      </TooltipContent>
    </Tooltip>
  );
});

/* ---------------------------------------------------------- settings menu */

export function SettingsMenu({
  id,
  className,
  align = "end",
  side = "bottom",
  variant = "ghost",
}: {
  /** Stable trigger id: Radix's useId-based id can mismatch on hydration in Next dev. */
  id: string;
  className?: string;
  align?: "start" | "end" | "center";
  side?: "top" | "bottom";
  variant?: "ghost" | "outline";
}) {
  const settings = useChatStore((s) => s.settings);
  const setSettings = useChatStore((s) => s.setSettings);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button id={id} variant={variant} size="icon-sm" className={className} aria-label="Chat settings">
              <SlidersHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={side === "top" ? "top" : "bottom"}>Settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align={align} side={side} className="w-72" aria-labelledby={id}>
        <DropdownMenuLabel className="text-muted-foreground text-xs">Model</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={settings.model}
          onValueChange={(v) => isChatModelId(v) && setSettings({ model: v })}
        >
          {CHAT_MODELS.map((m) => (
            <DropdownMenuRadioItem key={m.id} value={m.id} className="items-start">
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 font-medium">
                  {m.name}
                  {m.badge && <Badge className="h-4 px-1.5 text-[10px] leading-none">{m.badge}</Badge>}
                </span>
                <span className="text-muted-foreground text-xs">{m.description}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs">Response mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={settings.mode}
          onValueChange={(v) => setSettings({ mode: v === "diffusing" ? "diffusing" : "streaming" })}
        >
          {(["streaming", "diffusing"] as const).map((m) => (
            <DropdownMenuRadioItem key={m} value={m} className="items-start">
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  <ModeIcon mode={m} />
                  {MODE_COPY[m].label}
                </span>
                <span className="text-muted-foreground text-xs">{MODE_COPY[m].hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs">Reasoning effort</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={settings.reasoningEffort}
          onValueChange={(v) => isReasoningEffort(v) && setSettings({ reasoningEffort: v })}
        >
          {REASONING_EFFORTS.map((e) => (
            <DropdownMenuRadioItem key={e.id} value={e.id}>
              <span className="font-medium">{e.label}</span>
              <span className="ml-auto text-muted-foreground text-xs">{e.hint}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={settings.fimEnabled}
          onCheckedChange={(v) => setSettings({ fimEnabled: v === true })}
          onSelect={(e) => e.preventDefault()}
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Code autocomplete (FIM)</span>
            <span className="text-muted-foreground text-xs">Ghost-text suggestions in code blocks</span>
          </span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
