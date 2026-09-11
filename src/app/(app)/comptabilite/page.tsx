import { PageHeader } from "@/components/ui/page-header";
import { ComptabiliteClient } from "@/components/comptabilite/ComptabiliteClient";

export default function ComptabilitePage() {
  return (
    <div>
      <PageHeader
        title="Comptabilité"
        subtitle="Tenue des livres des contribuables selon le SYSCOHADA révisé : journaux, balance, grand livre et états financiers."
      />
      <ComptabiliteClient />
    </div>
  );
}
