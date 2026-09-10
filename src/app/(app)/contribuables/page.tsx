import { PageHeader } from "@/components/ui/page-header";
import { ContribuablesClient } from "@/components/contribuables/ContribuablesClient";

export default function ContribuablesPage() {
  return (
    <div>
      <PageHeader
        title="Contribuables"
        subtitle="Gérez le portefeuille de clients du cabinet."
      />
      <ContribuablesClient />
    </div>
  );
}
