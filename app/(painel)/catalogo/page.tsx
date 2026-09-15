import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CatalogoPage() {
  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Catálogo" />
      <Card>
        <EmptyState
          icon={BookOpen}
          title="Em breve"
          description="O gerador de catálogo com os produtos do estoque ainda está por vir."
        />
      </Card>
    </>
  );
}
