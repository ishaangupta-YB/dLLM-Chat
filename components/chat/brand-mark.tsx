import { cn } from "@/lib/utils";

/** dLLM Chat logo: a sky-blue tile with dots resolving into a wave (noise -> signal). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "brand-gradient-bg relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[30%] text-primary-foreground shadow-[0_4px_14px_-6px_var(--primary)] ring-1 ring-black/5 ring-inset dark:ring-white/10",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none">
        <circle cx="4" cy="7" r="1.15" fill="currentColor" opacity=".45" />
        <circle cx="8" cy="4.5" r="1" fill="currentColor" opacity=".35" />
        <circle cx="12" cy="6.5" r="1.1" fill="currentColor" opacity=".55" />
        <circle cx="16.5" cy="4" r=".9" fill="currentColor" opacity=".3" />
        <circle cx="20" cy="7.5" r="1.1" fill="currentColor" opacity=".5" />
        <path
          d="M2.5 15.5c2.2-3.6 4.4-3.6 6.6 0s4.4 3.6 6.6 0 4.4-3.6 6.6 0"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
