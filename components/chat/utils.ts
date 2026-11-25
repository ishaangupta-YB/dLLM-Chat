import type { Conversation } from "@/lib/types";

export const COMPOSER_INPUT_ID = "composer-input";

/** Move keyboard focus to the composer textarea (after send, new chat, ...). */
export function focusComposer() {
  if (typeof document === "undefined") return;
  requestAnimationFrame(() => {
    const el = document.getElementById(COMPOSER_INPUT_ID) as HTMLTextAreaElement | null;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  });
}

export type ConversationGroupKey = "pinned" | "today" | "yesterday" | "week" | "older";

export const GROUP_LABELS: Record<ConversationGroupKey, string> = {
  pinned: "Pinned",
  today: "Today",
  yesterday: "Yesterday",
  week: "Previous 7 days",
  older: "Older",
};

/** Groups an already sorted list (sortConversations) by recency. */
export function groupConversations(
  list: Conversation[],
  now: number,
): { key: ConversationGroupKey; items: Conversation[] }[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const yesterday = today - 86_400_000;
  const week = today - 7 * 86_400_000;

  const buckets: Record<ConversationGroupKey, Conversation[]> = {
    pinned: [],
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };
  for (const c of list) {
    if (c.pinned) buckets.pinned.push(c);
    else if (c.updatedAt >= today) buckets.today.push(c);
    else if (c.updatedAt >= yesterday) buckets.yesterday.push(c);
    else if (c.updatedAt >= week) buckets.week.push(c);
    else buckets.older.push(c);
  }
  return (Object.keys(buckets) as ConversationGroupKey[])
    .filter((k) => buckets[k].length > 0)
    .map((key) => ({ key, items: buckets[key] }));
}

export interface ExportFile {
  app: "dllm-chat";
  version: 1;
  exportedAt: string;
  conversations: Conversation[];
}

export function buildExport(conversations: Conversation[]): ExportFile {
  return {
    app: "dllm-chat",
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: conversations.map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({ ...m, pending: undefined })),
    })),
  };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "chat"
  );
}

/** Accepts our export format, a bare array, or a record keyed by id. */
export function extractConversations(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.conversations)) return obj.conversations;
    if (obj.conversations && typeof obj.conversations === "object") {
      return Object.values(obj.conversations as Record<string, unknown>);
    }
    // Raw persisted store: { state: { conversations } }
    if (obj.state && typeof obj.state === "object") {
      return extractConversations(obj.state);
    }
    if (typeof obj.id === "string" && Array.isArray(obj.messages)) return [obj];
  }
  return [];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(2)} s` : `${s.toFixed(1)} s`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
