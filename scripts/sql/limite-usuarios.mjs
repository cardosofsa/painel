/** Limite de usuários do plano (0073) e uso em minha_assinatura(). Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
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

const u = (await um(`insert into auth.users (email) values ('lu@l.com') returning id`)).id;
const master = (await um(`insert into auth.users (email) values ('m@l.com') returning id`)).id;
await q(
  `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`,
  [u],
);
await q(
  `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'm', 'master', 'ativo', '{}') on conflict (user_id) do update set papel = 'master', status = 'ativo'`,
  [master],
);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);

// Essencial: 2 usuários (o dono + 1 operador).
await q(
  `insert into assinaturas (user_id, plano_id, status) values ($1, 'essencial', 'ativa') on conflict (user_id) do update set plano_id = 'essencial', status = 'ativa'`,
  [u],
);
const ana = (await um(`select salvar_operador(null, 'Ana', '1234', array['pdv'], 0, 'venda', true) as id`)).id;
confere("primeiro operador cabe no Essencial (dono + 1)", !!ana);
const e2 = await erro(`select salvar_operador(null, 'Bia', '1234', array['pdv'], 0, 'venda', true)`);
confere("segundo operador ativo é recusado", /permite 2 usuário/.test(e2 ?? ""), e2 ?? "passou!");
const bia = (await um(`select salvar_operador(null, 'Bia', '1234', array['pdv'], 0, 'venda', false) as id`)).id;
confere("operador inativo cadastra mesmo no limite", !!bia);
confere(
  "reativar acima do limite é recusado",
  /permite 2 usuário/.test((await erro(`select salvar_operador($1, 'Bia', null, null, null, null, true)`, [bia])) ?? ""),
);
await q(`select salvar_operador($1, 'Ana editada', null, null, 3, null, null)`, [ana]);
confere("editar operador ativo no limite continua permitido", (await um(`select nome from operadores where id = $1`, [ana])).nome === "Ana editada");
await q(`select salvar_operador($1, 'Ana editada', null, null, null, null, false)`, [ana]);
await q(`select salvar_operador($1, 'Bia', null, null, null, null, true)`, [bia]);
confere("desativar libera a vaga para outro", (await um(`select ativo from operadores where id = $1`, [bia])).ativo === true);

const uso = (await um(`select minha_assinatura() as r`)).r.uso;
confere("minha_assinatura devolve usuários (dono + ativos) e imagens do mês", uso.usuarios === 2 && uso.imagens_mes === 0, JSON.stringify(uso));

// Pro (5) e plano ilimitado.
await q(`update assinaturas set plano_id = 'pro' where user_id = $1`, [u]);
await q(`select salvar_operador($1, 'Ana', null, null, null, null, true)`, [ana]);
confere("no Pro cabem mais", (await um(`select count(*)::int n from operadores where user_id = $1 and ativo`, [u])).n === 2);
await q(`update planos set limite_usuarios = null where id = 'gratis'`);
await q(`update assinaturas set plano_id = 'gratis' where user_id = $1`, [u]);
await q(`select salvar_operador(null, 'Cris', '1234', array['pdv'], 0, 'venda', true)`);
confere("limite nulo = ilimitado", (await um(`select count(*)::int n from operadores where user_id = $1 and ativo`, [u])).n === 3);
await q(`update planos set limite_usuarios = 1 where id = 'gratis'`);

// Master fica de fora.
await db.exec(`select set_config('request.jwt.claim.sub', '${master}', false)`);
await q(`insert into assinaturas (user_id, plano_id, status) values ($1, 'gratis', 'ativa') on conflict (user_id) do update set plano_id = 'gratis'`, [master]);
confere("master não é barrado", !(await erro(`select salvar_operador(null, 'Op', '1234', array['pdv'], 0, 'venda', true)`)));
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);

await db.exec(await lerMigracao("0073_limite_usuarios.sql"));
confere("0073 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
