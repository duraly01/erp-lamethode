import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Badge générique. Les couleurs de statut métier sont fournies via `className`
 * (cf. STATUT_*_COLORS dans lib/constants) pour rester cohérentes.
 */
export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}
