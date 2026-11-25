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
- **Streaming and Diffusion modes.** Streaming appends text as it arrives. Diffusion shows each denoising frame of the answer as it settles into place, paced so the effect stays visible.
- **Editable code canvas.** Code blocks in replies open in an editable, resizable CodeMirror canvas. You can save with the button, with Ctrl/Cmd+S or by clicking outside, and your edits are written back into the chat history. The canvas also has copy, download and maximize.
- **FIM autocomplete.** Ghost-text suggestions in the canvas come from Mercury Edit (`mercury-edit-2`, fill-in-the-middle). Tab accepts and Esc dismisses. A switch turns it on or off; it is on by default.
- **Voice mode.** A hands-free conversation loop using browser speech recognition and synthesis. Answers come from a low-latency Mercury voice turn (`realtime`, spoken-style prompt, sentence-by-sentence TTS). If an enterprise Mercury Voice model id is configured, it is used.
- **Conversation history.** A sidebar groups chats by date, with search, rename, pin, delete, and JSON export/import. History is saved as JSON in `localStorage` after every message.
- **Security.** The API key is read only on the server. API routes enforce same-origin requests, validate input, cap body size and rate-limit per IP.

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
