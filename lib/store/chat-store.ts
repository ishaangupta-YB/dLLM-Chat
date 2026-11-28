'use client';

// Single source of truth for conversations and settings. Persisted as JSON in
// localStorage under STORAGE_KEY. Hydration is manual (skipHydration) so the
// server render and the first client render match; call
// useChatStore.persist.rehydrate() once on mount (see useHydrated()).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { DEFAULT_MODEL, isChatModelId, isReasoningEffort } from '@/lib/models';
import { replaceCodeBlock } from '@/lib/chat/segments';
import type { AppMode, ChatMessage, ChatSettings, CodeProject, Conversation, CustomMcpServer, ToolSettings } from '@/lib/types';
import { debouncedLocalStorage, flushPersist } from './persist-storage';

export const STORAGE_KEY = 'dllm-chat:v2';
const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: ChatSettings = {
  model: DEFAULT_MODEL,
  mode: 'streaming',
  reasoningEffort: 'low',
  fimEnabled: true,
  voiceAutoSpeak: true,
  appMode: 'chat',
  tools: {
    enabled: true,
    webSearch: true,
    utilities: true,
    mcp: { deepwiki: true, context7: true },
    customMcp: [],
  },
  aiTitles: true,
  voiceEngine: 'browser',
  agentPreset: 'general',
};

export const NEW_CHAT_TITLE = 'New chat';

export interface StreamingRef {
  conversationId: string;
  messageId: string;
}

interface ChatState {
  conversations: Record<string, Conversation>;
  activeId: string | null;
  settings: ChatSettings;
  /** Transient (not persisted): the message currently receiving tokens. */
  streaming: StreamingRef | null;

  // conversations
  /** Create (or reuse an empty) conversation of the given kind (default: current appMode). */
  createConversation: (kind?: AppMode) => string;
  /** Set a title from a given source. 'ai' titles never overwrite 'user' titles. */
  setConversationTitle: (id: string, title: string, source: 'auto' | 'ai' | 'user') => void;
  /** Coding agent: write (content) or delete (null) a file in the conversation's project. */
  applyFileChange: (conversationId: string, path: string, content: string | null) => void;
  setActiveFile: (conversationId: string, path: string) => void;
  /** Replace the whole project (e.g. restore a version). */
  setProject: (conversationId: string, project: CodeProject) => void;
  selectConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  clearAll: () => void;
  importConversations: (list: Conversation[]) => number;

  // messages
  appendMessage: (conversationId: string, message: Omit<ChatMessage, 'id' | 'createdAt'> & Partial<Pick<ChatMessage, 'id' | 'createdAt'>>) => string;
  patchMessage: (conversationId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  /** Remove a message and everything after it (used by regenerate / edit). */
  truncateFrom: (conversationId: string, messageId: string) => void;
  updateCodeBlock: (conversationId: string, messageId: string, blockIndex: number, code: string) => void;

  // settings / transient
  setSettings: (patch: Partial<ChatSettings>) => void;
  setStreaming: (ref: StreamingRef | null) => void;
}

const now = () => Date.now();

function touch(c: Conversation, patch: Partial<Conversation> = {}): Conversation {
  return { ...c, ...patch, updatedAt: now() };
}

export function deriveTitle(text: string): string {
  const firstLine = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/[#>*_`~\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!firstLine) return NEW_CHAT_TITLE;
  return firstLine.length > 60 ? firstLine.slice(0, 57).trimEnd() + '…' : firstLine;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: {},
      activeId: null,
      settings: DEFAULT_SETTINGS,
      streaming: null,

      createConversation: (kindArg) => {
        // Reuse an existing empty chat of the same kind (the active one first)
        // rather than piling up blank ones.
        const { conversations, activeId, settings } = get();
        const kind: AppMode = kindArg ?? settings.appMode;
        const kindOf = (c: Conversation) => c.kind ?? 'chat';
        const active = activeId ? conversations[activeId] : undefined;
        if (active && active.messages.length === 0 && kindOf(active) === kind) return active.id;
        const empty = Object.values(conversations).find((c) => c.messages.length === 0 && kindOf(c) === kind);
        if (empty) {
          set((s) => ({
            conversations: { ...s.conversations, [empty.id]: touch(empty) },
            activeId: empty.id,
          }));
          return empty.id;
        }
        const id = nanoid(12);
        const t = now();
        set((s) => ({
          conversations: {
            ...s.conversations,
            [id]: {
              id,
              title: NEW_CHAT_TITLE,
              createdAt: t,
              updatedAt: t,
              messages: [],
              titleSource: 'auto',
              kind,
              ...(kind === 'code' ? { project: { files: {}, version: 0 } } : {}),
            },
          },
          activeId: id,
        }));
        return id;
      },

      selectConversation: (id) => set({ activeId: id }),

      deleteConversation: (id) => {
        set((s) => {
          const rest = { ...s.conversations };
          delete rest[id];
          let activeId = s.activeId;
          if (activeId === id) {
            const next = Object.values(rest).sort((a, b) => b.updatedAt - a.updatedAt)[0];
            activeId = next?.id ?? null;
          }
          return { conversations: rest, activeId };
        });
        flushPersist();
      },

      renameConversation: (id, title) => {
        const t = title.trim().slice(0, 120);
        if (!t) return;
        set((s) =>
          s.conversations[id]
            ? { conversations: { ...s.conversations, [id]: { ...s.conversations[id], title: t, titleSource: 'user' } } }
            : s,
        );
        flushPersist();
      },

      setConversationTitle: (id, title, source) => {
        const t = title.trim().replace(/\s+/g, ' ').slice(0, 120);
        if (!t) return;
        set((s) => {
          const c = s.conversations[id];
          if (!c) return s;
          if (source === 'ai' && c.titleSource === 'user') return s;
          return { conversations: { ...s.conversations, [id]: { ...c, title: t, titleSource: source } } };
        });
        flushPersist();
      },

      applyFileChange: (conversationId, path, content) =>
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return s;
          const project = c.project ?? { files: {}, version: 0 };
          const files = { ...project.files };
          if (content === null) delete files[path];
          else files[path] = content;
          const activeFile =
            content === null && project.activeFile === path ? Object.keys(files)[0] : project.activeFile ?? path;
          return {
            conversations: {
              ...s.conversations,
              [conversationId]: touch(c, { project: { files, activeFile, version: project.version + 1 } }),
            },
          };
        }),

      setActiveFile: (conversationId, path) =>
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c?.project) return s;
          return {
            conversations: { ...s.conversations, [conversationId]: { ...c, project: { ...c.project, activeFile: path } } },
          };
        }),

      setProject: (conversationId, project) => {
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return s;
          return {
            conversations: {
              ...s.conversations,
              [conversationId]: touch(c, { project: { ...project, version: (c.project?.version ?? 0) + 1 } }),
            },
          };
        });
        flushPersist();
      },

      togglePin: (id) =>
        set((s) =>
          s.conversations[id]
            ? {
                conversations: {
                  ...s.conversations,
                  [id]: { ...s.conversations[id], pinned: !s.conversations[id].pinned },
                },
              }
            : s,
        ),

      clearAll: () => {
        set({ conversations: {}, activeId: null, streaming: null });
        flushPersist();
      },

      importConversations: (list) => {
        let added = 0;
        set((s) => {
          const next = { ...s.conversations };
          for (const raw of list) {
            const c = sanitizeConversation(raw);
            if (!c) continue;
            next[c.id] = c;
            added++;
          }
          return { conversations: next };
        });
        flushPersist();
        return added;
      },

      appendMessage: (conversationId, message) => {
        const id = message.id ?? nanoid(12);
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return s;
          const msg: ChatMessage = { ...message, id, createdAt: message.createdAt ?? now() };
          const title =
            c.title === NEW_CHAT_TITLE && msg.role === 'user' ? deriveTitle(msg.content) : c.title;
          return {
            conversations: {
              ...s.conversations,
              [conversationId]: touch(c, { messages: [...c.messages, msg], title }),
            },
          };
        });
        return id;
      },

      patchMessage: (conversationId, messageId, patch) =>
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return s;
          const idx = c.messages.findIndex((m) => m.id === messageId);
          if (idx === -1) return s;
          const messages = c.messages.slice();
          messages[idx] = { ...messages[idx], ...patch };
          return { conversations: { ...s.conversations, [conversationId]: { ...c, messages } } };
        }),

      truncateFrom: (conversationId, messageId) =>
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return s;
          const idx = c.messages.findIndex((m) => m.id === messageId);
          if (idx === -1) return s;
          return {
            conversations: {
              ...s.conversations,
              [conversationId]: touch(c, { messages: c.messages.slice(0, idx) }),
            },
          };
        }),

      updateCodeBlock: (conversationId, messageId, blockIndex, code) => {
        const c = get().conversations[conversationId];
        const msg = c?.messages.find((m) => m.id === messageId);
        if (!c || !msg) return;
        const content = replaceCodeBlock(msg.content, blockIndex, code);
        if (content === msg.content) return;
        get().patchMessage(conversationId, messageId, { content });
        set((s) => ({
          conversations: { ...s.conversations, [conversationId]: touch(s.conversations[conversationId]) },
        }));
        flushPersist();
      },

      setSettings: (patch) => set((s) => ({ settings: sanitizeSettings({ ...s.settings, ...patch }) })),

      setStreaming: (ref) => set({ streaming: ref }),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => debouncedLocalStorage),
      skipHydration: true,
      partialize: (s) => ({ conversations: s.conversations, activeId: s.activeId, settings: s.settings }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ChatState>;
        const conversations: Record<string, Conversation> = {};
        for (const raw of Object.values(p.conversations ?? {})) {
          const c = sanitizeConversation(raw);
          if (c) conversations[c.id] = c;
        }
        const activeId = p.activeId && conversations[p.activeId] ? p.activeId : null;
        return {
          ...current,
          conversations,
          activeId,
          settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...(p.settings ?? {}) }),
        };
      },
    },
  ),
);

function sanitizeSettings(s: ChatSettings): ChatSettings {
  return {
    model: isChatModelId(s.model) ? s.model : DEFAULT_SETTINGS.model,
    mode: s.mode === 'diffusing' ? 'diffusing' : 'streaming',
    reasoningEffort: isReasoningEffort(s.reasoningEffort) ? s.reasoningEffort : DEFAULT_SETTINGS.reasoningEffort,
    fimEnabled: typeof s.fimEnabled === 'boolean' ? s.fimEnabled : true,
    voiceAutoSpeak: typeof s.voiceAutoSpeak === 'boolean' ? s.voiceAutoSpeak : true,
    appMode: s.appMode === 'code' ? 'code' : 'chat',
    tools: sanitizeTools(s.tools),
    aiTitles: typeof s.aiTitles === 'boolean' ? s.aiTitles : true,
    voiceEngine: s.voiceEngine === 'elevenlabs' ? 'elevenlabs' : 'browser',
    agentPreset: typeof s.agentPreset === 'string' && /^[a-z0-9-]{1,30}$/.test(s.agentPreset) ? s.agentPreset : 'general',
  };
}

function sanitizeTools(raw: unknown): ToolSettings {
  const d = DEFAULT_SETTINGS.tools;
  if (!raw || typeof raw !== 'object') return { ...d, mcp: { ...d.mcp }, customMcp: [] };
  const t = raw as Partial<ToolSettings>;
  const mcp: Record<string, boolean> = { ...d.mcp };
  if (t.mcp && typeof t.mcp === 'object') {
    for (const [k, v] of Object.entries(t.mcp)) if (typeof v === 'boolean' && /^[a-z0-9-]{1,40}$/.test(k)) mcp[k] = v;
  }
  const customMcp: CustomMcpServer[] = Array.isArray(t.customMcp)
    ? t.customMcp
        .filter(
          (x): x is CustomMcpServer =>
            !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.url === 'string',
        )
        .slice(0, 10)
        .map((x) => ({
          id: x.id.slice(0, 40),
          name: x.name.slice(0, 60),
          url: x.url.slice(0, 500),
          authHeader: typeof x.authHeader === 'string' ? x.authHeader.slice(0, 2000) : undefined,
          enabled: x.enabled === true,
        }))
    : [];
  return {
    enabled: typeof t.enabled === 'boolean' ? t.enabled : d.enabled,
    webSearch: typeof t.webSearch === 'boolean' ? t.webSearch : d.webSearch,
    utilities: typeof t.utilities === 'boolean' ? t.utilities : d.utilities,
    mcp,
    customMcp,
  };
}

/** Validates untrusted JSON (localStorage or an imported file). */
function sanitizeConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<Conversation>;
  if (typeof c.id !== 'string' || !Array.isArray(c.messages)) return null;
  const messages: ChatMessage[] = [];
  for (const m of c.messages) {
    if (!m || typeof m !== 'object') continue;
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const msg: ChatMessage = {
      ...m,
      id: typeof m.id === 'string' ? m.id : nanoid(12),
      createdAt: typeof m.createdAt === 'number' ? m.createdAt : now(),
    };
    // A message still marked pending was interrupted by a reload.
    if (msg.pending) {
      msg.pending = false;
      if (!msg.content) msg.error = msg.error ?? 'Response was interrupted.';
      else msg.finishReason = msg.finishReason ?? 'interrupted';
    }
    messages.push(msg);
  }
  const t = now();
  return {
    id: c.id,
    title: typeof c.title === 'string' && c.title.trim() ? c.title : NEW_CHAT_TITLE,
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : t,
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : t,
    messages,
    pinned: c.pinned === true,
    titleSource: c.titleSource === 'ai' || c.titleSource === 'user' ? c.titleSource : 'auto',
    kind: c.kind === 'code' ? 'code' : 'chat',
    ...(c.kind === 'code' ? { project: sanitizeProject(c.project) } : {}),
  };
}

function sanitizeProject(raw: unknown): CodeProject {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<CodeProject>;
  const files: Record<string, string> = {};
  if (p.files && typeof p.files === 'object') {
    for (const [k, v] of Object.entries(p.files).slice(0, 50)) {
      if (typeof v === 'string' && /^[\w.\-/]{1,120}$/.test(k) && !k.includes('..')) files[k] = v;
    }
  }
  return {
    files,
    activeFile: typeof p.activeFile === 'string' && files[p.activeFile] !== undefined ? p.activeFile : Object.keys(files)[0],
    version: typeof p.version === 'number' ? p.version : 0,
  };
}

/** Conversations sorted for the sidebar: pinned first, then most recent. */
export function sortConversations(list: Conversation[]): Conversation[] {
  return list.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}
