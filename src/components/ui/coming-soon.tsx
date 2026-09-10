import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ComingSoon({ module }: { module: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Construction className="h-7 w-7" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">
        Module « {module} »
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Cet écran est en cours de construction et sera livré dans la suite de la
        Phase 4. L&apos;API correspondante est déjà opérationnelle.
      </p>
    </Card>
  );
}
