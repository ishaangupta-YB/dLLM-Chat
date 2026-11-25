# Build on Mercury 3 before the December shutdown

The Inception Mercury API exposes a small, OpenAI-compatible surface: **eight HTTP paths** (chat, FIM, code edit, decisions, and four model-list endpoints). Its newest chat model is **`mercury-3`**, launched October 19, 2026, with a **1M-token context, up to 131,072 output tokens, tool calling, structured outputs, and `reasoning_effort` levels `instant|low|medium|high`**, priced at a launch rate of **$0.10 input / $0.01 cached / $0.35 output per 1M tokens** ([Models](https://docs.inceptionlabs.ai/get-started/models)). The fact that matters most for any upgrade is that **the whole API stops serving requests after December 28, 2026**, about five weeks from today, and Inception tells customers to move to another provider before then ([Wind-down](https://docs.inceptionlabs.ai/support/wind-down)). Everything specific to diffusion is real but thinly documented. `diffusing: true` streams full-text "denoising" frames that **replace** earlier ones. FIM autocomplete runs on `mercury-edit-2` at `/v1/fim/completions` and returned in roughly 0.4–0.75 s in live tests. "Mercury Voice" is an **enterprise-gated text-only LLM** with no audio endpoint, so self-serve voice means `mercury-3` with `realtime: true` plus a speech layer you build yourself ([Voice Quickstart](https://docs.inceptionlabs.ai/usecases/voice)). Live testing on 2026-11-24 found several places where the wire format departs from the docs. Errors can carry `message` as an array. Reasoning arrives only as encrypted blobs. Parallel tool calls can share `index: 0`. Diffusion progress jumps straight from 0.0 to 1.0. The right upgrade for the Next.js app is therefore a **provider-agnostic server proxy**, a **zustand-driven chat UI built from the AI Elements registry**, and a **Monaco code canvas** whose inline-completion provider calls a swappable `/api/fim` route. You get Mercury's speed now and an easy exit after December 28.

## Eight endpoints and 49 pages make up the entire documented surface

The docs at docs.inceptionlabs.ai are a Mintlify site. Its sitemap lists 45 URLs, and `llms.txt` adds four more (`/resources/chat`, `/support/support`, `/support/tou`, `/support/privacy`), for **49 pages plus an OpenAPI spec** ([sitemap](https://docs.inceptionlabs.ai/sitemap.xml), [llms.txt](https://docs.inceptionlabs.ai/llms.txt)). A separate pass counted 42 sitemap URLs. The difference probably comes from duplicate home URLs, and it does not change the page list. The complete text of every page is available in one 215 KB file at `llms-full.txt`, and adding `.md` to any page URL returns its Markdown. The pages fall into seven groups:

- **Get Started:** quick start, authentication, models, SDKs, rate limits.
- **API Reference:** chat, decisions, FIM, edit, and four model-list pages. These are thin renderings of the OpenAPI spec.
- **Capabilities:** reasoning efforts, streaming, tool use, structured outputs, decisions, extract, FIM, next edit.
- **Use cases:** one page, on voice.
- **Cookbooks (five):** search agent, customer-support voice agent, realtime voice assistant, NL-to-SQL, coding agent.
- **Integrations (ten):** Claude Code, Hermes, Cursor, Zed, Kilo Code, OpenCode, OpenClaw, LangChain, ElevenLabs, Vapi.
- **Resources and Support:** prompt guide, error codes, FAQ, wind-down, legal.

There is **no changelog**. Model history comes only from the blog and press coverage.

The OpenAPI spec at `https://api.inceptionlabs.ai/openapi.json` defines exactly these paths:

- `/v1/chat/completions`
- `/v1/fim/completions`
- `/v1/edit/completions`
- `/v1/decisions`
- `/v1/models`, `/v1/chat/completions/models`, `/v1/fim/completions/models`, `/v1/edit/completions/models`

There is **no audio, realtime-socket, embeddings, fine-tuning, or MCP endpoint**, and the chat schema accepts **no `seed`, `top_p`, `n`, `logprobs`, or `parallel_tool_calls`** ([OpenAPI](https://api.inceptionlabs.ai/openapi.json), [FAQ](https://docs.inceptionlabs.ai/resources/faq)). Authentication is a bearer token (`Authorization: Bearer <key>`). The SDKs read `INCEPTION_API_KEY`, and the official Stainless-generated SDK is `inceptionai` on npm (v0.3.0) and PyPI ([SDKs](https://docs.inceptionlabs.ai/get-started/sdks), [npm](https://www.npmjs.com/package/inceptionai)). Any OpenAI SDK also works when pointed at `https://api.inceptionlabs.ai/v1`. For the Vercel AI SDK the docs recommend `@ai-sdk/openai-compatible` with `createOpenAICompatible({ name: 'inception', baseURL: 'https://api.inceptionlabs.ai/v1' })`, and no dedicated `@ai-sdk/inception` provider exists ([Quick Start](https://docs.inceptionlabs.ai/get-started)).

## Mercury 3 is the only model the chat list endpoint still advertises

| Model id | Endpoint | Context | Max output | Price in / cached / out per 1M | Status |
|---|---|---|---|---|---|
| `mercury-3` | chat | 1,000,000 | 131,072 | **$0.10 / $0.01 / $0.35** (list $0.20/$0.02/$0.70) | Newest, Oct 2026 |
| `mercury-2.5` | chat | 260K | 65,536 | $0.20 / $0.02 / $0.75 | Previous generation |
| `mercury-2` | chat | 128K | 50,000 | $0.25 / $0.025 / $0.75 | Earlier generation |
| `mercury-voice` (no published id) | chat | 128K | 50,000 | $0.20 / $0.02 / $0.75 | Enterprise only |
| `mercury-edit-2` | FIM + edit | 32K | 8,192 | $0.25 / $0.025 / $0.75 | Coding model |
| `mercury-decide` | decisions | — | — | $0.02 input only | Classification/extraction |

Source: [Models](https://docs.inceptionlabs.ai/get-started/models). Press reports confirm the October 19 launch and the 50%-off launch pricing ([The Next Web](https://thenextweb.com/news/inception-mercury-3-diffusion-llm), [Unite.ai](https://unite.ai/inception-releases-mercury-3-its-flagship-diffusion-llm)). Inception claims **1,068 tokens/s**, but nobody has verified that independently ([TechRepublic](https://www.techrepublic.com/article/news-inception-mercury-3-ai-speed/), [Let's Data Science](https://letsdatascience.com/news/inception-releases-mercury-3-diffusion-llm-claiming-1000-tok-cb32df3e)). One third-party test measured about 850–900 tok/s of visible text ([HackerNoon](https://hackernoon.com/the-ai-model-that-promised-to-crush-gpt-6-has-a-surprising-weakness)).

Live calls matter here because they disagree with the docs in small ways:

- **`GET /v1/models`** returned only `mercury-2`, `mercury-2.5`, `mercury-3` and `mercury-decide`, and it answered even without an auth header.
- **`GET /v1/chat/completions/models`** returned **only `mercury-3`**. `mercury-edit-2` appears only under the FIM and edit list endpoints. The FIM list reports a 128K context and 32K output, which contradicts the docs and the validator: requests with `max_tokens` above 8,192 are rejected.
- **The chat validator** still accepts the legacy ids `mercury`, `mercury-coder`, `mercury-coder-small` and `mercury-small`, plus two `mercury-3-preview-*` snapshots. None of them appear in the current docs, and which underlying model serves them is unknown.

Every model-list response has the shape `{"data": [...]}` with per-token price strings (for example mercury-3 `"prompt":"0.0000001","completion":"0.00000035"`). There is no OpenAI `object`/`owned_by` field ([OpenAPI](https://api.inceptionlabs.ai/openapi.json)). Build the model picker from `/v1/chat/completions/models`. Default to `mercury-3`, and hide the legacy ids. All chat models are **text-only**. Only Mercury Decide accepts images ([FAQ](https://docs.inceptionlabs.ai/resources/faq)).

## The chat contract is OpenAI-shaped with diffusion-specific extensions

`POST /v1/chat/completions` requires `model` and `messages`. Message roles are `system|user|assistant|tool|function`, and `tool_call_id` links tool results to calls. The OpenAPI spec defines the fields that matter for the app as follows ([OpenAPI](https://api.inceptionlabs.ai/openapi.json), [Reasoning Efforts](https://docs.inceptionlabs.ai/capabilities/reasoning-efforts)):

| Field | Values | Default / behaviour |
|---|---|---|
| `max_completion_tokens` | 1–131,072 (model max) | Includes **reasoning tokens**. mercury-3 defaults: 24,576; 8,192 at `instant`; 65,536 at `medium`; 131,072 at `high`. `max_tokens` is deprecated. |
| `temperature` | 0.5–1.0 | mercury-3 default 1 (mercury-2: 0.75). Out-of-range values are **reset with a `warning`**, not rejected. |
| `reasoning_effort` | `instant|low|medium|high` | Docs say mercury-3 defaults to `low`. The OpenAPI spec and the ElevenLabs page say `medium`. **Always send it explicitly.** |
| `stream`, `stream_options.include_usage` | bool | The usage chunk has `choices: []`. |
| `diffusing` | bool | Streams full-text denoising frames. Returns 400 `diffusing_not_supported` without `stream`. |
| `realtime` | bool | "Lower TTFT/TTFAT" for voice. No visible effect on the response shape. |
| `tools`, `tool_choice` | OpenAI shape | `auto` by default when tools are present. |
| `response_format` | `text`, `json_object`, `json_schema{name, schema, strict}` | Same as OpenAI. |
| `reasoning_summary`, `reasoning_summary_wait` | bool | **Returned `null` in every live test.** |
| `stop`, `extra_body` | string[], object | `extra_body` is an OpenAI-compatible passthrough. |

The response is a standard `chat.completion`. It adds a `warning` string and a `reasoning_summary` object. The live `usage` object is **nested**: `prompt_tokens_details.cached_tokens` and `completion_tokens_details.reasoning_tokens`. The OpenAPI example shows flat `reasoning_tokens`/`cached_input_tokens` fields, and that example is out of date ([FAQ](https://docs.inceptionlabs.ai/resources/faq)). The detail counts are already included in their parent totals. Reasoning tokens bill at the output rate, and no dollar-cost field is returned. Compute cost client-side as `(prompt − cached) × prompt_price + cached × cache_read_price + completion × completion_price`, using the strings from `/v1/models`.

Reasoning is **invisible**. Assistant messages carry an undocumented `reasoning_details: [{type: "reasoning.encrypted", data: "mrt1_v1_…", format: "mercury-v1"}]`. It is opaque, and the `Message` schema has no field for sending it back. No plaintext chain-of-thought or working summary comes back, so a Reasoning panel can show only "Thinking…" and a token count. Validation of `reasoning_effort` is also inconsistent: `"max"` returned 400 in one test, while `"minimal"` returned 200 with no warning in another. The client should restrict values to the four documented levels.

The most important trap: **reasoning tokens consume `max_completion_tokens` first**. In a live run with default effort and a 600-token cap, the stream contained no content at all, only `reasoning_details`, then `finish_reason: "length"`. Set at least about 3,000–4,000 tokens whenever effort is `medium` or higher. The voice docs recommend at least 3,000 for medium ([Voice Quickstart](https://docs.inceptionlabs.ai/usecases/voice)).

## Diffusion streaming replaces text while normal streaming appends it

Standard streaming (`stream: true`) sends SSE frames of the form `data: {json}\n\n`, ending with `data: [DONE]`. There are no `event:` or `id:` lines and no keep-alives. Each delta is a **block** of refined text, often 200–560 characters and sometimes split mid-word, and the client **concatenates** them ([Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming)). A live stream ran in this order:

1. Content blocks, each repeating `role: "assistant"`.
2. An optional `reasoning_details` chunk with no `content` key. It was absent at `instant` effort.
3. A finish chunk with an empty `delta` and a `finish_reason`.
4. When requested, a usage chunk with `choices: []` and an undocumented `server_timing.server_latency_ms`.
5. `[DONE]`.

One capture placed the encrypted chunk in the first delta instead of after the content, so parsers should accept it in either position.

With `diffusing: true`, **each content frame contains the entire answer from character 0**, including random-character noise where text has not yet been denoised. The client must overwrite its display, not append. The docs say exactly this: "The diffusing effect is best shown by overwriting the displayed text on each step" ([Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming)). Diffusion frames carry an undocumented `diffusion_meta: {diffusion_content: true, diffusion_progress}`. Live captures showed three behaviours that a renderer has to handle:

- **`diffusion_progress` is 0.0 on every frame except the last, which is 1.0.** It is a completion flag, not a progress bar.
- **Frames arrive in bursts** of two or three within one millisecond, with 150–250 ms between bursts. A short answer produces three to five frames almost at once, so rendering frames as they arrive makes the effect invisible.
- **Noise is not monotonic.** Text that was clean in one frame can show noise again in a later one.

A 1,007-token story produced 25 frames between 714 ms and 2,605 ms, with the canvas growing from 367 to 4,285 characters. Bandwidth therefore grows roughly with the number of frames. Diffusion worked on `mercury-3`, `mercury-2.5` and `mercury-2`. With tools enabled, `content` is `""` while tool-call arguments stream as ordinary **appended** OpenAI deltas.

The browser snippet in the docs has two production bugs. It decodes without `{stream: true}` and does not carry partial lines between reads, so a 4 KB frame split across two network reads is lost. It also blanks the canvas on tool-call frames whose `content` is `""`.

For the app, the server route should re-frame upstream SSE into its own typed events:

- `{"type":"delta","text"}` for normal mode
- `{"type":"canvas","text","final"}` for diffusion
- `{"type":"tool_call",...}`
- `{"type":"usage",...}`
- `{"type":"error",...}`

The client then puts canvas frames in a queue and plays them every 30–60 ms with `requestAnimationFrame`. Once a frame with `final: true` (or the finish chunk) arrives, that text is locked and no later frame can overwrite it. Noisy frames should render as monospace plain text, and the Markdown renderer should run **only on the final frame**. This lets the AI SDK's append-only streaming model sit alongside replace semantics. It is also why a raw `fetch` proxy suits diffusion mode better than `@ai-sdk/openai-compatible`. Reasoning streams nothing: at `high` effort the first byte took about 2.15 s, against about 0.45–0.85 s at `instant`/`low`. The UI needs a shimmer indicator until the first frame arrives.

## Tools and structured outputs work, but with three live quirks

Tool calling follows OpenAI's format. You send `tools[]` of `{type:"function", function:{name, description, parameters, strict}}`, where names match `[a-zA-Z0-9_-]{1,64}`. `tool_choice` takes `auto|required|none` or a named function. You return results as `role:"tool"` messages carrying `tool_call_id`, and the docs advertise parallel calls ([Tool Use](https://docs.inceptionlabs.ai/capabilities/tool-use), [OpenAPI](https://api.inceptionlabs.ai/openapi.json)). Tools work on mercury-2, mercury-2.5, mercury-3 and, according to the docs, Mercury Voice. They do not work on FIM, edit or decisions. Live testing exposed three behaviours the tool loop has to handle:

- **Non-streamed parallel calls both carried `"index": 0`.** Key final calls by `id`. Streamed indices were correct.
- **The model can emit preamble text before tool calls** in the stream ("Let me get the weather for both cities."). Treat it as interim text, and never send it to TTS.
- **Forcing a named `tool_choice` on an unrelated prompt** produced a call with made-up arguments and **`finish_reason: "stop"`**, not `"tool_calls"`. Detect calls by checking `message.tool_calls?.length`, not `finish_reason`, and never force a named tool in open-ended chat.

A full round trip (assistant `tool_calls`, then a tool message, then the final answer) worked as expected.

`response_format` with `json_schema` and `strict: true` returned valid JSON in 0.48 s at `instant` effort, and `json_object` mode also worked ([Structured Outputs](https://docs.inceptionlabs.ai/capabilities/structured-outputs)). The supported JSON Schema subset is undocumented, so validate output with zod regardless. Mercury Decide (`/v1/decisions`) is a separate typed-question service with question types `noul`, `choice`, `score` and `extract`. It bills input only, at $0.02/M. It does not stream, and its 422 errors use FastAPI's `{"detail": [...]}` shape ([Decisions](https://docs.inceptionlabs.ai/capabilities/decisions), [Extract](https://docs.inceptionlabs.ai/capabilities/extract)). It could serve as a cheap intent router, but a chat app does not need it.

## FIM answers in about half a second; Apply-Edit is gone

**Fill-in-the-middle** is `POST /v1/fim/completions` with `model: "mercury-edit-2"`. You send the code before the cursor as `prompt` and the code after it as `suffix`, and read `choices[0].text` ([Autocomplete (FIM)](https://docs.inceptionlabs.ai/capabilities/fim)). The request schema has these defaults:

- `max_tokens` **512** (range 1–8,192)
- `stop` **`["\n\n", "\n \n"]`**
- `presence_penalty` **1.5**
- `top_p` 1.0, `top_k` −1 (or 1–1000; 0 is rejected)
- `frequency_penalty` 0, `repetition_penalty` 1.0
- `stream`, `stream_options`

`temperature` is not in the schema. Unknown fields are silently ignored, so whether temperature does anything is unknown ([OpenAPI](https://api.inceptionlabs.ai/openapi.json)). The docs say FIM has no fields for edit history or other files: "Add any extra context directly to `prompt`."

Live FIM calls took **0.40–0.75 s end to end** from a US-East client across prompt sizes up to about 2,760 tokens, with 0.19–0.27 s spent on the server. Prefix caching applied automatically from the second call onward. A streamed call reached first byte in 0.31 s and finished in 0.43 s. Streaming sends **incremental deltas** (append), and `finish_reason: "stop"` appears twice. The returned text includes leading indentation and no trailing newline, so it can be inserted verbatim at the cursor. `max_tokens` is a soft cap: a limit of 8 produced 10–11 tokens. The legacy id `mercury-coder` still works on this endpoint.

Inception publishes no debounce or sizing guidance for FIM. The following values are untested recommendations:

- **Single-line ghost text:** `max_tokens` about 64, `stop: ["\n"]`.
- **Block completion:** 128–256 tokens with the default stops.
- **Request hygiene:** debounce 150–250 ms, abort stale requests at both hops, and trim the context to about 4–8K characters of prefix and 1–2K of suffix (the hard limit is a 32K-token window).

**Next Edit** is `POST /v1/edit/completions` with the same model. It takes exactly **one user message containing nine required tags**: `<|recently_viewed_code_snippets|>…<|/…|>`, `<|edit_diff_history|>…<|/…|>`, `<|current_file_content|>…<|/…|>`, `<|code_to_edit|>…<|/code_to_edit|>`, and `<|cursor|>`. Empty sections are allowed. The response is the rewritten editable region in `choices[0].message.content`, wrapped in triple backticks ([Next Edit](https://docs.inceptionlabs.ai/capabilities/next-edit)). This endpoint has different defaults: temperature 0.2 on a 0–2 scale with no clamping, `max_tokens` 1,024, and `presence_penalty` 1.0. **Streaming returns a 400 error.** The docs give concrete guidance:

- 3–5 recently viewed snippets of about 20 lines each, always in their latest state.
- At least the last 3–5 range-based edits, oldest first.
- The whole current file.
- An editable region of **10–15 lines centred at `[line−5, line+10]`**, up to about 25 lines, because "the editable region directly determines output token count and dominates latency".

A live 15-line request returned in 0.54–0.60 s.

The **Apply-Edit** endpoint described on Inception's blog (`/v1/apply/completions` with `<|original_code|>` and `<|update_snippet|>` tags) **now returns 404** and is missing from the OpenAPI spec ([Apply-Edit blog](https://www.inceptionlabs.ai/blog/ultra-fast-apply-edit-with-mercury-coder)). "Apply this snippet to the canvas" has to be done another way: either ask `mercury-3` to return the merged file, or do it client-side with a diff/merge. The API does send permissive CORS headers for `localhost:3000`, but calling it from the browser would expose the key. Every call should go through Next.js routes.

## Mercury Voice is a sales-gated text model, not a speech API

The models page describes Mercury Voice as "a diffusion LLM tuned for voice agents" that "reasons, calls tools, returns structured outputs". It runs on the ordinary chat endpoint, supports only `low|medium|high` effort, and requires contacting sales@inceptionlabs.ai ([Models](https://docs.inceptionlabs.ai/get-started/models)). **No model id is published.** With a self-serve key, the guessed ids `mercury-voice` and `mercury-voice-1` are rejected with 400. Inception's blog claims **320 ms p50 / 750 ms p95 time-to-first-answer-token** and about $0.009 per minute of conversation, but publishes no numeric benchmark scores ([Introducing Mercury Voice](https://www.inceptionlabs.ai/blog/introducing-mercury-voice)).

The documented self-serve path is `mercury-3` in an ASR → LLM → TTS pipeline. The docs recommend `temperature: 0.75`, `realtime: true`, effort `medium` (standard) or `low` (fastest first token), at least 3,000 completion tokens at medium, and around 0.6 temperature for tool-heavy agents ([Voice Quickstart](https://docs.inceptionlabs.ai/usecases/voice)). In a live test with those settings, mercury-3 answered in **0.37 s**. The cookbooks pair Mercury with ElevenLabs: Scribe `scribe_v1` for speech-to-text and `eleven_turbo_v2_5` for text-to-speech at `mp3_44100_128`. They stream at `low` effort and send each complete sentence (split on `[.!?]+`) to TTS ([Realtime Voice Assistant](https://docs.inceptionlabs.ai/cookbooks/realtime-voice-assistant)). The prompt guide adds rules for spoken output: no Markdown, one question at a time, and spelling out numbers and IDs ([Prompt Guide](https://docs.inceptionlabs.ai/resources/prompt-guide)). ElevenLabs Agents and Vapi can connect through their "Custom LLM" settings pointed at `https://api.inceptionlabs.ai/v1` with model `mercury-3` ([ElevenLabs](https://docs.inceptionlabs.ai/integrations/elevenlabs), [Vapi](https://docs.inceptionlabs.ai/integrations/vapi)). LiveKit, Pipecat and Retell are mentioned, but no guide exists for them.

For the app, "voice mode" should be a **UI mode over `mercury-3`**, not a separate model. It means `realtime: true`, `instant` or `low` effort, and a voice system prompt. The browser's Web Speech API handles speech-to-text (the AI Elements `SpeechInput` component, which falls back to MediaRecorder and your own STT on Firefox/Safari). `speechSynthesis` or a server-side ElevenLabs route speaks each sentence. Strip Markdown before TTS regardless, because a live answer without the voice prompt contained `**18°C**`.

## Errors arrive in two shapes, and limits are per-minute tiers

| Status | Meaning | Retry? |
|---|---|---|
| 400 | Invalid request, incl. `context_length_exceeded`, `diffusing_not_supported`, **unknown model** | No |
| 401 | `invalid_api_key` | No |
| 402 | "Account is inactive" (billing or quota) | No |
| 404 | Model not found (documented; live returns 400) | No |
| 413 / 422 / 504 | Decisions body too large / invalid / timeout | — |
| 429 | `rate_limit_reached` | Exponential backoff |
| 500 / 502 / 503 | Server / bad upstream / engine overloaded | Exponential backoff |

Source: [Error Codes](https://docs.inceptionlabs.ai/resources/error-codes), [FAQ](https://docs.inceptionlabs.ai/resources/faq). The envelope is OpenAI's `{"error": {"message", "type", "param", "code"}}`, but **live validation errors return `message` as an array of Pydantic objects** (`[{type, loc, msg}]`), and other errors return it as a string. The normalizer must accept `string | Array<{msg}>` and join the `msg` values. Responses include `x-request-id` and `x-process-time` headers but **no `x-ratelimit-*` or `retry-after`**, so backoff has to be blind exponential. The rate limits are:

| Tier | Requests/min | Input tokens/min | Output tokens/min |
|---|---|---|---|
| Free | 1,000 | 1,000,000 | 100,000 |
| Pay As You Go | 3,000 | 3,000,000 | 300,000 |
| Enterprise | Custom | Custom | Custom |

Source: [Rate Limits](https://docs.inceptionlabs.ai/get-started/rate-limits). New accounts get a one-time credit of **100M free tokens**, and prefix-cache writes are free ([FAQ](https://docs.inceptionlabs.ai/resources/faq)). Keystroke-driven FIM is the likeliest source of 429s, which is why the client must abort stale requests.

## The upgrade spec: proxy routes, zustand chat, AI Elements, Monaco canvas

### Server layer: three routes behind one provider interface

Define one interface, `ChatProvider` / `FimProvider`, with a Mercury implementation selected by environment variable, so a replacement provider can be added by December 28. The three routes, each using `export const runtime = "nodejs"` and the key from `process.env` (the docs call it `INCEPTION_API_KEY`; this repo uses `DLLM_API_KEY`), are:

**`POST /api/chat`** takes `{messages, model, effort, diffusing, voice, tools?}` and builds the upstream body:

```ts
{ model: model ?? "mercury-3", messages, stream: true,
  stream_options: { include_usage: true },
  reasoning_effort: effort,                 // always explicit
  max_completion_tokens: effort === "instant" ? 8192 : Math.max(4000, userMax),
  diffusing, ...(voice && { realtime: true, temperature: 0.75 }) }
```

It then reads upstream SSE with a carry-over line buffer and `TextDecoder({stream:true})`, and re-emits the typed events from the diffusion section as `text/event-stream`. The headers are `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`. The route forwards `request.signal` to the upstream fetch so a Stop click cancels generation.

Tool loops run server-side and are capped at about five iterations. Streamed tool calls accumulate by `index`, and the final calls are keyed by `id`. Error responses go through the string-or-array normalizer, with retries on 429 and 5xx, up to three attempts with jittered backoff, but only before the first byte has streamed.

**`POST /api/fim`** takes `{prefix, suffix, language, mode: "line"|"block"}`. It trims the context, then calls `/v1/fim/completions` non-streaming with `mercury-edit-2`. Line mode uses `max_tokens: 64, stop: ["\n"]`. Block mode uses 256 tokens and the default stops. The route strips any overlap between the completion's end and the suffix's start and returns `{completion}`. It also passes the client abort through to upstream.

**`GET /api/models`** proxies `/v1/chat/completions/models` with a 1-hour cache and falls back to `["mercury-3"]`.

### Client state and AI Elements components

The AI Elements components are purely presentational. They import only *types* from `ai`, so they **do not require `useChat`** and can be driven from a zustand store ([vercel/ai-elements](https://github.com/vercel/ai-elements), [demo-cursor.tsx](https://github.com/vercel/ai-elements/blob/main/packages/examples/src/demo-cursor.tsx)). The store holds:

- `messages: {id, role, text, canvasFrames?, final?, toolCalls?, usage?}[]`
- `status: "ready" | "submitted" | "streaming" | "error"`
- `abort?: AbortController`
- the canvas document and settings (model, effort, diffusing, voice)

Each message subscribes through its own selector, and streamed deltas are batched per animation frame.

Install from the original `@ai-elements` registry, which shadcn's built-in registry index resolves, so `components.json` needs no change:

```
npx shadcn@latest add @ai-elements/conversation @ai-elements/message @ai-elements/prompt-input @ai-elements/reasoning @ai-elements/shimmer @ai-elements/code-block @ai-elements/artifact @ai-elements/model-selector @ai-elements/speech-input @ai-elements/context @ai-elements/suggestion
npx shadcn@latest add sidebar-07 resizable
```

Install soon, because **that registry is being deprecated at the end of November 2026** in favour of shadcn-native AI Elements patterns ([vercel/ai-elements README](https://github.com/vercel/ai-elements), [shadcn AI Elements](https://ui.shadcn.com/docs/ai-elements)). The copied source keeps working afterwards. The new patterns are the long-term path, but **`code-block` and `trace` return 404 for this repo's `new-york` (v4) style** ([shadcn registry](https://ui.shadcn.com/r/styles/new-york-v4/code-block.json)). The registry source is typed against `ai` v6, `shiki` 3 and `streamdown` ≥2.4, while npm currently has `ai` 7 and `shiki` 4. Run `tsc` after installing, and pin `ai@^6` or `shiki@3` if the type imports break.

Each piece of the UI maps to specific components:

| UI element | Components | Mercury-specific wiring |
|---|---|---|
| Thread | `Conversation`, `ConversationContent`, `ConversationScrollButton`, `Message from=…`, `MessageContent`, `MessageResponse` | While diffusion frames are still arriving, render them in a `<pre>` with no Markdown, then switch to `MessageResponse` on the final frame. |
| Thinking | `Reasoning` + `Shimmer` | Show "Thinking…" until the first byte. No reasoning text exists, so the panel shows `reasoning_tokens` from usage. |
| Actions | `MessageActions` / `MessageAction tooltip="Copy"`, retry, "Open in canvas" | "Open in canvas" extracts a fenced code block into the editor. |
| Input | `PromptInput onSubmit={({text}) => send(text)}`, `PromptInputTextarea`, `PromptInputTools` | `PromptInputSubmit status onStop={() => abort()}` |
| Model and effort | `ModelSelector` (from `/api/models`) plus a second select for `instant/low/medium/high`, and a "Diffusion view" switch | Hide effort `instant` for any future voice-enterprise id. |
| Voice | `SpeechInput onTranscriptionChange` (wrap the form in `PromptInputProvider`) plus a TTS toggle | Voice mode sets `realtime` and low effort, splits by sentence, and strips Markdown. |
| Cost | `Context` | Fed with nested usage and `/v1/models` prices |

### Code canvas: Monaco with an inline-completions provider

Use **Monaco through `@monaco-editor/react` 4.7.0**. React 19 is already within its peer range. Load it with `next/dynamic({ ssr: false })` and Monaco's default CDN loader, which avoids the Turbopack worker-bundling problems ([monaco-react](https://github.com/suren-atoyan/monaco-react)). Ghost text is built into Monaco's core API: `monaco.languages.registerInlineCompletionsProvider` gives you Tab to accept, Ctrl/Cmd+→ for partial accept, a `CancellationToken`, and `debounceDelayMs` ([monaco.d.ts 0.58](https://cdn.jsdelivr.net/npm/monaco-editor@0.58.0/monaco.d.ts)). CodeMirror 6 is lighter and better on mobile, but ghost text there depends on `@marimo-team/codemirror-ai` or a custom extension. The once-common `codemirror-copilot` has not been updated since January 2024.

The provider should be registered **once per Monaco instance** (not per editor) and disposed on unmount, so React 19 StrictMode's double mount does not create duplicate ghost text. Its `debounceDelayMs` is 200. In `provideInlineCompletions` it computes `prefix = text.slice(0, offset)` and `suffix = text.slice(offset)` and chooses line or block mode: block when the cursor sits on an empty line after an opening `{`/`:`, line otherwise. It skips the request when the text right after the cursor is anything other than whitespace or closing brackets. It links `token.onCancellationRequested` to an `AbortController` and returns `{items: [{insertText, range: cursorRange}]}`. `disposeInlineCompletions` is required, even as a no-op. A small client cache keyed by the prefix lets typed characters that match the current ghost text consume it without a new request.

The editor options are `automaticLayout: true`, `inlineSuggest: {enabled: true, showToolbar: "onHover"}`, and `minimap: {enabled: false}`. Monaco cannot read the `oklch()` CSS variables, so the theme comes from `defineTheme` with hex colours resolved from the shadcn tokens.

A later "Next Edit" mode can call `/api/next-edit`. It would send the nine-tag prompt built from Monaco's undo history (as unified diffs) and a 15-line region around the cursor, then show the result as a diff decoration accepted with Tab. Without streaming, expect about 0.6 s per suggestion.

The layout is shadcn `SidebarProvider` + `sidebar-07` (the chat list) + `SidebarInset`, containing a horizontal `ResizablePanelGroup`. The chat panel uses `defaultSize="45%"`, and the canvas panel uses `defaultSize="55%"`, `collapsible`, and `Artifact` → `ArtifactContent className="h-full min-h-0"` → the editor. Under react-resizable-panels v4, **plain numeric sizes are pixels**, so percentages must be written as strings, and the props are `orientation=`, not `direction=` ([react-resizable-panels](https://github.com/bvaughn/react-resizable-panels), [shadcn Resizable](https://ui.shadcn.com/docs/components/radix/resizable.md)). Persist the layout with `onLayoutChanged` to avoid layout shift on SSR.

## Conclusion

Mercury's distinctive feature, diffusion decoding, shows up at the API mostly as **speed rather than as new semantics**. Blocks are larger than tokens, first bytes arrive in under a second, and FIM finishes in about half a second. The one diffusion-native feature, `diffusing`, is a cosmetic replay that arrives in bursts too fast to see unless the client deliberately slows it down. The engineering effort therefore belongs in pacing frames and handling replace semantics, not in new protocol work. Everything else (tools, JSON schema, usage, errors) is OpenAI-compatible apart from a handful of undocumented differences that live tests caught and the docs do not mention.

The shutdown date changes what counts as a good implementation. Coupling the app tightly to Mercury-only fields would leave dead code in January. The defensible design keeps those fields (`diffusing`, `realtime`, `reasoning_effort: "instant"`, `mercury-edit-2` FIM) behind capability flags on a provider interface. It renders diffusion as an optional view mode, and it keeps FIM behind a `/api/fim` contract that any FIM-capable model (Codestral-style or another dLLM) can fill. Built that way, the AI Elements chat, the Monaco canvas and the ghost-text autocomplete outlive the provider that inspired them. Mercury's 100M free tokens and launch pricing make the remaining weeks a cheap way to tune the UX against the fastest backend currently available.
