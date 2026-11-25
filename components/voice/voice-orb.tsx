'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { VoicePhase } from '@/lib/voice/voice-engine';

// Gradient palettes per phase. Layers cross-fade so color changes are smooth.
const LAYERS: { phase: VoicePhase | 'idle'; bg: string; glow: string }[] = [
  {
    phase: 'idle',
    bg: 'radial-gradient(circle at 34% 28%, oklch(97% 0.01 260) 0%, oklch(82% 0.03 260) 38%, oklch(52% 0.04 265) 100%)',
    glow: 'oklch(70% 0.03 260 / 0.35)',
  },
  {
    phase: 'listening',
    bg: 'radial-gradient(circle at 34% 28%, oklch(97% 0.04 220) 0%, oklch(78% 0.14 228) 36%, oklch(50% 0.2 262) 100%)',
    glow: 'oklch(72% 0.16 235 / 0.55)',
  },
  {
    phase: 'thinking',
    bg: 'radial-gradient(circle at 34% 28%, oklch(97% 0.04 300) 0%, oklch(74% 0.16 295) 36%, oklch(45% 0.22 280) 100%)',
    glow: 'oklch(68% 0.2 295 / 0.55)',
  },
  {
    phase: 'speaking',
    bg: 'radial-gradient(circle at 34% 28%, oklch(98% 0.04 185) 0%, oklch(80% 0.13 195) 36%, oklch(50% 0.15 225) 100%)',
    glow: 'oklch(75% 0.14 195 / 0.55)',
  },
];

function visualPhase(phase: VoicePhase): VoicePhase | 'idle' {
  return phase === 'paused' || phase === 'starting' ? 'idle' : phase;
}

export interface VoiceOrbProps {
  phase: VoicePhase;
  muted: boolean;
  getLevel: () => number;
  getSpeechPulse: () => number;
  className?: string;
}

/** Animated orb. Scale and rings follow the mic level (listening) or a speech envelope (speaking). */
export function VoiceOrb({ phase, muted, getLevel, getSpeechPulse, className }: VoiceOrbProps) {
  const sphereRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const getters = useRef({ getLevel, getSpeechPulse });

  useEffect(() => {
    phaseRef.current = phase;
    getters.current = { getLevel, getSpeechPulse };
  });

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let smooth = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const p = phaseRef.current;
      const t = (now - t0) / 1000;
      let target = 0;
      if (p === 'listening') {
        // Perceptual curve so quiet speech still visibly moves the orb.
        target = Math.min(1, Math.sqrt(getters.current.getLevel()) * 2.2);
      } else if (p === 'speaking') {
        const env = 0.35 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1) + 0.15 * Math.sin(t * 13.7);
        target = Math.max(0, Math.min(1, env + getters.current.getSpeechPulse() * 0.4));
      } else if (p === 'thinking') {
        target = 0.18 + 0.1 * Math.sin(t * 3);
      } else {
        target = 0.05 + 0.04 * Math.sin(t * 1.4);
      }
      smooth += (target - smooth) * (target > smooth ? 0.35 : 0.12);
      const r = reduce?.matches;
      const s = r ? 1 : 1 + smooth * 0.14;
      if (sphereRef.current) sphereRef.current.style.transform = `scale(${s.toFixed(4)})`;
      if (glowRef.current) {
        glowRef.current.style.transform = `scale(${(r ? 1 : 1 + smooth * 0.35).toFixed(4)})`;
        glowRef.current.style.opacity = String(0.55 + smooth * 0.45);
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `scale(${(r ? 1.08 : 1.04 + smooth * 0.3).toFixed(4)})`;
        ringRef.current.style.opacity = String(p === 'listening' ? 0.25 + smooth * 0.6 : 0);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const vp = visualPhase(phase);

  return (
    <div className={cn('relative aspect-square', className)} data-phase={phase} aria-hidden>
      {/* soft glow */}
      <div ref={glowRef} className="absolute inset-[-18%] will-change-transform">
        {LAYERS.map((l) => (
          <div
            key={l.phase}
            className="absolute inset-0 rounded-full blur-3xl transition-opacity duration-500"
            style={{ background: `radial-gradient(circle, ${l.glow} 0%, transparent 65%)`, opacity: vp === l.phase ? 1 : 0 }}
          />
        ))}
      </div>
      {/* level ring */}
      <div
        ref={ringRef}
        className="absolute inset-0 rounded-full border-2 border-sky-400/70 opacity-0 transition-[border-color] dark:border-sky-300/60"
      />
      {/* sphere */}
      <div
        ref={sphereRef}
        className="absolute inset-0 overflow-hidden rounded-full shadow-[inset_0_-18px_40px_rgba(0,0,0,0.25),0_20px_60px_-20px_rgba(0,0,0,0.35)] will-change-transform"
      >
        {LAYERS.map((l) => (
          <div
            key={l.phase}
            className="absolute inset-0 transition-opacity duration-500"
            style={{ background: l.bg, opacity: vp === l.phase ? 1 : 0 }}
          />
        ))}
        {/* drifting light: gives the surface a liquid feel */}
        <div
          className={cn(
            'absolute inset-[-25%] opacity-60 mix-blend-soft-light blur-xl',
            'motion-safe:animate-[spin_14s_linear_infinite]',
            phase === 'thinking' && 'opacity-90 motion-safe:animate-[spin_2.6s_linear_infinite]',
          )}
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.75) 60deg, transparent 140deg, rgba(255,255,255,0.35) 220deg, transparent 300deg)',
          }}
        />
        <div
          className="absolute inset-[-10%] opacity-50 mix-blend-overlay motion-safe:animate-[spin_22s_linear_infinite_reverse]"
          style={{
            background:
              'radial-gradient(circle at 70% 75%, rgba(255,255,255,0.55) 0%, transparent 35%), radial-gradient(circle at 20% 70%, rgba(0,0,0,0.25) 0%, transparent 40%)',
          }}
        />
        {/* specular highlight */}
        <div
          className="absolute top-[9%] left-[20%] h-[26%] w-[38%] rounded-full opacity-70 blur-md"
          style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.9) 0%, transparent 70%)' }}
        />
        {muted && <div className="absolute inset-0 bg-background/35 backdrop-grayscale transition-opacity" />}
      </div>
    </div>
  );
}
