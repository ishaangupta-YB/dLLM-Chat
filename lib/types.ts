// Shared domain types. Safe to import from both client and server code.

export type ChatModelId = 'mercury-3' | 'mercury-2.5' | 'mercury-2';

/** How the response is rendered while it arrives. */
export type ResponseMode = 'streaming' | 'diffusing';

export type ReasoningEffort = 'instant' | 'low' | 'medium' | 'high';

export type Role = 'user' | 'assistant';

/** Top-level experience: normal chat, or the Lovable-style coding agent. */
export type AppMode = 'chat' | 'code';

/** A text file attached to a user message (text extracted client-side). */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  /** Original file size in bytes. */
  size: number;
  /** Extracted text sent to the model (capped, see lib/attachments). */
  text: string;
  /** true when text was cut to fit the budget. */
  truncated?: boolean;
}

/** A tool invocation made by the agent while answering. */
export interface ToolCallRecord {
  id: string;
  /** Tool function name as sent to the model, e.g. web_search or mcp__deepwiki__ask_question. */
  name: string;
  /** Human label, e.g. "Searching the web". */
  label?: string;
  /** Where the tool lives: 'builtin' or 'mcp:<serverId>'. */
  source?: string;
  /** JSON string of arguments. */
  args: string;
  status: 'running' | 'done' | 'error';
  /** Truncated result preview for display (the model saw the full result). */
  result?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export interface SourceRef {
  title: string;
  url: string;
  snippet?: string;
}

/** Files of a coding-agent project. Paths are relative, e.g. "index.html". */
export interface CodeProject {
  files: Record<string, string>;
  activeFile?: string;
  /** Monotonic counter bumped whenever the agent or the user changes files. */
  version: number;
}

export interface MessageUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  serverLatencyMs?: number;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** Model that produced an assistant message. */
  model?: ChatModelId;
  mode?: ResponseMode;
  /** true while tokens are still arriving. Never persisted as true. */
  pending?: boolean;
  error?: string;
  finishReason?: string | null;
  usage?: MessageUsage;
  /** Wall-clock ms from request start to the last frame. */
  durationMs?: number;
  /** Message was produced in a voice turn. */
  voice?: boolean;
  /** User messages: attached files. */
  attachments?: Attachment[];
  /** Assistant messages: tools called while producing this reply, in order. */
  toolCalls?: ToolCallRecord[];
  /** Assistant messages: web sources cited. */
  sources?: SourceRef[];
  /** Coding agent: paths written in this turn. */
  filesChanged?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  pinned?: boolean;
  /** 'auto' = derived from the first prompt (placeholder), 'ai' = generated, 'user' = renamed. */
  titleSource?: 'auto' | 'ai' | 'user';
  /** Which experience the conversation belongs to. Defaults to 'chat'. */
  kind?: AppMode;
  /** Coding-agent conversations only. */
  project?: CodeProject;
}

/** User-added remote MCP server (Streamable HTTP or SSE). */
export interface CustomMcpServer {
  id: string;
  name: string;
  url: string;
  /** Optional auth header value sent as Authorization (stored only in this browser). */
  authHeader?: string;
  enabled: boolean;
}

export interface ToolSettings {
  /** Master switch for agent tools in chat. */
  enabled: boolean;
  webSearch: boolean;
  /** Built-in helpers: current time, calculator, fetch URL. */
  utilities: boolean;
  /** Curated MCP servers by id -> enabled. */
  mcp: Record<string, boolean>;
  customMcp: CustomMcpServer[];
}

/** Bring-your-own keys. Stored only in this browser, sent per request, never persisted server-side. */
export interface ByokKeys {
  tavily?: string;
  elevenlabs?: string;
  vapi?: string;
}

export interface ChatSettings {
  model: ChatModelId;
  mode: ResponseMode;
  reasoningEffort: ReasoningEffort;
  /** FIM ghost-text autocomplete in the code canvas. */
  fimEnabled: boolean;
  /** Speak assistant replies aloud in voice mode. */
  voiceAutoSpeak: boolean;
  appMode: AppMode;
  tools: ToolSettings;
  /** Generate a chat title with the model after the first reply. */
  aiTitles: boolean;
  /** Voice engine: browser Web Speech, or ElevenLabs (needs a key). */
  voiceEngine: 'browser' | 'elevenlabs';
  /** Agent preset id (cookbook agents): 'general' | 'research' | 'clinic' | 'sql'. */
  agentPreset: string;
}

/** Body accepted by POST /api/chat. */
export interface ChatRequestBody {
  messages: { role: Role; content: string }[];
  model: ChatModelId;
  mode: ResponseMode;
  reasoningEffort: ReasoningEffort;
  /** Voice turn: low latency, spoken-style answers. */
  voice?: boolean;
  /** Agent tools to enable for this request. Omitted = no tools. */
  tools?: ToolRequestConfig;
}

/** Tools requested for one /api/chat or /api/code call. */
export interface ToolRequestConfig {
  /** Agent preset id; presets add their own tools and system prompt. */
  preset?: string;
  /** Conversation id, so stateful demo tools (clinic preset) persist across turns. */
  sessionId?: string;
  webSearch?: boolean;
  utilities?: boolean;
  /** Curated server ids (resolved server-side) */
  mcp?: string[];
  /** User-added servers (validated server-side against SSRF) */
  customMcp?: { id: string; name: string; url: string; authHeader?: string }[];
  /** BYOK keys needed by the enabled tools. */
  keys?: Pick<ByokKeys, 'tavily'>;
}

/** Body accepted by POST /api/code (coding agent). */
export interface CodeRequestBody {
  messages: { role: Role; content: string }[];
  model: ChatModelId;
  reasoningEffort: ReasoningEffort;
  /** Current project files sent as context. */
  files: Record<string, string>;
  tools?: ToolRequestConfig;
}

/** Body accepted by POST /api/title. */
export interface TitleRequestBody {
  user: string;
  assistant: string;
}

/** Body accepted by POST /api/fim. */
export interface FimRequestBody {
  prompt: string;
  suffix: string;
  language?: string;
  maxTokens?: number;
  /** Upstream stop sequences, e.g. ["\n"] for single-line inline completions. */
  stop?: string[];
}

export interface FimResponseBody {
  text: string;
  latencyMs?: number;
}

/** Uniform error body returned by every API route. */
export interface ApiErrorBody {
  error: { message: string; code: string; status: number };
}
