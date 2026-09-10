import { PageHeader } from "@/components/ui/page-header";
import { AcfClient } from "@/components/acf/AcfClient";

export default function AcfPage() {
  return (
    <div>
      <PageHeader
        title="ACF — Attestations de Conformité Fiscale"
        subtitle="Suivi des demandes, blocages et délivrances d'ACF."
      />
      <AcfClient />
    </div>
  );
}
