import { PageHeader } from "@/components/ui/page-header";
import { CnpsClient } from "@/components/cnps/CnpsClient";

export default function CnpsPage() {
  return (
    <div>
      <PageHeader
        title="CNPS — Cotisations sociales"
        subtitle="Suivi mensuel des cotisations à la Caisse Nationale de Prévoyance Sociale."
      />
      <CnpsClient />
    </div>
  );
}
