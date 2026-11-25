# AI Elements (shadcn / AI SDK) + In-browser Code Editor for an Inline-Editable Canvas with Ghost-Text Autocomplete

Research date: 2026-11-24. Target app: Next.js 16 / React 19 / Tailwind v4, existing `components.json` (verified in repo: `"style": "new-york"`, `"rsc": true`, `baseColor: "stone"`, `cssVariables: true`, `iconLibrary: "lucide"`, css at `app/globals.css`). Repo already has `zustand ^5`, `streamdown ^2.3.0`, `motion ^12`, `next-themes`, `next 16.1.6`, `react 19.2.4`, `tw-animate-css` (from local `/home/user/dLLM-Chat/package.json`).

Current npm versions (from `npm view`, 2026-11-24): `ai-elements` CLI 1.9.1 · `ai` 7.0.181 · `@ai-sdk/react` 4.0.186 · `streamdown` 2.8.1 · `shiki` 4.6.0 · `use-stick-to-bottom` 1.1.6 · `motion` 14.14.0 · `shadcn` 4.23.0 · `react-resizable-panels` 4.24.1 · `next` 16.4.6 · `tailwindcss` 4.3.5 · `monaco-editor` 0.58.0 · `@monaco-editor/react` 4.7.0 (dist-tag `next` = 4.8.0-rc.3) · `@monaco-editor/loader` 1.7.0 · `@uiw/react-codemirror` 4.25.13 · `@codemirror/view` 6.43.15 · `@codemirror/state` 6.7.6 · `codemirror` 6.0.2 · `codemirror-copilot` 0.0.7 (last published 2024-01-18) · `@marimo-team/codemirror-ai` 0.3.10 (published 2026-10-22).

---

## 1. Install commands, registry config, peer deps

### Takeaway
There are now TWO "AI Elements": (a) the original Vercel registry at elements.ai-sdk.dev (`npx ai-elements@latest add <c>` or `npx shadcn@latest add @ai-elements/<c>`, no components.json change needed because `@ai-elements` is in shadcn's built-in registry index), which is being deprecated at the end of November 2026; and (b) the new shadcn/ui-native "AI Elements" patterns (copy-paste compositions of new shadcn primitives such as `message`, `bubble`, `message-scroller`, `input-group`, `attachment`, `code-block`, `trace`). For a project starting today, the old registry still works and is the fastest path to a full chat UI with props-ready components; the shadcn patterns are the forward-looking path but are less "drop-in" and some primitives are NOT published for the `new-york` (v4) style.

### Cited Findings
- **Deprecation**: "AI Elements is moving to shadcn/ui. This project will be deprecated at the end of November 2026 and replaced by AI Elements from shadcn/ui. New projects should use the shadcn/ui version once it's available." — [vercel/ai-elements README](https://github.com/vercel/ai-elements); same callout on [elements.ai-sdk.dev setup](https://elements.ai-sdk.dev/docs/setup).
- **Old-registry install commands** (verbatim from repo README / setup doc): — [vercel/ai-elements README](https://github.com/vercel/ai-elements), [Setup](https://elements.ai-sdk.dev/docs/setup)
  - `npx ai-elements@latest` (installs all components; sets up shadcn if missing)
  - `npx ai-elements@latest add message` / `add conversation` / `add code-block`
  - `npx shadcn@latest add @ai-elements/message`
  - `npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/all.json` or `.../registry/message.json`
- Components are written to `@/components/ai-elements/` by default (controlled by components.json aliases). — [Setup](https://elements.ai-sdk.dev/docs/setup)
- **Registry config**: no `registries` entry is needed in components.json for `@ai-elements/...`: shadcn's public registry index (`https://ui.shadcn.com/r/registries.json`) maps `"@ai-elements": "https://ai-sdk.dev/elements/api/registry/{name}.json"` (which redirects to `https://elements.ai-sdk.dev/api/registry/{name}.json`, HTTP 200 verified). — [shadcn registries.json](https://ui.shadcn.com/r/registries.json). (If you want to pin it explicitly anyway: `"registries": { "@ai-elements": "https://elements.ai-sdk.dev/api/registry/{name}.json" }`.)
- **Prerequisites** (old registry): Node 18+, React 19, Next.js 14+ (App Router recommended), AI SDK installed, shadcn/ui initialized, Tailwind CSS 4; "AI Elements supports CSS Variables mode only"; built for React 19 (no `forwardRef`). — [Setup](https://elements.ai-sdk.dev/docs/setup), [README](https://github.com/vercel/ai-elements)
- **Per-component npm deps (from the live registry JSON)** — [registry message.json](https://elements.ai-sdk.dev/api/registry/message.json) etc.:
  - `message`: `streamdown`, `@streamdown/cjk`, `@streamdown/code`, `@streamdown/math`, `@streamdown/mermaid`, `ai`, `lucide-react`; shadcn deps `button`, `button-group`, `tooltip`
  - `conversation`: `ai`, `lucide-react`, `use-stick-to-bottom`; shadcn `button`
  - `prompt-input`: `ai`, `lucide-react`, `nanoid`; shadcn `command`, `dropdown-menu`, `hover-card`, `input-group`, `select`, `spinner`, `tooltip`
  - `code-block`: `shiki`, `lucide-react`; shadcn `button`, `select`
  - `reasoning`: `@radix-ui/react-use-controllable-state`, streamdown + plugins, `lucide-react`; shadcn `collapsible` + `shimmer` (registry URL)
  - `artifact`: `lucide-react`; shadcn `button`, `tooltip`
  - `all.json` pulls shadcn: accordion, badge, button, tooltip, hover-card, button-group, collapsible, separator, select, avatar, alert, progress, switch, carousel, command, popover, dialog, card, dropdown-menu, input-group, spinner, textarea, scroll-area, tabs, input.
- The elements package itself pins (repo package.json): `ai ^6.0.105`, `streamdown ^2.4.0`, `shiki 3.22.0`, `use-stick-to-bottom ^1.1.3`, `motion ^12.26.2`, `@xyflow/react ^12.10.0` (Canvas/Node/Edge), `tokenlens ^1.3.1` (Context), `ansi-to-react` (Terminal), `media-chrome` (audio player), `react-jsx-parser` (JSX preview), `@rive-app/react-webgl2` (Persona). — [packages/elements/package.json](https://github.com/vercel/ai-elements/blob/main/packages/elements/package.json)
- **New shadcn AI Elements**: "AI Elements are patterns for building agentic interfaces. Each one is a composition of shadcn/ui components that you copy into your project. There is no package to install." New-project steps: `npx shadcn@latest add trace code-block`, then copy a pattern (each page lists required components). Each pattern exists in three primitive variants via URL: `/docs/ai-elements/base/<p>` (Base UI), `/radix/<p>`, `/aria/<p>` (React Aria). — [ui.shadcn.com/docs/ai-elements](https://ui.shadcn.com/docs/ai-elements) (markdown at `https://ui.shadcn.com/docs/ai-elements.md`), [Prompt Input](https://ui.shadcn.com/docs/ai-elements/base/prompt-input)
  - Chat: `npx shadcn@latest add message-scroller message bubble input-group` — [Chat](https://ui.shadcn.com/docs/ai-elements/radix/chat.md)
  - Message: `npx shadcn@latest add message bubble tooltip` — [Message](https://ui.shadcn.com/docs/ai-elements/radix/message.md)
  - Prompt Input: `npx shadcn@latest add input-group attachment dropdown-menu` — [Prompt Input](https://ui.shadcn.com/docs/ai-elements/radix/prompt-input.md)
- **Registry availability by style (verified by HTTP status of `https://ui.shadcn.com/r/styles/<style>/<item>.json`)**: for `new-york-v4` (what `"style": "new-york"` resolves to on Tailwind v4): `message-scroller`, `message`, `bubble`, `attachment`, `input-group`, `sidebar`, `resizable` = 200, but **`code-block` and `trace` = 404**. For `radix-nova`, `radix-vega`, `radix-rhea`, `base-nova` all of them are 200. — [shadcn registry](https://ui.shadcn.com/r/styles/new-york-v4/message-scroller.json)
- New-york-v4 `message-scroller` depends on npm `@shadcn/react`; radix-nova `code-block` depends on registry item `use-highlighted-code`; `resizable` depends on `react-resizable-panels@^4`. — [registry JSON](https://ui.shadcn.com/r/styles/new-york-v4/resizable.json)

### Inferences
- Recommended path for this app: use the **old `@ai-elements` registry** now (`npx shadcn@latest add @ai-elements/conversation @ai-elements/message @ai-elements/prompt-input @ai-elements/reasoning @ai-elements/code-block @ai-elements/shimmer @ai-elements/suggestion @ai-elements/sources @ai-elements/artifact @ai-elements/model-selector @ai-elements/speech-input @ai-elements/context`). The code is copied into the repo and "keeps working as is" after the registry is deprecated (per shadcn migration notes), so deprecation risk is mainly "no more updates". Do this soon: the registry endpoint could go offline after Nov 2026 (not confirmed either way).
- If instead adopting the new shadcn patterns with `"style": "new-york"`, `npx shadcn add code-block trace` will likely fail (404). Workarounds: install from a full URL of another style (e.g. `npx shadcn@latest add https://ui.shadcn.com/r/styles/radix-nova/code-block.json`), or keep the AI Elements `code-block` (Shiki-based) for code.
- Peer deps to expect after install: `ai`, `@ai-sdk/react` (only if you use useChat), `streamdown` + `@streamdown/{code,math,mermaid,cjk}`, `shiki`, `use-stick-to-bottom`, `nanoid`, `@radix-ui/react-use-controllable-state`, `lucide-react`, `motion` (shimmer), `tokenlens` (context). The project already has streamdown ^2.3.0 — registry asks for streamdown ≥2.4 via its plugins; let the CLI bump it.
- Version skew: the AI Elements source types against `ai` v6 types (`UIMessage`, `ChatStatus`, `FileUIPart`, `ToolUIPart`, `LanguageModelUsage`); npm `latest` of `ai` is 7.0.x. These are type-only imports in most files; verify they still exist in v7 after install (run `tsc`). Pinning `ai@^6` is a safe fallback if types break.

### Gaps
- I did not confirm whether `npx ai-elements@latest` CLI v1.9.1 now redirects to shadcn patterns or still installs from elements.ai-sdk.dev; README still documents the old behavior.
- No official statement on whether elements.ai-sdk.dev registry URLs will stop resolving after deprecation.
- Did not verify the exact `ai` v7 type surface vs. v6 imports used by the components.

---

## 2. Component catalogue (old registry) with purpose, key props, and fit

### Takeaway
Old registry has ~48 component files; the ones needed for this app are Conversation, Message (+Actions/Branch/Response), PromptInput (+Select/Submit/attachments/ActionMenu), ModelSelector, SpeechInput, Reasoning, Shimmer, CodeBlock, Artifact, Suggestion, Sources, Context, Loader (now Spinner/Shimmer). `Response` was renamed `MessageResponse` (inside message.tsx) and `Actions`/`Branch` became `MessageActions`/`MessageBranch*`.

### Cited Findings (all from the source in [vercel/ai-elements packages/elements/src](https://github.com/vercel/ai-elements/tree/main/packages/elements/src) unless noted)
- Full file list: agent, artifact, attachments, audio-player, canvas, chain-of-thought, checkpoint, code-block, commit, confirmation, connection, context, controls, conversation, edge, environment-variables, file-tree, image, inline-citation, jsx-preview, message, mic-selector, model-selector, node, open-in-chat, package-info, panel, persona, plan, prompt-input, question, queue, reasoning, sandbox, schema-display, shimmer, snippet, sources, speech-input, stack-trace, suggestion, task, terminal, test-results, tool, toolbar, transcription, voice-selector, web-preview.
- **Conversation** (`conversation.tsx`): exports `Conversation`, `ConversationContent`, `ConversationEmptyState`, `ConversationScrollButton`, `ConversationDownload`, `messagesToMarkdown`. `ConversationProps = ComponentProps<typeof StickToBottom>`; renders `StickToBottom` with `initial="smooth" resize="smooth" role="log"`. Fit: chat thread with auto-stick-to-bottom.
- **Message** (`message.tsx`): exports `Message`, `MessageContent`, `MessageActions`, `MessageAction`, `MessageBranch`, `MessageBranchContent`, `MessageBranchSelector`, `MessageBranchPrevious`, `MessageBranchNext`, `MessageBranchPage`, `MessageResponse`, `MessageToolbar`. `MessageProps = HTMLAttributes<HTMLDivElement> & { from: UIMessage["role"] }` (adds `is-user ml-auto` vs `is-assistant` classes). `MessageActionProps = ComponentProps<typeof Button> & { tooltip?: string; label?: string }`. `MessageResponseProps = ComponentProps<typeof Streamdown>`; it is a `memo`'d `<Streamdown plugins={{cjk, code, math, mermaid}}>`. Fit: thread turns, copy/retry actions (`MessageActions` + `MessageAction tooltip="Copy"`), streaming markdown (`MessageResponse`), regenerate branches.
- **PromptInput** (`prompt-input.tsx`): `PromptInputProps` = form attrs + `accept?`, `multiple?`, `globalDrop?`, `syncHiddenInput?`, `maxFiles?`, `maxFileSize?`, `onError?({code:"max_files"|"max_file_size"|"accept", message})`, **`onSubmit(message: PromptInputMessage, event)`** where `PromptInputMessage = { text: string; files: FileUIPart[] }`. Sub-parts: `PromptInputProvider`/`usePromptInputController` (lift state out), `usePromptInputAttachments`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputHeader`, `PromptInputFooter`, `PromptInputTools`, `PromptInputButton` (+`PromptInputButtonTooltip`), `PromptInputActionMenu{,Trigger,Content,Item}`, `PromptInputActionAddAttachments`, `PromptInputActionAddScreenshot`, `PromptInputSubmit` (`status?: ChatStatus; onStop?: () => void` – shows spinner/stop for non-ready statuses), `PromptInputSelect{,Trigger,Content,Item,Value}` (simple model picker), `PromptInputHoverCard*`, `PromptInputTab*`, `PromptInputCommand*` (slash/mention menus). Fit: prompt input with model picker and mic button.
- **ModelSelector** (`model-selector.tsx`): dialog/command-palette picker — `ModelSelector`, `ModelSelectorTrigger`, `ModelSelectorContent`, `ModelSelectorDialog`, `ModelSelectorInput`, `ModelSelectorList`, `ModelSelectorEmpty`, `ModelSelectorGroup`, `ModelSelectorItem`, `ModelSelectorShortcut`, `ModelSelectorSeparator`, `ModelSelectorLogo`, `ModelSelectorLogoGroup`, `ModelSelectorName`.
- **SpeechInput** (`speech-input.tsx`): `SpeechInputProps = ComponentProps<typeof Button> & { onTranscriptionChange?: (text) => void; onAudioRecorded?: (audioBlob: Blob) => Promise<string>; lang?: string }` — Web Speech API, with a MediaRecorder fallback "in browsers that don't support the Web Speech API (Firefox, Safari)" where you return transcribed text from your own STT service. Fit: mic button inside `PromptInputTools`.
- **Reasoning** (`reasoning.tsx`): `ReasoningProps = Collapsible props & { isStreaming?, open?, defaultOpen?, onOpenChange?, duration? }`; auto-closes 1000 ms after streaming ends; `ReasoningTrigger`, `ReasoningContent` (Streamdown), `useReasoning`. Uses `Shimmer` while thinking. Fit: reasoning display.
- **Shimmer** (`shimmer.tsx`): `{ children: string; as?; className?; duration?; spread? }` — motion-based text shimmer ("Thinking..."). Fit: loading state (the old `Loader` component is no longer in the source tree; Spinner from shadcn + Shimmer replace it).
- **CodeBlock** (`code-block.tsx`): `CodeBlockProps = HTMLAttributes<HTMLDivElement> & { code: string; language: BundledLanguage; showLineNumbers?: boolean }`; uses Shiki `createHighlighter`; sub-parts `CodeBlockContainer`, `CodeBlockHeader`, `CodeBlockTitle`, `CodeBlockFilename`, `CodeBlockActions`, `CodeBlockContent`, `CodeBlockCopyButton`, `CodeBlockLanguageSelector*`, plus `highlightCode()`. Read-only. Fit: code in messages / read-only artifact preview.
- **Artifact** (`artifact.tsx`): `Artifact`, `ArtifactHeader`, `ArtifactClose`, `ArtifactTitle`, `ArtifactDescription`, `ArtifactActions`, `ArtifactAction`, `ArtifactContent` — a card shell. Fit: code artifact panel chrome (put the editor inside `ArtifactContent`).
- **Suggestion**: `Suggestions` (horizontal scroll row), `Suggestion` (button with `suggestion` + `onClick(suggestion)`). **Sources**: `Sources`, `SourcesTrigger` (count), `SourcesContent`, `Source` (href/title). **Context**: `Context`, `ContextTrigger`, `ContextContent{,Header,Body,Footer}`, `ContextInputUsage`, `ContextOutputUsage`, `ContextReasoningUsage`, `ContextCacheUsage` (typed against `LanguageModelUsage`; token/cost via `tokenlens`). **WebPreview**: `WebPreview`, `WebPreviewNavigation{,Button}`, `WebPreviewUrl`, `WebPreviewBody` (iframe), `WebPreviewConsole`. **Canvas**/`Node`/`Edge`/`Panel`/`Controls`/`Toolbar`/`Connection`: React Flow (`@xyflow/react`) workflow canvas — NOT a code canvas. **FileTree**, **Terminal** (`output`, `isStreaming`), **Plan**, **Queue**, **Task**, **Checkpoint**, **Tool**, **Confirmation**, **ChainOfThought**, **InlineCitation**, **Attachments** (`Attachments`, `Attachment`, `AttachmentPreview`, `AttachmentRemove`...).
- shadcn's replacement map: `conversation.tsx`→Chat (Message Scroller), `message.tsx`→Message, `prompt-input.tsx`→Prompt Input, `code-block.tsx`→Code Block, `shimmer.tsx`→`shimmer` util, `attachments.tsx`→Attachment, etc. **No replacement** for `artifact.tsx` (build with Card/Button/Tooltip), `web-preview.tsx` (iframe + Input Group), `speech-input.tsx` (Button + Spinner + Web Speech API), `canvas.tsx` & React Flow parts, `mic-selector`, `snippet`, `sandbox`, etc. — [shadcn AI Elements migration](https://ui.shadcn.com/docs/ai-elements.md)
- shadcn new patterns list: Chain of Thought, Chat, Checkpoint, Confirmation, Context, File Tree, Inline Citation, Message, Model Selector ("Two menus. One picks the model ... the other picks how hard it thinks"), Plan, Prompt Input, Queue, Reasoning, Sources, Stack Trace, Subagent, Suggestion, Task, Terminal, Test Results, Tool. — [shadcn AI Elements](https://ui.shadcn.com/docs/ai-elements)

### Inferences — mapping to this app
| Need | Old registry (recommended now) | New shadcn pattern |
|---|---|---|
| Chat thread | `Conversation`+`ConversationContent`+`ConversationScrollButton`, `Message`/`MessageContent`/`MessageResponse` | Chat (`message-scroller`, `message`, `bubble`) |
| Prompt input w/ model picker + mic | `PromptInput` + `PromptInputTextarea` + `PromptInputFooter` > `PromptInputTools` (`PromptInputActionMenu` attachments, `SpeechInput`, `PromptInputSelect` or `ModelSelector`) + `PromptInputSubmit status onStop` | Prompt Input (`input-group`, `attachment`) + Model Selector; mic = DIY |
| Code artifact panel | `Artifact` shell + editor (Monaco/CM) inside `ArtifactContent`; `CodeBlock` for read-only | DIY Card + `code-block` (not on new-york-v4) |
| Reasoning | `Reasoning` / `ReasoningTrigger` / `ReasoningContent` + `Shimmer` | Reasoning (on Trace) |
| Copy actions | `MessageActions` + `MessageAction tooltip label` ; `CodeBlockCopyButton` | `MessageFooter` + ghost icon buttons |
| Sidebar | not in AI Elements — use shadcn `sidebar` / `sidebar-07` | same |

### Gaps
- Exact current prop list for every minor component (Suggestion, Sources, WebPreview) was inferred from export names, not read line by line.

---

## 3. Does AI Elements require useChat? Using zustand + custom streaming

### Takeaway
No. Components are presentational; they only import **types** from `ai` (e.g. `UIMessage["role"]`, `ChatStatus`, `FileUIPart`). `MessageResponse` just renders a markdown string through Streamdown (which handles incomplete/streaming markdown), `PromptInput.onSubmit` hands you `{text, files}`, and `PromptInputSubmit` takes a `status` string. So a zustand store fed by a custom `fetch`/SSE reader works fine.

### Cited Findings
- Only type imports from `"ai"` appear in: agent, attachments, audio-player, confirmation, context, conversation, image, message, prompt-input, sandbox, tool, transcription (e.g. `import type { UIMessage } from "ai"`, `import type { ChatStatus, FileUIPart, SourceDocumentUIPart } from "ai"`). No component imports `@ai-sdk/react`; it is only a devDependency of the elements package. — [packages/elements/src](https://github.com/vercel/ai-elements/tree/main/packages/elements/src), [package.json](https://github.com/vercel/ai-elements/blob/main/packages/elements/package.json)
- The official IDE example (`demo-cursor.tsx`) drives `Conversation`/`Message`/`PromptInput`/`Terminal` from plain `useState` with a simulated stream (`status` string `"ready" | "streaming"`), no useChat. — [demo-cursor.tsx](https://github.com/vercel/ai-elements/blob/main/packages/examples/src/demo-cursor.tsx)
- README quick start uses useChat but only to obtain `messages`: `const { messages } = useChat(); ... <Message from={message.role}><MessageContent><MessageResponse>{...}</MessageResponse>` — [README](https://github.com/vercel/ai-elements)
- `ChatStatus` values used by PromptInputSubmit: `PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & { status?: ChatStatus; onStop?: () => void }`. — [prompt-input.tsx](https://github.com/vercel/ai-elements/blob/main/packages/elements/src/prompt-input.tsx)
- shadcn's new patterns show AI SDK integration as an optional section (`sendMessage({ text, files })`, route `result.toUIMessageStreamResponse()`), and `@shadcn/helpers/ai-sdk` `createChat()` scripts a conversation through useChat with no model. — [Prompt Input](https://ui.shadcn.com/docs/ai-elements/radix/prompt-input.md), [AI SDK helper](https://ui.shadcn.com/docs/helpers/ai-sdk)

### Inferences — pattern for zustand + custom stream
```tsx
// store: { messages: {id, role:'user'|'assistant', text, reasoning?}[], status: 'ready'|'submitted'|'streaming'|'error', abort?: AbortController }
<Conversation className="flex-1">
  <ConversationContent>
    {messages.map(m => (
      <Message from={m.role} key={m.id}>
        <MessageContent>
          {m.reasoning && <Reasoning isStreaming={status==='streaming' && m.id===lastId}><ReasoningTrigger/><ReasoningContent>{m.reasoning}</ReasoningContent></Reasoning>}
          {m.role === 'assistant' ? <MessageResponse>{m.text}</MessageResponse> : m.text}
        </MessageContent>
        {m.role==='assistant' && <MessageActions><MessageAction tooltip="Copy" label="Copy" onClick={() => navigator.clipboard.writeText(m.text)}><CopyIcon className="size-3"/></MessageAction></MessageActions>}
      </Message>
    ))}
    {status === 'submitted' && <Shimmer>Thinking...</Shimmer>}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
<PromptInput onSubmit={({ text, files }) => store.send(text, files)}>
  <PromptInputBody><PromptInputTextarea /></PromptInputBody>
  <PromptInputFooter>
    <PromptInputTools>
      <SpeechInput onTranscriptionChange={t => setText(prev => prev + t)} />
      <PromptInputSelect value={model} onValueChange={setModel}>…</PromptInputSelect>
    </PromptInputTools>
    <PromptInputSubmit status={status} onStop={() => store.abort?.abort()} />
  </PromptInputFooter>
</PromptInput>
```
- Streaming: append deltas to the last message's `text` in zustand (batch with `requestAnimationFrame` if token rate is high); `MessageResponse` is memoized, so give each message its own selector to avoid re-rendering the whole list.
- If typing your store against `UIMessage` is inconvenient, `from` only needs `"user" | "assistant" | "system"`.
- `PromptInputTextarea` is uncontrolled by default; to set text from SpeechInput, wrap with `PromptInputProvider` and use `usePromptInputController()` (export exists) or pass `value`/`onChange` as the IDE demo does.

### Gaps
- Did not verify exact `usePromptInputController()` return shape (textInput setters) line by line.

---

## 4. The IDE example (elements.ai-sdk.dev/examples/ide)

### Takeaway
A static three-column flex layout (not resizable): left `FileTree` (w-64), center read-only `CodeBlock` (Shiki, line numbers) over a `Terminal` (h-64), right column (w-80) with `Plan`/`Task`, `Queue`, `Conversation`/`Message`/`MessageResponse`, `Checkpoint`, and `PromptInput`. No real editor; state is local `useState` and simulated streaming.

### Cited Findings
- Setup commands: `npx create-next-app@latest ai-ide && cd ai-ide`, `npx ai-elements@latest`, `npm i nanoid shiki lucide-react`. Described as "three-panel layout": file tree left, code + terminal center, AI chat right; the editor is a read-only `CodeBlock`; file editing/multiple tabs listed as future extensions. — [IDE example](https://elements.ai-sdk.dev/examples/ide)
- Source: `packages/examples/src/demo-cursor.tsx` (704 lines). Imports `Checkpoint, CheckpointIcon, CheckpointTrigger`; `CodeBlock`; `Conversation, ConversationContent`; `FileTree, FileTreeFile, FileTreeFolder`; `Message, MessageContent, MessageResponse`; `Plan, PlanAction, PlanContent, PlanDescription, PlanHeader, PlanTitle, PlanTrigger`; `PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea` (+ type `PromptInputMessage`); `Queue, QueueItem, QueueItemContent, QueueItemIndicator, QueueList, QueueSection, QueueSectionContent, QueueSectionLabel, QueueSectionTrigger`; `Task, TaskContent, TaskItemFile, TaskTrigger`; `Terminal, TerminalContent`; `nanoid`; `BundledLanguage` from shiki. — [demo-cursor.tsx](https://github.com/vercel/ai-elements/blob/main/packages/examples/src/demo-cursor.tsx)
- Layout JSX (verbatim skeleton): `<div className="flex h-full w-full bg-background">` → `<div className="flex w-64 flex-col border-r"><FileTree expanded={expandedPaths} onExpandedChange={setExpandedPaths} onSelect={handleFileSelect} selectedPath={selectedPath}>…` → `<div className="flex flex-1 flex-col overflow-hidden"><CodeBlock className="rounded-none border-0" code={currentFile.content} language={currentFile.language} showLineNumbers /><Terminal className="h-64 rounded-none border-0" isStreaming={isTerminalStreaming} output={terminalOutput}><TerminalContent className="max-h-full" /></Terminal></div>` → `<div className="flex w-80 flex-col border-l">` Plan / Queue / `<Conversation className="flex-1">` / `<PromptInput className="rounded-lg border" onSubmit={handleSubmit}><PromptInputTextarea className="min-h-10" onChange={handleChatTextChange} value={chatText} /><PromptInputFooter className="justify-end p-2"><PromptInputSubmit disabled={status !== "ready" || !chatText.trim()} status={status === "streaming" ? "streaming" : undefined} /></PromptInputFooter></PromptInput>`. — [demo-cursor.tsx](https://github.com/vercel/ai-elements/blob/main/packages/examples/src/demo-cursor.tsx)

### Inferences
- For this app, reuse the IDE column structure but replace the fixed widths with shadcn `ResizablePanelGroup` and swap `CodeBlock` for an editable editor (section 5).

### Gaps
- None material.

---

## 5. Editor choice: Monaco vs CodeMirror 6 for an inline-editable code canvas with ghost text

### Takeaway
**Recommend Monaco via `@monaco-editor/react` 4.7.0** for this use case: ghost-text inline completion is a first-class, maintained core API (`monaco.languages.registerInlineCompletionsProvider`) with Tab-accept, word-by-word partial accept, cancellation tokens, debounce, and lifecycle callbacks — exactly what an FIM (fill-in-the-middle) autocomplete needs — and the React wrapper is SSR-safe (loads Monaco in the browser). Trade-off: much heavier (monaco-editor package is ~80 MB unpacked; loads from jsDelivr CDN by default). Choose **CodeMirror 6 (`@uiw/react-codemirror`)** instead only if bundle size/mobile matters more than polished ghost text; then use `@marimo-team/codemirror-ai` (active) or a ~60-line custom ghost-text extension, not `codemirror-copilot` (stale since Jan 2024, v0.0.7).

### Cited Findings
**Monaco**
- API: `export function registerInlineCompletionsProvider(languageSelector: LanguageSelector, provider: InlineCompletionsProvider): IDisposable;` Provider: `provideInlineCompletions(model, position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<T>`; **`disposeInlineCompletions(completions, reason)` is required** (reason kinds `'lostRace' | 'tokenCancellation' | 'other' | 'empty' | 'notTaken'`); optional `handleItemDidShow`, `handlePartialAccept`, `handleRejection`, `handleEndOfLifetime`, `debounceDelayMs?`, `displayName?`, `groupId?`. — [monaco-editor 0.58.0 monaco.d.ts](https://cdn.jsdelivr.net/npm/monaco-editor@0.58.0/monaco.d.ts)
- `InlineCompletion`: `insertText: string | { snippet: string }`, `range?: IRange`, `command?`, `additionalTextEdits?`, `completeBracketPairs?`, `isInlineEdit?` …; `InlineCompletions`: `{ items, commands?, suppressSuggestions?, enableForwardStability? }`; `InlineCompletionContext`: `triggerKind` (Automatic/Explicit), `selectedSuggestionInfo`, `includeInlineCompletions`, … — [monaco.d.ts](https://cdn.jsdelivr.net/npm/monaco-editor@0.58.0/monaco.d.ts)
- Editor options: `inlineSuggest?: { enabled?, mode?: 'prefix'|'subword'|'subwordSmart', showToolbar?: 'always'|'onHover'|'never', suppressSuggestions?, minShowDelay?, keepOnBlur?, fontFamily? }`; `automaticLayout?: boolean` — "install a ResizeObserver to check if its container dom node size has changed. Defaults to false." — [monaco.d.ts](https://cdn.jsdelivr.net/npm/monaco-editor@0.58.0/monaco.d.ts)
- `@monaco-editor/react` peer deps: `react ^16.8 || ^17 || ^18 || ^19`, `monaco-editor >= 0.25.0 < 1`; dep `@monaco-editor/loader ^1.5.0`. README install line still says "`npm install @monaco-editor/react # or @monaco-editor/react@next for React v19`" (dist-tag next = 4.8.0-rc.3), which conflicts with 4.7.0's peer range already including React 19. — [npm @monaco-editor/react](https://www.npmjs.com/package/@monaco-editor/react)
- Next.js: "works with Next.js without a hitch. The part of the source that should be pre-parsed is optimized for server-side rendering", but accessing the `monaco` instance needs `document`; avoid running that outside the browser, e.g. `next/dynamic`. By default Monaco files are downloaded from CDN; since v4.4.0 you can bundle the npm package: `import * as monaco from 'monaco-editor'; import { loader } from '@monaco-editor/react'; loader.config({ monaco });`. Props: `theme` (`"light" | "vs-dark"`, custom via `monaco.editor.defineTheme`), `beforeMount(monaco)`, `onMount(editor, monaco)`. — [@monaco-editor/react README](https://github.com/suren-atoyan/monaco-react)
- Bundling monaco-editor yourself requires a `MonacoEnvironment.getWorker` returning `new Worker(new URL(..., import.meta.url))` per label; Turbopack recently changed worker handling to "use a real file entrypoint for Workers" (Next.js PR #88602) — which Next version ships it was not confirmed. — [search summary / Next.js commit](https://app.semanticdiff.com/gh/vercel/next.js/commit/d23af53268d062ff70b7c12322750b85ed3a76ba), [Monaco ESM integration doc](https://redirect.github.com/OutSystems/monaco-editor/blob/main-os/docs/integrate-esm.md)
- Sizes: `monaco-editor` unpacked 80,070,496 bytes; `@monaco-editor/react` 152,819 bytes; `@uiw/react-codemirror` 830,214; `@codemirror/view` 1,264,544; `@codemirror/state` 440,367 (npm `dist.unpackedSize`, not gzip bundle size). — [npm registry](https://www.npmjs.com/package/monaco-editor)

**CodeMirror 6**
- `@uiw/react-codemirror` 4.25.13 peers: `react >=17`, `codemirror >=6`, `@codemirror/view`, `@codemirror/state`, `@codemirror/theme-one-dark`, `@babel/runtime`; bundles `@uiw/codemirror-extensions-basic-setup`. — [npm @uiw/react-codemirror](https://www.npmjs.com/package/@uiw/react-codemirror)
- `codemirror-copilot` 0.0.7: `inlineCopilot(async (prefix, suffix) => prediction)` extension used with `<CodeMirror extensions={[javascript({jsx:true}), inlineCopilot(...)]} />`; example backend posts `{prefix, suffix, language}` and replaces `<FILL_ME>`. Last publish 2024-01-18. — [npm codemirror-copilot](https://www.npmjs.com/package/codemirror-copilot)
- `@marimo-team/codemirror-ai` 0.3.10 (peers `@codemirror/view ^6`, `@codemirror/state ^6`): `aiExtension({ prompt: async ({prompt, selection, codeBefore, codeAfter}) => newCode, keymaps: { showInput:'Mod-k', acceptEdit:'Mod-y', rejectEdit:'Mod-u' } })` for Cmd-K inline edits; `nextEditPrediction({ fetchFn: async (state) => ({ newText, cursorOffset }), delay: 500, acceptOnClick, defaultKeymap: true /* Tab/Escape */, showAcceptReject })` for autocomplete; `promptHistory`. — [npm @marimo-team/codemirror-ai](https://www.npmjs.com/package/@marimo-team/codemirror-ai)

### Recommended Monaco wiring (inferred from the APIs above; not copied from a source)
```tsx
// components/canvas/code-editor.tsx
"use client";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useRef } from "react";

export function CodeEditor({ value, language, onChange }: { value: string; language: string; onChange: (v: string) => void }) {
  const { resolvedTheme } = useTheme();
  const disposeRef = useRef<{ dispose(): void } | null>(null);

  const onMount: OnMount = (editor, monaco) => {
    disposeRef.current?.dispose();
    disposeRef.current = monaco.languages.registerInlineCompletionsProvider({ pattern: "**" }, {
      debounceDelayMs: 250,
      async provideInlineCompletions(model, position, _ctx, token) {
        const offset = model.getOffsetAt(position);
        const text = model.getValue();
        const prefix = text.slice(0, offset), suffix = text.slice(offset);
        const ac = new AbortController();
        token.onCancellationRequested(() => ac.abort());
        try {
          const r = await fetch("/api/fim", { method: "POST", signal: ac.signal,
            body: JSON.stringify({ prefix, suffix, language: model.getLanguageId() }) });
          if (!r.ok || token.isCancellationRequested) return { items: [] };
          const { completion } = await r.json();
          return { items: completion ? [{ insertText: completion,
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] : [] };
        } catch { return { items: [] }; }
      },
      disposeInlineCompletions() {},
    });
    editor.onDidDispose(() => disposeRef.current?.dispose());
  };

  return (
    <Editor
      height="100%" language={language} value={value}
      onChange={(v) => onChange(v ?? "")}
      theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
      onMount={onMount}
      options={{ automaticLayout: true, minimap: { enabled: false }, inlineSuggest: { enabled: true, showToolbar: "onHover" }, fontSize: 13, scrollBeyondLastLine: false }}
    />
  );
}
// usage in a client page: const CodeEditor = dynamic(() => import("@/components/canvas/code-editor").then(m => m.CodeEditor), { ssr: false });
```
- Register the provider once per app (it is global per `monaco` instance, not per editor), and dispose it on unmount to avoid duplicate ghost texts under React 19 StrictMode double-mount.
- Tab accepts; `Ctrl/Cmd+→` accepts word-by-word (Monaco default keybinding for partial accept); `Alt+\` triggers explicitly.
- Theme: map shadcn tokens with `monaco.editor.defineTheme("app-dark", { base: "vs-dark", inherit: true, rules: [], colors: { "editor.background": "#0c0a09" } })` in `beforeMount`; Monaco cannot read CSS variables directly, so resolve them via `getComputedStyle` (Tailwind v4 tokens are `oklch()`; Monaco expects hex — convert or hardcode).
- Resizable container: `automaticLayout: true` + parent with `h-full min-h-0 overflow-hidden` inside a `ResizablePanel`.
- CSP / offline: default loader pulls from `cdn.jsdelivr.net`; for self-hosting use `loader.config({ monaco })` with npm `monaco-editor` (requires worker setup) or `loader.config({ paths: { vs: "/monaco/vs" } })` copying `node_modules/monaco-editor/min/vs` to `public/`.

### CodeMirror alternative (custom ghost text, inferred)
- Ghost text in CM6 = a `StateField<{pos, text} | null>` + `Decoration.widget({ widget: GhostWidget, side: 1 })` rendered via `EditorView.decorations.from(field)`, a `ViewPlugin` that debounces doc changes and fetches FIM, and a `Prec.highest(keymap.of([{ key: "Tab", run: accept }, { key: "Escape", run: clear }]))`. `@uiw/react-codemirror` is a client component; wrap in `"use client"` and it renders fine with SSR (no `window` at import), theme prop `"light" | "dark" | Extension`, `height="100%"`; CM6 re-measures on container resize automatically.

### Comparison summary (inferred from findings)
| Criterion | Monaco (`@monaco-editor/react`) | CodeMirror 6 (`@uiw/react-codemirror`) |
|---|---|---|
| SSR / App Router | Safe; load via `next/dynamic({ssr:false})`; CDN by default | Safe in a client component; modular ESM |
| Size | Heavy (multi-MB + workers; 80 MB unpacked pkg) | Light, tree-shakable |
| Ghost text | Built-in `registerInlineCompletionsProvider`, partial accept, cancellation, toolbar | Third-party (`@marimo-team/codemirror-ai`) or DIY; `codemirror-copilot` stale |
| Theming | `light`/`vs-dark` + `defineTheme` (hex colors) | CSS-based themes, easy to bind to CSS vars |
| Resizing | needs `automaticLayout: true` | automatic |
| Mobile | weak | good |

### Gaps
- No authoritative gzip bundle sizes for Monaco vs CodeMirror were retrieved (bundlephobia not consulted); figures above are unpacked npm sizes.
- No confirmed Next 16 Turbopack + bundled `monaco-editor` worker recipe; CDN loader path avoids the issue.
- Did not test `@marimo-team/codemirror-ai` `nextEditPrediction` rendering (it is a diff/next-edit style suggestion, which may display differently from classic end-of-cursor ghost text).

---

## 6. shadcn Sidebar (sidebar-07) and Resizable (react-resizable-panels v4) on Tailwind v4

### Takeaway
`npx shadcn@latest add sidebar-07` (collapsible-to-icons sidebar block) and `npx shadcn@latest add resizable` both exist for `new-york-v4`. The resizable component now wraps **react-resizable-panels v4**, whose API changed: `Group`/`Panel`/`Separator`, `orientation` instead of `direction`, and **numeric sizes are pixels** (use strings like `"25%"` for percentages).

### Cited Findings
- `sidebar-07` (new-york-v4) registry deps: `sidebar, breadcrumb, separator, collapsible, dropdown-menu, avatar`; files `app/…/page.tsx`, `components/app-sidebar.tsx`, `nav-main.tsx`, `nav-projects.tsx`, `nav-user.tsx`, `team-switcher.tsx`. `sidebar-08` adds `nav-secondary` (inset variant); `sidebar-16` adds sticky site header + search. — [registry sidebar-07.json](https://ui.shadcn.com/r/styles/new-york-v4/sidebar-07.json)
- `sidebar` deps: `radix-ui`, `class-variance-authority`, `lucide-react`; registry deps `button, separator, sheet, tooltip, input, use-mobile, skeleton`. — [registry sidebar.json](https://ui.shadcn.com/r/styles/new-york-v4/sidebar.json)
- Sidebar usage: wrap app in `SidebarProvider` (`defaultOpen`, `open`, `onOpenChange`); `<Sidebar collapsible="icon">` + `<SidebarInset>`; width via `style={{ "--sidebar-width": "20rem", "--sidebar-width-mobile": "20rem" }}` on `SidebarProvider`; hide groups when collapsed with `group-data-[collapsible=icon]:hidden`. — [shadcn Sidebar docs](https://ui.shadcn.com/docs/components/radix/sidebar.md)
- `resizable` deps `react-resizable-panels@^4`; component source wraps `ResizablePrimitive.Group` (className `flex h-full w-full aria-[orientation=vertical]:flex-col`), `ResizablePrimitive.Panel`, `ResizablePrimitive.Separator` (`withHandle` shows `GripVerticalIcon`). Usage: `<ResizablePanelGroup orientation="horizontal"><ResizablePanel>One</ResizablePanel><ResizableHandle /><ResizablePanel>Two</ResizablePanel></ResizablePanelGroup>`; vertical with `orientation="vertical"`, sizes `defaultSize="25%"`. — [registry resizable.json](https://ui.shadcn.com/r/styles/new-york-v4/resizable.json), [shadcn Resizable docs](https://ui.shadcn.com/docs/components/radix/resizable.md)
- react-resizable-panels v4: "Numeric values are assumed to be pixels. Strings without explicit units are assumed to be percentages … Pixels may also be specified as strings ending with px"; units em/rem/vh/vw supported; Panel elements must be direct DOM children of the Group; Group has `onLayoutChange` / `onLayoutChanged` (recommended), `defaultLayout`, `groupRef`; "Slight layout shift may occur when server-rendering panels with percentage-based default sizes." — [react-resizable-panels README](https://github.com/bvaughn/react-resizable-panels)

### Inferences — suggested layout
```tsx
<SidebarProvider>
  <AppSidebar collapsible="icon" />           {/* from sidebar-07, chats list */}
  <SidebarInset className="h-svh overflow-hidden">
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="45%" minSize="30%">{/* Conversation + PromptInput */}</ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="55%" minSize="25%" collapsible>
        <Artifact className="h-full rounded-none"> … <ArtifactContent className="h-full min-h-0 p-0"><CodeEditor/></ArtifactContent></Artifact>
      </ResizablePanel>
    </ResizablePanelGroup>
  </SidebarInset>
</SidebarProvider>
```
- Persist panel layout via `onLayoutChanged` → cookie/zustand and feed back as `defaultLayout` to avoid SSR shift.
- Any old snippets using `PanelGroup`, `PanelResizeHandle`, `direction=`, or `defaultSize={30}` (meaning 30%) will be wrong under v4.

### Gaps
- Did not confirm the exact v4 prop name for persistence helpers (README mentions layout callbacks; an `autoSaveId`-style prop was not verified).

---

## 7. Known gotchas (Tailwind v4 / React 19 / Next 16)

### Takeaway
Main risks: style-registry gaps for `new-york`, deprecated registry, `ai` v6→v7 type drift, react-resizable-panels v4 unit change, Monaco CDN/worker loading under Turbopack, and React 19 StrictMode double-mount registering duplicate Monaco providers.

### Cited Findings
- AI Elements "supports CSS Variables mode only"; unstyled components usually mean `globals.css` lacks the Tailwind import + shadcn base styles for Tailwind 4. — [README](https://github.com/vercel/ai-elements), [Troubleshooting](https://elements.ai-sdk.dev/docs/troubleshooting)
- Module-not-found → ensure tsconfig `"paths": { "@/*": ["./*"] }`. Theme switching issues → align with the `<html>` class/data-theme mechanism used by shadcn. — [Troubleshooting](https://elements.ai-sdk.dev/docs/troubleshooting)
- `code-block` / `trace` not published for `new-york-v4` (404) while present for `radix-nova` etc. — [shadcn registry](https://ui.shadcn.com/r/styles/new-york-v4/code-block.json)
- Elements source pins `ai ^6`, `shiki 3.22.0`, `streamdown ^2.4.0`; npm latest are `ai 7.0.181`, `shiki 4.6.0`, `streamdown 2.8.1`. — [elements package.json](https://github.com/vercel/ai-elements/blob/main/packages/elements/package.json), npm registry
- `react-resizable-panels` v4: numeric = px; percentage SSR layout shift note. — [README](https://github.com/bvaughn/react-resizable-panels)
- `@monaco-editor/react` loads Monaco from CDN by default and needs a browser environment for the `monaco` instance (use `next/dynamic`). — [monaco-react README](https://github.com/suren-atoyan/monaco-react)

### Inferences
- Shiki major version: the copied `code-block.tsx` was written against Shiki 3; if the CLI installs Shiki 4, check `createHighlighter`/`BundledLanguage` imports compile (pin `shiki@3` if not).
- `motion` 14 is latest; repo has motion 12 and the `shimmer` element imports `motion/react` — fine on 12; avoid an accidental major bump.
- Next 16 uses Turbopack by default (the repo's `dev` script already passes `--turbopack`); prefer the Monaco CDN loader or `public/` `vs` path rather than bundling `monaco-editor` ESM + workers.
- Tailwind v4: Monaco/CodeMirror DOM isn't styled by Tailwind preflight issues normally, but Tailwind's preflight `*{border-color}` and `box-sizing` are harmless; ensure the editor container has an explicit height (flex child with `min-h-0`), otherwise Monaco renders 0px / 5px tall.
- Ghost-text FIM latency: debounce 150–300 ms, cancel in-flight requests via `CancellationToken` → `AbortController`, and cap prefix/suffix length server-side.

### Gaps
- No primary-source list of Next.js 16-specific breaking issues with AI Elements was found.
