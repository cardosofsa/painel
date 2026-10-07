import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { buscarEmLotes } from "@/lib/lotes";
import { faixaDaPagina, filtrosDeBusca, lerFiltroClientes, totalDePaginas, type FiltroClientes, type ParamsUrl } from "@/lib/listas";
import { ClientesClient, type Cliente, type ClienteOriginal } from "./ClientesClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Clientes" };

interface ResumoCliente {
  cliente_id: string;
  compras: number;
  total_comprado: number;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Uma palavra com dígitos também procura só os dígitos no WhatsApp: "(11)" acha "11987…". */
function digitosNoWhatsapp(palavra: string): string[] {
  const d = palavra.replace(/\D/g, "");
  return d.length >= 3 && d !== palavra ? [`whatsapp.ilike.*${d}*`] : [];
}

function consultaClientes(supabase: Supabase, filtro: FiltroClientes, colunas: string) {
  // `*`: `origem` e `possivel_duplicado_de` só existem a partir da 0043.
  let q = supabase.from("clientes").select(colunas as "*", { count: "exact" });
  if (filtro.dup) q = q.not("possivel_duplicado_de", "is", null);
  for (const f of filtrosDeBusca(filtro.q, ["nome", "whatsapp", "email", "documento"], digitosNoWhatsapp)) q = q.or(f);
  return q.order("nome").order("id");
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<ParamsUrl> }) {
  const filtro = lerFiltroClientes(await searchParams);
  const supabase = await createClient();

  async function pagina() {
    const buscar = (n: number) => {
      const { de, ate } = faixaDaPagina(n);
      return consultaClientes(supabase, filtro, "*").range(de, ate);
    };
    let n = filtro.pagina;
    let r = await buscar(n);
    // PGRST103: `?pagina=` além do fim (alguém foi removido, ou a URL foi editada).
    if (r.error?.code === "PGRST103") {
      const c = await consultaClientes(supabase, filtro, "id").range(0, 0);
      n = totalDePaginas(c.count ?? 0);
      r = await buscar(n);
    }
    return { ...r, pagina: n };
  }

  // A soma por cliente é feita no banco. Antes esta página baixava a tabela `vendas`
  // INTEIRA — sem limite e sem filtro de data — só para contar e somar em memória: num PDV
  // com 30 vendas/dia são ~11 mil linhas por ano trafegando para preencher uma coluna.
  // Agora a lista é paginada e os cards vêm de contagens e da soma por cliente (em lotes:
  // o PostgREST corta cada resposta em 1000 linhas).
  const [clientesRes, totalRes, fiadoRes, duplicadosRes, resumoRes] = await Promise.all([
    pagina(),
    supabase.from("clientes").select("id", { count: "exact", head: true }),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("permite_fiado", true),
    // Sem a 0043 a coluna não existe: a contagem falha e o aviso de duplicados só não aparece.
    supabase.from("clientes").select("id", { count: "exact", head: true }).not("possivel_duplicado_de", "is", null),
    buscarEmLotes<ResumoCliente>(async (de, ate) => {
      const r = await supabase.rpc("resumo_vendas_por_cliente", undefined, { count: "exact" }).order("cliente_id").range(de, ate);
      return { data: r.data as ResumoCliente[] | null, error: r.error, count: r.count };
    }),
  ]);

  if (clientesRes.error) lancarErroSupabase(clientesRes.error);
  if (totalRes.error) lancarErroSupabase(totalRes.error);

  // O resumo é secundário: se ele falhar, a lista de clientes ainda serve — só fica sem as
  // colunas de compras. Derrubar a tela inteira por causa disso seria desproporcional.
  if (resumoRes.error) console.error("[clientes] resumo_vendas_por_cliente:", resumoRes.error.message);
  const resumoPorCliente = new Map<string, { compras: number; total: number }>();
  let totalComprado = 0;
  for (const r of resumoRes.error ? [] : resumoRes.data) {
    const total = Number(r.total_comprado);
    resumoPorCliente.set(r.cliente_id, { compras: Number(r.compras), total });
    totalComprado += total;
  }

  const clientes: Cliente[] = ((clientesRes.data ?? []) as Cliente[]).map((c) => ({
    ...c,
    compras: resumoPorCliente.get(c.id)?.compras ?? 0,
    total_comprado: resumoPorCliente.get(c.id)?.total ?? 0,
  }));

  // "Possível duplicado de Fulano": o original pode estar em outra página.
  const idsOriginais = [...new Set(clientes.map((c) => c.possivel_duplicado_de).filter((id): id is string => !!id))];
  const originaisRes = idsOriginais.length ? await supabase.from("clientes").select("id, nome, whatsapp").in("id", idsOriginais) : { data: [], error: null };
  if (originaisRes.error) console.error("[clientes] originais dos duplicados:", originaisRes.error.message);
  const originais: Record<string, ClienteOriginal> = Object.fromEntries(((originaisRes.data ?? []) as ClienteOriginal[]).map((o) => [o.id, o]));

  return (
    <ClientesClient
      clientes={clientes}
      filtro={{ ...filtro, pagina: clientesRes.pagina }}
      total={clientesRes.count ?? 0}
      resumo={{
        total: totalRes.count ?? 0,
        comFiado: fiadoRes.count ?? 0,
        duplicados: duplicadosRes.error ? 0 : (duplicadosRes.count ?? 0),
        totalComprado: Math.round(totalComprado * 100) / 100,
      }}
      originais={originais}
    />
  );
}
