import 'server-only';
import type { ChatStreamEvent } from '@/lib/chat/protocol';
import type { SourceRef } from '@/lib/types';

/** JSON Schema object for tool parameters (OpenAI function-calling subset). */
export type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [k: string]: unknown;
};

export interface ToolContext {
  /** Aborted when the client disconnects or the tool times out. */
  signal: AbortSignal;
  /** Emit extra protocol events (e.g. coding agent `file` events). */
  emit: (e: ChatStreamEvent) => void;
}

export interface ToolResult {
  /** What the model sees. Truncated by the runtime to MAX_TOOL_RESULT_CHARS. */
  content: string;
  /** Short preview shown in the UI (defaults to a truncated `content`). */
  display?: string;
  sources?: SourceRef[];
}

export interface AgentTool {
  /** ^[a-zA-Z0-9_-]{1,64}$ (OpenAI function name rules). */
  name: string;
  description: string;
  parameters: JsonSchema;
  /** 'builtin' or 'mcp:<serverId>' (shown in the UI). */
  source?: string;
  /** Human label for the UI, e.g. "Searching the web for “x”". */
  label?: (args: Record<string, unknown>) => string;
  /** Per-tool timeout (ms). Default 25s. */
  timeoutMs?: number;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

/** Upstream chat message (OpenAI format) used inside the agent loop. */
export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };
