/**
 * Fila de vendas do PDV feitas SEM internet (11.4). Código de NAVEGADOR (IndexedDB).
 *
 * Cada venda guarda o dono (user_id): outra conta que entrar no mesmo aparelho não envia
 * nem vê as vendas de quem saiu. A chave (uuid) garante que reenviar não duplica (0060).
 */

export interface VendaOffline {
  chave: string;
  userId: string;
  /** ISO, horário real da venda. */
  feitaEm: string;
  /** O mesmo corpo de `registrarVenda` (VendaInput). */
  dados: Record<string, unknown>;
  /** 11.8: operador do turno na hora da venda. */
  operadorId?: string | null;
  /** Para mostrar e descontar o estoque na tela enquanto não sobe. */
  resumo: { total: number; itens: { produto_id: string; nome: string; quantidade: number }[] };
  erro?: string | null;
}

const BANCO = "sertao-pdv";
const LOJA = "vendas";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA, { keyPath: "chave" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

async function comLoja<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const t = db.transaction(LOJA, modo);
    const req = fn(t.objectStore(LOJA));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

export async function guardarVendaOffline(v: VendaOffline): Promise<void> {
  await comLoja("readwrite", (s) => s.put(v));
}

export async function vendasOffline(userId: string): Promise<VendaOffline[]> {
  try {
    const todas = (await comLoja("readonly", (s) => s.getAll())) as VendaOffline[];
    return todas.filter((v) => v.userId === userId).sort((a, b) => a.feitaEm.localeCompare(b.feitaEm));
  } catch {
    return [];
  }
}

export async function removerVendaOffline(chave: string): Promise<void> {
  await comLoja("readwrite", (s) => s.delete(chave));
}

/** Quanto de cada produto já saiu em vendas ainda não enviadas (para a tela do PDV). */
export function reservadoOffline(vendas: VendaOffline[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of vendas) for (const i of v.resumo.itens) m.set(i.produto_id, (m.get(i.produto_id) ?? 0) + i.quantidade);
  return m;
}

/** Erro de rede (sem internet / servidor fora) — esse caso vira fila, não erro na tela. */
export function ehErroDeRede(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|offline/i.test(msg);
}
