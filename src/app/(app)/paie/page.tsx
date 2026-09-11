import { PageHeader } from "@/components/ui/page-header";
import { PaieClient } from "@/components/paie/PaieClient";

export default function PaiePage() {
  return (
    <div>
      <PageHeader
        title="Paie"
        subtitle="Salariés et bulletins des contribuables : CNPS, IRPP, CFC, FNE et TDL calculés sur le barème en vigueur."
      />
      <PaieClient />
    </div>
  );
}
