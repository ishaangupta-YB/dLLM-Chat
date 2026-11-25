# dLLM Chat architecture

Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui + shadcn AI Elements, backed by the
Inception Mercury API. The full API research is in `reports/Inception Mercury API implementation spec.md`.

> **Heads up:** Inception's docs announce that the Mercury API stops serving requests after
> **2026-12-28**. All upstream calls go through `lib/server/inception.ts`, so switching provider means
> changing one module plus the model registry.

## Layers

```
browser                                     server (Node runtime)                 upstream
───────                                     ─────────────────────                 ────────
components/*  ──uses──▶ lib/chat/use-chat-controller ──POST /api/chat──▶ app/api/chat/route.ts ──SSE──▶ /v1/chat/completions
     │                         │  NDJSON events (lib/chat/protocol.ts) ◀──────┘
     │                         ▼
     │                 lib/store/chat-store.ts (zustand, persisted JSON in localStorage "dllm-chat:v2")
     │
code canvas ──POST /api/fim──▶ app/api/fim/route.ts ─────────────────────────────▶ /v1/fim/completions (mercury-edit-2)
```

| Module | Responsibility |
| --- | --- |
| `lib/types.ts` | Shared domain types (`ChatMessage`, `Conversation`, `ChatSettings`, request bodies). |
| `lib/models.ts` | Model registry: `mercury-3` (default), `mercury-2.5`, `mercury-2`; reasoning efforts; `FIM_MODEL`. |
| `lib/server/inception.ts` | **Only** place that reads the API key (`INCEPTION_API_KEY` or `DLLM_API_KEY`). Normalises upstream errors (string or pydantic array). Maps upstream 401 to 502 so details never leak. |
| `lib/server/guard.ts` | Same-origin check (Origin/Referer must match Host, or `ALLOWED_ORIGINS`), per-IP rate limit, JSON body size cap, uniform `{error:{message,code,status}}`. |
| `app/api/chat/route.ts` | Validates body (zod), adds system prompt, calls Mercury with `stream:true`, `stream_options.include_usage`, `reasoning_effort`, `max_completion_tokens`, and `diffusing` or voice settings (`realtime:true`, `temperature:0.75`, effort `low`). Converts SSE into NDJSON events. Cancels upstream when the client aborts. |
| `app/api/fim/route.ts` | FIM autocomplete. Trims context to 12k chars before / 4k after the cursor. Returns `{text, latencyMs}`. |
| `lib/sse.ts` | Chunk-safe SSE parser (frames >4KB span reads). |
| `lib/chat/protocol.ts` | NDJSON events: `text` (append), `frame` (replace, `p`=1 on clean final), `finish`, `usage`, `warning`, `error`. |
| `lib/chat/frame-player.ts` | Paces diffusion frames (upstream sends them in ~1 ms bursts) so the denoise effect is visible; the clean final frame always wins. |
| `lib/chat/use-chat-controller.ts` | `send(text, {voice?, onText?})`, `regenerate(assistantMsgId)`, `editAndResend(userMsgId, text)`, `stop()`. rAF-throttled store writes while streaming. Flushes persistence after every completed message. |
| `lib/chat/segments.ts` | `parseSegments(markdown)` splits prose and fenced code (with `index` per block, `closed` false while streaming). `replaceCodeBlock(md, index, code)` writes edits back safely. |
| `lib/store/chat-store.ts` | Conversations + settings. `skipHydration`; call `useHydrated()` (hooks/use-hydrated.ts) before rendering history. Untrusted JSON is sanitised on load/import. `updateCodeBlock(convId, msgId, blockIndex, code)` saves canvas edits into the message content. |
| `lib/store/persist-storage.ts` | Debounced localStorage writes (400 ms), flushed on pagehide/visibility change and via `flushPersist()`. |

## Component contracts (Phase 2/3 work splits on these)

### Code canvas: `components/code-canvas/code-canvas.tsx`
```ts
export interface CodeCanvasProps {
  conversationId: string;
  messageId: string;
  blockIndex: number;   // CodeSegment.index
  language: string;
  code: string;
  streaming: boolean;   // true while the message is pending or the fence is unclosed
}
export function CodeCanvas(props: CodeCanvasProps): JSX.Element
```
Rendered by the chat message renderer for every code segment. Owns: CodeMirror editor, resize, maximize,
copy, download, save (button / Cmd+S / click outside), FIM ghost text (toggle reads and writes
`settings.fimEnabled`, default on). Saving calls `useChatStore.getState().updateCodeBlock(...)`.

### Voice: `components/voice/voice-mode-button.tsx`
```ts
export interface VoiceModeButtonProps { disabled?: boolean }
export function VoiceModeButton(props: VoiceModeButtonProps): JSX.Element | null
```
Placed in the prompt composer toolbar. Opens a voice overlay: browser speech recognition, then
`send(transcript, {voice: true, onText})`, then sentence-by-sentence speech synthesis. Voice turns are
saved in the same conversation history (`voice: true` on messages).

### Chat UI: `components/chat/*`
App shell, conversations sidebar, thread, message renderer, composer, settings. Renders code segments
with `<CodeCanvas>` and puts `<VoiceModeButton>` in the composer.

## Persistence format

`localStorage["dllm-chat:v2"]` = `{ state: { conversations: Record<id, Conversation>, activeId, settings }, version: 1 }`.

## Security

- The key is only read server-side (`server-only` import guard). Nothing is prefixed `NEXT_PUBLIC_`.
- API routes reject cross-origin or header-less requests, cap body size, rate-limit per IP.
- `Permissions-Policy` allows the microphone for this origin only (voice mode).

## Testing

- `npm test`: vitest unit tests (`tests/unit`).
- `npm run test:e2e`: Playwright end-to-end tests (`tests/e2e`).
