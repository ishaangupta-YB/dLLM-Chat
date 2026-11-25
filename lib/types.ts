// Shared domain types. Safe to import from both client and server code.

export type ChatModelId = 'mercury-3' | 'mercury-2.5' | 'mercury-2';

/** How the response is rendered while it arrives. */
export type ResponseMode = 'streaming' | 'diffusing';

export type ReasoningEffort = 'instant' | 'low' | 'medium' | 'high';

export type Role = 'user' | 'assistant';

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
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  pinned?: boolean;
}

export interface ChatSettings {
  model: ChatModelId;
  mode: ResponseMode;
  reasoningEffort: ReasoningEffort;
  /** FIM ghost-text autocomplete in the code canvas. */
  fimEnabled: boolean;
  /** Speak assistant replies aloud in voice mode. */
  voiceAutoSpeak: boolean;
}

/** Body accepted by POST /api/chat. */
export interface ChatRequestBody {
  messages: { role: Role; content: string }[];
  model: ChatModelId;
  mode: ResponseMode;
  reasoningEffort: ReasoningEffort;
  /** Voice turn: low latency, spoken-style answers. */
  voice?: boolean;
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
