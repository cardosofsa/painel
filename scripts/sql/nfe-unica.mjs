/** Uma NF-e ativa por venda (0105). Rode com `npm run test:sql`. */
import { criarBancoDeTeste } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const espera = async (nome, fn, trecho) => {
  try {
    await fn();
    confere(nome, false, "devia ter dado erro");
  } catch (e) {
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 110));
  }
};

const u = (await um(`insert into auth.users (email) values ('nfe@e.com') returning id`)).id;
const venda = (await um(`insert into vendas (user_id, numero) values ($1, 'V1') returning id`, [u])).id;
const nota = (status, ref) => q(`insert into notas_fiscais (user_id, venda_id, tipo, status, ref) values ($1, $2, 'nfe', $3, $4)`, [u, venda, status, ref]);

confere("índice criado", !!(await um(`select 1 x from pg_indexes where indexname = 'notas_fiscais_nfe_ativa_unica'`)));
await nota("rejeitada", "r1");
await nota("processando", "r2");
confere("rejeitada não impede emitir de novo", true);
await espera("segunda NF-e ativa para a mesma venda é recusada", () => nota("processando", "r3"), "duplicate key");
await q(`update notas_fiscais set status = 'autorizada' where ref = 'r2'`);
await espera("com a autorizada, outra em processamento também é recusada", () => nota("processando", "r4"), "duplicate key");
await q(`insert into notas_fiscais (user_id, venda_id, tipo, status, ref) values ($1, $2, 'comprovante', 'autorizada', 'c1')`, [u, venda]);
confere("comprovante não conta", true);
await q(`update notas_fiscais set status = 'cancelada' where ref = 'r2'`);
await nota("processando", "r5");
confere("cancelada libera uma nova emissão", true);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
