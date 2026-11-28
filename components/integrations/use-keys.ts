'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useKeysStore } from '@/lib/store/keys-store';
import type { ByokKeys } from '@/lib/types';

const EMPTY: ByokKeys = {};
const subscribe = (cb: () => void) => useKeysStore.persist.onFinishHydration(cb);
const getHydrated = () => useKeysStore.persist.hasHydrated();
const getServer = () => false;

/**
 * BYOK keys from localStorage (the store skips SSR hydration). The composer's
 * ToolsMenu mounts this on every page, so the chat controller's
 * buildToolConfig() sees the keys too.
 */
export function useByokKeys(): { keys: ByokKeys; ready: boolean } {
  const keys = useKeysStore((s) => s.keys);
  const ready = useSyncExternalStore(subscribe, getHydrated, getServer);
  useEffect(() => {
    if (!useKeysStore.persist.hasHydrated()) void useKeysStore.persist.rehydrate();
  }, []);
  return { keys: ready ? keys : EMPTY, ready };
}
