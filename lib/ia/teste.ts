/**
 * Estado do teste grátis da IA do sistema, como a tela precisa dele. Puro: recebe o que a
 * RPC `ia_estado_teste` devolveu e "agora", e devolve um estado + texto pronto.
 */

export interface EstadoTesteBruto {
  usadas: number;
  limite: number;
  dias: number;
  inicio: string | null;
  expira_em: string | null;
  ilimitado: boolean;
}

export type EstadoTeste =
  | { situacao: "ilimitado" }
  | { situacao: "nao_iniciado"; limite: number; dias: number }
  | { situacao: "ativo"; restantes: number; limite: number; expiraEm: string }
  | { situacao: "encerrado"; motivo: "prazo" | "limite"; limite: number; expiraEm: string | null };

export function estadoDoTeste(bruto: EstadoTesteBruto, agora: Date): EstadoTeste {
  if (bruto.ilimitado) return { situacao: "ilimitado" };
  if (!bruto.inicio || !bruto.expira_em) {
    // Sem uso ainda: a janela só começa na primeira geração. Limite 0 ou 0 dias = desligado.
    return bruto.limite === 0 || bruto.dias === 0
      ? { situacao: "encerrado", motivo: bruto.limite === 0 ? "limite" : "prazo", limite: bruto.limite, expiraEm: null }
      : { situacao: "nao_iniciado", limite: bruto.limite, dias: bruto.dias };
  }

  if (agora.getTime() >= new Date(bruto.expira_em).getTime()) {
    return { situacao: "encerrado", motivo: "prazo", limite: bruto.limite, expiraEm: bruto.expira_em };
  }
  if (bruto.usadas >= bruto.limite) {
    return { situacao: "encerrado", motivo: "limite", limite: bruto.limite, expiraEm: bruto.expira_em };
  }
  return { situacao: "ativo", restantes: bruto.limite - bruto.usadas, limite: bruto.limite, expiraEm: bruto.expira_em };
}

/** "06/10/2026", no fuso de Brasília, igual no servidor e no navegador. */
export function dataCurtaBR(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export function textoDoTeste(e: EstadoTeste): string {
  switch (e.situacao) {
    case "ilimitado":
      return "Conta master: uso da IA do sistema sem limite.";
    case "nao_iniciado":
      return `Teste grátis: ${e.limite} gerações em ${e.dias} dias, contados a partir da primeira geração.`;
    case "ativo":
      return `Teste grátis: restam ${e.restantes} de ${e.limite} gerações, válido até ${dataCurtaBR(e.expiraEm)}.`;
    case "encerrado":
      return e.motivo === "limite"
        ? `Teste grátis encerrado: as ${e.limite} gerações foram usadas.`
        : e.expiraEm
          ? `Teste grátis encerrado em ${dataCurtaBR(e.expiraEm)}.`
          : "O teste grátis da IA do sistema está desligado para esta conta.";
  }
}
