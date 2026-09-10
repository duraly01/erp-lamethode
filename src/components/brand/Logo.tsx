import { cn } from "@/lib/utils";

/** Logo texte LaMethode (« La » + M vert stylisé + « ethode »). */
export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-bold tracking-tight text-ink",
        compact ? "text-xl" : "text-2xl",
        className,
      )}
    >
      <span>La</span>
      <span className="relative mx-0.5 text-primary">
        M
        <svg
          viewBox="0 0 24 24"
          className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 13l5 5L20 6" />
        </svg>
      </span>
      <span>ethode</span>
    </span>
  );
}
