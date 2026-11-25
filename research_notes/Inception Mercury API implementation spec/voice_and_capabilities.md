# Mercury Voice and remaining Mercury API capabilities (voice, tools, structured outputs, reasoning, other endpoints)

Research date: 2026-11-24. "VERIFIED" = observed in a live call to api.inceptionlabs.ai using $DLLM_API_KEY on 2026-11-24. "DOCS" = stated in docs/OpenAPI. "INFERRED" = my reasoning, not stated anywhere.

**Critical context, read first:** the docs carry a wind-down notice. "The Mercury API remains fully available through December 28, 2026... After December 28, 2026, API requests stop being served, and you lose access to the platform and to any data submitted to it." Docs tell customers to "move them to another provider before December 28, 2026" — [Mercury API wind-down](https://docs.inceptionlabs.ai/support/wind-down). Any Mercury feature built now, voice included, has about 5 weeks of life left. Code against the generic OpenAI-compatible chat interface so the provider can be swapped.

## 1. What exactly is the Mercury voice model?

### Takeaway
"Mercury Voice" is a **text-in/text-out diffusion LLM tuned for voice agents**. It has no audio input or output and no realtime WebSocket or WebRTC endpoint. It is served on the ordinary OpenAI-compatible `POST /v1/chat/completions` (HTTP JSON, or SSE when `stream:true`) and is meant to fill "the LLM slot" of an ASR → LLM → TTS pipeline. It is **enterprise-only (sales-gated)**, and no public model id is documented. On our key it is **not available**: `/v1/models` does not list it, and the guessed ids `mercury-voice` and `mercury-voice-1` are rejected with 400 (VERIFIED). The self-serve voice path the docs actually document is **`mercury-3` with `realtime: true`** plus external STT/TTS.

### Cited Findings
- Models table row: "**Mercury Voice** | ~~$0.40~~ → **$0.20** input | ~~$0.04~~ → **$0.02** cached input | ~~$1.50~~ → **$0.75** output | `v1/chat/completions` | Chat: 128K | 50,000 max output | `Tool Calling` `Structured Outputs` | Supported Formats: `Text`" — [Models](https://docs.inceptionlabs.ai/get-started/models)
- "A diffusion LLM tuned for voice agents. It reasons, calls tools, returns structured outputs, and follows long system prompts while keeping latency low enough for natural conversation." — [Models](https://docs.inceptionlabs.ai/get-started/models)
- "Mercury Voice is available to enterprise customers through the OpenAI-compatible Inception API, and works with LiveKit, Pipecat, Vapi, Retell, or your own voice stack. It supports `low`, `medium`, and `high` reasoning effort. Temperature is adjustable from 0.5 to 1.0." Access: "Contact sales@inceptionlabs.ai to enable Mercury Voice for your organization." — [Models](https://docs.inceptionlabs.ai/get-started/models)
- The docs do not give a model id string for Mercury Voice. A grep of llms-full.txt and openapi.json for "mercury-voice" finds nothing — [llms-full.txt](https://docs.inceptionlabs.ai/llms-full.txt), [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- Blog "Introducing Mercury Voice": described as a dLLM "tuned to power voice agents", "available today through the Inception API as an OpenAI API compatible endpoint", "generally available for enterprise customers". It gives no model id, endpoint URL, or code — [Inception blog](https://www.inceptionlabs.ai/blog/introducing-mercury-voice)
- Blog latency claims (production voice prompts): median time-to-first-answer-token (TTFAT) **320 ms p50, 750 ms p95**. Target budget is about 500 ms after the caller stops speaking. At low effort it is called "the only model with a p50 TTFAT under 500 ms". A customer, OpenCall, reports a median model response latency "close to 170 milliseconds". It claims "twice as fast as the next fastest model" on conversational benchmarks — [Inception blog](https://www.inceptionlabs.ai/blog/introducing-mercury-voice)
- Blog quality claims: beats Gemma 4 31B, GPT-6 Luna, GLM-5.3-Flash, and Qwen3.5-397B on composites of τ³-bench (Telecom/Retail/Airline), IFBench, and BFCL v4. **No numeric scores are published** — [Inception blog](https://www.inceptionlabs.ai/blog/introducing-mercury-voice)
- Blog cost claim: "~$0.009 per minute" for a typical voice agent, versus GPT-4.1 at $0.045/min. Named customers: Audivi AI, Altur, OpenCall — [Inception blog](https://www.inceptionlabs.ai/blog/introducing-mercury-voice)
- Blog date conflict: page metadata says Nov 18, 2026, but the blog index dates the post Sep 29, 2026, and the text says it came "two weeks ago, alongside Mercury 2.5" — [Inception blog](https://www.inceptionlabs.ai/blog/introducing-mercury-voice)
- VERIFIED: `GET /v1/models` with our key returns exactly `mercury-2`, `mercury-2.5`, `mercury-3`, and `mercury-decide`. All have `input_modalities:["text"]` and `output_modalities:["text"]`, and none is a voice model. Per-model fields include `context_length`, `max_output_length`, `pricing` (per-token strings such as mercury-3 `"prompt":"0.0000001","completion":"0.00000035","input_cache_reads":"0.00000001"`), `supported_sampling_parameters:["temperature","stop"]`, `supported_features:["tools","json_mode","structured_outputs"]` (empty for mercury-decide), `supported_endpoints:["chat.completions"]` (or `["decisions"]`), and an `openrouter.slug` such as `inception/mercury-3`. mercury-3 shows `context_length:1000000`, `max_output_length:131072`.
- VERIFIED: `POST /v1/chat/completions` with `"model":"mercury-voice"` returns HTTP 400 `{"error":{"message":"Model must be one of the following: mercury-2.5, mercury-3-preview-1002, mercury-small, mercury-coder, mercury-3, mercury-2, mercury, mercury-3-preview-1014, mercury-coder-small","type":"invalid_request_error","param":"model","code":"invalid_request_error"}}`. `"mercury-voice-1"` also returns 400, but with a different error shape: `message` is a **Pydantic-style array** (`[{"type":"value_error","loc":["body","model"],"msg":"Value error, Model must be one of..."}]`) and `param:null`. So `error.message` is not always a string, and the client must handle both.
- VERIFIED: `GET /v1/chat/completions/models` returns only `["mercury-3"]`. `/v1/fim/completions/models` and `/v1/edit/completions/models` return `["mercury-edit-2"]`.
- Voice Quickstart (self-serve path): "Mercury 3 plugs in easily to ASR → LLM → TTS voice agent workflows." Example request: `model:"mercury-3"`, a voice system prompt ("NEVER use markdown... Keep every response as short as possible... ask for ONE thing at a time"), `reasoning_effort:"medium"`, `temperature:0.75`, `max_completion_tokens:8192`, `realtime:true` — [Voice Quickstart](https://docs.inceptionlabs.ai/usecases/voice)
- Recommended voice settings table: "Standard voice agent | 0.75 | medium | true" and "Time to First Answer Token (TTFT) | 0.75 | low | true" (temperature | reasoning_effort | realtime). The page also says "a lower temperature may be appropriate, e.g., `temperature=0.6`" for tool calling, and "we recommend setting `max_completion_tokens` to at least 3,000 for `reasoning_effort="medium"`" — [Voice Quickstart](https://docs.inceptionlabs.ai/usecases/voice)
- `realtime` in OpenAPI: `{"type":"boolean","description":"Enable flag for more realtime workloads that require lower TTFT/TTFAT.","default":false}` — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- VERIFIED: `mercury-3` with `realtime:true`, `reasoning_effort:"medium"`, `temperature:0.75`, and a voice system prompt answered "No, 91 is not prime. It equals 7 times 13." in **0.37 s total** (HTTP 200). The response shape is the normal `chat.completion`, so `realtime` changes nothing visible in the response.
- STT/TTS pairing in the docs is **ElevenLabs** throughout. STT `model_id="scribe_v1"`. TTS `model_id="eleven_turbo_v2_5"` for streaming replies (`eleven_v3` was used only to synthesize test input). `output_format="mp3_44100_128"`, example voice `VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel` — [Realtime Voice Assistant cookbook](https://docs.inceptionlabs.ai/cookbooks/realtime-voice-assistant); [Voice Customer Support Agent cookbook](https://docs.inceptionlabs.ai/cookbooks/customer-support-agent-mercury)
- Documented low-latency pattern: stream Mercury with `reasoning_effort="low"` and `stream=True`, buffer text, and send each complete sentence (split on `[.!?]+`) to streaming TTS — [Realtime Voice Assistant cookbook](https://docs.inceptionlabs.ai/cookbooks/realtime-voice-assistant)
- Support-agent cookbook architecture: "caller audio to ElevenLabs STT to Mercury 3, which loops with the clinic SQLite database via tool calls and results, then ElevenLabs TTS to spoken reply." It notes "every extra 100 ms is audible" — [Voice Customer Support Agent cookbook](https://docs.inceptionlabs.ai/cookbooks/customer-support-agent-mercury)
- ElevenLabs Agents integration: choose Custom LLM, set Server URL `https://api.inceptionlabs.ai/v1`, Model ID `mercury-3`, Temperature `0.75`. The page says "leaving it unset defaults to `medium` reasoning effort" — [ElevenLabs integration](https://docs.inceptionlabs.ai/integrations/elevenlabs)
- Vapi integration: Custom LLM URL `https://api.inceptionlabs.ai/v1`, Model `mercury-3`, Temperature `0.75`, Max Tokens "a slightly higher value, like `4096`" because Max Tokens includes reasoning tokens — [Vapi integration](https://docs.inceptionlabs.ai/integrations/vapi)
- There is no LiveKit, Pipecat, or Retell guide on docs.inceptionlabs.ai. Those platforms are only named in the Models tab and the blog — [llms.txt](https://docs.inceptionlabs.ai/llms.txt)
- Prompt Guide voice rules: suppress markdown ("Your response will be read aloud by a text-to-speech engine... No bullet points, no ellipses, no headers, no markdown, no numbered lists."), ask one question at a time, use explicit pronunciation rules (phone, dollars, zip, dates, IDs digit by digit), use a NATO spell-back alphabet, and match the user's language — [Prompt Guide](https://docs.inceptionlabs.ai/resources/prompt-guide)

### Inferences
- INFERRED: For a Next.js chat app, "Mercury voice support" means building the speech layer yourself:
  - **Option A (zero vendor):** browser Web Speech API. Use `SpeechRecognition`/`webkitSpeechRecognition` for STT (Chrome/Edge/Safari; Firefox lacks it) and `speechSynthesis` for TTS. Send the transcript to an existing Next.js route handler that proxies `/v1/chat/completions` with `stream:true, realtime:true, reasoning_effort:"low"|"instant", temperature:0.75` and a voice system prompt. Split SSE `delta.content` into sentences and call `speechSynthesis.speak()` on each one.
  - **Option B (docs-aligned):** ElevenLabs STT `scribe_v1` and TTS `eleven_turbo_v2_5` (`mp3_44100_128`) called from server routes, so the ElevenLabs key never reaches the browser. Capture audio with `MediaRecorder` (webm/opus).
  - **Option C:** hand the whole loop to ElevenLabs Agents or Vapi using the Custom LLM settings above.
- INFERRED: Because Mercury Voice is unavailable on this key and the API shuts down on 2026-12-28, the app should treat "voice mode" as a UI mode over `mercury-3`: realtime flag, low/instant effort, voice system prompt, and markdown stripping before TTS. It should not add a separate model id. If an enterprise id ever appears in `/v1/models`, drive model selection from that endpoint.
- INFERRED: Strip markdown before TTS anyway. A VERIFIED response without the voice prompt contained `**18°C**`.

### Gaps
- The exact Mercury Voice model id, and whether it supports `instant` effort or `realtime`. The id is not published, and the model can't be reached with this key.
- The docs give no audio formats, sample rates, or voices for Mercury itself, because it has no audio I/O.
- The docs give no LiveKit or Pipecat configuration. Those integrations presumably use their generic OpenAI-compatible LLM plugins with base URL `https://api.inceptionlabs.ai/v1` (INFERRED).

## 2. Tool calling: schemas, behavior, supported models

### Takeaway
Tool calling is OpenAI-compatible: `tools[]` of `{type:"function", function:{name, description, parameters, strict}}`, plus `tool_choice` of `"auto"|"required"|"none"|{type:"function",function:{name}}`. Parallel calls work, and you return results as `role:"tool"` messages carrying `tool_call_id`. Supported on mercury-2, mercury-2.5, mercury-3 (and Mercury Voice per docs), not on mercury-decide, FIM, or Edit. Live testing found three quirks a client must handle.

### Cited Findings
- "Mercury 3 supports OpenAI-compatible tool calling on the chat completions endpoint, including parallel tool calls... it returns one or more `tool_calls` with JSON arguments." For the round trip, "append the assistant message and a `tool` message (matched by `tool_call_id`) and call the API again." — [Tool Use](https://docs.inceptionlabs.ai/capabilities/tool-use)
- OpenAPI `FunctionDefinition`: `name` is required ("a-z, A-Z, 0-9, or contain underscores and dashes, with a maximum length of 64"). Also `description`, `parameters` (JSON Schema object), and `strict` (boolean, default false): "When true, the model output is constrained to match the `parameters` schema exactly." — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- OpenAPI `tool_choice`: "'auto' (model decides, default when tools present), 'required' (model must call one), 'none' (model must not call one), or {"type": "function", "function": {"name": "..."}} to force one declared tool." — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- OpenAPI `Message.role` enum: `system, user, assistant, tool, function`. `content` can be a string, an array of parts, or null. `tool_calls` and `tool_call_id` are present. `Choice.finish_reason` enum: `stop, length, tool_calls, content_filter, null` — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- `ToolCallDelta`: "per OpenAI SSE spec, id/type only appear in the first chunk per index." — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- Models with "tools" in `supported_features`: mercury-2, mercury-2.5, mercury-3 (VERIFIED via /v1/models). The docs also list Tool Calling for Mercury Voice — [Models](https://docs.inceptionlabs.ai/get-started/models). FIM: "Tool calling and function calling are not supported." Edit: tool calling not supported — [llms.txt](https://docs.inceptionlabs.ai/llms.txt)
- FAQ: there is no MCP endpoint, but any framework with an OpenAI-compatible backend can use the base URL `https://api.inceptionlabs.ai/v1`. The FAQ oddly says to set the model to `mercury-2.5` — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- VERIFIED (non-streaming, parallel): asking for the weather in Paris and Tokyo returned `finish_reason:"tool_calls"`, `content:null`, and two `tool_calls`, `{"index":0,"id":"call_89692a6ddb7901e5","type":"function","function":{"name":"get_weather","arguments":"{\"location\": \"Paris\", \"unit\": \"celsius\"}"}}` and the same for Tokyo. **Quirk 1: both non-streamed tool calls had `"index":0`**, so match calls by `id`, never by `index`, in non-streamed responses. Latency was 0.78 s.
- VERIFIED (streaming, parallel): SSE chunks first sent free text in `delta.content` ("I need to check the weather in Paris and Tokyo... Let me get the weather for both cities.\n\n"). Then came `delta.tool_calls` with `{index:0, id, type:"function", function:{name, arguments:null}}`, followed by argument fragments with `id:null, name:null`. The second call used `index:1`, so streamed indices are correct. Then came a chunk with `delta:{}` and `finish_reason:"tool_calls"`, then a usage chunk (`choices:[]`), then `data: [DONE]`. **Quirk 2: the model can emit visible preamble text before tool calls.** Don't speak it in voice mode, or treat it as interim text.
- VERIFIED (named `tool_choice`): forcing `get_weather` on the prompt "hello" produced a call with hallucinated args `{"location":"New York","unit":"celsius"}`, `content:""`, and **`finish_reason:"stop"` (not `"tool_calls"`). Quirk 3: detect tool calls by the presence of `message.tool_calls`, not by finish_reason.**
- VERIFIED (round trip): sending the assistant message with `tool_calls` plus `{"role":"tool","tool_call_id":"call_1","content":"{\"temperature\":18}"}` returned "The weather in Paris is currently **18°C** — nice and mild!" with `finish_reason:"stop"`.
- VERIFIED: assistant messages may carry an **undocumented** field `reasoning_details: [{"type":"reasoning.encrypted","data":"mrt1_v1_...","format":"mercury-v1","index":0}]`. This field is not in the OpenAPI `Message` schema. The docs' Python round trip appends the whole `message.model_dump(exclude_none=True)`, which would echo the field back — [Tool Use](https://docs.inceptionlabs.ai/capabilities/tool-use). INFERRED: echoing `reasoning_details` back in later turns is probably harmless or beneficial (encrypted reasoning carry-over, OpenRouter-style). I did not test it.

### Inferences
- INFERRED: The app's tool loop should (a) accumulate streamed `tool_calls` by `index` but key final calls by `id`, (b) treat `message.tool_calls?.length > 0` as the tool signal, (c) cap loop iterations, and (d) never set `tool_choice` to a named function for open-ended chat, because the model will invent arguments.

### Gaps
- `strict:true` on functions was not tested live.
- Whether `parallel_tool_calls:false` is accepted. It is not in the schema, and unknown fields seem to be ignored (see the reasoning section).

## 3. Structured outputs (`response_format`)

### Takeaway
`response_format` accepts `{type:"text"}`, `{type:"json_object"}`, and `{type:"json_schema", json_schema:{name, description?, schema, strict?}}`, exactly OpenAI's shape. JSON arrives as a string in `message.content`. It works on mercury-2, mercury-2.5, and mercury-3 (VERIFIED on mercury-3).

### Cited Findings
- OpenAPI `response_format` is oneOf `ResponseFormatText`, `ResponseFormatJSONObject` (`{"type":"json_object"}`), or `ResponseFormatJSONSchema` (`{"type":"json_schema","json_schema":JSONSchema}`). `JSONSchema` takes `name` (required, `[a-zA-Z0-9_-]`, max 64), `description`, `schema` (object), and `strict` (default false, "When true, the model output is constrained to match the supplied `schema` exactly.") — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- The docs' example uses `response_format={"type": "json_schema", "json_schema": {"name":"Sentiment","strict":True,"schema":{...enum, minimum/maximum, array items..., "required":[...]}}}` on `mercury-3` — [Structured Outputs](https://docs.inceptionlabs.ai/capabilities/structured-outputs)
- /v1/models lists `"json_mode","structured_outputs"` for mercury-2, mercury-2.5, and mercury-3 (VERIFIED).
- VERIFIED: a strict json_schema request with `reasoning_effort:"instant"` returned `content:"{\"sentiment\": \"positive\", \"confidence\": 1.0}"` with `finish_reason:"stop"` in 0.48 s.
- VERIFIED: `{"type":"json_object"}` returned `content:"{\"a\": 1}"` in 0.42 s.

### Inferences
- INFERRED: Always `JSON.parse` in try/catch and validate (for example with zod). `strict` is documented as constraining output, but `finish_reason:"length"` could still truncate JSON, so set `max_completion_tokens` generously when reasoning is on.

### Gaps
- Supported JSON Schema keyword subset and limits (depth, size) are undocumented.
- Behavior when combining `response_format` with `tools` or `stream:true` was not tested.

## 4. Reasoning controls

### Takeaway
`reasoning_effort` accepts `instant | low | medium | high` on mercury-3. mercury-2.5 and mercury-2 accept the field, and the docs list Mercury Voice as supporting `low|medium|high`. Reasoning tokens are hidden. They count in `usage.completion_tokens_details.reasoning_tokens` and are billed at the output rate. Opaque encrypted reasoning may appear in `reasoning_details`. `reasoning_summary` exists in the schema but returned null in every test. The default effort for mercury-3 is documented inconsistently.

### Cited Findings
- "`reasoning_effort` controls how much the model deliberates before answering. It applies to `mercury-3`, `mercury-2.5`, and `mercury-2`." Table: `instant` (Lowest latency, "Voice, realtime turns, high-volume automations"), `low` ("Latency-sensitive chat and tool-calling"), `medium` ("General-purpose use"), `high` ("Complex, multi-step reasoning") — [Reasoning Efforts](https://docs.inceptionlabs.ai/capabilities/reasoning-efforts)
- Default conflict: "If `reasoning_effort` is omitted, `mercury-3` defaults to `low`, while `mercury-2.5` and `mercury-2` default to `medium`." — [Reasoning Efforts](https://docs.inceptionlabs.ai/capabilities/reasoning-efforts). This is contradicted by the OpenAPI `"default":"medium"` — [OpenAPI](https://api.inceptionlabs.ai/openapi.json) — and by the ElevenLabs page ("leaving it unset defaults to `medium`") — [ElevenLabs](https://docs.inceptionlabs.ai/integrations/elevenlabs). The Vapi page also assumes medium — [Vapi](https://docs.inceptionlabs.ai/integrations/vapi).
- Token budget defaults (OpenAPI `max_completion_tokens`, "including visible output tokens and reasoning tokens"): mercury-3 defaults to 24,576, or 8,192 at `instant`, 65,536 at `medium`, and 131,072 at `high`. mercury-2.5 defaults to 16,384, or 65,536 at `high`. mercury-2 defaults to 16,384. Maximums: 50,000 for mercury-2, 65,536 for mercury-2.5, 131,072 for mercury-3. `max_tokens` is deprecated, and `max_completion_tokens` wins when both are sent — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- Temperature range is 0.5–1.0. Out-of-range values reset to the default (mercury-3: 1, mercury-2.5: 1, mercury-2: 0.75) "with a `warning` in the response" — [OpenAPI](https://api.inceptionlabs.ai/openapi.json). VERIFIED: `temperature:0.1` returned HTTP 200 with `"warning":"Warning: Requested temperature 0.1 is not within [0.5, 1]. Temperature has been set to 1."`
- The request also accepts `reasoning_summary` (bool, default false, "Request a summary of the model's reasoning process") and `reasoning_summary_wait` (bool, "Wait for all reasoning summaries to complete before finishing the response"). The response has `reasoning_summary: {content: string|null, status: "complete"|"unavailable"|"skipped"}` (nullable), and for streams it is "included in final chunk if available" — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- VERIFIED: `reasoning_summary:true` (with and without `reasoning_summary_wait:true`, streamed and non-streamed, effort medium) always returned `"reasoning_summary":null`. The feature appears inert for mercury-3 on this account.
- VERIFIED: an invalid `reasoning_effort:"minimal"` returned **HTTP 200 with no warning**. Values are not validated, so the client should constrain them.
- VERIFIED: `usage` shape `{"prompt_tokens":284,"completion_tokens":154,"total_tokens":438,"prompt_tokens_details":{"cached_tokens":9},"completion_tokens_details":{"reasoning_tokens":49}}`. `instant` produced `reasoning_tokens:0`. FAQ: "The nested detail counts are already included in their parent totals." Streaming needs `stream_options.include_usage:true` to get a final usage chunk — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- VERIFIED: in streams, `reasoning_details` (encrypted) arrives in the first delta alongside `role:"assistant"`. The usage chunk carries an undocumented `"server_timing":{"server_latency_ms":275.39}`.
- Models page: Mercury 3 has "`instant`, `low`, `medium`, and `high` reasoning effort"; Mercury Voice "supports `low`, `medium`, and `high`" — [Models](https://docs.inceptionlabs.ai/get-started/models)

### Inferences
- INFERRED: Always send `reasoning_effort` explicitly, given the documented default conflict. Voice should use `instant` or `low`, chat `low` or `medium`. Set `max_completion_tokens` at least 3000 when effort is medium or higher, to avoid `finish_reason:"length"` with empty content. Surface `warning` in dev logs.
- INFERRED: There is no visible reasoning text to render ("thinking" UI). Only token counts and opaque encrypted blobs are available.

### Gaps
- Why `reasoning_summary` is always null: it may be model-specific, plan-gated, or deprecated. Undocumented.

## 5. Full docs page inventory and capabilities beyond chat/streaming/FIM

### Takeaway
The sitemap has 42 URLs, and llms.txt lists the same pages plus /index, /resources/chat, and /support/{privacy,support,tou}. Capabilities beyond chat, streaming, FIM, tools, schema, and reasoning: **Decisions/Extract** (`mercury-decide` on `/v1/decisions`, which also accepts images), **Next Edit** (`/v1/edit/completions`), the **diffusing** visualization flag, automatic prefix caching, and the **API wind-down on 2026-12-28**. There is no embeddings, fine-tuning, seed, MCP, image generation, or audio endpoint.

### Cited Findings
- Full page list from [llms.txt](https://docs.inceptionlabs.ai/llms.txt) (sitemap.xml matches it):
  - Get started: `/index`, `/get-started`, `/get-started/authentication`, `/get-started/models`, `/get-started/sdks`, `/get-started/rate-limits`
  - API reference: `/api-reference/decisions/create-a-decision`, `/api-reference/chat/create-a-chat-completion`, `/api-reference/fim/create-a-fill-in-the-middle-completion`, `/api-reference/edit/create-a-code-edit-completion`, `/api-reference/models/{list-available-models,list-chat-models,list-fim-models,list-edit-models}`
  - Capabilities: `/capabilities/{reasoning-efforts,streaming,tool-use,structured-outputs,decisions,extract,fim,next-edit}`
  - Resources: `/resources/prompt-guide`, `/resources/chat`, `/resources/error-codes`, `/resources/faq`
  - Use cases: `/usecases/voice`
  - Cookbooks: `/cookbooks/{search-agent-mercury,customer-support-agent-mercury,realtime-voice-assistant,natural-language-sql-agent,coding-agent-mercury-tool-calling}`
  - Integrations: `/integrations/{claude-code,hermes,cursor,zed,kilo-code,opencode,open-claw,langchain,elevenlabs,vapi}`
  - Support: `/support/{wind-down,support,tou,privacy}`
- OpenAPI paths: `/v1/decisions`, `/v1/chat/completions`, `/v1/fim/completions`, `/v1/edit/completions`, `/v1/models`, `/v1/chat/completions/models`, `/v1/fim/completions/models`, `/v1/edit/completions/models`. There is no audio, realtime, or embeddings path — [OpenAPI](https://api.inceptionlabs.ai/openapi.json)
- Decisions: "Mercury Decide evaluates named questions against a shared `state` and returns typed answers with probabilities... `POST /v1/decisions` and the model `mercury-decide`." Question types are `noul` (binary probability), `choice` (criteria map), `score` (ordinal criteria array), and `extract`. Streaming is not supported. Only input tokens are billed: "$0.02 per million tokens (50% off the regular $0.04)" — [Decisions](https://docs.inceptionlabs.ai/capabilities/decisions); [Models](https://docs.inceptionlabs.ai/get-started/models)
- Extract: "Every span is an exact substring of your input, with character offsets and a confidence score. Nothing is generated." — [Extract](https://docs.inceptionlabs.ai/capabilities/extract)
- Images: the OpenAPI `Message.content` says "Models with image support accept user-message parts of the form {"type": "image_url", "image_url": {"url": "data:image/png;base64,...", "detail": "auto"}}... base64 PNG, JPEG, WebP, or GIF data URLs, at most 10 MiB each and 15 MiB total per request... Remote URLs are not supported." The FAQ says Mercury 3, 2.5, 2, and Edit 2 are text-only, and only Mercury Decide accepts images — [OpenAPI](https://api.inceptionlabs.ai/openapi.json); [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- Other chat params: `diffusing` (bool, "Whether to show the diffusion effect in the streamed response"), `stop` (string array), `extra_body` (passthrough object). There is no `seed`, `top_p`, `n`, or `logprobs` — [OpenAPI](https://api.inceptionlabs.ai/openapi.json); [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- FAQ: "Prefix caching is automatic and requires no request parameter"; there is no embeddings endpoint, no fine-tuning, and no seed; "Every new account includes a one-time credit of 100 million free tokens." — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- Rate limits per minute: Free tier 1,000 requests, 1,000,000 input tokens, 100,000 output tokens. Pay As You Go 3,000 / 3,000,000 / 300,000. Enterprise is custom — [Rate Limits](https://docs.inceptionlabs.ai/get-started/rate-limits)
- Error codes 400 (incl. `context_length_exceeded`), 401, 402 ("Account is inactive"), 404 (model not available for account), 413/422/504 (decisions), 429, 500, 502, 503 ("Engine overloaded"). Format: `{"error":{"message","type","param","code"}}` — [Error Codes](https://docs.inceptionlabs.ai/resources/error-codes). VERIFIED: an unavailable model returns **400**, not the documented 404.
- SDKs: `pip install inceptionai` / `npm install inceptionai`; TS `import Inception from 'inceptionai'`, reads `INCEPTION_API_KEY` — [SDKs](https://docs.inceptionlabs.ai/get-started/sdks)

### Inferences
- INFERRED: For the chat app, only chat completions (with tools, schema, reasoning, and the realtime flag) matter. Decisions could power cheap intent routing (for example "does this voice turn need a tool?"), but it is not needed.
- INFERRED: The legacy ids in the validation error (`mercury`, `mercury-coder`, `mercury-coder-small`, `mercury-small`, `mercury-3-preview-1002`, `mercury-3-preview-1014`) pass validation but are not in `/v1/models`. Don't expose them, because their availability isn't guaranteed.

### Gaps
- I did not fetch the `/resources/chat` page (Inception Chat consumer app) or the legal pages, since they have no API content.
- No migration target is named in the wind-down notice.
