"use client";

import { useState } from "react";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

type TitleSource = Conversation["titleSource"];

/**
 * Returns a counter that increments whenever the AI title arrives for the
 * same conversation (titleSource flips to 'ai' or the AI title changes).
 * Initial loads, conversation switches and user renames never animate.
 */
function useTitleReveal(id: string | null | undefined, title: string | undefined, source: TitleSource) {
  const [prev, setPrev] = useState({ id, title, source });
  const [reveal, setReveal] = useState(0);
  if (prev.id !== id || prev.title !== title || prev.source !== source) {
    if (prev.id === id && id && source === "ai" && prev.title !== title) setReveal((n) => n + 1);
    setPrev({ id, title, source });
  }
  return reveal;
}

/** A conversation title that sweeps in with a short shimmer when the AI names the chat. */
export function AnimatedTitle({
  id,
  title,
  source,
  className,
}: {
  id: string | null | undefined;
  title: string;
  source: TitleSource;
  className?: string;
}) {
  const reveal = useTitleReveal(id, title, source);
  return (
    <span key={reveal} className={cn(reveal > 0 ? "title-reveal" : "truncate", className)}>
      {title}
    </span>
  );
}
