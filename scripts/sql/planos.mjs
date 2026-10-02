/** Planos e assinatura (0057). Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const como = (id) => db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
const erroDe = async (sql, p = []) => {
  try {
    await db.query(sql, p);
    return null;
  } catch (e) {
    return e.message;
  }
};

// Conta nova: o gatilho do perfil cria a assinatura de teste.
const u = (await um(`insert into auth.users (email) values ('nova@a.com') returning id`)).id;
await db.query(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'nova@a.com', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
const a = await um(`select plano_id, status, teste_ate > now() + interval '13 days' as quatorze from assinaturas where user_id = $1`, [u]);
confere("conta nova nasce em teste do Pro por 14 dias", a?.plano_id === "pro" && a.status === "teste" && a.quatorze, JSON.stringify(a));
confere("no teste, vale o Pro", (await um(`select plano_efetivo_id($1) as p`, [u])).p === "pro");

await db.query(`update assinaturas set teste_ate = now() - interval '1 day' where user_id = $1`, [u]);
confere("teste vencido: vale o Grátis (sem bloquear a conta)", (await um(`select plano_efetivo_id($1) as p`, [u])).p === "gratis");

// Limite de produtos do Grátis (50): o 51º é recusado com mensagem clara.
await db.query(`update planos set limite_produtos = 2 where id = 'gratis'`);
await como(u);
for (const sku of ["A", "B"]) await db.query(`insert into produtos (user_id, sku, nome) values ($1, $2, $2)`, [u, sku]);
const e = await erroDe(`insert into produtos (user_id, sku, nome) values ($1, 'C', 'C')`, [u]);
confere("limite de produtos do plano no banco", /permite até 2 produtos/.test(e ?? ""), e ?? "passou");

// Lojas conectadas: Grátis permite 0.
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa, icone, cor) values ($1, 'Shopee', 'faixas', 'x', '#000') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'L') returning id`, [u, canal])).id;
const e2 = await erroDe(`insert into marketplace_conexoes (user_id, loja_id, plataforma, shop_id) values ($1, $2, 'shopee', '1')`, [u, loja]);
confere("limite de lojas conectadas no banco", /loja\(s\) conectada/.test(e2 ?? ""), e2 ?? "passou");

// IA por mês.
await db.query(`update planos set limite_ia_mes = 3 where id = 'gratis'`);
await db.query(`insert into ia_uso (user_id, geracoes) values ($1, 3) on conflict (user_id, dia) do update set geracoes = 3`, [u]);
const ia = (await um(`select plano_permite_ia() as m`)).m;
confere("IA: estourou o mês, mensagem do plano", /3 gerações de IA por mês/.test(ia ?? ""), ia ?? "null");

// Pedir troca não muda o plano; o resumo mostra o pedido e o uso.
await um(`select solicitar_plano('essencial')`);
const r = (await um(`select minha_assinatura() as r`)).r;
confere("solicitar não ativa sozinho; resumo com uso", r.plano_efetivo === "gratis" && r.plano_solicitado === "essencial" && Number(r.uso.produtos) === 2, JSON.stringify(r));
const e3 = await erroDe(`select admin_definir_assinatura($1, 'pro', 'ativa', null, null, null)`, [u]);
confere("conta comum não se promove", /administrador/.test(e3 ?? ""), e3 ?? "passou");

// Master ativa o pedido.
const m = (await um(`insert into auth.users (email) values ('master@a.com') returning id`)).id;
await db.query(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'master@a.com', 'master', 'ativo', '{}') on conflict (user_id) do update set papel = 'master', status = 'ativo'`, [m]);
await como(m);
await um(`select admin_definir_assinatura($1, 'essencial', 'ativa', now() + interval '30 days', null, 'Pix recebido')`, [u]);
const depois = await um(`select plano_id, status, plano_solicitado from assinaturas where user_id = $1`, [u]);
confere("master ativa e o pedido é atendido", depois.plano_id === "essencial" && depois.status === "ativa" && depois.plano_solicitado === null, JSON.stringify(depois));
confere("histórico do master", (await um(`select count(*)::int n from historico_admin where alvo_user_id = $1 and acao = 'plano'`, [u])).n === 1);
confere("master vê a assinatura de qualquer conta", (await um(`select count(*)::int n from assinaturas where user_id = $1`, [u])).n === 1);

await db.exec(await lerMigracao("0057_planos_assinaturas.sql"));
confere("0057 roda 2x sem erro (e não sobrescreve planos editados)", (await um(`select limite_ia_mes from planos where id = 'gratis'`)).limite_ia_mes === 3);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
