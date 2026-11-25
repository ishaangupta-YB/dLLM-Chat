# Inception Labs Mercury API: core reference (models, auth, chat completions, parameters, errors, limits)

Research date: 2026-11-24. Main sources: the docs site (llms.txt, llms-full.txt, sitemap.xml), the OpenAPI spec at https://api.inceptionlabs.ai/openapi.json (title "Inception API", version 1.0.0), and live calls made today with the key in `$DLLM_API_KEY`. The key value was never printed or saved.

**CRITICAL HEADLINE: THE MERCURY API IS WINDING DOWN.** It "remains fully available through **December 28, 2026**". After that date "API requests stop being served, and you lose access to the platform and to any data submitted to it." That is about 34 days after today. Source: [Wind-down](https://docs.inceptionlabs.ai/support/wind-down). The same banner appears on [Quick Start](https://docs.inceptionlabs.ai/get-started) and the [docs index](https://docs.inceptionlabs.ai/index).

## Q1. What is every page on docs.inceptionlabs.ai? (full sitemap)

### Takeaway
The docs are a Mintlify site. sitemap.xml lists 45 URLs. llms.txt also lists 4 more: resources/chat, support/support, support/tou and support/privacy. Together that is 49 pages, plus the OpenAPI spec. There is no changelog or release-notes page.

### Cited Findings
- Machine-readable indexes: https://docs.inceptionlabs.ai/llms.txt (8,316 bytes), https://docs.inceptionlabs.ai/llms-full.txt (215,698 bytes, the full text of every page) and https://docs.inceptionlabs.ai/sitemap.xml. All three returned HTTP 200 on 2026-11-24 — [llms.txt](https://docs.inceptionlabs.ai/llms.txt)
- The FAQ says the docs site "does not block crawlers or agent traffic" — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- OpenAPI spec: https://api.inceptionlabs.ai/openapi.json (78,807 bytes) — [llms.txt](https://docs.inceptionlabs.ai/llms.txt)
- Full URL list from sitemap.xml plus llms.txt ([sitemap](https://docs.inceptionlabs.ai/sitemap.xml)). Appending `.md` to any page URL gives its markdown.
  - Home: https://docs.inceptionlabs.ai (also /index)
  - Get started:
    - https://docs.inceptionlabs.ai/get-started
    - /get-started/authentication
    - /get-started/models
    - /get-started/sdks
    - /get-started/rate-limits
  - API reference:
    - /api-reference/chat/create-a-chat-completion
    - /api-reference/decisions/create-a-decision
    - /api-reference/fim/create-a-fill-in-the-middle-completion
    - /api-reference/edit/create-a-code-edit-completion
    - /api-reference/models/list-available-models
    - /api-reference/models/list-chat-models
    - /api-reference/models/list-fim-models
    - /api-reference/models/list-edit-models
  - Capabilities:
    - /capabilities/reasoning-efforts
    - /capabilities/streaming
    - /capabilities/tool-use
    - /capabilities/structured-outputs
    - /capabilities/decisions
    - /capabilities/extract
    - /capabilities/fim
    - /capabilities/next-edit
  - Use cases: /usecases/voice
  - Cookbooks:
    - /cookbooks/search-agent-mercury
    - /cookbooks/customer-support-agent-mercury
    - /cookbooks/realtime-voice-assistant
    - /cookbooks/natural-language-sql-agent
    - /cookbooks/coding-agent-mercury-tool-calling
  - Integrations:
    - /integrations/claude-code
    - /integrations/hermes
    - /integrations/cursor
    - /integrations/zed
    - /integrations/kilo-code
    - /integrations/opencode
    - /integrations/open-claw
    - /integrations/langchain
    - /integrations/elevenlabs
    - /integrations/vapi
  - Resources:
    - /resources/prompt-guide
    - /resources/chat (content is empty in llms-full)
    - /resources/error-codes
    - /resources/faq
  - Support:
    - /support/wind-down
    - /support/support
    - /support/tou
    - /support/privacy
- The API reference pages are thin wrappers that render the OpenAPI operations. The real detail is in openapi.json — [Create a chat completion](https://docs.inceptionlabs.ai/api-reference/chat/create-a-chat-completion)

### Inferences
- There is no changelog page. Model-release history has to come from the blog or the press.

### Gaps
- The marketing blog at https://www.inceptionlabs.ai/blog is rendered client-side, so curl could not get post content. Release dates below come from press coverage.

## Q2. Which model ids exist right now, and which is newest?

### Takeaway
The newest model is **`mercury-3`**, launched October 2026. It has a 1M context window, up to 131,072 output tokens, tool calling, structured outputs and `reasoning_effort` with levels `instant|low|medium|high` (default `low` per the docs). The other chat models are `mercury-2.5` and `mercury-2`, both previous generation. `mercury-voice` is enterprise-only. Live, `/v1/chat/completions/models` returns **only `mercury-3`**. The validator still accepts legacy ids: `mercury`, `mercury-coder`, `mercury-coder-small`, `mercury-small` and two `mercury-3-preview-*` ids.

### Cited Findings
**Models table from the docs** ([Models](https://docs.inceptionlabs.ai/get-started/models)). Prices are per 1M tokens. Strikethrough prices are the regular list price; the current price is the launch discount.

| Model (id) | Input | Cached input | Output | Endpoint | Context | Max output | Features |
|---|---|---|---|---|---|---|---|
| Mercury 3 (`mercury-3`) | ~~$0.20~~ **$0.10** | ~~$0.02~~ **$0.01** | ~~$0.70~~ **$0.35** | v1/chat/completions | 1M | 131,072 | Tool Calling, Structured Outputs; Text |
| Mercury Voice (`mercury-voice`, enterprise) | ~~$0.40~~ **$0.20** | ~~$0.04~~ **$0.02** | ~~$1.50~~ **$0.75** | v1/chat/completions | 128K | 50,000 | Tool Calling, Structured Outputs |
| Mercury Decide (`mercury-decide`) | ~~$0.04~~ **$0.02** | $0 | $0 | v1/decisions | — | — | Classification, Scoring, Extraction; Text/JSON/Image |
| Mercury 2.5 (`mercury-2.5`) | $0.20 | $0.02 | $0.75 | v1/chat/completions | 260K | 65,536 | Tool Calling, Structured Outputs |
| Mercury 2 (`mercury-2`) | $0.25 | $0.025 | $0.75 | v1/chat/completions | 128K | 50,000 | Tool Calling, Structured Outputs |
| Mercury Edit 2 (`mercury-edit-2`) | $0.25 | $0.025 | $0.75 | v1/fim/completions, v1/edit/completions | FIM 32K / NextEdit 32K | 8,192 | — |

- Docs description of Mercury 3: "Our most intelligent model yet, with a 1M-token context window, up to 131,072 output tokens, and `instant`, `low`, `medium`, and `high` reasoning effort. Temperature is adjustable from 0.5 to 1.0." It is "50% off at launch". — [Models](https://docs.inceptionlabs.ai/get-started/models)
- Mercury 2.5 is "Our previous-generation reasoning model". Mercury 2 is "An earlier-generation reasoning model for chat completions". — [Models](https://docs.inceptionlabs.ai/get-started/models)
- Mercury Voice "is available to enterprise customers". It supports `low`, `medium` and `high` effort; contact sales@inceptionlabs.ai for access. — [Models](https://docs.inceptionlabs.ai/get-started/models)
- Mercury Decide: only input is billed. The endpoint "does not support chat completions, streaming, or tool calling." — [Models](https://docs.inceptionlabs.ai/get-started/models)
- Mercury 3 launched October 19, 2026, at a list price of $0.20/$0.70 with 50% off at launch. Press coverage says "Mercury 2 and Mercury 2.5 are no longer available to new users". — [The Next Web](https://thenextweb.com/news/inception-mercury-3-diffusion-llm), [Unite.ai](https://unite.ai/inception-releases-mercury-3-its-flagship-diffusion-llm), [layer3labs (updated Oct 20, 2026)](https://www.layer3labs.io/guides/mercury-3-explained). These are secondary sources, so the "no longer available to new users" claim is UNVERIFIED against primary docs. See the live behavior below.
- **LIVE: `GET /v1/models`** on 2026-11-24 returned 4 models: `mercury-2`, `mercury-2.5`, `mercury-3` and `mercury-decide`. It did not include `mercury-edit-2` or `mercury-voice`. Live pricing for `mercury-3` is `{"prompt":"0.0000001","completion":"0.00000035","input_cache_reads":"0.00000001","input_cache_writes":"0"}`, which matches the discounted price. Note that the OpenAPI *example* shows "0" for mercury-3, which is stale.
- **LIVE: `GET /v1/chat/completions/models`** returned `['mercury-3']` only.
- **LIVE: the chat validation error** for an unknown model lists the accepted ids: `"Model must be one of the following: mercury, mercury-2, mercury-2.5, mercury-3, mercury-3-preview-1002, mercury-3-preview-1014, mercury-coder, mercury-coder-small, mercury-small"`.
  - Requests with `mercury`, `mercury-coder`, `mercury-coder-small`, `mercury-2` and `mercury-2.5` all returned 200 for this account.
  - The response `model` field echoes back the requested alias. Which underlying model serves the legacy aliases is UNVERIFIED.
  - `mercury-edit-2` is rejected on chat with 400.
  - `mercury-voice` is rejected with 400 "Model must be one of…" because this is not an enterprise account.
- **LIVE: the error docs** name "`mercury-3`, `mercury-2.5`, `mercury-2`, or `mercury-edit-2`" as valid example names. `mercury-coder` and `mercury` are not documented anywhere in the current docs — [Error Codes](https://docs.inceptionlabs.ai/resources/error-codes)
- Full live `/v1/models` entry for mercury-3:
```json
{"id":"mercury-3","name":"Inception: Mercury 3","created":1743465660,"input_modalities":["text"],"output_modalities":["text"],"context_length":1000000,"max_output_length":131072,"pricing":{"prompt":"0.0000001","completion":"0.00000035","input_cache_reads":"0.00000001","input_cache_writes":"0"},"supported_sampling_parameters":["temperature","stop"],"supported_features":["tools","json_mode","structured_outputs"],"supported_endpoints":["chat.completions"],"description":"Mercury 3","openrouter":{"slug":"inception/mercury-3"},"datacenters":[{"country_code":"US"}]}
```
- The live entries for mercury-2 and mercury-2.5 report `context_length` 128000 and 260000 and `max_output_length` 50000 and 65536. mercury-decide reports context_length 65536 and max_output_length 50000, with `"description":"Typed-decision preview. Decisions endpoint only."`
- Mercury 3, 2.5, 2 and Edit 2 are text-only, with no image input. — [FAQ](https://docs.inceptionlabs.ai/resources/faq)

### Inferences
- **Deprecation status:**
  - `mercury-coder`, `mercury-coder-small`, `mercury` and `mercury-small` are legacy. They are undocumented but still accepted.
  - `mercury-2` and `mercury-2.5` are previous generation and are left out of `/v1/chat/completions/models`.
  - **The whole API is deprecated as of 2026-12-28.**
  - For a new app, hardcode or default to `mercury-3`. Build any model picker from `/v1/chat/completions/models`, not from `/v1/models`, because `/v1/models` includes `mercury-decide`, which is not a chat model.
- The `mercury-3-preview-1002` and `-1014` ids look like pre-launch snapshots (Oct 2 and Oct 14). Do not use them.

### Gaps
- Inception has published no formal deprecation date for `mercury-2` or `mercury-2.5`, beyond the overall wind-down.
- It is unconfirmed whether the legacy aliases route to mercury-2 or mercury-3. The `mercury`/`mercury-coder` responses included `reasoning_tokens`, which suggests a reasoning-era model behind them.

## Q3. Chat completions: exact request and response schemas

### Takeaway
The endpoint is `POST https://api.inceptionlabs.ai/v1/chat/completions` with `Authorization: Bearer <key>` and `Content-Type: application/json`. The shape is OpenAI-compatible, with these extensions:
- `diffusing`
- `realtime`
- `reasoning_effort` with an `instant` level
- `reasoning_summary` and `reasoning_summary_wait`
- `extra_body`
- response fields `warning`, `reasoning_summary`, `message.reasoning_details` (encrypted), plus `diffusion_meta` and `server_timing` in streams

There is **no** `top_p`, `seed`, `n`, `frequency_penalty`/`presence_penalty`, `logprobs` or `parallel_tool_calls` in the schema.

### Cited Findings
**Base URL / auth** ([OpenAPI](https://api.inceptionlabs.ai/openapi.json), [Authentication](https://docs.inceptionlabs.ai/get-started/authentication))
- The server is `https://api.inceptionlabs.ai`. All paths start with `/v1`. The OpenAI-SDK base URL is `https://api.inceptionlabs.ai/v1`.
- Security scheme: `BearerAuth`, `type: http`, `scheme: bearer`. Header: `Authorization: Bearer <api_key>`. Keys come from https://platform.inceptionlabs.ai/dashboard/api-keys.
- The docs' conventional env var name is `INCEPTION_API_KEY`; the official SDK reads it by default.

**Request body `ChatCompletionRequest`.** Required fields: `messages`, `model`. Source: [OpenAPI](https://api.inceptionlabs.ai/openapi.json).

| Field | Type | Range / enum | Default | Notes (quoted/condensed) |
|---|---|---|---|---|
| `model` | string | see Q2 | — (required) | |
| `messages` | Message[] | — | — (required) | |
| `max_completion_tokens` | integer | 1–131072 (per-model max: mercury-2 50,000; mercury-2.5 65,536; mercury-3 131,072) | per model, see below | Covers visible output plus reasoning tokens. Supersedes `max_tokens`. |
| `max_tokens` | integer | 1–131072 | same as above | **Deprecated**; `max_completion_tokens` takes precedence when both are sent. |
| `temperature` | number | 0.5–1.0 | mercury-2: 0.75; mercury-2.5: 1; mercury-3: 1 | Out-of-range values are *reset to the default* and a `warning` is returned, not a 400. |
| `stop` | string[] | — | — | The returned text does not contain the stop sequences. Schema type is array; whether a plain string is accepted is unverified. |
| `tools` | ChatCompletionTool[] | — | — | `{type:"function", function:{name, description?, parameters?, strict? (default false)}}`. Name pattern: a-z A-Z 0-9 _ -, max length 64. |
| `tool_choice` | `"auto"`\|`"required"`\|`"none"` or `{type:"function",function:{name}}` | — | `auto` when tools are present | |
| `stream` | boolean | — | false | SSE stream terminated by `data: [DONE]` |
| `stream_options` | `{include_usage: boolean}` | — | include_usage=false | Sends a final chunk with `choices: []` and `usage` before `[DONE]` |
| `diffusing` | boolean | — | false | "Whether to show the diffusion effect in the streamed response." Each chunk holds the *full* text so far, which the client should replace, not append. |
| `realtime` | boolean | — | false | "Enable flag for more realtime workloads that require lower TTFT/TTFAT." |
| `response_format` | oneOf `{type:"text"}` \| `{type:"json_object"}` \| `{type:"json_schema", json_schema:{name (required), description?, schema?, strict? (default false)}}` | — | — | |
| `reasoning_effort` | string | `instant`,`low`,`medium`,`high` | OpenAPI says `"medium"`; the docs say mercury-3 defaults to **`low`** and mercury-2.5 and mercury-2 default to `medium` | See the conflict noted below |
| `reasoning_summary` | boolean | — | false | "Request a summary of the model's reasoning process." |
| `reasoning_summary_wait` | boolean | — | false | "Wait for all reasoning summaries to complete before finishing the response." |
| `extra_body` | object | — | — | "Extra parameters passed to the model (OpenAI-compat passthrough)." |

- **Default token budgets when neither token field is sent** (quoted from the OpenAPI field description):
  - mercury-2: 16,384.
  - mercury-2.5: 16,384; 65,536 when `reasoning_effort="high"`.
  - mercury-3: 24,576; 8,192 when `"instant"`; 65,536 when `"medium"`; 131,072 when `"high"`. — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- Reasoning effort levels from the docs ([Reasoning Efforts](https://docs.inceptionlabs.ai/capabilities/reasoning-efforts)):

| Level | Latency | Best for |
|---|---|---|
| `instant` | Lowest | voice, realtime turns, high-volume automations |
| `low` | Low | latency-sensitive chat and tool calling |
| `medium` | Balanced | general-purpose use |
| `high` | Highest | complex, multi-step reasoning |

  "If `reasoning_effort` is omitted, `mercury-3` defaults to `low`, while `mercury-2.5` and `mercury-2` default to `medium`." Mercury Voice accepts only low, medium and high; live, `instant` returned 400 "reasoning_effort must be one of: 'low', 'medium', 'high'".
- **CONFLICT: temperature default.**
  - The OpenAPI spec says mercury-3's default is 1.
  - The FAQ says "Values outside that range are silently reset to the model's default (0.75 for `mercury-2`, 1 for `mercury-2.5`)".
  - **LIVE:** `temperature: 0` on mercury-3 returned 200 with `"warning":"Warning: Requested temperature 0.0 is not within [0.5, 1]. Temperature has been set to 1."` This confirms 1 for mercury-3. — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- The Quick Start example uses `"reasoning_effort": "medium", "temperature": 0.75, "max_completion_tokens": 8192` — [Quick Start](https://docs.inceptionlabs.ai/get-started)
- "The chat completions request schema does not accept a `seed` parameter" — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- The docs say tool calling is "OpenAI-compatible … including parallel tool calls" — [Tool Use](https://docs.inceptionlabs.ai/capabilities/tool-use)
- Structured outputs example: `response_format={"type":"json_schema","json_schema":{"name":"Sentiment","strict":true,"schema":{...}}}` — [Structured Outputs](https://docs.inceptionlabs.ai/capabilities/structured-outputs)

**`Message` schema** ([OpenAPI](https://api.inceptionlabs.ai/openapi.json))
- `role`: one of `system`, `user`, `assistant`, `tool`, `function`. Required.
- `content`: a string, an array of content-part objects, or null.
  - Image parts are documented only for "models with image support", which applies to none of the chat models today.
- `tool_calls`: ToolCall[] or null.
- `tool_call_id`: string or null, used with role `tool`.

**Response `ChatCompletionResponse`** ([OpenAPI](https://api.inceptionlabs.ai/openapi.json))
- `id`, `object: "chat.completion"`, `created` (int), `model`, `choices[]`, `usage`.
- `warning` (string|null) and `reasoning_summary` (`{content: string|null, status: "complete"|"unavailable"|"skipped"}` or null).
- Each Choice has `index`, `message`, and `finish_reason` ∈ `stop`, `length`, `tool_calls`, `content_filter`, null.
- `usage` has `prompt_tokens`, `completion_tokens` (includes reasoning), `total_tokens`, `prompt_tokens_details.cached_tokens` and `completion_tokens_details.reasoning_tokens`. All five are required in the schema.
- ToolCall: `{index (int|null, default 0), id, type:"function", function:{name, arguments (JSON string)}}`.
- **Stale docs example:** the OpenAPI example shows `usage.reasoning_tokens` and `usage.cached_input_tokens` at the top level. The real responses use nested `*_details`, as the FAQ describes. — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- The FAQ also says: "The nested detail counts are already included in their parent totals, so do not add them again. Cached prompt tokens use the cached-input rate; completion tokens, including reasoning tokens, use the output rate." No dollar-cost field is returned. — [FAQ](https://docs.inceptionlabs.ai/resources/faq)

**LIVE real responses (2026-11-24)**

Non-streaming, mercury-3, `reasoning_effort: "instant"`, `max_completion_tokens: 50`:
```json
{"id":"chatcmpl-6f22f552-1cd8-4fbb-9cda-aabf63099b74","object":"chat.completion","created":1795547151,"model":"mercury-3","choices":[{"index":0,"message":{"role":"assistant","content":"Hi, hello, hey!","tool_calls":null,"tool_call_id":null,"reasoning_details":null},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":10,"total_tokens":20,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}},"warning":null,"reasoning_summary":null}
```

mercury-3 with `reasoning_effort: "medium"`, `reasoning_summary: true` and `reasoning_summary_wait: true`. Note the undocumented `message.reasoning_details` field, which is *encrypted*. No plaintext reasoning came back, and `reasoning_summary` stayed null:
```json
{"id":"chatcmpl-7bc2bed1-...","object":"chat.completion","created":1795547191,"model":"mercury-3","choices":[{"index":0,"message":{"role":"assistant","content":"391","tool_calls":null,"tool_call_id":null,"reasoning_details":[{"type":"reasoning.encrypted","data":"mrt1_v1_PT8z...","format":"mercury-v1","index":0}]},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":22,"total_tokens":34,"prompt_tokens_details":{"cached_tokens":1},"completion_tokens_details":{"reasoning_tokens":17}},"warning":null,"reasoning_summary":null}
```

Tool call, mercury-3, `tool_choice: "auto"`:
```json
{"choices":[{"index":0,"message":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_8e3e045f9a221251","type":"function","function":{"name":"get_weather","arguments":"{\"city\": \"Paris\"}"}}],"tool_call_id":null,"reasoning_details":[{"type":"reasoning.encrypted","data":"mrt1_v1_...","format":"mercury-v1","index":0}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":266,"completion_tokens":70,"total_tokens":336,"prompt_tokens_details":{"cached_tokens":9},"completion_tokens_details":{"reasoning_tokens":26}}}
```

Streaming with `stream_options.include_usage: true`. Frames are `data: {json}\n\n`; the JSON is serialized with spaces after `:` and `,`. The usage chunk carries an undocumented `server_timing`:
```
data: {"id": "chatcmpl-4bd1...", "object": "chat.completion.chunk", "created": 1795547164, "model": "mercury-3", "choices": [{"index": 0, "delta": {"content": "1  \n", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null}
data: {"id": "chatcmpl-4bd1...", ..., "choices": [{"index": 0, "delta": {"content": "2  \n3  \n4  \n5", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null}
data: {"id": "chatcmpl-4bd1...", ..., "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}
data: {"id": "chatcmpl-4bd1...", ..., "choices": [], "usage": {"prompt_tokens": 10, "completion_tokens": 9, "total_tokens": 19, "prompt_tokens_details": {"cached_tokens": 0}, "completion_tokens_details": {"reasoning_tokens": 0}}, "server_timing": {"server_latency_ms": 177.73}}
data: [DONE]
```
- Stream deltas are **blocks** of text, not single tokens. Every content chunk repeats `role: "assistant"`. — [Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming)

Streaming with `diffusing: true`. Each chunk is the FULL current text and carries undocumented `diffusion_meta`:
```
data: {"id": "chatcmpl-06ef...", "object": "chat.completion.chunk", ..., "choices": [{"index": 0, "delta": {"content": "the", "role": "assistant", "tool_calls": null}, "finish_reason": null}], "reasoning_summary": null, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 0.0}}
data: {..., "choices": [{"index": 0, "delta": {"content": "the cat sat", ...}, "finish_reason": null}], "reasoning_summary": null, "diffusion_meta": {"diffusion_content": true, "diffusion_progress": 1.0}}
data: {..., "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}
data: [DONE]
```
- The docs' JS example sets `fullContent = choice.delta.content` (replace, not append) — [Streaming & Diffusion](https://docs.inceptionlabs.ai/capabilities/streaming)

**Response headers (live)**
- `content-type: application/json`, `server: uvicorn`, `x-request-id: <uuid>`, `x-process-time: <seconds>`, plus CloudFront headers.
- **No `x-ratelimit-*` headers** and no `retry-after` were seen on a 200.

### Inferences
- For a Next.js route, parse SSE frames as `data: ` lines. Treat a chunk with `choices: []` and `usage` as the usage frame. In diffusing mode, replace the accumulated text on each chunk.
- `reasoning_details` is opaque and encrypted (`format: "mercury-v1"`). Do not show it to users. Echoing it back in multi-turn assistant messages may or may not help; that is UNVERIFIED, and the Message schema has no field for it.
- A token budget that is too small with reasoning on can produce `content: null` and `finish_reason: "length"`, because reasoning tokens use up the budget. This was observed live: mercury-coder with max 5 tokens returned 8 reasoning tokens and null content. Use generous `max_completion_tokens` or `reasoning_effort: "instant"`.
- `reasoning_summary: true` returned `null` in this test. Treat it as unreliable.

### Gaps
- `top_p` is not in the schema and its behavior was not tested; it is probably ignored or rejected. UNVERIFIED.
- Whether `stop` accepts a plain string is UNVERIFIED.
- The exact behavior of `realtime: true` is undocumented beyond one line.
- No value of `finish_reason: "content_filter"` was observed.

## Q4. Is there a /v1/models endpoint, and what does it return?

### Takeaway
Yes. There are four list endpoints. Each returns `{"data": [ModelObject...]}`, without an OpenAI `object: "list"` wrapper. Live, `/v1/models` answered **without any Authorization header** (HTTP 200).

### Cited Findings
- Paths:
  - `GET /v1/models` (listModels)
  - `GET /v1/chat/completions/models` (listChatModels)
  - `GET /v1/fim/completions/models` (listFIMModels)
  - `GET /v1/edit/completions/models` (listEditModels)
  - Documented responses: 200, 401, 500. — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- ModelObject:
  - Required fields: `id`, `name`, `created`, `input_modalities`, `output_modalities`, `context_length`, `max_output_length`, `pricing{prompt, completion, input_cache_reads, input_cache_writes}` (strings, USD **per token**), `supported_sampling_parameters`, `supported_features`, `supported_endpoints`.
  - Optional fields: `description`, `openrouter{slug}`, `datacenters[{country_code}]`. — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- LIVE results: the 4 entries listed in Q2, and `/v1/chat/completions/models` returned only `mercury-3`. The unauthenticated `/v1/models` call also returned 200 with the same data.
- The entries carry no OpenAI-style `object: "model"` or `owned_by` fields (live).

### Inferences
- OpenAI SDK `client.models.list()` should still work, because it reads `data`. Code that expects `owned_by` will see undefined.

### Gaps
- The FIM and Edit model-list endpoints were not called live.

## Q5. OpenAI SDK compatibility, official SDKs, AI SDK providers

### Takeaway
The API is OpenAI-compatible: point the OpenAI SDKs at `https://api.inceptionlabs.ai/v1`. The official SDK is `inceptionai` on PyPI and npm (npm latest **0.3.0**, modified 2026-10-21). For the Vercel AI SDK, the docs recommend `@ai-sdk/openai-compatible`. No dedicated `@ai-sdk/inception` provider is documented. LiteLLM has a native `inception/` provider.

### Cited Findings
- "The API is also OpenAI-compatible, so existing OpenAI SDKs work by pointing them at `https://api.inceptionlabs.ai/v1`." Packages: Python `inceptionai`, TypeScript `inceptionai`. Usage: `import Inception from 'inceptionai'; new Inception({ apiKey })`, which reads `INCEPTION_API_KEY` by default. — [SDKs](https://docs.inceptionlabs.ai/get-started/sdks)
- Vercel AI SDK example from the Quick Start:
```js
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
const provider = createOpenAICompatible({ name: 'inception', apiKey: process.env.INCEPTION_API_KEY, baseURL: 'https://api.inceptionlabs.ai/v1' });
const { text } = await generateText({ model: provider('mercury-3'), prompt: '...' });
```
  — [Quick Start](https://docs.inceptionlabs.ai/get-started)
- Other documented clients — [Quick Start](https://docs.inceptionlabs.ai/get-started):
  - LiteLLM: `model="inception/mercury-3"` (native provider; reads INCEPTION_API_KEY)
  - AISuite: `inception:mercury-3`
  - LangChain: `ChatOpenAI(base_url=...)`
- The OpenAPI spec carries Stainless annotations (`x-stainless-*`), so the official SDK is Stainless-generated. In it, `extra_body` maps to `extra_params` — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- npm registry (live): `inceptionai` dist-tags `{latest: '0.3.0'}`, described as "The official TypeScript library for the Inception API". `@ai-sdk/openai-compatible` latest is 3.0.94 (ai-v6 2.0.94, ai-v5 1.0.63). `@inceptionlabs/ai-sdk-provider` does not exist. — [npm inceptionai](https://www.npmjs.com/package/inceptionai)
- Also available via OpenRouter (slug `inception/mercury-3`), Baseten and Vercel, per press coverage — [Unite.ai](https://unite.ai/inception-releases-mercury-3-its-flagship-diffusion-llm)
- There is no MCP endpoint, no embeddings and no fine-tuning — [FAQ](https://docs.inceptionlabs.ai/resources/faq)

### Inferences
- With `@ai-sdk/openai-compatible`, non-standard params (`reasoning_effort`, `diffusing`, `realtime`) must go through `providerOptions.inception` or a custom fetch/body transform. Diffusing-mode deltas are full-text replacements, which breaks the AI SDK's append-based text streaming. A raw `fetch` SSE proxy is safer if the app wants the diffusion effect.

### Gaps
- Whether the Vercel AI Gateway exposes Mercury 3 was not verified in primary docs.

## Q6. Errors, rate limits, pricing

### Takeaway
Errors usually follow the OpenAI shape `{"error":{"message","type","param","code"}}`. **However, live validation errors (400) return `error.message` as an ARRAY of Pydantic error objects, not a string.** Rate limits are per minute per tier, and responses carry no rate-limit headers. New accounts get 100M free tokens.

### Cited Findings
**Error codes from the docs** — [Error Codes](https://docs.inceptionlabs.ai/resources/error-codes)

| Status | Meaning |
|---|---|
| 400 | Invalid request (incl. `context_length_exceeded`) |
| 401 | Invalid authentication |
| 402 | Payment required ("Account is inactive" means billing inactive or quota exceeded) |
| 404 | Model not found |
| 413 | Decision request body too large |
| 422 | Invalid decision request |
| 429 | Rate limit reached |
| 500 | Server error |
| 502 | Invalid upstream response |
| 503 | Engine overloaded |
| 504 | Decision service timeout |

- Documented example error bodies for chat — [OpenAPI](https://api.inceptionlabs.ai/openapi.json):
  - 400: `{"error":{"message":"You exceeded the maximum context length for this model of 128000. Please reduce the length of the messages or completion.","type":"invalid_request_error","param":"messages","code":"context_length_exceeded"}}`
  - 401: `{"error":{"message":"Incorrect API key provided","type":"authentication_error","param":null,"code":"invalid_api_key"}}`
  - 402: `{"error":{"message":"Account is inactive","type":"account_error","param":null,"code":"account_error"}}`
  - 404: `{"error":{"message":"model `jupyter-2` not found","type":"invalid_request_error","param":"model","code":"model_not_found"}}`
  - 429: `{"error":{"message":"Rate limit exceeded. Please try again later.","type":"rate_limit_error","param":null,"code":"rate_limit_reached"}}`
  - 500: `{"error":{"message":"The server had an error while processing your request.","type":"server_error","param":null,"code":"server_error"}}`
- **LIVE 401** (invalid key): `{"error":{"message":"Incorrect API key provided","type":"authentication_error","param":null,"code":"invalid_api_key"}}`. This matches the docs.
- **LIVE 400** responses. An unknown model gave **400, not 404**. `message` is an array:
  - Unknown model: `{"error":{"message":[{"type":"value_error","loc":["body","model"],"msg":"Value error, Model must be one of the following: mercury, mercury-2, ...","ctx":{"error":"..."}}],"type":"invalid_request_error","param":null,"code":"invalid_request_error"}}`
  - `max_completion_tokens: 200000`: message array with `msg` "Value error, max_completion_tokens must be between 1 and 131072"
  - `reasoning_effort: "max"`: message array with `msg` "Value error, reasoning_effort must be one of: 'instant', 'low', 'medium', 'high'"
  - Missing messages: `{"error":{"message":[{"type":"missing","loc":["body","messages"],"msg":"Field required"}],"type":"invalid_request_error","param":null,"code":"invalid_request_error"}}`
  - The `mercury-voice` request (non-enterprise) got `message` as a plain **string** with `"param":"model"`. **So `error.message` can be either a string or an array.**
- Decisions-endpoint 422 uses FastAPI's `{"detail":[{loc,msg,type,...}]}` (HTTPValidationError) — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- For 429 and 503, "Implement exponential backoff" — [FAQ](https://docs.inceptionlabs.ai/resources/faq)

**Rate limits (per minute)** — [Rate Limits](https://docs.inceptionlabs.ai/get-started/rate-limits)

| Tier | Requests | Input tokens | Output tokens |
|---|---|---|---|
| Free | 1,000 | 1,000,000 | 100,000 |
| Pay As You Go | 3,000 | 3,000,000 | 300,000 |
| Enterprise | Custom | Custom | Custom |

**Pricing and credits**
- Pricing is in the Q2 table. Mercury 3 costs **$0.10 input / $0.01 cached input / $0.35 output per 1M tokens**, at the launch discount from $0.20/$0.02/$0.70. — [Models](https://docs.inceptionlabs.ai/get-started/models)
- "Every new account includes a one-time credit of 100 million free tokens… shared across all models." — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- Prefix caching is automatic and has no documented TTL. Cache writes cost 0 — [FAQ](https://docs.inceptionlabs.ai/resources/faq); live `/v1/models` shows `input_cache_writes: "0"`.

### Inferences
- In the error normalizer of a Next.js route:
  - Handle `error.message` as `string | Array<{msg, loc, type}>`, joining the `msg` values for display.
  - Do not rely on 404 for a bad model; expect 400 with `code: "invalid_request_error"`.
  - Retry on 429, 500, 502 and 503 with backoff. With no `retry-after` header, use exponential backoff.
- Cost formula: `(prompt_tokens - cached_tokens) * prompt + cached_tokens * input_cache_reads + completion_tokens * completion`, using the per-token strings from `/v1/models`.

### Gaps
- No 429, 402, 413 or 5xx was triggered live, so the real body shapes for those come only from the docs.
- Whether 429 responses include `retry-after` or `x-ratelimit-*` headers is unverified.
- How long the launch discount lasts was not stated, though the wind-down makes it moot after 2026-12-28.
- The live `context_length_exceeded` message for mercury-3 (1M context) was not tested.
