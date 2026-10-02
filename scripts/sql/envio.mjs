/** Estado do envio do marketplace (0054). Rode com `npm run test:sql`. */
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
const reg = (envios) => um(`select registrar_envio_marketplace($1::jsonb) as n`, [JSON.stringify(envios)]);
const ler = () => um(`select envio_programado_em, envio_erro, rastreio, etiqueta_impressa_em from pedidos_marketplace where id = $1`, [ped]);

await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
await reg([{ id: ped, erro: "Endereço de coleta não cadastrado" }]);
let m = await ler();
confere("grava a falha sem programar", m.envio_erro === "Endereço de coleta não cadastrado" && m.envio_programado_em === null, JSON.stringify(m));

await reg([{ id: ped, programado: true, erro: null, rastreio: "BR123" }]);
m = await ler();
confere("programado limpa a falha e grava o rastreio", m.envio_programado_em !== null && m.envio_erro === null && m.rastreio === "BR123", JSON.stringify(m));

await reg([{ id: ped, impressa: true }]);
m = await ler();
confere("impressa não mexe no resto", m.etiqueta_impressa_em !== null && m.rastreio === "BR123" && m.envio_programado_em !== null, JSON.stringify(m));

await reg([{ id: ped, impressa: false }]);
m = await ler();
confere("impressa false volta para Imprimir", m.etiqueta_impressa_em === null, JSON.stringify(m));

await db.exec(`select set_config('request.jwt.claim.sub', '${outro}', false)`);
const n = (await reg([{ id: ped, impressa: true }])).n;
confere("outra conta não mexe no pedido alheio", n === 0 && (await ler()).etiqueta_impressa_em === null, `linhas: ${n}`);

await db.exec(await lerMigracao("0054_envio_marketplace.sql"));
confere("0054 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
