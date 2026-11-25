'use client';

import { useState, useSyncExternalStore } from 'react';
import { AudioLinesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useHydrated } from '@/hooks/use-hydrated';
import { isRecognitionSupported } from '@/lib/voice/recognition';
import { VoiceOverlay } from './voice-overlay';

export interface VoiceModeButtonProps {
  disabled?: boolean;
}

const noopSubscribe = () => () => {};

/** Composer button that opens hands-free voice mode (contract: docs/ARCHITECTURE.md). */
export function VoiceModeButton({ disabled }: VoiceModeButtonProps) {
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  // Server render assumes support; the client corrects it after hydration.
  const supported = useSyncExternalStore(noopSubscribe, isRecognitionSupported, () => true);
  const unavailable = !supported;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span keeps the tooltip working while the button is disabled */}
          <span className="inline-flex" tabIndex={unavailable ? 0 : undefined}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Voice mode (Mercury)"
              data-testid="voice-mode-button"
              disabled={disabled || unavailable || !hydrated}
              onClick={() => setOpen(true)}
            >
              <AudioLinesIcon />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {unavailable
            ? 'Voice mode needs speech recognition, available in Chrome, Edge or Safari.'
            : 'Voice mode (Mercury)'}
        </TooltipContent>
      </Tooltip>
      {supported && <VoiceOverlay open={open} onOpenChange={setOpen} />}
    </TooltipProvider>
  );
}
