import { PageHeader } from "@/components/ui/page-header";
import { DocumentsClient } from "@/components/documents/DocumentsClient";

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Coffre documentaire des contribuables."
      />
      <DocumentsClient />
    </div>
  );
}
