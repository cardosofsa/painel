import { Card, CardEyebrow } from "@/components/ui/Card";
import { formatarData } from "@/lib/format";
import type { OrigemConta } from "@/lib/indicacao";

/** Admin → conta: de onde veio o cadastro (UTM do link e indicação, 0078). */
export function OrigemContaCard({ origem }: { origem: OrigemConta }) {
  const utm = [origem.utm_source, origem.utm_medium, origem.utm_campaign].filter(Boolean).join(" / ");
  const indicado = origem.indicado_por
    ? `${origem.indicado_por}${origem.recompensado_em ? ` · bônus pago em ${formatarData(origem.recompensado_em)}` : " · bônus pendente"}`
    : origem.ref
      ? `Código ${origem.ref} (não reconhecido)`
      : "Ninguém";
  const linhas: [string, string][] = [
    ["Origem (UTM)", utm || "Direto (sem UTM)"],
    ["Indicado por", indicado],
    ["Código desta conta", origem.codigo ?? "—"],
    ["Contas que indicou", origem.indicou.toLocaleString("pt-BR")],
  ];
  return (
    <Card className="mt-4 max-w-2xl">
      <CardEyebrow>Origem do cadastro</CardEyebrow>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-2">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-xs text-text-tertiary">{rotulo}</dt>
            <dd className="text-text-primary break-words">{valor}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
