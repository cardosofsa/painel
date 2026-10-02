/** Mercado Livre (0056): plataforma do pedido vem da conexão. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('a@a.com') returning id`)).id;
await db.query(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa, icone, cor) values ($1, 'Mercado Livre', 'fixo', 'x', '#000') returning id`, [u])).id;
const lojaMl = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'ML') returning id`, [u, canal])).id;
const lojaPlanilha = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Planilha') returning id`, [u, canal])).id;
await db.query(`insert into marketplace_conexoes (user_id, loja_id, plataforma, shop_id) values ($1, $2, 'mercadolivre', '777')`, [u, lojaMl]);

await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const r = await um(
  `select importar_pedidos_marketplace($1, $2::jsonb) as r`,
  [lojaMl, JSON.stringify([{ numero: "2000001", status: "a_enviar", status_original: "PROCESSED · ready_to_print", subtotal: 100, itens: [] }])],
);
confere("importa pedido do ML pela mesma RPC", !!r, JSON.stringify(r?.r));
const p = await um(`select plataforma from pedidos_marketplace where numero = '2000001'`);
confere("pedido da loja conectada ao ML fica como mercadolivre", p?.plataforma === "mercadolivre", p?.plataforma);

await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [lojaPlanilha, JSON.stringify([{ numero: "X1", status: "a_enviar", subtotal: 10, itens: [] }])]);
confere("loja sem conexão mantém o padrão", (await um(`select plataforma from pedidos_marketplace where numero = 'X1'`)).plataforma === "shopee");

await db.exec(await lerMigracao("0056_mercado_livre.sql"));
confere("0056 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
