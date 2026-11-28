'use client';
// Full settings: General, Tools & connectors (MCP), API keys (BYOK), Voice.
// Opened from the sidebar footer and from the composer's Tools menu.
import { useId, useState } from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  MicIcon,
  PlugIcon,
  PlusIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  WrenchIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { CURATED_MCP_SERVERS } from '@/lib/agent/mcp/servers';
import { checkUrl } from '@/lib/agent/net/ssrf';
import { CHAT_MODELS, REASONING_EFFORTS, isChatModelId, isReasoningEffort } from '@/lib/models';
import { useChatStore } from '@/lib/store/chat-store';
import { useKeysStore } from '@/lib/store/keys-store';
import type { ByokKeys, CustomMcpServer, ToolSettings } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useByokKeys } from './use-keys';

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional initial tab: 'general' | 'tools' | 'keys' | 'voice'. */
  tab?: string;
}

const TABS = ['general', 'tools', 'keys', 'voice'] as const;
type TabId = (typeof TABS)[number];
const asTab = (t?: string): TabId => ((TABS as readonly string[]).includes(t ?? '') ? (t as TabId) : 'general');

export function SettingsDialog({ open, onOpenChange, tab }: SettingsDialogProps) {
  const [active, setActive] = useState<TabId>(asTab(tab));
  const [wasOpen, setWasOpen] = useState(open);
  // Reset to the requested tab each time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setActive(asTab(tab));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="settings-dialog"
        className={cn(
          'flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl',
          // Phones: a bottom sheet.
          'max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[92dvh] max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0',
        )}
      >
        <DialogHeader className="border-b px-5 pt-5 pb-4 text-left">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Tools, connectors, keys and voice. Everything is saved in this browser.</DialogDescription>
        </DialogHeader>
        <Tabs value={active} onValueChange={(v) => setActive(asTab(v))} className="min-h-0 flex-1 gap-0">
          <div className="border-b px-5 py-2.5">
            <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto [&_[data-slot=tabs-trigger]]:px-1.5 [&_[data-slot=tabs-trigger]]:text-[13px] sm:[&_[data-slot=tabs-trigger]]:px-2 sm:[&_[data-slot=tabs-trigger]]:text-sm">
              <TabsTrigger value="general">
                <SlidersHorizontalIcon className="hidden sm:block" /> General
              </TabsTrigger>
              <TabsTrigger value="tools">
                <PlugIcon className="hidden sm:block" /> <span className="sm:hidden">Tools</span>
                <span className="hidden sm:inline">Tools &amp; connectors</span>
              </TabsTrigger>
              <TabsTrigger value="keys">
                <KeyRoundIcon className="hidden sm:block" /> <span className="sm:hidden">Keys</span>
                <span className="hidden sm:inline">API keys</span>
              </TabsTrigger>
              <TabsTrigger value="voice">
                <MicIcon className="hidden sm:block" /> Voice
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TabsContent value="general">
              <GeneralTab />
            </TabsContent>
            <TabsContent value="tools">
              <ToolsTab />
            </TabsContent>
            <TabsContent value="keys">
              <KeysTab />
            </TabsContent>
            <TabsContent value="voice">
              <VoiceTab onGoToKeys={() => setActive('keys')} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------------- shared */

function SettingRow({
  title,
  description,
  htmlFor,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {title}
        </Label>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionTitle({ children, aside, first }: { children: React.ReactNode; aside?: React.ReactNode; first?: boolean }) {
  return (
    <div className={cn('mb-1 flex items-center gap-2', first ? 'mt-0' : 'mt-6')}>
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
      {aside && <div className="ml-auto">{aside}</div>}
    </div>
  );
}

function useTools() {
  const tools = useChatStore((s) => s.settings.tools);
  const setSettings = useChatStore((s) => s.setSettings);
  const patch = (p: Partial<ToolSettings>) => setSettings({ tools: { ...useChatStore.getState().settings.tools, ...p } });
  return { tools, patch };
}

/* ---------------------------------------------------------------- general */

function GeneralTab() {
  const settings = useChatStore((s) => s.settings);
  const setSettings = useChatStore((s) => s.setSettings);
  return (
    <div className="divide-y">
      <SettingRow
        title="AI chat titles"
        htmlFor="set-ai-titles"
        description="Name new chats with a short title generated after the first reply."
      >
        <Switch id="set-ai-titles" checked={settings.aiTitles} onCheckedChange={(v) => setSettings({ aiTitles: v })} />
      </SettingRow>
      <SettingRow title="Default model" description="Used for new messages.">
        <Select value={settings.model} onValueChange={(v) => isChatModelId(v) && setSettings({ model: v })}>
          <SelectTrigger size="sm" className="w-40" aria-label="Default model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {CHAT_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow title="Response mode" description="Stream text left to right, or watch the answer diffuse into place.">
        <Select
          value={settings.mode}
          onValueChange={(v) => (v === 'streaming' || v === 'diffusing') && setSettings({ mode: v })}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Response mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="streaming">Streaming</SelectItem>
            <SelectItem value="diffusing">Diffusion</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow title="Reasoning effort" description="Higher effort thinks longer before answering.">
        <Select
          value={settings.reasoningEffort}
          onValueChange={(v) => isReasoningEffort(v) && setSettings({ reasoningEffort: v })}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Reasoning effort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {REASONING_EFFORTS.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        title="Code autocomplete"
        htmlFor="set-fim"
        description="Ghost-text suggestions in the code canvas (Mercury Edit)."
      >
        <Switch id="set-fim" checked={settings.fimEnabled} onCheckedChange={(v) => setSettings({ fimEnabled: v })} />
      </SettingRow>
    </div>
  );
}

/* ------------------------------------------------------------------ tools */

function ToolsTab() {
  const { tools, patch } = useTools();
  const { keys } = useByokKeys();
  const off = !tools.enabled;

  return (
    <div>
      <div className="flex items-center gap-4 rounded-xl border bg-card/60 p-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <WrenchIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <Label htmlFor="set-tools-enabled" className="text-sm font-medium">
            Agent tools
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Let Mercury call tools and connectors while answering.</p>
        </div>
        <Switch id="set-tools-enabled" checked={tools.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
      </div>

      <div className={cn('transition-opacity', off && 'pointer-events-none opacity-50')} aria-disabled={off}>
        <SectionTitle>Built-in</SectionTitle>
        <div className="divide-y">
          <SettingRow
            title="Web search"
            htmlFor="set-web"
            description={
              keys.tavily ? (
                <>
                  Using <span className="font-medium text-foreground">Tavily (your key)</span>. Answers cite numbered sources.
                </>
              ) : (
                <>Free search via Exa, with Wikipedia as a fallback. Add a Tavily key under API keys for better results.</>
              )
            }
          >
            <Switch id="set-web" checked={tools.webSearch} disabled={off} onCheckedChange={(v) => patch({ webSearch: v })} />
          </SettingRow>
          <SettingRow
            title="Utilities"
            htmlFor="set-utilities"
            description="Current time, an exact calculator and a web page reader."
          >
            <Switch id="set-utilities" checked={tools.utilities} disabled={off} onCheckedChange={(v) => patch({ utilities: v })} />
          </SettingRow>
        </div>

        <SectionTitle>Connectors (MCP)</SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          Free remote MCP servers. Each enabled connector adds tools to every request, so keep only the ones you use.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CURATED_MCP_SERVERS.map((s) => {
            const id = `set-mcp-${s.id}`;
            const on = !!tools.mcp[s.id];
            return (
              <li key={s.id}>
                <label
                  htmlFor={id}
                  className={cn(
                    'flex h-full cursor-pointer items-start gap-3 rounded-xl border bg-card/50 p-3 transition-colors hover:bg-accent/50',
                    on && 'border-primary/40 bg-primary/5',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {s.name}
                      <span className="truncate text-[11px] font-normal text-muted-foreground">{s.domain}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-snug text-muted-foreground">{s.description}</span>
                  </span>
                  <Switch
                    id={id}
                    size="sm"
                    checked={on}
                    disabled={off}
                    onCheckedChange={(v) => patch({ mcp: { ...useChatStore.getState().settings.tools.mcp, [s.id]: v } })}
                    aria-label={s.name}
                  />
                </label>
              </li>
            );
          })}
        </ul>

        <SectionTitle aside={<Badge variant="secondary" className="text-[10px]">{tools.customMcp.length}/10</Badge>}>
          Custom servers
        </SectionTitle>
        <CustomServers />
      </div>
    </div>
  );
}

interface InspectOk {
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
  tools: { name: string; description: string }[];
}

async function inspect(url: string, authHeader?: string): Promise<InspectOk> {
  const res = await fetch('/api/mcp/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, authHeader: authHeader || undefined }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (HTTP ${res.status}).`);
  return json as InspectOk;
}

function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        className="pr-10 font-mono text-[13px]"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide value' : 'Show value'}
      >
        {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </Button>
    </div>
  );
}

function CustomServers() {
  const { tools, patch } = useTools();
  const formId = useId();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [auth, setAuth] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: true; data: InspectOk } | { ok: false; error: string } | null>(null);

  let urlError: string | null = null;
  if (url.trim()) {
    try {
      checkUrl(url.trim());
    } catch (err) {
      urlError = (err as Error).message;
    }
  }
  const full = tools.customMcp.length >= 10;
  const canSubmit = !!name.trim() && !!url.trim() && !urlError && !full;

  const runTest = async () => {
    if (!url.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const data = await inspect(url.trim(), auth.trim());
      setResult({ ok: true, data });
      if (!name.trim() && data.serverName) setName(data.serverName.slice(0, 60));
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const add = () => {
    if (!canSubmit) return;
    const server: CustomMcpServer = {
      id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, 60),
      url: url.trim(),
      authHeader: auth.trim() || undefined,
      enabled: true,
    };
    patch({ customMcp: [...useChatStore.getState().settings.tools.customMcp, server] });
    setName('');
    setUrl('');
    setAuth('');
    setResult(null);
  };

  const remove = (id: string) =>
    patch({ customMcp: useChatStore.getState().settings.tools.customMcp.filter((c) => c.id !== id) });
  const toggle = (id: string, enabled: boolean) =>
    patch({ customMcp: useChatStore.getState().settings.tools.customMcp.map((c) => (c.id === id ? { ...c, enabled } : c)) });

  return (
    <div className="space-y-3">
      {tools.customMcp.length > 0 && (
        <ul className="divide-y rounded-xl border" data-testid="custom-servers">
          {tools.customMcp.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="custom-server">
              <PlugIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {s.url}
                  {s.authHeader ? ' · auth header set' : ''}
                </p>
              </div>
              <Switch size="sm" checked={s.enabled} onCheckedChange={(v) => toggle(s.id, v)} aria-label={`Enable ${s.name}`} />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => remove(s.id)}
                aria-label={`Remove ${s.name}`}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3 rounded-xl border border-dashed p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        aria-label="Add a custom MCP server"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1.6fr]">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-name`} className="text-xs">
              Name
            </Label>
            <Input id={`${formId}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="My server" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-url`} className="text-xs">
              Server URL (Streamable HTTP)
            </Label>
            <Input
              id={`${formId}-url`}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setResult(null);
              }}
              placeholder="https://example.com/mcp"
              inputMode="url"
              spellCheck={false}
              aria-invalid={!!urlError}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-auth`} className="text-xs">
            Authorization header <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <SecretInput id={`${formId}-auth`} value={auth} onChange={setAuth} placeholder="Bearer sk-… or a bare token" />
        </div>
        {urlError && (
          <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive" data-testid="mcp-url-error">
            <AlertCircleIcon className="size-3.5" /> {urlError}
          </p>
        )}
        {result && !result.ok && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive" data-testid="mcp-test-error">
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" /> {result.error}
          </p>
        )}
        {result?.ok && (
          <div className="rounded-lg bg-muted/60 p-2.5 text-xs" data-testid="mcp-test-result">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <CheckCircle2Icon className="size-3.5 text-green-600" />
              Connected{result.data.serverName ? ` to ${result.data.serverName}` : ''} · {result.data.tools.length} tools
              {result.data.protocolVersion && (
                <span className="font-normal text-muted-foreground">· MCP {result.data.protocolVersion}</span>
              )}
            </p>
            <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto">
              {result.data.tools.map((t) => (
                <li key={t.name} className="truncate">
                  <code className="font-mono text-[11px] text-foreground">{t.name}</code>
                  {t.description && <span className="text-muted-foreground"> — {t.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={runTest} disabled={!url.trim() || !!urlError || testing}>
            {testing ? <LoaderCircleIcon className="size-4 animate-spin" /> : <PlugIcon className="size-4" />}
            Test connection
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            <PlusIcon className="size-4" /> Add server
          </Button>
          <p className="basis-full text-[11px] leading-relaxed text-muted-foreground sm:ml-auto sm:basis-auto">
            Public https servers only. Tool output is treated as untrusted.
          </p>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------- keys */

function KeyField({
  name,
  label,
  placeholder,
  help,
  validate,
}: {
  name: keyof ByokKeys;
  label: string;
  placeholder: string;
  help: React.ReactNode;
  validate?: boolean;
}) {
  const { keys } = useByokKeys();
  const setKey = useKeysStore((s) => s.setKey);
  const value = keys[name] ?? '';
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const id = `key-${name}`;

  const check = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: name, key: value }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) setStatus({ ok: false, message: json?.error?.message ?? `Request failed (HTTP ${res.status}).` });
      else setStatus({ ok: !!json?.ok, message: json?.message ?? '' });
    } catch {
      setStatus({ ok: false, message: 'Could not reach the server.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {value && (
          <Badge variant="secondary" className="text-[10px]">
            saved · …{value.slice(-4)}
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <SecretInput
            id={id}
            value={value}
            onChange={(v) => {
              setKey(name, v);
              setStatus(null);
            }}
            placeholder={placeholder}
          />
        </div>
        {validate && (
          <Button type="button" variant="outline" onClick={check} disabled={value.length < 8 || checking}>
            {checking ? <LoaderCircleIcon className="size-4 animate-spin" /> : <ShieldCheckIcon className="size-4" />}
            Validate
          </Button>
        )}
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              setKey(name, undefined);
              setStatus(null);
            }}
            aria-label={`Remove ${label}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </div>
      {status && (
        <p
          role="status"
          data-testid={`key-status-${name}`}
          className={cn('flex items-center gap-1.5 text-xs', status.ok ? 'text-green-700 dark:text-green-500' : 'text-destructive')}
        >
          {status.ok ? <CheckCircle2Icon className="size-3.5" /> : <AlertCircleIcon className="size-3.5" />}
          {status.message}
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>
    </div>
  );
}

function KeysTab() {
  const clearKeys = useKeysStore((s) => s.clearKeys);
  const { keys } = useByokKeys();
  const any = !!(keys.tavily || keys.elevenlabs || keys.vapi);
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border bg-card/60 p-3.5">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Stored only in this browser, never on our servers.</span> Keys
          live in this device&apos;s local storage, are left out of chat exports, and are sent only with the requests
          that need them.
        </p>
      </div>
      <KeyField
        name="tavily"
        label="Tavily"
        placeholder="tvly-…"
        validate
        help={
          <>
            Powers web search with higher-quality results (free tier: 1,000 searches a month at tavily.com). Without a
            key, search uses free providers.
          </>
        }
      />
      <Separator />
      <KeyField
        name="elevenlabs"
        label="ElevenLabs"
        placeholder="sk_…"
        help="Natural voices and accurate transcription for voice mode. Called directly from your browser."
      />
      <Separator />
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left text-sm font-medium">
          Advanced
          <Badge variant="outline" className="text-[10px] font-normal">
            optional
          </Badge>
          <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <KeyField
            name="vapi"
            label="Vapi (optional)"
            placeholder="Vapi public key"
            help="Kept for future telephony experiments. Vapi is not used by voice mode today: the supported voice engines are the browser's built-in speech and ElevenLabs."
          />
        </CollapsibleContent>
      </Collapsible>
      {any && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={clearKeys}>
            <Trash2Icon className="size-4" /> Remove all keys
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ voice */

function VoiceTab({ onGoToKeys }: { onGoToKeys: () => void }) {
  const engine = useChatStore((s) => s.settings.voiceEngine);
  const autoSpeak = useChatStore((s) => s.settings.voiceAutoSpeak);
  const setSettings = useChatStore((s) => s.setSettings);
  const { keys } = useByokKeys();
  const hasKey = !!keys.elevenlabs;

  const options = [
    {
      id: 'browser' as const,
      title: 'Browser',
      description: 'Built-in speech recognition and synthesis. Free, no key needed.',
      icon: GlobeIcon,
      disabled: false,
    },
    {
      id: 'elevenlabs' as const,
      title: 'ElevenLabs',
      description: hasKey ? 'Studio-quality voices and transcription with your key.' : 'Requires an ElevenLabs API key.',
      icon: MicIcon,
      disabled: !hasKey,
    },
  ];

  return (
    <div>
      <SectionTitle first>Voice engine</SectionTitle>
      <div role="radiogroup" aria-label="Voice engine" className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const selected = engine === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={o.disabled}
              onClick={() => setSettings({ voiceEngine: o.id })}
              className={cn(
                'flex items-start gap-3 rounded-xl border bg-card/50 p-3 text-left transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-card/50',
                selected && 'border-primary/50 bg-primary/5 ring-1 ring-primary/30',
              )}
            >
              <o.icon className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground', selected && 'text-primary')} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{o.description}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 size-4 shrink-0 rounded-full border',
                  selected && 'border-[5px] border-primary',
                )}
              />
            </button>
          );
        })}
      </div>
      {!hasKey && (
        <Button variant="link" size="sm" className="mt-1 h-auto px-0 text-xs" onClick={onGoToKeys}>
          Add an ElevenLabs key
        </Button>
      )}
      {engine === 'elevenlabs' && !hasKey && (
        <p className="mt-2 text-xs text-destructive">The ElevenLabs key is missing; voice mode falls back to the browser.</p>
      )}
      <Separator className="my-4" />
      <SettingRow
        title="Speak replies aloud"
        htmlFor="set-autospeak"
        description="In voice mode, read each answer aloud as it arrives."
        className="py-0"
      >
        <Switch id="set-autospeak" checked={autoSpeak} onCheckedChange={(v) => setSettings({ voiceAutoSpeak: v })} />
      </SettingRow>
    </div>
  );
}
