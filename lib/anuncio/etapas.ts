/**
 * Etapas do "Anúncio Infinito". PURO, coberto por `etapas.test.ts`: dado o que já existe no
 * rascunho, diz quais etapas estão feitas, quais estão liberadas e qual é a próxima. A tela só
 * desenha; a ordem e os bloqueios moram aqui.
 */

export type EtapaId = "loja" | "produto" | "titulo" | "capa" | "descricao" | "revisar";

export const ETAPAS: readonly { id: EtapaId; rotulo: string; ajuda: string }[] = [
  { id: "loja", rotulo: "Loja", ajuda: "Para qual loja e plataforma é este anúncio" },
  { id: "produto", rotulo: "Produto", ajuda: "Qual produto vira anúncio" },
  { id: "titulo", rotulo: "Título", ajuda: "A porta de entrada da busca" },
  { id: "capa", rotulo: "Capa", ajuda: "A primeira imagem, a que vende" },
  { id: "descricao", rotulo: "Descrição", ajuda: "O texto que tira as dúvidas" },
  { id: "revisar", rotulo: "Revisar e enviar", ajuda: "Pacote final e envio como não listado" },
];

export interface EntradaEtapas {
  /** O usuário escolheu uma loja/perfil, ou decidiu seguir sem perfil. */
  lojaDecidida: boolean;
  produtoId: string | null;
  rascunhoAberto: boolean;
  titulo: string | null;
  descricao: string | null;
  capaAprovada: boolean;
  itemCriadoNaShopee: boolean;
  /** `status = 'publicado'` no rascunho: criado pelo Painel ou marcado "Publiquei manualmente". */
  publicado?: boolean;
}

export interface EtapaCalculada {
  id: EtapaId;
  rotulo: string;
  ajuda: string;
  feita: boolean;
  /** Pode ser aberta agora. */
  liberada: boolean;
  /** Por que está travada (só quando `liberada` é falso). */
  motivo: string | null;
}

export interface ResultadoEtapas {
  etapas: EtapaCalculada[];
  /** A primeira etapa liberada que ainda não foi feita; a última se tudo estiver feito. */
  atual: EtapaId;
  feitas: number;
}

export function calcularEtapas(e: EntradaEtapas): ResultadoEtapas {
  const feita: Record<EtapaId, boolean> = {
    loja: e.lojaDecidida,
    produto: !!e.produtoId && e.rascunhoAberto,
    titulo: !!e.titulo?.trim(),
    capa: e.capaAprovada,
    descricao: !!e.descricao?.trim(),
    revisar: e.itemCriadoNaShopee || !!e.publicado,
  };
  const motivo = (id: EtapaId): string | null => {
    if (id === "loja") return null;
    if (id === "produto") return e.lojaDecidida ? null : "Escolha a loja primeiro.";
    if (!e.rascunhoAberto) return "Escolha o produto e abra o anúncio primeiro.";
    // Capa e descrição levam o título aprovado: o servidor já recusava, a tela liberava.
    if ((id === "capa" || id === "descricao") && !feita.titulo) return "Escolha o título primeiro.";
    if (id === "revisar" && !(feita.titulo && feita.descricao)) return "Falta escolher o título e salvar a descrição.";
    return null;
  };
  const etapas = ETAPAS.map((t) => {
    const m = motivo(t.id);
    return { ...t, feita: feita[t.id], liberada: m === null, motivo: m };
  });
  const proxima = etapas.find((t) => t.liberada && !t.feita);
  return { etapas, atual: (proxima ?? etapas[etapas.length - 1]).id, feitas: etapas.filter((t) => t.feita).length };
}

/** Número da etapa como aparece no trilho (1 a 6). Os painéis usam este, nunca um número à mão. */
export function numeroDaEtapa(id: EtapaId): number {
  return ETAPAS.findIndex((t) => t.id === id) + 1;
}

export type StatusRascunho = "rascunho" | "pronto" | "publicado";

/**
 * Status gravado no rascunho (`anuncio_rascunhos.status`, 0099), que antes nunca mudava.
 * "pronto" = título, descrição e capa aprovada; "publicado" não volta atrás (a pessoa marcou
 * ou o Painel criou o item).
 */
export function statusDoRascunho(e: { atual: string | null | undefined; titulo: string | null; descricao: string | null; capaAprovada: boolean; publicado: boolean }): StatusRascunho {
  if (e.publicado || e.atual === "publicado") return "publicado";
  return e.titulo?.trim() && e.descricao?.trim() && e.capaAprovada ? "pronto" : "rascunho";
}
