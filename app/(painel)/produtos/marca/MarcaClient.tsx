"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Palette, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { PerfilForm } from "@/components/marca/PerfilForm";
import { AprenderCapas } from "@/components/marca/AprenderCapas";
import { FichaEditor } from "@/components/marca/FichaEditor";
import { MemoriaMarcaCard } from "@/components/marca/MemoriaMarca";
import { ConferirTexto } from "@/components/marca/ConferirTexto";
import type { PlataformaMarcaId } from "@/lib/marca/plataformas";
import type { FichaSalva, LojaParaMarca, MemoriaMarca, PerfilMarca } from "@/lib/marca/tipos";

type LojaComPlataforma = LojaParaMarca & { plataforma: PlataformaMarcaId | null };

/**
 * Padrão da loja: o perfil de marca (plataforma primeiro), a memória e a Ficha de Direção de
 * Arte que o assistente de anúncios vai seguir. Cada perfil é independente: várias lojas, ou
 * a mesma loja em outro momento, outro nicho.
 */
export function MarcaClient({
  perfis,
  memorias,
  fichas,
  lojas,
  iaDisponivel,
  semMigracao,
}: {
  perfis: PerfilMarca[];
  memorias: MemoriaMarca[];
  fichas: FichaSalva[];
  lojas: LojaComPlataforma[];
  iaDisponivel: boolean;
  semMigracao: boolean;
}) {
  // "novo" = formulário em branco; senão o id do perfil aberto.
  const [escolhido, setEscolhido] = useState<string>(perfis[0]?.id ?? "novo");
  const perfil = perfis.find((p) => p.id === escolhido) ?? null;
  const novo = escolhido === "novo" || !perfil;

  return (
    <>
      <Link href="/produtos" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} /> Produtos
      </Link>
      <PageHeader title="Padrão da loja" descricao="Ensine à IA como a sua loja deve aparecer. Vale para qualquer plataforma e qualquer tipo de produto, e você ajusta quando quiser." />

      {semMigracao ? (
        <Card>
          <EmptyState icon={AlertTriangle} title="Falta aplicar a migração 0098" description="Aplique a migração 0098 no Supabase (SQL Editor) e recarregue esta página." />
        </Card>
      ) : (
        <div className="space-y-4">
          <ChipRow>
            {perfis.map((p) => (
              <Chip key={p.id} ativo={!novo && escolhido === p.id} onClick={() => setEscolhido(p.id)}>
                {p.nome}
              </Chip>
            ))}
            <Chip ativo={novo} onClick={() => setEscolhido("novo")}>
              <span className="inline-flex items-center gap-1">
                <Plus size={12} aria-hidden /> Novo perfil
              </span>
            </Chip>
          </ChipRow>

          {perfis.length === 0 && novo && (
            <Card>
              <EmptyState icon={Palette} title="Comece criando o perfil da sua loja" description="Escolha a plataforma, envie algumas capas e deixe a IA sugerir o seu padrão visual." />
            </Card>
          )}

          <PerfilForm
            key={perfil?.id ?? "novo"}
            perfil={novo ? null : perfil}
            lojas={lojas}
            onSalvo={(id) => setEscolhido(id)}
            onRemovido={() => setEscolhido("novo")}
          />

          {!novo && perfil && (
            <>
              <ConferirTexto termosDoPerfil={perfil.termos_proibidos} />
              <AprenderCapas key={`aprender-${perfil.id}-${perfil.referencias.join("|")}`} perfil={perfil} fichas={fichas} iaDisponivel={iaDisponivel} />
              <FichaEditor perfilId={perfil.id} fichas={fichas} />
              <MemoriaMarcaCard perfilId={perfil.id} memorias={memorias} />
            </>
          )}
        </div>
      )}
    </>
  );
}
