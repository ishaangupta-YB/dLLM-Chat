"use client";

import { memo, useCallback, useEffect, useRef, useSyncExternalStore, type ClipboardEvent, type KeyboardEvent } from "react";
import { PaperclipIcon } from "lucide-react";
import { toast } from "sonner";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { AttachmentChip } from "@/components/attachments/attachment-chip";
import { FileDropOverlay } from "@/components/attachments/file-drop-overlay";
import { useAttachmentDraft } from "@/components/attachments/use-attachment-draft";
import { AgentPresetPicker } from "@/components/integrations/preset-picker";
import { ToolsMenu } from "@/components/integrations/tools-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VoiceModeButton } from "@/components/voice/voice-mode-button";
import { MAX_ATTACHMENTS } from "@/lib/attachments/extract";
import { useChatController } from "@/lib/chat/use-chat-controller";
import { useChatStore } from "@/lib/store/chat-store";
import { setPersistErrorHandler } from "@/lib/store/persist-storage";
import { cn } from "@/lib/utils";
import { EffortSelect, ModelPicker, ResponseModeToggle, SettingsMenu } from "./settings-controls";
import { COMPOSER_INPUT_ID, focusComposer } from "./utils";

const noopSubscribe = () => () => {};
const speechSupported = () =>
  typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

/** File picker filter: the types extract.ts can read. Paste and drop accept anything and explain rejections. */
const ACCEPT = [
  ".txt,.md,.markdown,.mdx,.rst,.tex,.csv,.tsv,.json,.jsonl,.ndjson,.xml,.yaml,.yml,.toml,.ini,.cfg,.conf,.env,.log",
  ".html,.htm,.css,.scss,.js,.jsx,.mjs,.cjs,.ts,.tsx,.vue,.svelte,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.hpp",
  ".cs,.php,.sh,.bash,.zsh,.sql,.graphql,.proto,.lua,.r,.dart,.scala,.diff,.patch,.srt,.vtt,.svg",
  ".pdf,.docx,text/*,application/json,application/pdf",
].join(",");

/** Surface localStorage quota errors once in a while (history is kept in this browser). */
function useStorageErrorToast() {
  useEffect(() => {
    let last = 0;
    setPersistErrorHandler((err) => {
      const name = (err as DOMException)?.name;
      const now = Date.now();
      if (now - last < 15_000) return;
      last = now;
      toast.error(
        name === "QuotaExceededError"
          ? "Browser storage is full, so this chat may not be saved. Delete old chats or large attachments."
          : "Couldn't save chats to browser storage.",
      );
    });
  }, []);
}

export function Composer() {
  useStorageErrorToast();
  return (
    <div className="pointer-events-none relative z-10 -mt-10 shrink-0 bg-gradient-to-t from-background from-55% to-transparent px-3 pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      <div className="@container pointer-events-auto mx-auto w-full max-w-[var(--chat-max-w,52rem)]">
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
  const draft = useAttachmentDraft();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasText = textInput.value.trim().length > 0;
  const canSend = (hasText || draft.ready.length > 0) && !draft.extracting;

  // Desktop: focus the composer on load. Mobile: don't pop the keyboard.
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) focusComposer();
  }, []);

  const { add: addFiles, clear: clearFiles, remove: removeFile } = draft;
  const ready = draft.ready;
  const extracting = draft.extracting;

  const onSubmit = useCallback(
    ({ text }: PromptInputMessage) => {
      // Throwing keeps the draft in the textarea (PromptInput only clears on success).
      if (useChatStore.getState().streaming) throw new Error("busy");
      if (extracting) throw new Error("extracting");
      if (!text.trim() && !ready.length) throw new Error("empty");
      void send(text, ready.length ? { attachments: ready } : undefined);
      clearFiles();
      focusComposer();
    },
    [send, ready, extracting, clearFiles],
  );

  const onDictation = useCallback(
    (spoken: string) => {
      const current = textInput.value;
      const sep = current && !/\s$/.test(current) ? " " : "";
      textInput.setInput(current + sep + spoken.trim());
    },
    [textInput],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    },
    [addFiles],
  );

  const lastItem = draft.items.at(-1);
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Backspace in an empty textarea removes the last chip.
      if (e.key === "Backspace" && e.currentTarget.value === "" && lastItem) {
        e.preventDefault();
        removeFile(lastItem.id);
      }
    },
    [lastItem, removeFile],
  );

  return (
    <>
      <FileDropOverlay onFiles={addFiles} />
      {/* `accept` is set only while the picker is open, so this input never matches
          other file inputs' selectors (e.g. the chat import picker). */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Attach files"
        data-testid="composer-file-input"
        onChange={(e) => {
          if (e.currentTarget.files?.length) addFiles(e.currentTarget.files);
          e.currentTarget.value = "";
          e.currentTarget.removeAttribute("accept");
        }}
      />
      <PromptInput
        onSubmit={onSubmit}
        className={cn(
          "[&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-border/80 [&_[data-slot=input-group]]:bg-card",
          "[&_[data-slot=input-group]]:shadow-[0_8px_30px_-12px_rgb(0_0_0/0.18)] dark:[&_[data-slot=input-group]]:shadow-[0_8px_30px_-12px_rgb(0_0_0/0.6)]",
          "[&_[data-slot=input-group]]:transition-[border-color,box-shadow] [&_[data-slot=input-group]]:duration-200",
          "[&_[data-slot=input-group]:focus-within]:border-primary/45! [&_[data-slot=input-group]]:ring-primary/12!",
        )}
      >
        {draft.items.length > 0 && (
          <PromptInputHeader className="cursor-default px-2.5 pt-2.5 pb-0">
            <div
              data-testid="composer-attachments"
              className="flex w-full gap-2 overflow-x-auto pb-1 no-scrollbar"
              aria-label="Attached files"
            >
              {draft.items.map((it) => {
                const sent = ready.find((r) => r.id === it.id);
                return (
                  <AttachmentChip
                    key={it.id}
                    name={it.name}
                    mime={it.mime}
                    size={it.size}
                    status={it.status}
                    error={it.error}
                    truncated={sent?.truncated}
                    detail={it.pages ? `${it.pages} page${it.pages === 1 ? "" : "s"}` : undefined}
                    onRemove={() => removeFile(it.id)}
                  />
                );
              })}
            </div>
          </PromptInputHeader>
        )}
        <PromptInputBody>
          <PromptInputTextarea
            id={COMPOSER_INPUT_ID}
            aria-label="Message"
            placeholder={draft.items.length ? "Ask about the attached files…" : "Ask Mercury anything…"}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            className="max-h-[40vh] min-h-14 px-4 pt-3.5 text-[15px] md:text-[15px]"
          />
        </PromptInputBody>
        <PromptInputFooter className="gap-2 px-2 pb-2">
          <PromptInputTools className="min-w-0 flex-1 gap-0.5 overflow-x-auto no-scrollbar">
            <AttachButton
              onClick={() => {
                const el = fileInputRef.current;
                if (!el) return;
                el.accept = ACCEPT;
                el.click();
                // The window regains focus when the picker closes (picked or cancelled).
                window.addEventListener("focus", () => setTimeout(() => el.removeAttribute("accept"), 500), {
                  once: true,
                });
              }}
            />
            <ToolsMenu disabled={streaming} />
            <AgentPresetPicker disabled={streaming} />
            <Dictation onText={onDictation} />
            <VoiceModeButton disabled={streaming} />
            <span aria-hidden className="mx-1 hidden h-5 w-px shrink-0 bg-border @md:block" />
            <ModelPicker className="hidden shrink-0 @md:flex" />
            <ResponseModeToggle className="ml-0.5 hidden shrink-0 @md:inline-flex" />
            <EffortSelect className="@3xl:flex hidden shrink-0" />
            {/* Overflow: model, mode, effort and FIM autocomplete live here (always on narrow widths). */}
            <SettingsMenu
              id="composer-settings-trigger"
              side="top"
              align="start"
              className="shrink-0 text-muted-foreground"
            />
          </PromptInputTools>
          <PromptInputSubmit
            status={streaming ? "streaming" : "ready"}
            onStop={stop}
            disabled={!streaming && !canSend}
            aria-label={streaming ? "Stop generating" : "Send message"}
            title={!streaming && draft.extracting ? "Waiting for files to finish reading…" : undefined}
            className={cn(
              "size-9 shrink-0 rounded-xl transition-all duration-200",
              !streaming && canSend && "brand-gradient-bg text-white shadow-md hover:opacity-90",
            )}
          />
        </PromptInputFooter>
      </PromptInput>
    </>
  );
}

const AttachButton = memo(function AttachButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label="Attach files"
          data-testid="attach-button"
          className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        >
          <PaperclipIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        Attach files (text, code, PDF, DOCX; up to {MAX_ATTACHMENTS}). You can also drop or paste them.
      </TooltipContent>
    </Tooltip>
  );
});

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
