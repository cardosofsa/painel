import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { IconeLampiao } from "@/components/ui/IconeLampiao";
import { SegmentosVixe } from "@/components/vixe/SegmentosVixe";

/** Casca de toda a Vixe: título com o lampião e os segmentos (Alertas, Preço…). */
export default function VixeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0 mb-6">
          <IconeLampiao size={18} />
        </span>
        <PageHeader eyebrow="Assistente do SERTÃO" title="Vixe" />
      </div>
      <SegmentosVixe />
      {children}
    </>
  );
}
