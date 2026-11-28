"use client";

import { memo, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoreHydrated } from "./use-store-hydrated";
import { useChatController } from "@/lib/chat/use-chat-controller";
import { useChatStore } from "@/lib/store/chat-store";
import { AssistantMessage } from "./assistant-message";
import { ChatEmptyState, type StarterPrompt } from "./empty-state";
import { UserMessage } from "./user-message";
import { focusComposer, switchAppMode } from "./utils";

const EMPTY: string[] = [];

export function ChatThread() {
  const hydrated = useStoreHydrated();
  const activeId = useChatStore((s) => s.activeId);
  const ids = useChatStore(
    useShallow((s) => {
      const c = s.activeId ? s.conversations[s.activeId] : undefined;
      return c ? c.messages.map((m) => m.id) : EMPTY;
    }),
  );
  const { send } = useChatController();
  const setSettings = useChatStore((s) => s.setSettings);

  const onPick = useCallback(
    (p: StarterPrompt) => {
      if (p.switchToCode) {
        switchAppMode("code");
        return;
      }
      if (p.mode) setSettings({ mode: p.mode });
      if (p.webSearch) {
        const tools = useChatStore.getState().settings.tools;
        setSettings({ tools: { ...tools, enabled: true, webSearch: true } });
      }
      void send(p.prompt);
      focusComposer();
    },
    [send, setSettings],
  );

  if (!hydrated) return <ThreadSkeleton />;

  if (!activeId || ids.length === 0) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ChatEmptyState onPick={onPick} />
      </div>
    );
  }

  const lastId = ids[ids.length - 1];
  return (
    <Conversation key={activeId} className="min-h-0" initial="instant">
      <ConversationContent className="mx-auto w-full max-w-[var(--chat-max-w)] gap-6 px-4 pt-6 pb-10 sm:px-6">
        {ids.map((id) => (
          <div key={id} className="chat-turn">
            <MessageRow conversationId={activeId} messageId={id} isLast={id === lastId} />
          </div>
        ))}
      </ConversationContent>
      <ConversationScrollButton
        aria-label="Scroll to latest message"
        className="bottom-4 z-10 bg-background/80 shadow-lg backdrop-blur-md"
      />
    </Conversation>
  );
}

/** Subscribes to exactly one message so only the streaming row re-renders. */
const MessageRow = memo(function MessageRow({
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
  return message.role === "user" ? (
    <UserMessage message={message} />
  ) : (
    <AssistantMessage conversationId={conversationId} message={message} isLast={isLast} />
  );
});

function ThreadSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[var(--chat-max-w)] flex-1 flex-col gap-8 px-4 pt-10 sm:px-6" aria-hidden>
      <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
      <div className="flex gap-3">
        <Skeleton className="size-7 shrink-0 rounded-[30%]" />
        <div className="flex flex-1 flex-col gap-2.5">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
      <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
    </div>
  );
}
