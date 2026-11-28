import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, jsonError, readJson } from '@/lib/server/guard';
import { inceptionFetch, UpstreamError } from '@/lib/server/inception';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  user: z.string().min(1).max(4000),
  assistant: z.string().max(4000),
});

const PROMPT = `You name chat conversations. Given the user's first message and the start of the assistant's reply, write a short, specific title for the conversation.
Rules: 2 to 6 words, Title Case, no quotes, no trailing punctuation, no emojis, do not start with "Chat" or "Conversation". Use the user's language.`;

/** Generates a conversation title with Mercury structured outputs (json_schema). */
export async function POST(req: NextRequest) {
  const blocked = guard(req, 'title', 30);
  if (blocked) return blocked;
  const raw = await readJson(req, 20_000);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonError('Invalid request.', 400, 'bad_request');

  try {
    const res = await inceptionFetch(
      '/chat/completions',
      {
        model: 'mercury-3',
        reasoning_effort: 'instant',
        max_completion_tokens: 200,
        messages: [
          { role: 'system', content: PROMPT },
          {
            role: 'user',
            content: `User message:\n"""\n${parsed.data.user}\n"""\n\nAssistant reply (start):\n"""\n${parsed.data.assistant}\n"""`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'conversation_title',
            strict: true,
            schema: {
              type: 'object',
              properties: { title: { type: 'string', description: '2 to 6 word title' } },
              required: ['title'],
              additionalProperties: false,
            },
          },
        },
      },
      req.signal,
      10_000,
    );
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    let title = '';
    try {
      title = String((JSON.parse(text) as { title?: unknown }).title ?? '');
    } catch {
      title = text;
    }
    title = title
      .replace(/["“”'`]/g, '')
      .replace(/[.!?:;,]+$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (!title) return jsonError('Empty title.', 502, 'empty');
    return NextResponse.json({ title }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof UpstreamError) return jsonError(err.message, err.status, err.code);
    if ((err as Error)?.name === 'AbortError') return new Response(null, { status: 499 });
    return jsonError('Unexpected server error.', 500, 'internal');
  }
}
