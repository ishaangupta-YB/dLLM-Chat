'use client';

// Bring-your-own API keys (Tavily, ElevenLabs, Vapi). Kept in a separate
// localStorage entry so they are never included in chat exports. Keys are sent
// to this app's own API routes per request over HTTPS and are never persisted
// or logged server-side.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ByokKeys } from '@/lib/types';

export const KEYS_STORAGE_KEY = 'dllm-chat:keys';

interface KeysState {
  keys: ByokKeys;
  setKey: (name: keyof ByokKeys, value: string | undefined) => void;
  clearKeys: () => void;
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 400) : undefined);

export const useKeysStore = create<KeysState>()(
  persist(
    (set) => ({
      keys: {},
      setKey: (name, value) => set((s) => ({ keys: { ...s.keys, [name]: clean(value) } })),
      clearKeys: () => set({ keys: {} }),
    }),
    {
      name: KEYS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      merge: (persisted, current) => {
        const k = ((persisted as Partial<KeysState>)?.keys ?? {}) as ByokKeys;
        return { ...current, keys: { tavily: clean(k.tavily), elevenlabs: clean(k.elevenlabs), vapi: clean(k.vapi) } };
      },
    },
  ),
);
