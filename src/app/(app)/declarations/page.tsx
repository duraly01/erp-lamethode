import { PageHeader } from "@/components/ui/page-header";
import { DeclarationsClient } from "@/components/declarations/DeclarationsClient";

export default function DeclarationsPage() {
  return (
    <div>
      <PageHeader
        title="Déclarations"
        subtitle="Suivi des obligations fiscales et sociales, annuelles et mensuelles."
      />
      <DeclarationsClient />
    </div>
  );
}
