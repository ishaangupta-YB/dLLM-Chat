'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatController } from '@/lib/chat/use-chat-controller';
import { useChatStore } from '@/lib/store/chat-store';
import { createVoiceEngine, type VoiceEngine, type VoiceState } from './voice-engine';

const INITIAL: VoiceState = {
  phase: 'starting',
  muted: false,
  interim: '',
  userText: '',
  assistantText: '',
  error: null,
  latencyMs: null,
  micLive: false,
};

declare global {
  interface Window {
    /** Dev-only hook used by browser tests to drive a voice turn without speech. */
    __voiceTest?: {
      submit: (text: string) => void;
      state: () => VoiceState;
    };
  }
}

/** Runs a voice conversation while `active` is true; tears everything down when it turns false. */
export function useVoiceSession(active: boolean) {
  const { send, stop } = useChatController();
  const [state, setState] = useState<VoiceState>(INITIAL);
  const engineRef = useRef<VoiceEngine | null>(null);
  const autoSpeak = useChatStore((s) => s.settings.voiceAutoSpeak);

  useEffect(() => {
    if (!active) return;
    const engine = createVoiceEngine({
      send,
      stop,
      isBusy: () => useChatStore.getState().streaming !== null,
      getAutoSpeak: () => useChatStore.getState().settings.voiceAutoSpeak,
      onState: setState,
    });
    engineRef.current = engine;
    void engine.start();
    if (process.env.NODE_ENV !== 'production') {
      window.__voiceTest = { submit: (t) => engine.submit(t), state: () => engine.getState() };
    }
    return () => {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      if (process.env.NODE_ENV !== 'production') delete window.__voiceTest;
    };
  }, [active, send, stop]);

  useEffect(() => {
    engineRef.current?.setAutoSpeak(autoSpeak);
  }, [autoSpeak]);

  return { state, engineRef };
}
