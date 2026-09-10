import { PageHeader } from "@/components/ui/page-header";
import { ParametresClient } from "@/components/parametres/ParametresClient";

export default function ParametresPage() {
  return (
    <div>
      <PageHeader
        title="Paramètres"
        subtitle="Configuration du cabinet : échéances légales, barèmes, rappels."
      />
      <ParametresClient />
    </div>
  );
}
