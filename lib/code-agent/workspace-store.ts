'use client';

// Transient UI state of the coding-agent workspace (shared by the toolbar, the
// preview, the console and the mobile tabs). Not persisted except the device.
import { create } from 'zustand';

export type WorkspaceTab = 'preview' | 'code';
export type MobileTab = 'chat' | WorkspaceTab;
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface ConsoleEntry {
  id: number;
  frame: number;
  level: LogLevel;
  message: string;
  timestamp: number;
}

export const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

const MAX_LOGS = 300;
let logId = 0;

interface WorkspaceState {
  tab: WorkspaceTab;
  mobileTab: MobileTab;
  device: PreviewDevice;
  reloadKey: number;
  /** Page rendered in the preview (multi-page projects). */
  page?: string;
  consoleOpen: boolean;
  logs: ConsoleEntry[];
  /** Bundled document currently shown (for "Open in new tab"). */
  html: string | null;
  setTab: (tab: WorkspaceTab) => void;
  setMobileTab: (tab: MobileTab) => void;
  setDevice: (d: PreviewDevice) => void;
  reload: () => void;
  setPage: (page: string | undefined) => void;
  setConsoleOpen: (open: boolean) => void;
  addLog: (frame: number, e: Omit<ConsoleEntry, 'id' | 'frame'>) => void;
  /** A new document is visible: keep only its logs. */
  swapFrame: (frame: number) => void;
  clearLogs: () => void;
  setHtml: (html: string | null) => void;
  reset: () => void;
}

const DEVICE_KEY = 'dllm-chat:code-device';

function readDevice(): PreviewDevice {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    if (v === 'tablet' || v === 'mobile' || v === 'desktop') return v;
  } catch {
    /* ignore */
  }
  return 'desktop';
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  tab: 'preview',
  mobileTab: 'chat',
  device: 'desktop',
  reloadKey: 0,
  page: undefined,
  consoleOpen: false,
  logs: [],
  html: null,
  setTab: (tab) => set({ tab }),
  setMobileTab: (mobileTab) => set({ mobileTab }),
  setDevice: (device) => {
    try {
      localStorage.setItem(DEVICE_KEY, device);
    } catch {
      /* ignore */
    }
    set({ device });
  },
  reload: () => set((s) => ({ reloadKey: s.reloadKey + 1 })),
  setPage: (page) => set({ page }),
  setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
  addLog: (frame, e) =>
    set((s) => ({ logs: [...s.logs, { ...e, frame, id: ++logId }].slice(-MAX_LOGS) })),
  swapFrame: (frame) => set((s) => ({ logs: s.logs.filter((l) => l.frame >= frame) })),
  clearLogs: () => set({ logs: [] }),
  setHtml: (html) => set({ html }),
  reset: () => set({ page: undefined, logs: [], html: null, tab: 'preview' }),
}));

/** Load persisted UI preferences (call once on mount, client only). */
export function hydrateWorkspacePrefs() {
  useWorkspaceStore.setState({ device: readDevice() });
}
