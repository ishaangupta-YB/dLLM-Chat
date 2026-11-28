# dLLM Chat v2 roadmap and agent handoff

Branch: `claude/peaceful-dijkstra-11h6ft` (reset to `main` at v1). Nothing merges to `main` until the owner reviews.

Read first: `docs/ARCHITECTURE.md` (v1 layers), this file, and the research notes in `research_notes/v2/`:
`cookbooks.md` (all Inception cookbooks), `mcp_byok.md` (MCP + bring-your-own-key APIs), `agent_ui_preview.md`
(AI Elements agent components, coding agent UX, secure HTML preview, attachments, sidebar animation).

## Goals (from the owner)

1. Remove the header's top-right settings dropdown.
2. Restore the original theme (sky-blue primary, white / near-black backgrounds, see "Theme" below). Do not invent a new palette.
3. Chat column slightly wider (about 52rem instead of 48rem).
4. Fix sidebar open/close lag and the odd animation (measured: up to 67 ms frames when toggling with a long chat).
5. AI-generated chat titles after the first reply, updated live in the sidebar (done in contracts: `lib/chat/title.ts`, `/api/title`; UI must animate the change).
6. Implement every Inception cookbook in the app (see "Cookbook mapping").
7. Tools: web search, utilities, MCP servers (free ones like DeepWiki, Context7), custom MCP servers, all toggleable in settings.
8. Bring-your-own keys for third-party APIs (Tavily, ElevenLabs, Vapi). Keys live only in the browser.
9. Coding agent mode: a switch that turns the app into a Lovable-style builder (chat + Code/Preview panels, HTML/CSS/JS preview). Sandbox for React apps is "coming soon" (show it as such, do not build it).
10. File uploads (text extracted client-side; Mercury 3 is text only).
11. shadcn + AI Elements components only (plus small focused libs). Premium, consistent, no slop.

## Done in the contracts phase (do not redo)

| Area | Files |
| --- | --- |
| Types | `lib/types.ts`: `AppMode`, `Attachment`, `ToolCallRecord`, `SourceRef`, `CodeProject`, `ToolSettings`, `CustomMcpServer`, `ByokKeys`, `ToolRequestConfig`, `CodeRequestBody`, `TitleRequestBody`; `ChatMessage.attachments/toolCalls/sources/filesChanged`; `Conversation.titleSource/kind/project`; `ChatSettings.appMode/tools/aiTitles/voiceEngine` |
| Protocol | `lib/chat/protocol.ts`: `step`, `tool_start`, `tool_end`, `sources`, `file` events |
| Agent runtime | `lib/agent/runtime.ts` `runAgent()` (streamed tool calls, parallel tools, timeouts, multi-step, diffusion-aware); `lib/agent/types.ts` `AgentTool`; `lib/agent/schema.ts` `ToolConfigSchema`; `lib/agent/tools/index.ts` `resolveTools()` (currently utilities only); `lib/agent/tools/utilities.ts` |
| Chat route | `app/api/chat/route.ts` runs on `runAgent` + `resolveTools` |
| Titles | `app/api/title/route.ts` (structured outputs json_schema), `lib/chat/title.ts` `maybeGenerateTitle()` called by the controller after the first reply |
| Store | `lib/store/chat-store.ts`: `createConversation(kind?)`, `setConversationTitle(id, title, source)`, `applyFileChange`, `setActiveFile`, `setProject`; sanitisers for the new fields. `lib/store/keys-store.ts` (`dllm-chat:keys`, never exported) |
| Controller | `lib/chat/use-chat-controller.ts`: `send(text, {attachments})`, sends `tools` from settings via `buildToolConfig()`, handles all agent events, diffusion per step |
| Attachments | `lib/attachments/format.ts` `formatWithAttachments()`, limits |
| Stubs | `components/agent-ui/message-tools.tsx`, `components/integrations/{tools-menu,settings-dialog}.tsx`, `components/code-agent/code-agent-app.tsx`, `components/attachments/message-attachments.tsx` |

Live-verified: `/api/chat` with `tools:{utilities:true}` runs parallel tool calls and multi-step answers, also in diffusion mode.

## Workstreams and file ownership

Agents work in parallel. Stay inside your files. If you need a change elsewhere, write it in your final report.
Never run `git` commands or `next build` (the coordinator commits; a dev server with the API key runs on
http://localhost:3000). Test the real API only through the local routes (`/api/chat`, `/api/fim`, `/api/title`, ...);
do not read API keys from the environment.

### A. UX and shell
Owns: `components/chat/**` except `composer.tsx`; `app/globals.css`; `app/layout.tsx`; `app/page.tsx`; `components/ui/sidebar.tsx`; `components/mode-toggle.tsx`.
- Remove the header settings dropdown. Header keeps: sidebar trigger, title, model badge, and the Chat / Code mode switch (segmented control) that sets `settings.appMode`.
- `chat-app.tsx` renders `<CodeAgentApp/>` when `appMode === 'code'`; sidebar lists conversations of the current mode (`kind`), New chat creates the right kind.
- Sidebar footer: Settings button opening `<SettingsDialog/>` (from workstream B), LinkedIn link stays.
- Theme restore, wider column via `--chat-max-w` CSS variable (composer uses it too), sidebar animation fix, live AI-title animation in the sidebar and header (e.g. typewriter or crossfade when `titleSource` changes to 'ai').
- Assistant messages render `<MessageToolCalls/>` above the answer and `<MessageSources/>` below it; user messages render `<MessageAttachments/>`.

### B. Agent tools, MCP, integrations, cookbooks
Owns: `lib/agent/**` (except `runtime.ts`/`types.ts`, extend only if necessary and report), `app/api/mcp/**`, `app/api/integrations/**`, `components/agent-ui/**`, `components/integrations/**`.
- Tools: web search (Tavily BYOK, keyless fallback), fetch page, utilities, MCP (curated + custom with SSRF protection), cookbook agents (see mapping).
- UI: tool calls (AI Elements Tool / ChainOfThought), sources, ToolsMenu (composer), SettingsDialog (Tools and connectors, API keys, Voice, General).

### C. Coding agent
Owns: `components/code-agent/**`, `lib/code-agent/**`, `app/api/code/**`, `app/preview/**` (or the preview route chosen), CSP changes in `next.config.ts` needed for the preview (report them).
- Lovable-style layout, file tools through `runAgent`, secure sandboxed preview, version restore, "Sandbox (React) coming soon".

### D. Composer, attachments, voice BYOK
Owns: `components/chat/composer.tsx`, `components/attachments/**`, `lib/attachments/**` (keep `format.ts` API), `components/voice/**`, `lib/voice/**`, `app/api/voice/**`.
- Attachments (drag/drop, paste, picker) with text extraction; composer uses `--chat-max-w`; places `<ToolsMenu/>` and agent preset picker (from B) in the toolbar.
- ElevenLabs voice (BYOK) following the Realtime Voice Assistant cookbook; browser voice stays the default.

## Cookbook mapping

| Cookbook | Where it lives |
| --- | --- |
| Realtime Voice Assistant (ElevenLabs STT/TTS, sentence streaming) | D: voice engine `elevenlabs` |
| Voice quickstart (`realtime:true`, voice prompt) | Already in `/api/chat` voice turns |
| Search Agent (planner + search + cited synthesis) | B: web search tool with numbered citations + Research preset |
| Voice Customer Support Agent (clinic tools) | B: "Clinic support" agent preset with demo data tools |
| Natural Language SQL Agent | B: "SQL analyst" preset over a sample database |
| Coding Agent (file tools loop) | C: coding agent mode |
| Tool use / Structured outputs guides | runtime + `/api/title` |

## Theme

Original v0 palette (light): primary `oklch(75% 0.12 240)`, background white, foreground `oklch(9.08% 0.0054 285.82)`,
muted/accent `oklch(94.51% 0.0173 197.96)`, border `oklch(89.87% 0.0109 205.91)`, ring `oklch(59.69% 0.156 255.85)`, radius 0.5rem.
Dark: primary `oklch(80% 0.15 240)`, background `oklch(9.08% 0.0054 285.82)`, foreground `oklch(83.91% 0.0194 196.38)`,
muted/border `oklch(19.85% 0.0243 264.54)`. Full values: `git show 63c4923:app/globals.css`.
