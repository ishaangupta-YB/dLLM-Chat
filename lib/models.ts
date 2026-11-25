// Model registry. Source: docs.inceptionlabs.ai (models, reasoning-efforts,
// streaming) verified against live /v1/models on 2026-11-24.
import type { ChatModelId, ReasoningEffort } from './types';

export interface ModelInfo {
  id: ChatModelId;
  name: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  /** Default output budget we send. Covers visible text plus reasoning tokens. */
  defaultMaxTokens: number;
  badge?: string;
}

export const CHAT_MODELS: readonly ModelInfo[] = [
  {
    id: 'mercury-3',
    name: 'Mercury 3',
    description: 'Newest diffusion LLM. 1M context, adjustable reasoning.',
    contextWindow: 1_000_000,
    maxOutputTokens: 131_072,
    defaultMaxTokens: 16_384,
    badge: 'New',
  },
  {
    id: 'mercury-2.5',
    name: 'Mercury 2.5',
    description: 'Previous generation. 260K context.',
    contextWindow: 260_000,
    maxOutputTokens: 65_536,
    defaultMaxTokens: 16_384,
  },
  {
    id: 'mercury-2',
    name: 'Mercury 2',
    description: 'Previous generation. 128K context.',
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    defaultMaxTokens: 16_384,
  },
] as const;

export const DEFAULT_MODEL: ChatModelId = 'mercury-3';

export const CHAT_MODEL_IDS = CHAT_MODELS.map((m) => m.id) as ChatModelId[];

export function getModel(id: string): ModelInfo | undefined {
  return CHAT_MODELS.find((m) => m.id === id);
}

export function isChatModelId(id: unknown): id is ChatModelId {
  return typeof id === 'string' && CHAT_MODEL_IDS.includes(id as ChatModelId);
}

export const REASONING_EFFORTS: readonly {
  id: ReasoningEffort;
  label: string;
  hint: string;
}[] = [
  { id: 'instant', label: 'Instant', hint: 'Lowest latency' },
  { id: 'low', label: 'Low', hint: 'Fast, light reasoning' },
  { id: 'medium', label: 'Medium', hint: 'Balanced' },
  { id: 'high', label: 'High', hint: 'Deepest reasoning, slower' },
] as const;

export function isReasoningEffort(v: unknown): v is ReasoningEffort {
  return v === 'instant' || v === 'low' || v === 'medium' || v === 'high';
}

/** FIM / Next Edit model (served only on /v1/fim and /v1/edit). */
export const FIM_MODEL = 'mercury-edit-2';
