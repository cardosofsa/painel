/** Notificações do marketplace (0108): deduplicação atômica e teto por conta. Rode com `npm run test:sql`. */
import { criarBancoDeTeste } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('avisos@m.com') returning id`)).id;
const reg = async (chave, janela = 30, teto = 120) => (await um(`select registrar_aviso_marketplace($1, $2, $3, $4) ok`, [u, chave, janela, teto])).ok;

confere("primeiro aviso de um pedido passa", (await reg("ml:pedido:1")) === true);
confere("o mesmo pedido repetido na janela é descartado", (await reg("ml:pedido:1")) === false);
confere("outro pedido passa", (await reg("ml:pedido:2")) === true);
await q(`update marketplace_avisos set visto_em = now() - interval '31 seconds' where chave = 'ml:pedido:1'`);
confere("depois da janela, o mesmo pedido passa de novo", (await reg("ml:pedido:1")) === true);
for (let i = 0; i < 5; i++) await reg(`ml:pedido:teto${i}`, 30, 6);
confere("passou do teto por minuto, descarta até chave nova", (await reg("ml:pedido:novo", 30, 6)) === false);
confere("chave vazia é recusada", (await reg("")) === false);

// Só o service role chama.
await db.exec(`grant usage on schema public to authenticated, anon`);
for (const papel of ["authenticated", "anon"]) {
  await db.exec(`set role ${papel}`);
  try {
    await db.query(`select registrar_aviso_marketplace($1, 'x')`, [u]);
    confere(`${papel} não chama a função`, false, "devia ter dado erro");
  } catch (e) {
    confere(`${papel} não chama a função`, e.message.includes("permission denied"), e.message.slice(0, 80));
  } finally {
    await db.exec(`reset role`);
  }
}

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
