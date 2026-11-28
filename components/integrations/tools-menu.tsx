'use client';
// Composer button: quick toggles for agent tools, web search and MCP
// servers, plus a link to the full settings dialog (Tools & connectors tab).
import { useState } from 'react';
import { BlocksIcon, GlobeIcon, PlugIcon, Settings2Icon, WrenchIcon } from 'lucide-react';
import { PromptInputButton } from '@/components/ai-elements/prompt-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { CURATED_MCP_SERVERS } from '@/lib/agent/mcp/servers';
import { getPresetMeta } from '@/lib/agent/presets-meta';
import { useChatStore } from '@/lib/store/chat-store';
import type { ToolSettings } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SettingsDialog } from './settings-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useByokKeys } from './use-keys';

export function countActiveTools(t: ToolSettings): number {
  if (!t.enabled) return 0;
  return (
    (t.webSearch ? 1 : 0) +
    (t.utilities ? 1 : 0) +
    CURATED_MCP_SERVERS.filter((s) => t.mcp[s.id]).length +
    t.customMcp.filter((s) => s.enabled).length
  );
}

function Row({
  id,
  icon,
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch id={id} size="sm" checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
    </label>
  );
}

export function ToolsMenu({ disabled }: { disabled?: boolean }) {
  const tools = useChatStore((s) => s.settings.tools);
  const preset = useChatStore((s) => s.settings.agentPreset);
  const setSettings = useChatStore((s) => s.setSettings);
  const { keys } = useByokKeys();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const patch = (p: Partial<ToolSettings>) => setSettings({ tools: { ...useChatStore.getState().settings.tools, ...p } });
  const active = countActiveTools(tools);
  const presetMeta = getPresetMeta(preset);
  const focused = presetMeta.id === 'clinic' || presetMeta.id === 'sql';
  const off = !tools.enabled;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <PromptInputButton
            id="composer-tools-trigger"
            disabled={disabled}
            aria-label="Tools"
            tooltip={open ? undefined : 'Tools and connectors'}
            className={cn('shrink-0 gap-1.5 px-2 text-muted-foreground', active > 0 && 'text-foreground')}
            size="sm"
          >
            <BlocksIcon className="size-4" />
            <span className="hidden @md:inline">Tools</span>
            {active > 0 && (
              <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums">
                {active}
              </Badge>
            )}
          </PromptInputButton>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0" data-testid="tools-menu">
          <div className="flex items-center gap-3 px-3 pt-3 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Tools</p>
              <p className="text-xs text-muted-foreground">Let Mercury search, calculate and use connectors.</p>
            </div>
            <Switch
              id="tools-master"
              checked={tools.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              aria-label="Enable tools"
            />
          </div>
          {focused && (
            <p className="mx-3 mb-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
              The {presetMeta.name} agent uses its own demo tools; these switches apply in General and Research.
            </p>
          )}
          <Separator />
          <div className="max-h-[min(60vh,26rem)] overflow-y-auto p-1.5">
            <p className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Built-in</p>
            <Row
              id="tools-web"
              icon={<GlobeIcon className="size-3.5" />}
              title="Web search"
              hint={keys.tavily ? 'Tavily (your key)' : 'Free search (Exa, Wikipedia)'}
              checked={tools.webSearch}
              disabled={off}
              onChange={(v) => patch({ webSearch: v })}
            />
            <Row
              id="tools-utilities"
              icon={<WrenchIcon className="size-3.5" />}
              title="Utilities"
              hint="Time, calculator, page reader"
              checked={tools.utilities}
              disabled={off}
              onChange={(v) => patch({ utilities: v })}
            />
            <p className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Connectors (MCP)</p>
            {CURATED_MCP_SERVERS.map((s) => (
              <Row
                key={s.id}
                id={`tools-mcp-${s.id}`}
                icon={<PlugIcon className="size-3.5" />}
                title={s.name}
                hint={s.description}
                checked={!!tools.mcp[s.id]}
                disabled={off}
                onChange={(v) => patch({ mcp: { ...useChatStore.getState().settings.tools.mcp, [s.id]: v } })}
              />
            ))}
            {tools.customMcp.map((s) => (
              <Row
                key={s.id}
                id={`tools-custom-${s.id}`}
                icon={<PlugIcon className="size-3.5 text-primary" />}
                title={s.name}
                hint={s.url.replace(/^https:\/\//, '')}
                checked={s.enabled}
                disabled={off}
                onChange={(v) =>
                  patch({
                    customMcp: useChatStore
                      .getState()
                      .settings.tools.customMcp.map((c) => (c.id === s.id ? { ...c, enabled: v } : c)),
                  })
                }
              />
            ))}
          </div>
          <Separator />
          <div className="p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
            >
              <Settings2Icon className="size-4" /> Manage connectors
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} tab="tools" />
    </>
  );
}
