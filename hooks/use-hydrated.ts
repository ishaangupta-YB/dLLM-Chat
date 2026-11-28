'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { useKeysStore } from '@/lib/store/keys-store';

const subscribe = (cb: () => void) => useChatStore.persist.onFinishHydration(cb);
const getSnapshot = () => useChatStore.persist.hasHydrated();
const getServerSnapshot = () => false;

/**
 * Rehydrates the persisted chat store once on the client and reports when it
 * is ready. useSyncExternalStore uses the server snapshot (false) during React
 * hydration, so the server HTML and first client render always match. Render
 * nothing history-dependent until this returns true.
 */
export function useHydrated(): boolean {
  useEffect(() => {
    if (!useChatStore.persist.hasHydrated()) void useChatStore.persist.rehydrate();
    if (!useKeysStore.persist.hasHydrated()) void useKeysStore.persist.rehydrate();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
