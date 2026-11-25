'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { AudioLinesIcon, MicIcon, MicOffIcon, PhoneOffIcon, RotateCwIcon, SquareIcon, TimerIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/lib/store/chat-store';
import { useVoiceSession } from '@/lib/voice/use-voice-session';
import type { VoiceState } from '@/lib/voice/voice-engine';
import { VoiceOrb } from './voice-orb';

export interface VoiceOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function phaseLabel(s: VoiceState): string {
  if (s.error && s.phase === 'paused') return 'Paused';
  if (s.muted && (s.phase === 'paused' || s.phase === 'listening')) return 'Microphone muted';
  switch (s.phase) {
    case 'starting':
      return 'Starting…';
    case 'listening':
      return s.interim ? 'Listening…' : 'Listening. Go ahead and speak.';
    case 'thinking':
      return 'Thinking…';
    case 'speaking':
      return 'Speaking';
    default:
      return 'Paused';
  }
}

function orbAction(s: VoiceState): string {
  switch (s.phase) {
    case 'listening':
      return 'Send what I said now';
    case 'thinking':
    case 'speaking':
      return 'Interrupt and listen';
    default:
      return s.muted ? 'Unmute microphone' : 'Start listening';
  }
}

export function VoiceOverlay({ open, onOpenChange }: VoiceOverlayProps) {
  const { state, engineRef } = useVoiceSession(open);
  const autoSpeak = useChatStore((s) => s.settings.voiceAutoSpeak);
  const setSettings = useChatStore((s) => s.setSettings);
  const captionsRef = useRef<HTMLDivElement>(null);

  const getLevel = useCallback(() => engineRef.current?.getLevel() ?? 0, [engineRef]);
  const getPulse = useCallback(() => engineRef.current?.getSpeechPulse() ?? 0, [engineRef]);

  // Keep the newest caption text in view.
  useEffect(() => {
    const el = captionsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.assistantText, state.interim, state.userText]);

  const onOrb = () => {
    const e = engineRef.current;
    if (!e) return;
    if (state.phase === 'listening') e.finishTurn();
    else if (state.phase === 'thinking' || state.phase === 'speaking') e.interrupt();
    else if (state.muted) e.toggleMute();
    else e.retry();
  };

  const busy = state.phase === 'thinking' || state.phase === 'speaking';
  // While listening, keep the last exchange on screen until the user starts
  // speaking (with "Speak replies" off, listening resumes right after a reply).
  const hearing = state.phase === 'listening' && !!state.interim;
  const showUserLine = hearing ? state.interim : state.userText;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid="voice-overlay"
          data-phase={state.phase}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none',
            'sm:inset-4 sm:rounded-3xl sm:border sm:shadow-2xl',
            'duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Voice mode</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Talk with Mercury hands-free. Replies are read aloud. Press Escape to end.
          </DialogPrimitive.Description>

          {/* ambient backdrop tint */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 opacity-70 transition-[background] duration-700 dark:opacity-50',
              state.phase === 'listening' && 'bg-[radial-gradient(60%_50%_at_50%_38%,oklch(80%_0.1_230/0.18),transparent)]',
              state.phase === 'thinking' && 'bg-[radial-gradient(60%_50%_at_50%_38%,oklch(72%_0.14_295/0.18),transparent)]',
              state.phase === 'speaking' && 'bg-[radial-gradient(60%_50%_at_50%_38%,oklch(80%_0.12_195/0.18),transparent)]',
            )}
          />

          {/* top bar */}
          <header className="relative flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
                Mercury 3 · realtime
              </span>
              {state.latencyMs !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      data-testid="voice-latency"
                      className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2.5 py-1 font-mono text-xs text-muted-foreground tabular-nums backdrop-blur"
                    >
                      <TimerIcon className="size-3" />
                      {state.latencyMs < 1000 ? `${state.latencyMs} ms` : `${(state.latencyMs / 1000).toFixed(2)} s`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Last turn: end of your speech to first reply text</TooltipContent>
                </Tooltip>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Close voice mode">
                <XIcon />
              </Button>
            </DialogPrimitive.Close>
          </header>

          {/* orb + status */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4">
            <button
              type="button"
              onClick={onOrb}
              aria-label={orbAction(state)}
              title={orbAction(state)}
              className="group rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
            >
              <VoiceOrb
                phase={state.phase}
                muted={state.muted}
                getLevel={getLevel}
                getSpeechPulse={getPulse}
                className="w-[min(56vw,15rem)] transition-transform duration-300 group-active:scale-95 sm:w-[min(32vh,16rem)]"
              />
            </button>
            <p
              data-testid="voice-status"
              aria-live="polite"
              className="text-sm font-medium tracking-wide text-muted-foreground"
            >
              {phaseLabel(state)}
            </p>

            {/* captions */}
            <div
              ref={captionsRef}
              data-testid="voice-captions"
              className="h-[26vh] max-h-56 w-full max-w-2xl shrink-0 overflow-y-auto px-2 text-center [mask-image:linear-gradient(to_bottom,transparent,black_1.25rem)] [scrollbar-width:none]"
            >
              <div className="flex flex-col gap-3 pt-5 pb-2">
                {showUserLine && (
                  <p
                    data-testid="voice-user-text"
                    className={cn(
                      'text-base text-pretty text-muted-foreground transition-opacity',
                      hearing && 'italic',
                    )}
                  >
                    {showUserLine}
                  </p>
                )}
                {!hearing && state.assistantText && (
                  <p
                    data-testid="voice-assistant-text"
                    className="text-lg leading-relaxed font-medium text-pretty sm:text-xl"
                  >
                    {state.assistantText}
                  </p>
                )}
              </div>
            </div>

            {state.error && (
              <div
                role="alert"
                data-testid="voice-error"
                className="flex max-w-md items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive dark:text-red-300"
              >
                <span className="text-pretty">{state.error.message}</span>
                {state.error.retryable && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-full"
                    onClick={() => engineRef.current?.retry()}
                  >
                    <RotateCwIcon /> Try again
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* controls */}
          <footer className="relative flex flex-col items-center gap-4 px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-7">
            <div className="flex items-center gap-4 sm:gap-5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-pressed={state.muted}
                    aria-label={state.muted ? 'Unmute microphone' : 'Mute microphone'}
                    onClick={() => engineRef.current?.toggleMute()}
                    className={cn(
                      'size-14 rounded-full [&_svg:not([class*=size-])]:size-6',
                      state.muted && 'bg-destructive/15 text-destructive hover:bg-destructive/25 dark:text-red-300',
                    )}
                  >
                    {state.muted ? <MicOffIcon /> : <MicIcon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{state.muted ? 'Unmute' : 'Mute'}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="Stop speaking"
                      disabled={!busy}
                      onClick={() => engineRef.current?.interrupt()}
                      className="size-14 rounded-full [&_svg:not([class*=size-])]:size-5"
                    >
                      <SquareIcon className="fill-current" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Stop and listen (or just start talking)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    aria-label="End voice mode"
                    onClick={() => onOpenChange(false)}
                    className="size-14 rounded-full [&_svg:not([class*=size-])]:size-6"
                  >
                    <PhoneOffIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>End (Esc)</TooltipContent>
              </Tooltip>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
              <Switch
                checked={autoSpeak}
                onCheckedChange={(v) => setSettings({ voiceAutoSpeak: v })}
                aria-label="Speak replies aloud"
              />
              <AudioLinesIcon className="size-3.5" />
              Speak replies
            </label>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
