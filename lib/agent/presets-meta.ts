// Agent presets (Inception cookbook agents). Client-safe metadata: the
// preset picker reads it; lib/agent/presets.ts adds prompts and tools.

export type PresetId = 'general' | 'research' | 'clinic' | 'sql';

export interface AgentPresetMeta {
  id: PresetId;
  name: string;
  /** One line shown in the picker. */
  description: string;
  /** lucide-react icon name (mapped in the UI). */
  icon: 'sparkles' | 'telescope' | 'stethoscope' | 'database';
  /** Cookbook it implements (docs.inceptionlabs.ai/cookbooks/...). */
  cookbook?: string;
  /** Example prompts for the empty state. */
  starters: string[];
  /** Tools the preset always adds, shown as chips. */
  toolNames: string[];
  /** true: runs on built-in demo data. */
  demoData?: boolean;
}

export const AGENT_PRESETS: readonly AgentPresetMeta[] = [
  {
    id: 'general',
    name: 'General',
    description: 'Everyday assistant with the tools you enable.',
    icon: 'sparkles',
    starters: [],
    toolNames: [],
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Plans searches, reads sources and answers with numbered citations.',
    icon: 'telescope',
    cookbook: 'search-agent-mercury',
    starters: [
      'What changed in the latest Node.js LTS release?',
      'Compare the top three open-source vector databases in 2026.',
    ],
    toolNames: ['web_search', 'fetch_url'],
  },
  {
    id: 'clinic',
    name: 'Clinic support',
    description: 'Receptionist for the demo “Diffusion Dental” clinic: find, book, move or cancel visits.',
    icon: 'stethoscope',
    cookbook: 'customer-support-agent-mercury',
    starters: [
      'What cleaning slots does Dr. Flossmore have this week?',
      "I'm Penny Placeholder. When is my next appointment?",
    ],
    toolNames: [
      'find_patient',
      'list_available_slots',
      'book_appointment',
      'reschedule_appointment',
      'cancel_appointment',
      'get_appointments_for_patient',
    ],
    demoData: true,
  },
  {
    id: 'sql',
    name: 'SQL analyst',
    description: 'Answers questions about a sample shop database by writing read-only SQL.',
    icon: 'database',
    cookbook: 'natural-language-sql-agent',
    starters: ['Who are the top 3 customers by total spending?', 'What is the total revenue from delivered orders?'],
    toolNames: ['run_sql_query'],
    demoData: true,
  },
];

export function getPresetMeta(id: string | undefined): AgentPresetMeta {
  return AGENT_PRESETS.find((p) => p.id === id) ?? AGENT_PRESETS[0];
}
