# dLLM Chat

A fast chat app for Inception Labs' **Mercury** diffusion language models, built with Next.js 16, React 19, Tailwind v4, shadcn/ui and shadcn **AI Elements**.

> **Note:** Inception's docs say the Mercury API stops serving requests after **December 28, 2026**
> ([wind-down notice](https://docs.inceptionlabs.ai/support/wind-down)). All upstream calls go
> through one module (`lib/server/inception.ts`), so pointing the app at another
> OpenAI-compatible provider only means changing that module and `lib/models.ts`.

## Demo Video
https://github.com/user-attachments/assets/646b2b61-3ae7-42d8-91bd-28699df7b674

## Features

- **Mercury 3** (newest, 1M context) plus Mercury 2.5 and Mercury 2, with selectable reasoning effort (`instant`, `low`, `medium`, `high`).
- **Streaming and Diffusion modes.** Streaming appends text as it arrives. Diffusion shows each denoising frame of the answer as it settles into place, paced so the effect stays visible (also between agent tool steps).
- **Agent tools.** Web search with numbered citations and a sources list (Tavily with your own key, or a free search fallback), page reading, calculator and time, all shown as live tool cards.
- **MCP connectors.** Free remote MCP servers (DeepWiki, Context7, Exa, Microsoft Learn, Hugging Face, AWS Knowledge, Cloudflare and Astro docs) can be switched on or off, and you can add your own server URL (with SSRF protection and a "test connection" tool list).
- **Cookbook agents.** Presets built from the Inception cookbooks: Research (search agent), Clinic support (customer support agent with demo data) and SQL analyst (natural-language SQL over a sample database).
- **Coding agent mode.** A Chat | Code switch opens a Lovable-style builder: chat on the left, live preview and code on the right, file tree, editor with autocomplete, device widths, console, version history and zip download. Previews run in an isolated sandbox. A React/Node sandbox is marked as coming soon.
- **File attachments.** Attach text, code, CSV, JSON, PDF or DOCX files (drag and drop, paste or picker). Text is extracted in the browser because Mercury 3 is text-only.
- **Editable code canvas with FIM autocomplete** on every code block in chat (Mercury Edit, fill-in-the-middle).
- **Voice mode.** Hands-free voice chat with browser speech, or ElevenLabs speech-to-text and text-to-speech with your own key (Realtime Voice Assistant cookbook).
- **AI chat titles.** After the first reply a second, structured-output call names the chat, and the sidebar updates live.
- **Conversation history** grouped by date with search, rename, pin, delete and JSON export/import, saved in `localStorage` after every message.
- **Bring your own keys.** Third-party keys (Tavily, ElevenLabs) are stored only in your browser and never saved on the server.
- **Security.** The Inception key is server-only. API routes enforce same-origin requests, validate input, cap sizes and rate-limit. Strict CSP, sandboxed previews, untrusted tool output is labelled as data.

## Getting started

```bash
npm install
```

```bash
cp .env.example .env.local   # then set INCEPTION_API_KEY
```

```bash
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `INCEPTION_API_KEY` | yes (or `DLLM_API_KEY`) | Inception API key. Server only. |
| `MERCURY_VOICE_MODEL` | no | Enterprise Mercury Voice model id for voice turns. Defaults to `mercury-3` + `realtime`. |
| `ALLOWED_ORIGINS` | no | Extra origins allowed to call `/api/*` (comma separated). Same-origin is always allowed. |
| `INCEPTION_BASE_URL` | no | Override `https://api.inceptionlabs.ai/v1`. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run typecheck` | TypeScript |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The API research behind the implementation is in
[`reports/Inception Mercury API implementation spec.md`](reports/Inception%20Mercury%20API%20implementation%20spec.md).
