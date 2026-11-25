"use client";

import { memo, useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, MicIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Message, MessageAction, MessageActions, MessageContent } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatController } from "@/lib/chat/use-chat-controller";
import { useChatStore } from "@/lib/store/chat-store";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { copyText, focusComposer } from "./utils";

export const UserMessage = memo(function UserMessage({ message }: { message: ChatMessage }) {
  const { editAndResend } = useChatController();
  const streaming = useChatStore((s) => s.streaming !== null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const startEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const submitEdit = () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setEditing(false);
    if (text === message.content.trim()) return;
    void editAndResend(message.id, text);
    focusComposer();
  };

  const onCopy = async () => {
    if (await copyText(message.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Could not copy to clipboard");
    }
  };

  if (editing) {
    return (
      <Message from="user" className="max-w-full sm:max-w-[85%]">
        <div className="w-full rounded-2xl border bg-card p-2 shadow-sm ring-1 ring-primary/20">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            aria-label="Edit message"
            className="field-sizing-content max-h-72 min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-end gap-2 px-1 pt-1">
            <span className="mr-auto hidden text-muted-foreground text-xs sm:inline">
              Enter to resend · Esc to cancel
            </span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submitEdit} disabled={!draft.trim() || streaming}>
              Send
            </Button>
          </div>
        </div>
      </Message>
    );
  }

  return (
    <Message from="user" className="max-w-[92%] sm:max-w-[80%]">
      <MessageContent className="rounded-2xl! rounded-br-md! bg-secondary px-4! py-2.5! text-[15px] leading-relaxed shadow-xs ring-1 ring-border/50">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </MessageContent>
      <MessageActions
        className={cn(
          "justify-end gap-0.5 transition-opacity duration-200",
          "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
        )}
      >
        {message.voice && (
          <span className="mr-1 inline-flex items-center gap-1 text-muted-foreground text-xs">
            <MicIcon className="size-3" /> Voice
          </span>
        )}
        <MessageAction tooltip={copied ? "Copied" : "Copy"} label="Copy message" onClick={onCopy}>
          {copied ? <CheckIcon className="size-4 text-emerald-500" /> : <CopyIcon className="size-4" />}
        </MessageAction>
        <MessageAction tooltip="Edit" label="Edit message" onClick={startEdit} disabled={streaming}>
          <PencilIcon className="size-4" />
        </MessageAction>
      </MessageActions>
    </Message>
  );
});
