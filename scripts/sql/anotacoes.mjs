/** Observação, tags e ocultar em pedidos de marketplace (0053). Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('a@a.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('b@b.com') returning id`)).id;
for (const id of [u, outro]) await db.query(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa, icone, cor) values ($1, 'Shopee', 'faixas', 'x', '#000') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'L') returning id`, [u, canal])).id;
const ped = (await um(`insert into pedidos_marketplace (user_id, loja_id, numero, status) values ($1, $2, 'A1', 'a_enviar') returning id`, [u, loja])).id;

await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
await um(`select anotar_pedidos_marketplace(array[$1]::uuid[], 'Embalar com plástico bolha', array['urgente','brinde'], true)`, [ped]);
let m = await um(`select observacao_interna, tags, ocultado_em from pedidos_marketplace where id = $1`, [ped]);
confere("grava observação, tags e oculta", m.observacao_interna === "Embalar com plástico bolha" && m.tags.join() === "urgente,brinde" && m.ocultado_em !== null, JSON.stringify(m));

await um(`select anotar_pedidos_marketplace(array[$1]::uuid[], null, null, false)`, [ped]);
m = await um(`select observacao_interna, tags, ocultado_em from pedidos_marketplace where id = $1`, [ped]);
confere("null não mexe; p_ocultar false mostra de novo", m.observacao_interna === "Embalar com plástico bolha" && m.tags.length === 2 && m.ocultado_em === null, JSON.stringify(m));

await um(`select anotar_pedidos_marketplace(array[$1]::uuid[], '', '{}', null)`, [ped]);
m = await um(`select observacao_interna, tags from pedidos_marketplace where id = $1`, [ped]);
confere("observação vazia apaga, '{}' limpa as tags", m.observacao_interna === null && m.tags.length === 0, JSON.stringify(m));

await db.exec(`select set_config('request.jwt.claim.sub', '${outro}', false)`);
const n = (await um(`select anotar_pedidos_marketplace(array[$1]::uuid[], 'invadiu', null, true) as n`, [ped])).n;
confere("outra conta não anota pedido alheio", n === 0, `linhas: ${n}`);

await db.exec(await lerMigracao("0053_expedicao_anotacoes.sql"));
confere("0053 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
