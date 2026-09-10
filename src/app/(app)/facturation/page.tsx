import { PageHeader } from "@/components/ui/page-header";
import { FacturesClient } from "@/components/factures/FacturesClient";

export default function FacturationPage() {
  return (
    <div>
      <PageHeader
        title="Facturation"
        subtitle="Honoraires du cabinet et refacturation des impôts et cotisations."
      />
      <FacturesClient />
    </div>
  );
}
