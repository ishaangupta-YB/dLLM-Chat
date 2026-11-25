"use client";

import { memo, useCallback, useEffect, useSyncExternalStore } from "react";
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
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VoiceModeButton } from "@/components/voice/voice-mode-button";
import { useChatController } from "@/lib/chat/use-chat-controller";
import { useChatStore } from "@/lib/store/chat-store";
import { cn } from "@/lib/utils";
import { EffortSelect, FimToggle, ModelPicker, ResponseModeToggle, SettingsMenu } from "./settings-controls";
import { COMPOSER_INPUT_ID, focusComposer } from "./utils";

const noopSubscribe = () => () => {};
const speechSupported = () =>
  typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

export function Composer() {
  return (
    <div className="pointer-events-none relative z-10 -mt-10 shrink-0 bg-gradient-to-t from-background from-55% to-transparent px-3 pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      <div className="@container pointer-events-auto mx-auto w-full max-w-3xl">
        <PromptInputProvider>
          <ComposerForm />
        </PromptInputProvider>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/80">
          Mercury can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}

function ComposerForm() {
  const streaming = useChatStore((s) => s.streaming !== null);
  const { send, stop } = useChatController();
  const { textInput } = usePromptInputController();
  const hasText = textInput.value.trim().length > 0;

  // Desktop: focus the composer on load. Mobile: don't pop the keyboard.
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) focusComposer();
  }, []);

  const onSubmit = useCallback(
    ({ text }: PromptInputMessage) => {
      // Throwing keeps the draft in the textarea (PromptInput only clears on success).
      if (useChatStore.getState().streaming) throw new Error("busy");
      if (!text.trim()) throw new Error("empty");
      void send(text);
      focusComposer();
    },
    [send],
  );

  const onDictation = useCallback(
    (spoken: string) => {
      const current = textInput.value;
      const sep = current && !/\s$/.test(current) ? " " : "";
      textInput.setInput(current + sep + spoken.trim());
    },
    [textInput],
  );

  return (
    <PromptInput
      onSubmit={onSubmit}
      className={cn(
        "[&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-border/80 [&_[data-slot=input-group]]:bg-card",
        "[&_[data-slot=input-group]]:shadow-[0_8px_30px_-12px_rgb(0_0_0/0.18)] dark:[&_[data-slot=input-group]]:shadow-[0_8px_30px_-12px_rgb(0_0_0/0.6)]",
        "[&_[data-slot=input-group]]:transition-[border-color,box-shadow] [&_[data-slot=input-group]]:duration-200",
        "[&_[data-slot=input-group]:focus-within]:border-primary/45! [&_[data-slot=input-group]]:ring-primary/12!",
      )}
    >
      <PromptInputBody>
        <PromptInputTextarea
          id={COMPOSER_INPUT_ID}
          aria-label="Message"
          placeholder="Ask Mercury anything…"
          className="max-h-[40vh] min-h-14 px-4 pt-3.5 text-[15px] md:text-[15px]"
        />
      </PromptInputBody>
      <PromptInputFooter className="gap-2 px-2 pb-2">
        <PromptInputTools className="min-w-0 flex-1 gap-0.5 overflow-x-auto no-scrollbar">
          <Dictation onText={onDictation} />
          <VoiceModeButton disabled={streaming} />
          <ModelPicker className="shrink-0" />
          <ResponseModeToggle className="ml-0.5 shrink-0" />
          <div className="@2xl:flex hidden items-center gap-0.5">
            <EffortSelect />
            <FimToggle />
          </div>
          <SettingsMenu id="composer-settings-trigger" side="top" align="start" className="@2xl:hidden shrink-0 text-muted-foreground" />
        </PromptInputTools>
        <PromptInputSubmit
          status={streaming ? "streaming" : "ready"}
          onStop={stop}
          disabled={!streaming && !hasText}
          aria-label={streaming ? "Stop generating" : "Send message"}
          className={cn(
            "size-9 shrink-0 rounded-xl transition-all duration-200",
            !streaming && hasText && "brand-gradient-bg text-white shadow-md hover:opacity-90",
          )}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}

const Dictation = memo(function Dictation({ onText }: { onText: (t: string) => void }) {
  const supported = useSyncExternalStore(noopSubscribe, speechSupported, () => false);
  if (!supported) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <SpeechInput
            onTranscriptionChange={onText}
            size="icon-sm"
            aria-label="Dictate"
            className="size-8 [&:not(.bg-destructive)]:bg-transparent [&:not(.bg-destructive)]:text-muted-foreground [&:not(.bg-destructive)]:hover:bg-accent [&:not(.bg-destructive)]:hover:text-foreground"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">Dictate</TooltipContent>
    </Tooltip>
  );
});
