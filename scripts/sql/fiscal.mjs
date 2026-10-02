/** Fiscal (0062): configuração, NCM, documento do cliente e notas. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};
const erro = async (sql, p = []) => {
  try {
    await db.query(sql, p);
    return null;
  } catch (e) {
    return e.message;
  }
};

const u = (await um(`insert into auth.users (email) values ('f@f.com') returning id`)).id;
await db.query(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);

await db.query(`insert into fiscal_config (user_id) values ($1)`, [u]);
const c = await um(`select cfop_padrao, csosn_padrao, padrao_pdv, padrao_catalogo, ambiente from fiscal_config where user_id = $1`, [u]);
confere("padrões do Simples e por canal", c.cfop_padrao === "5102" && c.csosn_padrao === "102" && c.padrao_pdv === "comprovante" && c.padrao_catalogo === "perguntar" && c.ambiente === "homologacao", JSON.stringify(c));

const p = (await um(`insert into produtos (user_id, sku, nome, estoque, ncm) values ($1, 'A', 'A', 0, '69120000') returning id`, [u])).id;
confere("NCM com 8 dígitos aceito", !!p);
confere("NCM inválido recusado", !!(await erro(`update produtos set ncm = '6912' where id = $1`, [p])));
const cli = (await um(`insert into clientes (user_id, nome, documento) values ($1, 'Ana', '123.456.789-01') returning id`, [u])).id;
confere("documento do cliente formatado continua aceito (a NF-e limpa)", !!cli);

await db.exec(await lerMigracao("0062_fiscal_nfe.sql"));
confere("0062 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
