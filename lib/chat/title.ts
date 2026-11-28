'use client';

// AI-generated conversation titles. After the first successful exchange the
// user prompt and the start of the reply are sent to /api/title (structured
// output). The sidebar picks up the new title from the store and animates it.
import { useChatStore } from '@/lib/store/chat-store';
import type { TitleRequestBody } from '@/lib/types';

const inFlight = new Set<string>();

export async function maybeGenerateTitle(conversationId: string): Promise<void> {
  const { conversations, settings } = useChatStore.getState();
  const conv = conversations[conversationId];
  if (!conv || !settings.aiTitles || conv.titleSource !== 'auto' || inFlight.has(conversationId)) return;
  const user = conv.messages.find((m) => m.role === 'user');
  const assistant = conv.messages.find((m) => m.role === 'assistant' && !m.error && m.content.trim());
  // Only after the first exchange.
  if (!user || !assistant || conv.messages.filter((m) => m.role === 'assistant').length !== 1) return;

  inFlight.add(conversationId);
  try {
    const attachmentNames = user.attachments?.map((a) => a.name).join(', ');
    const body: TitleRequestBody = {
      user: (user.content || '').slice(0, 2000) + (attachmentNames ? `\n[attached: ${attachmentNames}]` : ''),
      assistant: assistant.content.slice(0, 1500),
    };
    const res = await fetch('/api/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { title?: string };
    if (data.title) useChatStore.getState().setConversationTitle(conversationId, data.title, 'ai');
  } catch {
    /* keep the placeholder title */
  } finally {
    inFlight.delete(conversationId);
  }
}
