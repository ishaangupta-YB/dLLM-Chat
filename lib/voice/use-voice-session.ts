'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatController } from '@/lib/chat/use-chat-controller';
import { useChatStore } from '@/lib/store/chat-store';
import { useKeysStore } from '@/lib/store/keys-store';
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
  engine: 'browser',
  notice: null,
  transcribing: false,
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
  const voiceEngine = useChatStore((s) => s.settings.voiceEngine);

  useEffect(() => {
    if (!active) return;
    // The keys store skips hydration; make sure the ElevenLabs key is loaded.
    if (!useKeysStore.persist.hasHydrated()) void useKeysStore.persist.rehydrate();
    const engine = createVoiceEngine({
      send,
      stop,
      isBusy: () => useChatStore.getState().streaming !== null,
      getAutoSpeak: () => useChatStore.getState().settings.voiceAutoSpeak,
      onState: setState,
      engine: voiceEngine === 'elevenlabs' ? 'elevenlabs' : 'browser',
      getElevenLabsKey: () => useKeysStore.getState().keys.elevenlabs,
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
  }, [active, send, stop, voiceEngine]);

  useEffect(() => {
    engineRef.current?.setAutoSpeak(autoSpeak);
  }, [autoSpeak]);

  return { state, engineRef };
}
