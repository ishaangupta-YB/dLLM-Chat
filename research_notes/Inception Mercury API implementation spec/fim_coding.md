# Inception Mercury API: coding endpoints (FIM autocomplete, Next Edit, Apply Edit)

Researched 2026-11-24. Sources are the official docs (docs.inceptionlabs.ai, fetched as raw `.md`), the live OpenAPI spec (https://api.inceptionlabs.ai/openapi.json), Inception blog posts, and real API calls made with `$DLLM_API_KEY` from a US-East cloud container (the responses came through CloudFront POP IAD61). Labels used below: **[VERIFIED-LIVE]** means a real request confirmed it. **[DOCS]** means it comes from the docs or OpenAPI spec. **[UNVERIFIED]** means it is not confirmed.

> **CRITICAL CONTEXT: the API is shutting down.** The wind-down page says: "The Mercury API remains fully available through December 28, 2026 ... After December 28, 2026 API requests stop being served, and you lose access to the platform and to any data submitted to it." That is about 5 weeks after this research date. Any editor built on these endpoints needs a provider abstraction. — [Mercury API wind-down](https://docs.inceptionlabs.ai/support/wind-down)

---

## Q1. FIM / autocomplete endpoint: path, model, request fields, response shape, streaming

### Takeaway
FIM is `POST https://api.inceptionlabs.ai/v1/fim/completions` with `model: "mercury-edit-2"`. It is OpenAI legacy-completions shaped: you send `prompt` (prefix) plus an optional `suffix` and read `choices[0].text`. Streaming works over SSE (`stream: true`), with `data: [DONE]` as the terminator. A typical inline completion returned end to end in about 0.4 to 0.75 s (measured with curl, network included). `temperature` is **not** in the FIM schema. The legacy model id `mercury-coder` is still accepted on this endpoint.

### Cited Findings

**Endpoint and model**
- The endpoint is `POST /v1/fim/completions` with model `mercury-edit-2`. The docs say: "You send the code **before** the cursor as `prompt` (the prefix) and the code **after** the cursor as `suffix`; Mercury Edit 2 returns the text that belongs in between. This is what powers inline autocomplete in an editor." — [Autocomplete (FIM)](https://docs.inceptionlabs.ai/capabilities/fim)
- The API reference says: "Designed for IDE-style inline completion. Returns a `FimCompletion` object, or a server-sent events stream of `FimCompletionChunk` deltas when `stream=true`. Tool calling and function calling are not supported." — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json), [API ref](https://docs.inceptionlabs.ai/api-reference/fim/create-a-fill-in-the-middle-completion)
- Mercury Edit 2 pricing: $0.25 per 1M input tokens, $0.025 per 1M cached input tokens, $0.75 per 1M output tokens. Context window: "FIM: 32K NextEdit: 32K". Max output tokens: 8,192. Text only. — [Models](https://docs.inceptionlabs.ai/get-started/models)
  - Conflict: `GET /v1/fim/completions/models` [VERIFIED-LIVE] returns `"context_length":128000,"max_output_length":32000,"supported_sampling_parameters":["temperature","stop"],"supported_endpoints":["edit.completions","fim.completions"]`. The docs table says 32K context and 8,192 max output, and request validation rejects `max_tokens` above 8192 (see below). Plan for 32K context and 8,192 output.
- `GET /v1/models` [VERIFIED-LIVE] lists only `mercury-2`, `mercury-2.5`, `mercury-3` and `mercury-decide`. It does **not** list `mercury-edit-2`, which appears only under `/v1/fim/completions/models` and `/v1/edit/completions/models`. Both of those returned only `mercury-edit-2`.
- The legacy id still works [VERIFIED-LIVE]. A FIM request with `"model":"mercury-coder"` returned HTTP 200 with `"model":"mercury-coder"` echoed back. A chat-completions validation error also listed the accepted chat models as `mercury, mercury-2, mercury-2.5, mercury-3, mercury-3-preview-1002, mercury-3-preview-1014, mercury-coder, mercury-coder-small, mercury-small`, which shows `mercury-coder` is still a recognised id. Use `mercury-edit-2` for FIM.

**Request schema `FIMCompletionRequest`, exactly as in the OpenAPI spec** — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)

| field | type | default | constraints / description |
|---|---|---|---|
| `model` | string | (required) | "The model to use for the FIM completion." |
| `prompt` | string | (required) | "The prompt to complete." (the prefix) |
| `suffix` | string | (optional) | "The suffix to complete." |
| `max_tokens` | int | **512** | min 1, max **8192** |
| `top_p` | number | 1.0 | 0–1 |
| `top_k` | int | -1 | "Must be `-1` (disables the cutoff...) or an integer from 1 to 1000; other values such as 0 are rejected." |
| `frequency_penalty` | number | 0.0 | -2 to 2 |
| `presence_penalty` | number | **1.5** | -2 to 2 |
| `repetition_penalty` | number | 1.0 | >0 |
| `stop` | string[] | **`["\n\n", "\n \n"]`** | "The returned text will not contain the stop sequences. Defaults to common code-block boundaries." |
| `stream` | bool | false | |
| `stream_options` | `{include_usage: bool}` | `include_usage:false` | "an additional chunk is streamed before the `data: [DONE]` message containing the token usage ... `choices` is an empty array" |

- There is **no `temperature` field** in `FIMCompletionRequest`. A request with `"temperature":0` still returned HTTP 200 [VERIFIED-LIVE], and so did a made-up field `"foo":1`. Unknown fields are silently ignored, so it is **[UNVERIFIED]** whether temperature has any effect on FIM. The `/models` metadata lists `temperature` as a supported sampling parameter, which contradicts the schema.
- Out-of-range values are rejected [VERIFIED-LIVE]. `max_tokens: 9000` gave HTTP 400: `{"error":{"message":[{"type":"value_error","loc":["body","max_tokens"],"msg":"Value error, max_tokens must be between 1 and 8192",...}],"type":"invalid_request_error","param":null,"code":"invalid_request_error"}}`. In this error, `error.message` is an **array** of pydantic errors, not a string, so the client must handle both forms.
- `max_tokens` is a soft cap [VERIFIED-LIVE]. With `max_tokens: 8`, `completion_tokens` came back as 10 and 11 with `finish_reason:"length"`. The model may slightly overshoot, probably because diffusion decodes in blocks (that cause is an inference).

**Response `FIMCompletionResponse`** — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)
- Fields: `id`, `object:"text_completion"`, `created`, `model`, `choices[]` (`index`, `text`, `finish_reason` ∈ `stop|length|content_filter|null`), `usage`, and a `warning` that is a string or null.
- The doc example shows `usage` with `reasoning_tokens` and `cached_input_tokens` at the top level. The **live** shape is different [VERIFIED-LIVE]: `usage: {prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details:{cached_tokens}, completion_tokens_details:{reasoning_tokens}}`, which matches the `FIMUsage` schema.

**Real response captured [VERIFIED-LIVE]** (official factorial example, `max_tokens: 64`):
```json
{"id":"cmpl-51651e44-2bb1-421f-8c37-ea8b9f42a36c","object":"text_completion","created":1795547149,"model":"mercury-edit-2","choices":[{"index":0,"text":"factorial(n - 1)","finish_reason":"stop"}],"usage":{"prompt_tokens":30,"completion_tokens":10,"total_tokens":40,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}},"warning":null}
```
Timing: HTTP 200 in 0.610 s, then 0.606 s and 0.467 s on repeats. The repeats showed `cached_tokens: 15`, so prefix caching is automatic.

Multi-line TS example: prompt `"// Returns true if s is a palindrome\nexport function isPalindrome(s: string): boolean {\n"`, suffix `"\n}\n"`. Response in 0.504 s:
```json
{"id":"cmpl-dd7a2a4d-...","object":"text_completion","created":1795547151,"model":"mercury-edit-2","choices":[{"index":0,"text":"  const cleanedString = s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();\n  return cleanedString === cleanedString.split('').reverse().join('');","finish_reason":"stop"}],"usage":{"prompt_tokens":22,"completion_tokens":34,"total_tokens":56,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":0}},"warning":null}
```
Response headers included `server: uvicorn`, `x-request-id: <uuid>`, `x-process-time: 0.268` (server-side seconds) and `via: CloudFront`. The returned text includes leading indentation and no trailing newline, so it can be inserted verbatim at the cursor.

With no suffix (`"import os\n\ndef read_file(path):\n"`), the call took 0.745 s and returned `"    with open(path, 'r') as file:\n        content = file.read()\n    return content"`.

With a custom `stop:["\n"]` and `temperature:0` (`const doubled = ` / `;\nconsole.log(doubled);`), the call took 0.471 s and returned `"nums.map(n => n * 2)"`.

**Streaming, real SSE capture [VERIFIED-LIVE]** with `stream:true, stream_options:{include_usage:true}`, prompt `"function add(a, b) {\n  return "`, suffix `"\n}\n"`:
```
data: {"id": "cmpl-69e8...", "object": "text_completion", "created": 1795547151, "model": "mercury-edit-2", "choices": [{"index": 0, "text": "", "finish_reason": null}]}

data: {... "choices": [{"index": 0, "text": "a", "finish_reason": null}]}

data: {... "choices": [{"index": 0, "text": " + ", "finish_reason": null}]}

data: {... "choices": [{"index": 0, "text": "b;", "finish_reason": "stop"}]}

data: {... "choices": [{"index": 0, "text": "", "finish_reason": "stop"}]}

data: {... "choices": [], "usage": {"prompt_tokens": 14, "completion_tokens": 7, "total_tokens": 21, "prompt_tokens_details": {"cached_tokens": 0}, "completion_tokens_details": {"reasoning_tokens": 0}}, "server_timing": {"server_latency_ms": 186.89}}

data: [DONE]
```
Time to first byte was 0.308 s and the total was 0.428 s. The chunks are **incremental deltas**, not cumulative text, so the client concatenates `choices[0].text`. `finish_reason:"stop"` shows up twice, on the last text chunk and then on an empty chunk. The usage chunk has `choices: []` and carries an extra undocumented `server_timing.server_latency_ms` field.

**Latency with a larger context [VERIFIED-LIVE]**: about 2,740 prompt tokens (120 TS helper functions plus a loop), `max_tokens:64`, `stop:["\n\n"]`. Four runs took 0.512, 0.681, 0.464 and 0.399 s, and each returned `"helper0(x);"`. From the second run on, `cached_tokens` was about 2,690–2,750 of about 2,740. Identical requests reported slightly different `prompt_tokens` (2741/2756/2704/2763). The cause is unknown and probably server-side.

**Official code examples, copied verbatim** — [Autocomplete (FIM)](https://docs.inceptionlabs.ai/capabilities/fim)
```bash
curl https://api.inceptionlabs.ai/v1/fim/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INCEPTION_API_KEY" \
  -d '{
    "model": "mercury-edit-2",
    "prompt": "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * ",
    "suffix": "\n\nprint(factorial(5))",
    "max_tokens": 1000
}'
```
```python
from inceptionai import Inception

client = Inception()  # reads INCEPTION_API_KEY from the environment

completion = client.fim.completions.create(
    model="mercury-edit-2",
    prompt="def factorial(n):\n    if n <= 1:\n        return 1\n    return n * ",
    suffix="\n\nprint(factorial(5))",
    max_tokens=1000,
)
# The completion is the code that fills the gap, e.g. "factorial(n - 1)"
print(completion.choices[0].text)
```
```typescript
import Inception from 'inceptionai';

const client = new Inception(); // reads INCEPTION_API_KEY from the environment

const completion = await client.fim.completions.create({
  model: 'mercury-edit-2',
  prompt: 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * ',
  suffix: '\n\nprint(factorial(5))',
  max_tokens: 1000,
});
// The completion is the code that fills the gap, e.g. "factorial(n - 1)"
console.log(completion.choices[0]?.text);
```
The OpenAPI example request is `{"model":"mercury-edit-2","prompt":"def fibonacci(n: int) -> int:\n    if n <= 1:\n        return n\n    return ","suffix":"\n\nprint(fibonacci(10))\n","max_tokens":256}`, with example text `"fibonacci(n - 1) + fibonacci(n - 2)"`. — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)
- SDKs: `pip install inceptionai` and `npm install inceptionai`. The TS client is `client.fim.completions.create(...)` and `client.edit.completions.create(...)`, and it reads the env var `INCEPTION_API_KEY`. The spec has Stainless annotations (`x-stainless-stream-type: sse`). — [Autocomplete (FIM)](https://docs.inceptionlabs.ai/capabilities/fim), [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)
- The docs say: "FIM has no separate fields for edit history or other open files. Add any extra context directly to `prompt`, such as imports, related types, or a short description of the intended code." — [Autocomplete (FIM)](https://docs.inceptionlabs.ai/capabilities/fim)

**Errors** — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)
- 400 `invalid_request_error` (for example `context_length_exceeded`), 401 `invalid_api_key`, 402 `account_error` ("Account is inactive"), 404 `model_not_found`, 429 `rate_limit_reached`, 500 `server_error`. All use the envelope `{"error":{"message","type","param","code"}}`.
- Rate limits per minute: Free tier is 1,000 requests, 1M input tokens and 100K output tokens. Pay As You Go is 3,000 requests, 3M input and 300K output. — [Rate Limits](https://docs.inceptionlabs.ai/get-started/rate-limits)
- CORS [VERIFIED-LIVE]: an OPTIONS preflight from `Origin: http://localhost:3000` returned `access-control-allow-origin: http://localhost:3000`, `access-control-allow-headers: authorization,content-type`, `access-control-allow-credentials: true` and `access-control-max-age: 600`. The browser could therefore call the API directly, but that would expose the key. Proxy through the Next.js route instead.

### Inferences
- For a Next.js route `POST /api/complete`, forward `{model:"mercury-edit-2", prompt, suffix, max_tokens, stop}` to `https://api.inceptionlabs.ai/v1/fim/completions` with `Authorization: Bearer ${process.env.DLLM_API_KEY}`, then return `choices[0].text`. Non-streaming is simpler and good enough for ghost text, since total latency is about 0.4–0.7 s and tokens are short. Streaming adds little for 5–40 token completions.
- For single-line ghost text, pass `stop: ["\n"]` and `max_tokens` around 64. For multi-line block completion, keep the default stops (`"\n\n"`, `"\n \n"`) and use `max_tokens` around 128–256. These numbers are a recommendation, not official guidance.
- Abort in-flight requests with `AbortController` on each keystroke, both from the client to the route and from the route to upstream, so the 3,000 requests/min rate limit is not wasted.
- Prefix caching is automatic, and the second request on the same prefix is cheaper and usually faster. Keep the prompt prefix stable (for example, file header first) to get cache hits.
- Trim `prompt` and `suffix` to fit 32K tokens. A practical choice is about 4–8K characters of prefix and about 1–2K of suffix around the cursor.
- The returned text may repeat the start of the suffix. Strip any overlap with the suffix client-side, which is common FIM hygiene; it was not observed in these tests.
- Treat `error.message` as `string | array`.

### Gaps
- No official debounce interval, recommended `max_tokens` for inline FIM, or latency SLA is published for FIM. The docs examples use `max_tokens` of 1000 and 256. Typical IDE practice is a 150–300 ms debounce, but no Inception source states that.
- It is unverified whether `temperature` affects FIM. It is absent from the schema and silently accepted.
- No official IDE-integration guide for FIM exists in the current docs. The Zed page covers only Next Edit, and there is no Continue page in the current docs.

---

## Q2. Next Edit endpoint: path, model, prompt tags, request and response shapes

### Takeaway
Next Edit is `POST /v1/edit/completions` with `model: "mercury-edit-2"`. The body has chat-style `messages`, which must be a **single user message** whose content contains nine required tags. The response is `choices[0].message.content`: the rewritten editable region wrapped in triple backticks. Streaming is **not supported** (a request with `stream: true` returns HTTP 400).

### Cited Findings
- The API reference says: "The request must contain a single user message whose content includes the required edit prompt tags (e.g. `<|code_to_edit|>`, `<|cursor|>`, `<|current_file_content|>`). Returns an `EditCompletion` object. Streaming and tool calling are not supported on this endpoint." — [API ref: edit](https://docs.inceptionlabs.ai/api-reference/edit/create-a-code-edit-completion)
- `EditCompletionRequest` fields: `messages` (required; each item is `{role:"user" (const), content: string | object[]}`), `model` (required), `max_tokens` (default **1024**, 1–8192), `temperature` (default **0.2**, 0–2), `top_p` (default 1.0), `presence_penalty` (default **1.0**). There is no `stream` field. — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)
- The FAQ says: "The code edit endpoint (`/v1/edit/completions`) uses a different temperature range of 0–2 with a default of 0.2 and no clamping." — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- Response `EditCompletionResponse`: `id`, `object:"edit.completion"`, `created`, `model`, `choices[]` (`index`, `message:{role:"assistant", content}`, `finish_reason`), `usage`, `warning`. — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)
- Required tags, from a live validation error [VERIFIED-LIVE]. A request without tags returned HTTP 400: `"Value error, Missing required tags in user message: <|recently_viewed_code_snippets|>, <|/recently_viewed_code_snippets|>, <|edit_diff_history|>, <|/edit_diff_history|>, <|current_file_content|>, <|/current_file_content|>, <|code_to_edit|>, <|/code_to_edit|>, <|cursor|>"`.
- Streaming is rejected [VERIFIED-LIVE]. `stream:true` returned HTTP 400 `{"error":{"message":"Streaming is not supported for Next Edit completions","type":"invalid_request_error",...}}`.
- The documented format, verbatim — [Next Edit](https://docs.inceptionlabs.ai/capabilities/next-edit)
```text
<|recently_viewed_code_snippets|>
<|recently_viewed_code_snippet|>
code_snippet_file_path: [SNIPPET FILE PATH 1]
[SNIPPET 1 CODE]
<|/recently_viewed_code_snippet|>

<|recently_viewed_code_snippet|>
code_snippet_file_path: [SNIPPET FILE PATH 2]
[SNIPPET 2 CODE]
<|/recently_viewed_code_snippet|>
<|/recently_viewed_code_snippets|>
```
```text
<|current_file_content|>
current_file_path: [CURRENT FILE PATH]
[CODE ABOVE EDITABLE REGION]
<|code_to_edit|>
[EDITABLE REGION CODE]
<|/code_to_edit|>
[CODE BELOW EDITABLE REGION]
<|/current_file_content|>
```
"Mercury Edit will return an updated version of the editable region in its response (e.g., completing a function) enclosed in triple backticks."
```text
<|edit_diff_history|>
--- [EDITED FILE PATH 1]
+++ [EDITED FILE PATH 1]
[DIFF HUNK HEADER 1 WITH @@]
[DIFF LINES 1]

--- [EDITED FILE PATH 2]
+++ [EDITED FILE PATH 2]
[DIFF HUNK HEADER 2 WITH @@]
[DIFF LINES 2]

<|/edit_diff_history|>
```
Empty sections are allowed: "please add `<|recently_viewed_code_snippets|>\n\n<|/recently_viewed_code_snippets|>` with no contents inside the tags", and the same applies to `<|edit_diff_history|>\n\n<|/edit_diff_history|>`. The `<|cursor|>` marker goes inside the editable region (see the example).
- Official cURL example, verbatim — [Next Edit](https://docs.inceptionlabs.ai/capabilities/next-edit)
```bash
curl https://api.inceptionlabs.ai/v1/edit/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INCEPTION_API_KEY" \
  -d "{
    \"model\": \"mercury-edit-2\",
    \"messages\": [
      {
        \"role\": \"user\",
        \"content\": \"<|recently_viewed_code_snippets|>\\n\\n<|/recently_viewed_code_snippets|>\\n\\n<|current_file_content|>\\ncurrent_file_path: solver.py\\n'''\\nfunction: flagAllNeighbors\\n----------\\nThis function marks each of the covered neighbors of the cell at the given row\\n<|code_to_edit|>\\nand col as flagged.\\n'''\\ndef flagAllNeighbors(board<|cursor|>, row, col): \\n for r, c in b.getNeighbors(row, col):\\n if b.isValid(r, c):\\n b.flag(r, c)\\n\\n<|/code_to_edit|>\\n<|/current_file_content|>\\n\\n<|edit_diff_history|>\\n--- /c:/Users/test/testing/solver.py\\n+++ /c:/Users/test/testing/solver.py\\n@@ -6,1 +6,1 @@\\n-def flagAllNeighbors(b, row, col): \\n+def flagAllNeighbors(board, row, col): \\n\\n<|/edit_diff_history|>\"
      }
    ]
  }"
```
TypeScript usage: `await client.edit.completions.create({ model: 'mercury-edit-2', messages: [{ role: 'user', content }] })`, then `completion.choices[0]?.message.content`. — [Next Edit](https://docs.inceptionlabs.ai/capabilities/next-edit)
- Real Next Edit response [VERIFIED-LIVE] for a `math.ts` file with `add`, then `sub` in the edit history, and a cursor after `export function mul`. Two runs took 0.595 s and 0.542 s:
```json
{"id":"cmpl-33349084-...","object":"edit.completion","created":1795547176,"model":"mercury-edit-2","choices":[{"index":0,"message":{"role":"assistant","content":"```\nexport function sub(a: number, b: number): number {\n  return a - b;\n}\n\nexport function mul(a: number, b: number): number {\n  return a * b;\n}\n```"},"finish_reason":"stop"}],"usage":{"prompt_tokens":289,"completion_tokens":52,"total_tokens":341,"prompt_tokens_details":{"cached_tokens":24},"completion_tokens_details":{"reasoning_tokens":0}},"warning":null}
```
The output is the **whole editable region**, fenced with three backticks and no language tag. Strip the fences, then diff the result against the original region to render the suggestion.
- Best practices, quoted from [Next Edit](https://docs.inceptionlabs.ai/capabilities/next-edit):
  - Snippets: "Include **3–5 snippets** of roughly 20 lines each, centered around the user's recent cursor positions ... Always provide the **latest state** of code at each snippet location, as stale snippets can cause the model to suggest reverting recent changes."
  - Edit history: "Include at least the **last 3–5 user edits**, ordered chronologically with the most recent edit last. Edits should be **range-based** ... The edit history is often the strongest signal for identifying user intent."
  - Current file: "Pass in the **entire current file** ... For extremely large files, trim distant regions while preserving the area around the editable region."
  - Editable region: "The editable region directly determines output token count and dominates latency. We recommend starting with **10–15 lines** (~100–150 tokens) ... At ~1,000 tokens/second decoding speed, an upper bound of around 25 lines (~250 tokens) is practical ... center the region around the cursor: `[currentLine - 5, currentLine + 10]`." Other suggestions on the page: parallel requests with disjoint regions, linter-guided region selection, and a configurable maximum region size.
- Zed integration: Settings → AI → Edit Predictions → Configure Providers → Mercury, then paste the Inception key. — [Zed](https://docs.inceptionlabs.ai/integrations/zed)
- Blog claim: Mercury Edit 2's "edits are accepted 48% more often" and it is "27% more selective in the edits it displays". The blog gives no absolute latency numbers. The page metadata shows Nov 18, 2026, which may be an updated-at timestamp rather than the original publication date. — [Introducing Mercury Edit 2](https://www.inceptionlabs.ai/blog/introducing-mercury-edit-2)

### Inferences
- Next Edit can drive "Tab to jump/accept" multi-line suggestions in Monaco or CodeMirror. Render them as an inline diff decoration rather than ghost text. It is not streamed, so the full round trip (about 0.55–0.6 s for a 15-line region) must finish before anything is shown.
- The one-message tag protocol is strictly validated, so build the content string with a helper that always emits all nine tags.

### Gaps
- No published guidance on debounce or triggering for Next Edit (on keystroke, on idle, or on cursor move).

---

## Q3. Apply Edit: does it exist, and in what format?

### Takeaway
An Apply-Edit endpoint (`/v1/apply/completions`, model `mercury-coder`, tags `<|original_code|>` and `<|update_snippet|>`) was announced in an Inception blog post. It is **gone from the live API**: both an empty request and a properly tagged request return HTTP 404 `{"detail":"Not Found"}`. It is also absent from the OpenAPI spec and the current docs. Do not build on it.

### Cited Findings
- Blog: "To access Apply-Edit programatically, update your Mercury Coder endpoint to `/v1/apply/completions`. Mercury Coder expects apply-edit requests to contain 2 sections: the original code and an update snippet." The tag format is `<|original_code|>{original_code}<|/original_code|>`, followed by `<|update_snippet|>// ... existing code ...\n[UPDATED CODE SNIPPET 1]\n// ... existing code ...<|/update_snippet|>`, sent as a single user message with `"model": "mercury-coder"`. Claims: "accurately applies edits 92% of the time, matching ... GPT-5, while running 46x as fast". The post also says the feature was usable via the Continue VS Code extension. — [Ultra-Fast Apply-Edit with Mercury Coder](https://www.inceptionlabs.ai/blog/ultra-fast-apply-edit-with-mercury-coder)
- The live OpenAPI spec has only these paths: `/v1/decisions`, `/v1/chat/completions`, `/v1/fim/completions`, `/v1/edit/completions`, `/v1/models`, `/v1/chat/completions/models`, `/v1/fim/completions/models` and `/v1/edit/completions/models`. — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)
- The FAQ says: "Inception's API covers chat completions (`/v1/chat/completions`), fill-in-the-middle completions (`/v1/fim/completions`), and code edit completions (`/v1/edit/completions`)." — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- [VERIFIED-LIVE]: `POST /v1/apply/completions` with `mercury-coder` and correct tags returned HTTP 404 `{"detail":"Not Found"}`.
- [VERIFIED-LIVE]: `mercury-edit-2` is rejected on `/v1/chat/completions` because it is not in the chat model list.

### Inferences
- To get "apply this snippet to the file" behaviour, use `/v1/chat/completions` with `mercury-3` and a system prompt asking for the full merged file. Alternatively, use `/v1/edit/completions` with the target region as `<|code_to_edit|>` and the intended change expressed as context. That second approach is an unofficial workaround and has not been tested.

### Gaps
- When `/v1/apply/completions` was removed is undocumented. The blog's metadata date (Nov 18, 2026) may be an updated-at timestamp, so its original publication date is unclear.

---

## Q4. Recommended practices: debounce, max_tokens, stop sequences, latency

### Takeaway
Inception publishes concrete latency and sizing guidance only for Next Edit: about 1,000 tokens/s decoding, 10–15 line regions, and a 25-line upper bound. For FIM, the only official tuning values are the schema defaults: `max_tokens` 512, `stop` `["\n\n","\n \n"]` and `presence_penalty` 1.5. In measured runs, FIM took 0.40–0.75 s end to end from a US-East client, with about 0.19–0.27 s of that on the server.

### Cited Findings
- FIM defaults: `max_tokens` 512, `stop` `["\n\n", "\n \n"]` ("Defaults to common code-block boundaries"), `presence_penalty` 1.5, `top_k` -1. — [OpenAPI spec](https://api.inceptionlabs.ai/openapi.json)
- The docs give "~1,000 tokens/second decoding speed" and an editable-region recommendation of 10–15 lines. — [Next Edit](https://docs.inceptionlabs.ai/capabilities/next-edit)
- Measured [VERIFIED-LIVE]:
  - FIM non-streaming took 0.40–0.75 s across 10 calls, covering prompt sizes from 5 to about 2,760 tokens and 6–34 output tokens.
  - FIM streaming had a TTFB of 0.31 s and a total of 0.43 s, with `server_timing.server_latency_ms: 186.89`.
  - The `x-process-time` header showed 0.268 s.
  - Next Edit (about 290 prompt and 52 output tokens) took 0.54–0.60 s.
  - `GET /v1/models` took 0.32 s, which approximates the pure network round-trip overhead.
- Prefix caching is automatic. The docs say: "The `usage.prompt_tokens_details.cached_tokens` field reports how many prompt tokens were served from cache ... The API does not expose a documented TTL." — [FAQ](https://docs.inceptionlabs.ai/resources/faq)
- Every new account gets 100M free tokens. — [FAQ](https://docs.inceptionlabs.ai/resources/faq)

### Inferences
These implementation recommendations are not official.
- Debounce FIM by about 150–250 ms after the last keystroke, and cancel stale requests with AbortController. Skip the request when the cursor is mid-word in the suffix, or when the line after the cursor holds anything other than closing brackets or whitespace.
- Inline single-line ghost text: `max_tokens: 64`, `stop: ["\n"]`.
- Multi-line or block ghost text: `max_tokens: 128–256`, default stops.
- Cache the last completion keyed on prefix and suffix. If the user types characters that match the ghost text, consume them locally without making a new request.
- Leave `presence_penalty` at the default of 1.5, or lower it to about 0 if completions avoid repeating identifiers they should repeat. Whether this helps is untested.
- Budget about 0.5 s end to end from US clients. Expect higher latency outside North America, since the API is served from the US (`datacenters: US`).

### Gaps
- No official FIM debounce, latency SLA, or recommended inline `max_tokens` value.
- Latency was measured from a single US-East location over a small sample of about 15 calls, so it is not a benchmark.
