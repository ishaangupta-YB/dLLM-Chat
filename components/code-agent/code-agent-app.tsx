'use client';

// Lovable-style coding agent: chat on the left, Preview / Code workspace on the
// right (resizable, layout remembered). On phones: Chat | Preview | Code tabs.
// Rendered by components/chat/chat-app.tsx when settings.appMode === 'code'.
import { useEffect, useState } from 'react';
import type { Layout } from 'react-resizable-panels';
import { CodeXmlIcon, FileCode2Icon, MessageSquareIcon, MonitorIcon } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useIsMobile } from '@/hooks/use-mobile';
import { ensureCodeConversation } from '@/lib/code-agent/use-code-agent';
import { useVersionsStore } from '@/lib/code-agent/versions';
import { hydrateWorkspacePrefs, useWorkspaceStore } from '@/lib/code-agent/workspace-store';
import { useChatStore } from '@/lib/store/chat-store';
import { cn } from '@/lib/utils';
import { CodeChat } from './code-chat';
import { SegmentedTabs, WorkspaceBody, WorkspaceToolbar } from './workspace';

const LAYOUT_KEY = 'dllm-chat:code-layout';
const DEFAULT_LAYOUT: Layout = { chat: 36, workspace: 64 };

function readLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null') as Layout | null;
    if (raw && typeof raw.chat === 'number' && typeof raw.workspace === 'number' && Math.abs(raw.chat + raw.workspace - 100) < 1) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT;
}

export function CodeAgentApp() {
  const activeId = useChatStore((s) => s.activeId);
  const activeIsCode = useChatStore((s) => (s.activeId ? s.conversations[s.activeId]?.kind === 'code' : false));
  const isMobile = useIsMobile();
  const [versionsReady, setVersionsReady] = useState(() => useVersionsStore.persist.hasHydrated());

  useEffect(() => {
    hydrateWorkspacePrefs();
    if (!useVersionsStore.persist.hasHydrated()) {
      void Promise.resolve(useVersionsStore.persist.rehydrate()).then(() => setVersionsReady(true));
    }
  }, []);

  // Code mode always works on a code conversation.
  useEffect(() => {
    if (!activeIsCode) ensureCodeConversation();
  }, [activeIsCode, activeId]);

  // Per-project UI state resets when switching projects.
  useEffect(() => {
    useWorkspaceStore.getState().reset();
  }, [activeId]);

  if (!activeId || !activeIsCode || !versionsReady) {
    return <div className="flex min-h-0 flex-1" aria-busy="true" />;
  }

  return isMobile ? <MobileLayout conversationId={activeId} /> : <DesktopLayout conversationId={activeId} />;
}

function DesktopLayout({ conversationId }: { conversationId: string }) {
  const [defaultLayout] = useState(readLayout);
  const view = useWorkspaceStore((s) => s.tab);
  return (
    <ResizablePanelGroup
      id="code-agent-layout"
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout, meta) => {
        if (!meta.isUserInteraction) return;
        try {
          localStorage.setItem(LAYOUT_KEY, JSON.stringify(meta.requestedLayout ?? layout));
        } catch {
          /* ignore */
        }
      }}
      // While dragging, iframes must not swallow pointer events.
      className="code-agent min-h-0 flex-1 has-[[data-separator=active]]:[&_iframe]:pointer-events-none has-[[data-separator=active]]:select-none"
      data-testid="code-agent"
    >
      <ResizablePanel id="chat" defaultSize="36%" minSize="26%" maxSize="60%" className="flex min-w-0 flex-col bg-background">
        <CodeChat conversationId={conversationId} />
      </ResizablePanel>
      <ResizableHandle withHandle className="bg-border/80 [&>div]:h-6 [&>div]:rounded-full" />
      <ResizablePanel id="workspace" defaultSize="64%" minSize="35%" className="flex min-w-0 flex-col bg-background">
        <WorkspaceToolbar conversationId={conversationId} />
        <WorkspaceBody conversationId={conversationId} view={view} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function MobileLayout({ conversationId }: { conversationId: string }) {
  const tab = useWorkspaceStore((s) => s.mobileTab);
  const setTab = useWorkspaceStore((s) => s.setMobileTab);
  const streaming = useChatStore((s) => s.streaming?.conversationId === conversationId);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="code-agent">
      <div className="flex shrink-0 items-center gap-2 border-border/70 border-b px-3 py-2">
        <CodeXmlIcon className={cn('size-4 text-muted-foreground', streaming && 'animate-pulse text-primary')} />
        <SegmentedTabs
          label="Coding agent view"
          value={tab}
          onChange={setTab}
          className="flex-1"
          items={[
            { value: 'chat', label: 'Chat', icon: <MessageSquareIcon className="size-3.5" /> },
            { value: 'preview', label: 'Preview', icon: <MonitorIcon className="size-3.5" /> },
            { value: 'code', label: 'Code', icon: <FileCode2Icon className="size-3.5" /> },
          ]}
        />
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col', tab !== 'chat' && 'hidden')}>
        <CodeChat conversationId={conversationId} />
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col', tab === 'chat' && 'hidden')}>
        <WorkspaceToolbar conversationId={conversationId} showTabs={false} />
        <WorkspaceBody conversationId={conversationId} view={tab === 'code' ? 'code' : 'preview'} />
      </div>
    </div>
  );
}
