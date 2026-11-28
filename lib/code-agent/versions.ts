'use client';

// Version history for coding-agent projects. Every completed agent turn that
// changed files stores an immutable snapshot keyed by the assistant message.
// Kept in its own localStorage key (not in the chat store) and capped so the
// ~5 MB origin quota is not exhausted by large projects.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { sanitizeFiles } from './files';

export const VERSIONS_KEY = 'dllm-chat:code-versions';
const MAX_PER_PROJECT = 20;
const MAX_TOTAL_CHARS = 1_500_000;

export interface ProjectVersion {
  id: string;
  /** Assistant message that produced this version. */
  messageId: string;
  /** 1-based number within the project (stable even when old versions are pruned). */
  n: number;
  files: Record<string, string>;
  createdAt: number;
  label?: string;
}

interface VersionsState {
  byConversation: Record<string, ProjectVersion[]>;
  addVersion: (conversationId: string, v: Omit<ProjectVersion, 'id' | 'n' | 'createdAt'>) => ProjectVersion;
  /** Remove versions produced by the given messages (regenerate / truncate). */
  removeForMessages: (conversationId: string, messageIds: string[]) => void;
  removeConversation: (conversationId: string) => void;
}

// Quota errors must never break a turn: the snapshot simply is not persisted.
const safeStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota exceeded or storage blocked */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const sizeOf = (v: ProjectVersion) => Object.values(v.files).reduce((n, c) => n + c.length, 0);

function prune(all: Record<string, ProjectVersion[]>): Record<string, ProjectVersion[]> {
  const out: Record<string, ProjectVersion[]> = {};
  for (const [k, list] of Object.entries(all)) out[k] = list.slice(-MAX_PER_PROJECT);
  // Global budget: drop the oldest snapshots across projects, keeping the latest of each.
  let total = Object.values(out).flat().reduce((n, v) => n + sizeOf(v), 0);
  if (total <= MAX_TOTAL_CHARS) return out;
  const candidates = Object.entries(out)
    .flatMap(([k, list]) => list.slice(0, -1).map((v) => ({ k, v })))
    .sort((a, b) => a.v.createdAt - b.v.createdAt);
  for (const { k, v } of candidates) {
    if (total <= MAX_TOTAL_CHARS) break;
    out[k] = out[k].filter((x) => x.id !== v.id);
    total -= sizeOf(v);
  }
  return out;
}

export const useVersionsStore = create<VersionsState>()(
  persist(
    (set, get) => ({
      byConversation: {},
      addVersion: (conversationId, v) => {
        const list = get().byConversation[conversationId] ?? [];
        const version: ProjectVersion = {
          ...v,
          files: { ...v.files },
          id: nanoid(10),
          n: (list[list.length - 1]?.n ?? 0) + 1,
          createdAt: Date.now(),
        };
        set((s) => ({ byConversation: prune({ ...s.byConversation, [conversationId]: [...list, version] }) }));
        return version;
      },
      removeForMessages: (conversationId, messageIds) =>
        set((s) => {
          const list = s.byConversation[conversationId];
          if (!list) return s;
          const ids = new Set(messageIds);
          return { byConversation: { ...s.byConversation, [conversationId]: list.filter((v) => !ids.has(v.messageId)) } };
        }),
      removeConversation: (conversationId) =>
        set((s) => {
          if (!s.byConversation[conversationId]) return s;
          const rest = { ...s.byConversation };
          delete rest[conversationId];
          return { byConversation: rest };
        }),
    }),
    {
      name: VERSIONS_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<VersionsState>;
        const byConversation: Record<string, ProjectVersion[]> = {};
        for (const [k, list] of Object.entries(p.byConversation ?? {})) {
          if (!Array.isArray(list)) continue;
          byConversation[k] = list
            .filter((v): v is ProjectVersion => !!v && typeof v.id === 'string' && typeof v.messageId === 'string')
            .map((v) => ({ ...v, n: typeof v.n === 'number' ? v.n : 1, files: sanitizeFiles(v.files) }));
        }
        return { ...current, byConversation };
      },
    },
  ),
);

const EMPTY: ProjectVersion[] = [];
export const useProjectVersions = (conversationId: string | null | undefined) =>
  useVersionsStore((s) => (conversationId ? (s.byConversation[conversationId] ?? EMPTY) : EMPTY));
