'use client';
// Composer control bound to settings.agentPreset: General / Research /
// Clinic support / SQL analyst (the Inception cookbook agents).
import { CheckIcon, ChevronDownIcon, DatabaseIcon, SparklesIcon, StethoscopeIcon, TelescopeIcon, type LucideIcon } from 'lucide-react';
import { PromptInputButton } from '@/components/ai-elements/prompt-input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AGENT_PRESETS, getPresetMeta, type AgentPresetMeta } from '@/lib/agent/presets-meta';
import { useChatStore } from '@/lib/store/chat-store';
import { cn } from '@/lib/utils';

export const PRESET_ICONS: Record<AgentPresetMeta['icon'], LucideIcon> = {
  sparkles: SparklesIcon,
  telescope: TelescopeIcon,
  stethoscope: StethoscopeIcon,
  database: DatabaseIcon,
};

export function AgentPresetPicker({ disabled }: { disabled?: boolean }) {
  const presetId = useChatStore((s) => s.settings.agentPreset);
  const setSettings = useChatStore((s) => s.setSettings);
  const current = getPresetMeta(presetId);
  const Icon = PRESET_ICONS[current.icon];
  const isGeneral = current.id === 'general';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <PromptInputButton
          id="composer-preset-trigger"
          aria-label={`Agent: ${current.name}`}
          size="sm"
          className={cn(
            'shrink-0 gap-1.5 px-2 text-muted-foreground',
            !isGeneral && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
          )}
        >
          <Icon className="size-4" />
          <span className={cn(isGeneral ? 'hidden @lg:inline' : 'inline')}>{isGeneral ? 'Agent' : current.name}</span>
          <ChevronDownIcon className="size-3 opacity-60" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[min(20rem,calc(100vw-2rem))]" data-testid="preset-menu">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Agent preset</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {AGENT_PRESETS.map((p) => {
          const PIcon = PRESET_ICONS[p.icon];
          const selected = p.id === current.id;
          return (
            <DropdownMenuItem
              key={p.id}
              data-preset={p.id}
              onSelect={() => setSettings({ agentPreset: p.id })}
              className="items-start gap-3 py-2"
            >
              <span
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background',
                  selected && 'border-primary/40 bg-primary/10 text-primary',
                )}
              >
                <PIcon className={cn('size-4', selected && 'text-primary')} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {p.name}
                  {p.demoData && (
                    <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-normal text-muted-foreground">demo data</span>
                  )}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">{p.description}</span>
              </span>
              {selected && <CheckIcon className="mt-1 size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
