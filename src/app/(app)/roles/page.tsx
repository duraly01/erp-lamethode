import { PageHeader } from "@/components/ui/page-header";
import { RolesClient } from "@/components/roles/RolesClient";

export default function RolesPage() {
  return (
    <div>
      <PageHeader
        title="Rôles & permissions"
        subtitle="Définissez ce que chaque niveau de pouvoir peut consulter, créer, modifier ou supprimer."
      />
      <RolesClient />
    </div>
  );
}
