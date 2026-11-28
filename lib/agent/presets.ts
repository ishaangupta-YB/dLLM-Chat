import 'server-only';
// Server side of the agent presets (cookbook agents): system prompts and the
// tools each preset adds. Metadata for the UI lives in presets-meta.ts.
import type { AgentTool } from './types';
import { getPresetMeta, type PresetId } from './presets-meta';
import { clinicSystemPrompt, clinicTools, getClinicState } from './presets/clinic';
import { SQL_SYSTEM_PROMPT, sqlTools } from './presets/sql';

export interface PresetRuntime {
  id: PresetId;
  systemPrompt?: string;
  tools: AgentTool[];
  /** Built-in tools the preset forces on regardless of user toggles. */
  forceWebSearch?: boolean;
  forceFetchUrl?: boolean;
}

const RESEARCH_PROMPT = `You are in Research mode (search agent). For questions that need facts:
1. PLAN: decide which 1-3 focused queries attack the question from different angles (never repeat a query).
2. SEARCH: call web_search for them (you may call several in parallel). Use fetch_url to read the most relevant page in full when snippets are not enough.
3. ANALYZE: stop searching as soon as the evidence supports a complete answer; search again only for missing facts.
4. ANSWER: write a well-structured markdown answer using only what the sources say. Cite every factual claim inline with its source number as a markdown link, e.g. [1](https://example.com) or [2](url)[4](url). Say clearly when the sources do not answer something.`;

export function resolvePreset(id: string | undefined, opts: { sessionId?: string } = {}): PresetRuntime {
  const meta = getPresetMeta(id);
  switch (meta.id) {
    case 'research':
      return { id: 'research', systemPrompt: RESEARCH_PROMPT, tools: [], forceWebSearch: true, forceFetchUrl: true };
    case 'clinic':
      return { id: 'clinic', systemPrompt: clinicSystemPrompt(), tools: clinicTools(getClinicState(opts.sessionId)) };
    case 'sql':
      return { id: 'sql', systemPrompt: SQL_SYSTEM_PROMPT, tools: sqlTools() };
    default:
      return { id: 'general', tools: [] };
  }
}
