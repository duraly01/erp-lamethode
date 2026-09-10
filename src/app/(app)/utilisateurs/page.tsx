import { PageHeader } from "@/components/ui/page-header";
import { UsersClient } from "@/components/users/UsersClient";

export default function UtilisateursPage() {
  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        subtitle="Gestion des comptes, rôles et permissions du cabinet."
      />
      <UsersClient />
    </div>
  );
}
