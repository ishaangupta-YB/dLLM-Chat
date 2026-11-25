# Inception Mercury API: Streaming & Diffusion ("diffusing") Wire Format

Researched 2026-11-24. Sources: the official docs (fetched as raw Markdown from `docs.inceptionlabs.ai/*.md`), the OpenAPI spec at `https://api.inceptionlabs.ai/openapi.json`, and **live requests sent to `https://api.inceptionlabs.ai/v1/chat/completions` on 2026-11-24 between 19:05 and 19:07 UTC**, authenticated with `$DLLM_API_KEY`. Everything labeled "LIVE" comes from those captures.

> **Business-critical context:** the docs say the Mercury API is winding down. It "will remain **fully available through December 28, 2026**. After this date... API requests stop being served" — [Mercury API wind-down](https://docs.inceptionlabs.ai/support/wind-down.md). An app built on it today has about 5 weeks of service left.

## Q1. Which request flags enable streaming and diffusion mode?

### Takeaway
Use `stream: true` for normal block streaming. Add `diffusing: true` to get the denoising visualization. `diffusing` only works when `stream` is true: a non-streaming request with it gets a 400 error. Add `stream_options: {"include_usage": true}` to get a final usage chunk. The newest chat model is `mercury-3`. Prefer `max_completion_tokens` over `max_tokens`, which is deprecated.

### Cited Findings
- Endpoint: `POST https://api.inceptionlabs.ai/v1/chat/completions`, with headers `Authorization: Bearer <key>` and `Content-Type: application/json`. The API is OpenAI-compatible, and "existing OpenAI SDKs work by pointing them at `https://api.inceptionlabs.ai/v1`" — [Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming.md), [SDKs](https://docs.inceptionlabs.ai/get-started/sdks.md)
- Request schema fields, quoted from the OpenAPI `ChatCompletionRequest`: `stream` (boolean, default false, "Whether to stream the response."); `stream_options` ($ref StreamOptions); `diffusing` (boolean, default false, "Whether to show the diffusion effect in the streamed response."); `realtime` (boolean, default false, "Enable flag for more realtime workloads that require lower TTFT/TTFAT."); `reasoning_effort` (enum `instant|low|medium|high`); `reasoning_summary` (bool); `reasoning_summary_wait` (bool); `extra_body` (OpenAI-compat passthrough); `tools`; `tool_choice`; `response_format` — [Create a chat completion](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md)
- `StreamOptions.include_usage`: "If true, an additional chunk is streamed before the `data: [DONE]` message containing the token usage statistics for the entire request. Inside that chunk, `choices` is an empty array and the `usage` field is populated." — [API ref](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md). The FAQ repeats this: "For streaming (`stream: true`), set `stream_options.include_usage: true` to receive a final usage chunk before `data: [DONE]`." — [FAQ](https://docs.inceptionlabs.ai/resources/faq.md)
- `max_completion_tokens`: "An upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens. Supersedes `max_tokens`." Maximums are 50,000 for `mercury-2`, 65,536 for `mercury-2.5` and 131,072 for `mercury-3`. Defaults for `mercury-3` when neither budget field is set: 24,576; 8,192 with `instant`; 65,536 with `medium`; 131,072 with `high`. `max_tokens` is marked `deprecated: true` — [API ref](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md)
- Temperature range is 0.5–1. For `mercury-3` the default is 1, and "out-of-range values are reset to 1 with a `warning` in the response" — [API ref](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md)
- The model list from `GET https://api.inceptionlabs.ai/v1/models` (LIVE) has chat models `mercury-2` (128K context, 50,000 max output), `mercury-2.5` (260K, 65,536) and `mercury-3` (1,000,000, 131,072), each with `supported_features: ["tools","json_mode","structured_outputs"]`. It also lists `mercury-decide`, which uses the decisions endpoint only, with "Streaming is not supported". **`diffusing` is not listed as a feature flag for any model** — [LIVE /v1/models]; [Models](https://docs.inceptionlabs.ai/get-started/models.md)
- The Models doc also lists a "Mercury Voice" chat model, but **it did not appear in the live `/v1/models` response**, and I did not find its id — [Models](https://docs.inceptionlabs.ai/get-started/models.md)
- LIVE: `diffusing: true` without `stream` returns `{"error":{"message":"Diffusing is not supported for non-streaming requests","type":"invalid_request_error","param":"diffusing","code":"diffusing_not_supported"}}`
- Response headers (LIVE, both modes): `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache`, `server: uvicorn`, `x-request-id: <uuid>`, served through CloudFront.

### Inferences
- Recommended proxy request body: `{"model":"mercury-3","messages":[...],"max_completion_tokens":N,"stream":true,"diffusing":<bool>,"stream_options":{"include_usage":true},"reasoning_effort":"instant"|"low"|...}`. Inception-specific fields (`diffusing`, `realtime`, `reasoning_summary`) must go through `extra_body` with the OpenAI SDK. They can be sent top-level with the `inceptionai` SDK or raw fetch.

### Gaps
- I did not test the `realtime` flag, and the docs say nothing about how it affects chunk cadence.
- The Mercury Voice model id is unknown and not present in `/v1/models`.

## Q2. Exact SSE semantics: replace vs. append, chunk JSON, count, final chunk, [DONE], usage, finish_reason

### Takeaway
**Normal streaming uses APPEND semantics.** Each `choices[0].delta.content` is a new block of text, sometimes split mid-word, and you concatenate them. **Diffusing mode uses REPLACE semantics.** Each content chunk holds the **entire current canvas from character 0**, including random-character "noise" for positions not yet denoised. The canvas grows block by block. Earlier, already-clean text can show noise again in later frames. The frame with `diffusion_meta.diffusion_progress: 1.0` is the clean final text. After the content frames, in order, come an optional `reasoning_details` chunk (no `content` key), a finish chunk with empty `delta` and `finish_reason`, an optional usage chunk with `choices: []`, then `data: [DONE]`.

### Cited Findings (docs)
- Streaming page: "Get responses block-by-block... A 'block' is a chunk of refined text the model emits as it decodes, rather than one token at a time." — [Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming.md)
- Diffusion: "Set `diffusing` to `true` to stream the model's intermediate denoising steps. Each chunk contains the full text as it is refined into the final answer." and "The diffusing effect is best shown by overwriting the displayed text on each step." — [Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming.md)
- 200 response with `stream=true`: "a server-sent events stream of `ChatCompletionChunk` objects (terminated by `data: [DONE]`)". The spec sets `x-stainless-stream-terminator: '[DONE]'` — [API ref](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md)
- `ChatCompletionChunk` schema: `id`, `object` (const `chat.completion.chunk`), `created`, `model`, `choices[]` (`ChunkChoice`), and `reasoning_summary` ("included in final chunk if available"). `ChunkChoice` has `index`, `delta`, and `finish_reason` ∈ `stop|length|tool_calls|content_filter|null`. `ChunkDelta` has `content` (string|null, "The partial content of the message."), `role` ("typically only in the first chunk") and `tool_calls` (ToolCallDelta[]|null) — [API ref](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md)
- **The schema does not document** the `diffusion_meta`, `usage`/`server_timing` and `delta.reasoning_details` fields seen live (below). Treat their exact shape as observed behavior, not a contract.

### Cited Findings (LIVE captures, mercury-3, 2026-11-24)

**Wire framing:** each event is one line `data: <json>\n` followed by a blank line, so events are separated by `\n\n`. There are no `event:` or `id:` lines and no keep-alive comments in any capture. The JSON uses Python-style `", "` / `": "` separators. The stream ends with `data: [DONE]\n\n`.

**Capture A: plain streaming** (`stream:true`, `include_usage:true`, `max_completion_tokens:200`, prompt "Name three colors, one sentence."). Complete capture, 6 events, TTFB 0.77 s, total 0.94 s:
```
data: {"id": "chatcmpl-f3f83cef-32d1-43b3-8968-ec5be08d0037", "object": "chat.completion.chunk", "created": 1795547149, "model": "mercury-3", "choices": [{"index": 0, "delta": {"content": "The sky is blue, the grass is green, and a", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null}

data: {"id": "chatcmpl-f3f83cef-...", "object": "chat.completion.chunk", "created": 1795547149, "model": "mercury-3", "choices": [{"index": 0, "delta": {"content": " rose is red.", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null}

data: {"id": "chatcmpl-f3f83cef-...", "object": "chat.completion.chunk", "created": 1795547149, "model": "mercury-3", "choices": [{"index": 0, "delta": {"role": "assistant", "reasoning_details": [{"type": "reasoning.encrypted", "data": "mrt1_v1_wEbvRj9M…(opaque, truncated)", "format": "mercury-v1", "index": 0}]}, "finish_reason": null}]}

data: {"id": "chatcmpl-f3f83cef-...", "object": "chat.completion.chunk", "created": 1795547149, "model": "mercury-3", "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}

data: {"id": "chatcmpl-f3f83cef-...", "object": "chat.completion.chunk", "created": 1795547149, "model": "mercury-3", "choices": [], "usage": {"prompt_tokens": 9, "completion_tokens": 55, "total_tokens": 64, "prompt_tokens_details": {"cached_tokens": 0}, "completion_tokens_details": {"reasoning_tokens": 33}}, "server_timing": {"server_latency_ms": 611.79}}

data: [DONE]
```
The final text is the concatenation of the two blocks: "The sky is blue, the grass is green, and a" + " rose is red." Blocks split mid-phrase, which confirms append. A longer plain response (about 180 visible tokens) arrived as 3 content blocks of 224, 561 and 205 chars at 848, 988 and 1055 ms. With `reasoning_effort:"instant"` and no `include_usage` it arrived as 4 blocks (454, 427, 207, 15 chars) at 466, 638, 727 and 727 ms, followed by `finish_reason:"stop"` and `[DONE]` with **no usage chunk**.

**Capture B: diffusing, short** (same prompt plus `diffusing:true`). Complete capture, 7 events, TTFB 0.59 s:
```
data: {"id": "chatcmpl-0ae65da5-0dfe-4e8b-adb7-ebd5f4235b3a", "object": "chat.completion.chunk", "created": 1795547150, "model": "mercury-3", "choices": [{"index": 0, "delta": {"content": "The three Gx9cD; I would nC@k are crimson, sapphire, and emera@wR Jhich togeth_[ avok- M Y5K3 n9d", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}

data: {"id": "chatcmpl-0ae65da5-...", ..., "choices": [{"index": 0, "delta": {"content": "T'4 Ghree colors I woTZ% 2Yqe [~# crimson, sapp;tkBE an$ f}_|/,*6 w0;kx 9og~&Zdr evoke a rich and", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}

data: {"id": "chatcmpl-0ae65da5-...", ..., "choices": [{"index": 0, "delta": {"content": "The three colors I would name are crimson, sapphire, and emerald, which together evoke a rich and vibrant palette.", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 1.0}}

data: {"id": "chatcmpl-0ae65da5-...", ..., "choices": [{"index": 0, "delta": {"role": "assistant", "reasoning_details": [{"type": "reasoning.encrypted", "data": "mrt1_v1_HGbR…(opaque)", "format": "mercury-v1", "index": 0}]}, "finish_reason": null}]}

data: {"id": "chatcmpl-0ae65da5-...", ..., "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}

data: {"id": "chatcmpl-0ae65da5-...", ..., "choices": [], "usage": {"prompt_tokens": 10, "completion_tokens": 122, "total_tokens": 132, "prompt_tokens_details": {"cached_tokens": 0}, "completion_tokens_details": {"reasoning_tokens": 97}}, "server_timing": {"server_latency_ms": 326.39}}

data: [DONE]
```

**Capture C: diffusing, long** (`reasoning_effort:"instant"`, "Write a 500-word short story about a lighthouse keeper.", `max_completion_tokens:3000`). 25 content frames, 28 events in total. First 3 and last 5 are shown, with long contents truncated. The leading number is client-side arrival time.
```
   713.9ms data: {"id": "chatcmpl-b0c2e006-...", "object": "chat.completion.chunk", "created": 1795547217, "model": "mercury-3", "choices": [{"index": 0, "delta": {"content": "Tj( ninH +Ms a living t(g$l KE the point, a \"QQ.ling beast th=( t,QK; salt y+G spraR )mai …[TRUNCATED, full len 367 chars]… ng at his hip, =zoKnVv & K5aky", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}
   713.9ms data: {..., "created": 1795547216, ..., "delta": {"content": "The wind was a l2HDOg thing [S tD2 hoint, a sn]K6=ng beast that t;[(h jdoS Tnd spray ag'35 …[TRUNCATED, full len 367 chars]… ng at Mng (WnH 5tLE:}l k shaky", ...}, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}
   713.9ms data: {..., "delta": {"content": "Tj( ninH +Ms a living t(g$l KE the point, a \"QQ.ling beast th=( ... …[TRUNCATED, full len 680 chars]…  a giant QrgDl o/ V8^ crys**+!", ...}, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}
   ... (19 more frames; canvas lengths 680, 978, 978, 1326, 1326, 1667, 1667, 1954, 1954, 2294, 2294, 2681, 2681, 3090, 3090, 3427, 3427, 3863, 3863 ...) ...
  2605.2ms data: {..., "delta": {"content": "The wind was a living thing on the point, a snarling beast that threw salt and spray again …[TRUNCATED, full len 4284 chars]… Vght, he knew hi\\ _V9e ORmter", ...}, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}
  2605.3ms data: {..., "delta": {"content": "The wind was a living thing on the point, a snarling beast that threw salt and spray again …[TRUNCATED, full len 4285 chars]… ight, he knew his true master.", ...}, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 1.0}}
  2605.4ms data: {..., "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}
  2606.1ms data: {..., "choices": [], "usage": {"prompt_tokens": 11, "completion_tokens": 1007, "total_tokens": 1018, "prompt_tokens_details": {"cached_tokens": 0}, "completion_tokens_details": {"reasoning_tokens": 0}}, "server_timing": {"server_latency_ms": 2375.96}}
  2606.1ms data: [DONE]
```

**Observed diffusing semantics (LIVE):**
- Every content frame starts at character 0 of the answer and grows as new blocks are added: 367 → 680 → 978 → … → 4285 chars. **Replace, never append.**
- Frames arrive in **bursts of about 2–3 within a millisecond**, with roughly 150–250 ms gaps between bursts. Example arrival times: 714, 714, 714, 898, 1047, 1047, 1048, 1214, 1381 ms, and so on. Short answers (one block) produce only **3–5 frames, all within about 1 ms**, so the effect would be invisible if rendered as received.
- The noise is cosmetic and not monotonic. Within a burst, frames alternate between different scrambles of the same text. In the instant capture, frame 1 was `'k iYbfusio| s4!*...'` and frame 2 reverted to frame 0's `'_ _f28(Uion lanD/...'` prefix. Earlier blocks that were clean in one frame show noise again in later frames ("The wind was a GlUiu<" at 1047 ms, then "The winb Xxs a nhQAng" at 1214 ms). Even the second-to-last frame still had noise near the end.
- `diffusion_meta.diffusion_progress` was **0.0 on every frame except the last, which was 1.0**. It is not a smooth progress value. `diffusion_meta.diffusion_content` was always `true` on content frames.
- `created` can differ by 1 s between frames of the same stream (1795547217 vs 1795547216).
- The reasoning phase streams **nothing**: no reasoning text and no progress events. The first event arrives only after reasoning finishes, so the high-reasoning test had TTFB of about 2.15 s against about 0.7 s for instant. The `reasoning_details` chunk (encrypted, `format: "mercury-v1"`) comes after the content and before the finish chunk. It was absent with `reasoning_effort:"instant"` (reasoning_tokens 0).
- **Budget pitfall (LIVE):** with the default effort and `max_completion_tokens:600`, reasoning used all 570 completion tokens. The stream then contained **no content at all**, only `reasoning_details`, then `finish_reason:"length"`, usage and `[DONE]`. Reasoning tokens count against `max_completion_tokens`.
- `reasoning_summary: true` plus `reasoning_summary_wait: true` (medium effort) still returned `"reasoning_summary": null` on every chunk in my test. I could not confirm whether summaries are produced at all.

### Inferences
- A browser needs a **frame scheduler** for a visible denoise effect. Queue the frames on the client and show each for about 30–60 ms with `requestAnimationFrame`, instead of rendering each burst at once. Never let a late noisy frame overwrite the final text: once a frame with `diffusion_progress === 1` arrives (or the finish chunk), lock in that text.
- Treat `diffusion_meta.diffusion_content === true` as the marker for a canvas frame, so chunks without it (the `reasoning_details` chunk, the finish chunk) never clear the canvas.
- The canvas can get long (about 4.3 KB per frame for 1000 tokens, more for long answers), so a 10k-token answer means hundreds of KB per frame. Diffusing mode multiplies bandwidth roughly by the number of frames. Avoid re-running a markdown parser on every frame: render noisy frames as plain text and parse markdown only on the final frame.

### Gaps
- It is unverified whether multiple `choices` (`n>1`) are supported in either mode. The `n` parameter does not appear in the request schema.
- I saw no error event in the middle of a stream, so its format is unknown. Assume a non-2xx JSON `{"error":{message,type,param,code}}` before any streaming starts.

## Q3. Interaction with tools, reasoning, and models; which models support diffusing

### Takeaway
Diffusing worked on all three chat models (`mercury-3`, `mercury-2.5`, `mercury-2`). With tools, diffusing still tags chunks with `diffusion_meta`, but the **tool-call arguments stream as OpenAI-style deltas (append)**, while `content` is `""`. The finish reason is `tool_calls`. Reasoning is hidden (encrypted) and delays the first frame.

### Cited Findings
- LIVE, tools plus diffusing on mercury-3 (`get_weather` tool, "What is the weather in Paris?"):
```
data: {..., "choices": [{"index": 0, "delta": {"content": "", "role": "assistant", "tool_calls": [{"index": 0, "id": "call_84bda24a2ac30fd3", "type": "function", "function": {"name": "get_weather", "arguments": null}}]}, "finish_reason": null}], "reasoning_summary": null, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}
data: {..., "delta": {"content": "", "role": "assistant", "tool_calls": [{"index": 0, "id": null, "type": "function", "function": {"name": null, "arguments": "{\"city\": \"Paris"}}]}, ... "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}
data: {..., "delta": {"content": "", "role": "assistant", "tool_calls": [{"index": 0, "id": null, "type": "function", "function": {"name": null, "arguments": "\"}"}}]}, ... "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}
data: {..., "delta": {"role": "assistant", "reasoning_details": [{"type": "reasoning.encrypted", ...}]}, "finish_reason": null}]}
data: {..., "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]}
data: {..., "choices": [], "usage": {"prompt_tokens": 269, "completion_tokens": 65, "total_tokens": 334, "prompt_tokens_details": {"cached_tokens": 9}, "completion_tokens_details": {"reasoning_tokens": 23}}, "server_timing": {"server_latency_ms": 198.5}}
data: [DONE]
```
  The arguments concatenate to `{"city": "Paris"}`. The first tool-call delta carries `id` and `name`, and later ones carry only `arguments`. This is the standard OpenAI accumulation pattern.
- LIVE, mercury-2 diffusing: 3 frames (24, 24, 38 chars), progress 0.0, 0.0, 1.0, then a `reasoning_details` chunk, `stop` and `[DONE]`. mercury-2.5 diffusing: 4 frames (12, 12, 40, 40 chars), and its content begins with `"\n\n"`. Same structure for both.
- `reasoning_effort` applies to `mercury-3`, `mercury-2.5` and `mercury-2`, with values `instant` (lowest latency, "Voice, realtime turns"), `low`, `medium` and `high`. "If `reasoning_effort` is omitted, `mercury-3` defaults to `low`, while `mercury-2.5` and `mercury-2` default to `medium`." — [Reasoning Efforts](https://docs.inceptionlabs.ai/capabilities/reasoning-efforts.md). This **conflicts with** the OpenAPI schema, which gives `default: medium` for `reasoning_effort` with no per-model note — [API ref](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md)
- Usage response fields: `usage.completion_tokens_details.reasoning_tokens` and `usage.prompt_tokens_details.cached_tokens` (LIVE). The API reference example instead shows flat `reasoning_tokens` and `cached_input_tokens`, so the doc example and the live wire format differ — [API ref](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion.md)

### Inferences
- For multi-turn conversations with reasoning models, the encrypted `reasoning_details` may need to be sent back on the assistant message, as with OpenRouter's convention. I did not verify this. It is probably safe to drop it for a simple chat UI.
- A UI with tools plus diffusing should run the canvas renderer on `content` and a separate append accumulator on `tool_calls`. It should ignore `content: ""` frames when no text canvas exists yet, so it doesn't flash an empty bubble.

### Gaps
- I did not test whether a turn that mixes text and tool calls in diffusing mode sends noisy text and tool calls together.
- No documentation states which models support diffusing. Support on all three chat models is based only on the live tests above.

## Q4. Recommended client-handling code from the docs (verbatim)

### Takeaway
The docs give curl, Python and TS examples for both modes, plus one browser JS snippet that overwrites the text per chunk. The JS snippet has a framing bug: it doesn't buffer partial lines across `read()` calls. A production client should buffer.

### Cited Findings (all verbatim from [Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming.md))

Streaming, Python:
```python
from inceptionai import Inception

client = Inception()  # reads INCEPTION_API_KEY from the environment

stream = client.chat.completions.create(
    model="mercury-3",
    messages=[{"role": "user", "content": "What is a diffusion model?"}],
    max_completion_tokens=1000,
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```
Streaming, TypeScript:
```typescript
import Inception from 'inceptionai';

const client = new Inception(); // reads INCEPTION_API_KEY from the environment

const stream = await client.chat.completions.create({
  model: 'mercury-3',
  messages: [{ role: 'user', content: 'What is a diffusion model?' }],
  max_completion_tokens: 1000,
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta.content ?? '');
}
```
Diffusion, cURL:
```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INCEPTION_API_KEY" \
  -d '{
    "model": "mercury-3",
    "messages": [
      {"role": "user", "content": "What is a diffusion model?"}
    ],
    "max_completion_tokens": 1000,
    "stream": true,
    "diffusing": true
  }'
```
Diffusion, Python:
```python
from inceptionai import Inception

client = Inception()  # reads INCEPTION_API_KEY from the environment

stream = client.chat.completions.create(
    model="mercury-3",
    messages=[{"role": "user", "content": "What is a diffusion model?"}],
    max_completion_tokens=1000,
    stream=True,
    diffusing=True,
)
for chunk in stream:
    # In diffusing mode each chunk is the full text as it is denoised
    print(chunk.choices[0].delta.content or "", flush=True)
```
Diffusion, TypeScript:
```typescript
import Inception from 'inceptionai';

const client = new Inception(); // reads INCEPTION_API_KEY from the environment

const stream = await client.chat.completions.create({
  model: 'mercury-3',
  messages: [{ role: 'user', content: 'What is a diffusion model?' }],
  max_completion_tokens: 1000,
  stream: true,
  diffusing: true,
});
for await (const chunk of stream) {
  // In diffusing mode each chunk is the full text as it is denoised
  console.log(chunk.choices[0]?.delta.content ?? '');
}
```
Web app, browser JS ("The diffusing effect is best shown by overwriting the displayed text on each step"):
```javascript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullContent = '';
while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        if (trimmed === 'data: [DONE]') continue;
        const jsonStr = trimmed.substring(6);
        if (!jsonStr.startsWith('{')) continue;
        try {
            const data = JSON.parse(jsonStr);
            
            for (const choice of data.choices || []) {
                if (choice.delta && choice.delta.content !== null && choice.delta.content !== undefined) {
                    fullContent = choice.delta.content || '';
                    contentElement.textContent = fullContent;
                }
            }
        } catch (error) {
            console.error('Parsing error:', error);
        }
    }
}
```
- SDK packages: `pip install inceptionai` and `npm install inceptionai`. The SDKs read `INCEPTION_API_KEY` — [Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming.md), [SDKs](https://docs.inceptionlabs.ai/get-started/sdks.md)

### Inferences
- Bugs in the doc snippet for production use: (1) `decoder.decode(value)` without `{stream:true}` and with no carry-over buffer, so a JSON line split across two network reads gets dropped as a parse error. Diffusing frames are 4 KB or more, so this will happen. Keep a `buffer`, split on `\n`, and keep the last partial line. (2) It would also set the canvas to `""` on tool-call frames, which have `content: ""`.
- A Next.js route handler can pass the upstream `response.body` straight through, returning `new Response(upstream.body, {headers: {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no'}})`, or it can re-frame into its own event types (e.g. `{"type":"canvas","text":...}` vs `{"type":"delta","text":...}`). Re-framing on the server keeps the key server-side and hides the undocumented `diffusion_meta` and `reasoning_details` fields from the client.

### Gaps
- No Inception blog post on diffusion visualization turned up. The only official guidance is the streaming page.

## Q5. Latency/throughput numbers relevant to UI rendering

### Takeaway
Vendor claim: about 1,068 tok/s for Mercury 3. Live end-to-end numbers for small requests: TTFB of about 0.45–0.85 s with instant/low effort and about 2.15 s with high effort, then content blocks every 70–200 ms. The whole answer usually finishes within a few hundred ms to about 2.6 s, so the UI has to pace rendering for the diffusion effect to be visible.

### Cited Findings
- Inception says Mercury 3 (launched Oct 19, 2026) reaches 1,068 tokens per second on Nvidia GPUs. This is vendor-reported — [TechRepublic](https://www.techrepublic.com/article/news-inception-mercury-3-ai-speed/). No independent testing has been published — [Let's Data Science](https://letsdatascience.com/news/inception-releases-mercury-3-diffusion-llm-claiming-1000-tok-cb32df3e). The GPU configuration is undisclosed, and tok/s doesn't capture time to first usable text — [AlphaSignal](https://alphasignal.ai/news/inception-s-mercury-3-hits-1-068-tokens-per-second-beating-gpt-6-luna). A third-party test measured about 850–900 tok/s of visible streamed text — [HackerNoon](https://hackernoon.com/the-ai-model-that-promised-to-crush-gpt-6-has-a-surprising-weakness)
- LIVE timings (client in a cloud container going through a proxy, single requests, not a benchmark):
  - Plain, low/default effort, 55 completion tokens: TTFB 0.77 s, total 0.94 s, `server_latency_ms` 611.79.
  - Plain, default effort, 481 completion tokens (301 reasoning): first block at 848 ms, last at 1055 ms, `server_latency_ms` 867.1.
  - Plain, instant, about 184 tokens: first block at 466 ms, done at 733 ms.
  - Diffusing, instant, 184 tokens: 5 frames, all between 870 and 901 ms. `server_latency_ms` 678.63.
  - Diffusing, high, 1,404 completion tokens (1,237 reasoning): first frame at 2,151 ms, all 4 frames within 2.5 ms.
  - Diffusing, instant, 1,007 tokens (story): 25 frames from 714 ms to 2,605 ms, which is about 530 tok/s of visible output after first frame and about 390 tok/s wall-clock including TTFB.
- Rate limits per minute: Free tier 1,000 requests, 1,000,000 input tokens and 100,000 output tokens. Pay As You Go 3,000 / 3,000,000 / 300,000 — [Rate Limits](https://docs.inceptionlabs.ai/get-started/rate-limits.md)
- `usage` also includes an undocumented `server_timing.server_latency_ms` (LIVE).

### Inferences
- The UI should show a "thinking" indicator until the first frame, since reasoning is silent and can take more than 2 s at high effort. It should also animate queued diffusion frames at a fixed cadence. Normal streaming blocks are large (200–560 chars), so to make them look like smooth typing, reveal the appended text over the gap until the next block (about 100–170 ms).
- Use `reasoning_effort: "instant"` or `"low"` for snappy chat. Set `max_completion_tokens` generously (e.g. ≥ 4,000 unless `instant`) so reasoning can't use up the budget and return an empty answer with `finish_reason: "length"`.

### Gaps
- No official tokens/sec figure appears in the docs themselves. The 1,068 tok/s figure comes from press coverage of vendor claims.
- I measured no concurrency or long-output (>1k tokens) performance.
