"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatarDataHora } from "@/lib/format";
import { formatarDiffHistorico } from "@/lib/admin";

export interface LinhaHistorico {
  id: string;
  admin_email: string;
  alvo_user_id: string | null;
  alvo_email: string;
  acao: string;
  detalhes: Record<string, { de: unknown; para: unknown }>;
  criado_em: string;
}

export function HistoricoAdmin({ linhas }: { linhas: LinhaHistorico[] }) {
  if (linhas.length === 0) {
    return (
      <Card className="p-0 overflow-hidden">
        <EmptyState icon={History} title="Nenhuma ação registrada ainda" description="Aprovações, suspensões e mudanças de acesso aparecem aqui." />
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <Table>
        <Thead>
          <tr>
            <Th>Quando</Th>
            <Th>Feito por</Th>
            <Th>Conta afetada</Th>
            <Th>O que mudou</Th>
          </tr>
        </Thead>
        <tbody>
          {linhas.map((l) => {
            const diff = formatarDiffHistorico(l.detalhes);
            return (
              <Tr key={l.id}>
                <Td className="text-text-secondary whitespace-nowrap">{formatarDataHora(l.criado_em)}</Td>
                <Td className="text-text-secondary">{l.admin_email}</Td>
                <Td>
                  {l.alvo_user_id ? (
                    <Link href={`/admin/${l.alvo_user_id}`} className="text-accent hover:underline">
                      {l.alvo_email}
                    </Link>
                  ) : (
                    <span className="text-text-tertiary">{l.alvo_email} (removida)</span>
                  )}
                </Td>
                <Td className="text-text-secondary">
                  {diff.length > 0 ? diff.join(" · ") : <span className="text-text-tertiary">—</span>}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
