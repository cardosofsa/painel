import { createClient } from "@/lib/supabase/server";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { cofreDisponivel } from "@/lib/ia/cofre";
import { ambienteShopee, faltandoShopee } from "@/lib/marketplace/shopee-api";
import { faltandoML } from "@/lib/marketplace/mercadolivre-api";
import { resumoConexoes } from "@/lib/marketplace/pedidos-servidor";
import { estadoDoTeste, type EstadoTesteBruto } from "@/lib/ia/teste";
import type { IaCadastrada } from "@/components/configuracoes/AbaIA";
import type { FreteConfig } from "@/components/configuracoes/AbaFrete";
import type { DadosPlano } from "@/components/configuracoes/AbaPlano";
import { FISCAL_PADRAO, type FiscalConfigTela } from "@/components/configuracoes/AbaFiscal";
import type { DadosEquipe, OperadorTela } from "@/components/configuracoes/AbaEquipe";
import type { Plano, ResumoAssinatura } from "@/lib/planos";
import {
  ConfiguracoesClient,
  type Categoria,
  type Canal,
  type Loja,
  type Conta,
  type Armazem,
  type FormaPagamento,
  type PerfilNegocio,
} from "./ConfiguracoesClient";
import { MasterConfiguracoesClient } from "./MasterConfiguracoesClient";

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ shopee?: string; aba?: string }> }) {
  const { shopee, aba } = await searchParams;
  const supabase = await createClient();

  // Master não roda loja nenhuma por esta conta — categorias, canais, armazéns, formas de
  // pagamento e perfil do negócio não fazem sentido pra ela. Papel e e-mail vêm do
  // middleware, antes do Promise.all grande de dado de loja, que nem chega a rodar para master.
  const acesso = await acessoAtual();
  const user = acesso ? { id: acesso.userId, email: acesso.email } : null;

  if (acesso?.papel === "master") {
    // Planos (0057): o master edita preço e limites aqui. Sem a migração, o bloco explica.
    const planosRes = await supabase.from("planos").select("*").order("ordem");
    return <MasterConfiguracoesClient email={user?.email ?? ""} planos={planosRes.error ? null : ((planosRes.data ?? []) as Plano[])} />;
  }

  const [categoriasRes, canaisRes, lojasRes, faixasRes, contasRes, armazensRes, formasPagamentoRes, contagemRes, perfilRes, conexoesRes] =
    await Promise.all([
      // `*`: `tipo` só existe a partir da 0042.
      supabase.from("categorias").select("*").order("nome"),
      supabase
        .from("canais")
        .select(
          "id, nome, tipo_taxa, icone, cor, comissao_pct_padrao, taxa_fixa_padrao, taxa_extra_valor_padrao, taxa_extra_tipo_padrao, limite_titulo, limite_descricao",
        )
        .order("criado_em"),
      supabase
        .from("lojas_canal")
        .select("id, canal_id, nome, logo_path, link, comissao_pct, taxa_fixa, taxa_extra_valor, taxa_extra_tipo")
        .order("nome"),
      supabase.from("faixas_comissao_canal").select("id, canal_id, preco_min, preco_max, comissao_pct, tarifa_fixa").order("ordem"),
      supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
      // `*`: `loja_ids` só existe a partir da 0041.
      supabase.from("armazens").select("*").order("nome"),
      supabase.from("formas_pagamento").select("id, nome, tipo").order("nome"),
      // Contagem por categoria agregada no banco: antes vinha uma linha por produto só
      // para somar em memória.
      supabase.rpc("contagem_produtos_por_categoria"),
      // `pin_admin_hash` NÃO entra no select: tudo que a tela precisa saber é se existe um
      // PIN cadastrado. Antes o PIN vinha em texto puro até o Client Component e ficava
      // legível no DOM e no payload RSC, apesar do input `type="password"`.
      supabase
        .from("perfil_negocio")
        .select("nome_negocio, cnpj, regime_tributario, aliquota_das, whatsapp, pin_admin_hash, logo_url, telefone, email, instagram, cep, endereco, numero, bairro, cidade, uf")
        .maybeSingle(),
      // API dos marketplaces por loja (0046). Só as colunas sem token; sem a tabela, vazio.
      supabase.from("marketplace_conexoes").select("*"),
    ]);

  if (categoriasRes.error) throw new Error(categoriasRes.error.message);
  if (canaisRes.error) throw new Error(canaisRes.error.message);
  if (lojasRes.error) throw new Error(lojasRes.error.message);
  if (faixasRes.error) throw new Error(faixasRes.error.message);
  if (contasRes.error) throw new Error(contasRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (formasPagamentoRes.error) throw new Error(formasPagamentoRes.error.message);
  if (perfilRes.error) throw new Error(perfilRes.error.message);

  const lojas: Loja[] = (lojasRes.data ?? []).map((l) => ({
    ...l,
    logo_url: l.logo_path ? supabase.storage.from("canais-logos").getPublicUrl(l.logo_path).data.publicUrl : null,
  }));

  const faixasPorCanal = new Map<string, typeof faixasRes.data>();
  for (const f of faixasRes.data ?? []) {
    const lista = faixasPorCanal.get(f.canal_id) ?? [];
    lista!.push(f);
    faixasPorCanal.set(f.canal_id, lista);
  }
  const canais: Canal[] = (canaisRes.data ?? []).map((c) => ({
    ...c,
    faixas: faixasPorCanal.get(c.id) ?? [],
  })) as Canal[];

  const perfil: PerfilNegocio = {
    nome_negocio: perfilRes.data?.nome_negocio ?? "",
    cnpj: perfilRes.data?.cnpj ?? "",
    regime_tributario: perfilRes.data?.regime_tributario ?? "",
    aliquota_das: perfilRes.data?.aliquota_das ?? 6,
    whatsapp: perfilRes.data?.whatsapp ?? "",
    pin_configurado: !!perfilRes.data?.pin_admin_hash,
    empresa: {
      logo_url: perfilRes.data?.logo_url ?? null,
      telefone: perfilRes.data?.telefone ?? null,
      email: perfilRes.data?.email ?? null,
      instagram: perfilRes.data?.instagram ?? null,
      cep: perfilRes.data?.cep ?? null,
      endereco: perfilRes.data?.endereco ?? null,
      numero: perfilRes.data?.numero ?? null,
      bairro: perfilRes.data?.bairro ?? null,
      cidade: perfilRes.data?.cidade ?? null,
      uf: perfilRes.data?.uf ?? null,
    },
  };

  const contagemPorCategoria = new Map<string, number>(
    ((contagemRes.data ?? []) as { categoria_id: string; total: number }[]).map((c) => [c.categoria_id, Number(c.total)]),
  );

  const categorias: Categoria[] = (categoriasRes.data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    skus: contagemPorCategoria.get(c.id) ?? 0,
    tipo: c.tipo ?? "produto",
  }));

  // Nunca seleciona `chave_cifrada`: a tela só precisa de provedor, modelo e final da chave.
  // Tabela ausente (0035 não aplicada) = lista vazia, sem derrubar a página.
  const { data: iasData } = await supabase
    .from("ia_provedores")
    .select("id, provedor, modelo, chave_final, padrao")
    .order("criado_em");
  const ias = (iasData ?? []) as IaCadastrada[];

  // Migração 0036 ausente = a RPC não existe: `teste` fica nulo e o quadro simplesmente some.
  const { data: testeBruto } = await supabase.rpc("ia_estado_teste").maybeSingle<EstadoTesteBruto>();
  const teste = testeBruto ? estadoDoTeste(testeBruto, new Date()) : null;

  // Plano (0057): catálogo + resumo da conta. Sem a migração, a aba explica.
  const [planosRes, assinaturaRes] = await Promise.all([supabase.from("planos").select("*").eq("ativo", true).order("ordem"), supabase.rpc("minha_assinatura")]);
  const plano: DadosPlano | null =
    planosRes.error || assinaturaRes.error || !assinaturaRes.data
      ? null
      : {
          planos: ((planosRes.data ?? []) as Plano[]).map((p) => ({ ...p, preco_mensal: Number(p.preco_mensal) })),
          resumo: assinaturaRes.data as ResumoAssinatura,
        };

  // Equipe (0063): operadores sem o hash do PIN (a coluna nem é legível pela API).
  const [opsRes, negocioRes] = await Promise.all([
    supabase.from("operadores").select("id, nome, abas, comissao_pct, comissao_base, ativo").order("nome"),
    supabase.from("perfil_negocio").select("*").maybeSingle(),
  ]);
  const neg = negocioRes.data as Record<string, unknown> | null;
  const equipe: DadosEquipe | null = opsRes.error
    ? null
    : {
        operadores: ((opsRes.data ?? []) as OperadorTela[]).map((o) => ({ ...o, comissao_pct: Number(o.comissao_pct) })),
        exigir: !!neg?.exigir_operador,
        temPinAdmin: !!neg?.pin_admin_hash,
      };

  // Fiscal (0062). Nunca manda o token: só se existe.
  const fiscalRes = await supabase.from("fiscal_config").select("*").maybeSingle();
  const fx = fiscalRes.data as Record<string, unknown> | null;
  const fiscal: FiscalConfigTela | null = fiscalRes.error
    ? null
    : fx
      ? ({ ...FISCAL_PADRAO, ...Object.fromEntries(Object.keys(FISCAL_PADRAO).filter((k) => k in fx).map((k) => [k, fx[k]])), ligada: !!fx.token_cifrado } as FiscalConfigTela)
      : FISCAL_PADRAO;

  // Frete (0055). Nunca manda o token: só se existe. Tabela ausente = null (a aba explica).
  const freteRes = await supabase.from("frete_conexoes").select("*").maybeSingle();
  const fr = freteRes.data as Record<string, unknown> | null;
  const frete: FreteConfig | null = freteRes.error
    ? null
    : {
        conectado: !!fr?.token_cifrado,
        ambiente: fr?.ambiente === "sandbox" ? "sandbox" : "producao",
        cep_origem: (fr?.cep_origem as string | null) ?? "",
        servicos: (fr?.servicos as number[] | null) ?? [],
        acrescimo: Number(fr?.acrescimo ?? 0),
        frete_gratis_acima: fr?.frete_gratis_acima == null ? null : Number(fr.frete_gratis_acima),
        na_vitrine: !!fr?.na_vitrine,
      };

  return (
    <ConfiguracoesClient
      // Remonta ao trocar de `?aba=` (clicar no plano do topo já estando em Configurações).
      key={aba ?? "inicio"}
      abaUrl={aba}
      categorias={categorias}
      canais={canais}
      lojas={lojas}
      contas={(contasRes.data ?? []) as Conta[]}
      armazens={(armazensRes.data ?? []) as Armazem[]}
      formasPagamento={(formasPagamentoRes.data ?? []) as FormaPagamento[]}
      perfil={perfil}
      email={user?.email ?? ""}
      ias={ias}
      cofreOk={cofreDisponivel()}
      iaSistemaOk={Boolean(process.env.GEMINI_API_KEY)}
      teste={teste}
      frete={frete}
      plano={plano}
      fiscal={fiscal}
      equipe={equipe}
      marketplace={{
        conexoes: conexoesRes.error ? [] : resumoConexoes(conexoesRes.data),
        faltando: [...faltandoShopee(), ...(cofreDisponivel() ? [] : ["IA_CHAVE_COFRE"])],
        faltandoML: [...faltandoML(), ...(cofreDisponivel() ? [] : ["IA_CHAVE_COFRE"])],
        ambiente: ambienteShopee(),
        aviso: shopee && ["conectada", "erro", "desligada", "ml_conectada", "ml_erro", "ml_desligada"].includes(shopee) ? shopee : null,
      }}
    />
  );
}
