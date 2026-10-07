import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { sincronizarTodasAsLojas } from "@/lib/marketplace/sincronizar-todas";

export const maxDuration = 60;

/**
 * "Sincronizar pedidos" como rota, não Server Action: o Next enfileira as Server Actions com
 * a navegação, e uma sincronização de 20 s travava a troca de tela até terminar. Com `fetch`
 * a sincronização corre por fora e a pessoa navega à vontade. Sessão pelo cookie (anon key +
 * RLS), como nas telas.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const r = await comResultado(() => sincronizarTodasAsLojas(supabase));
  if (r.ok) {
    for (const p of ["/vendas", "/clientes", "/dashboard", "/estoque", "/financeiro"]) revalidatePath(p);
  }
  return NextResponse.json(r);
}
