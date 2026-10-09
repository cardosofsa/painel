/** Cartão de crédito como tipo de conta (0092): limite, trava de gasto, pagar fatura, isolamento. Rode com `npm run test:sql`. */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

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
const novoUsuario = async (email) => {
  const id = (await um(`insert into auth.users (email) values ($1) returning id`, [email])).id;
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, $2, 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id, email]);
  return id;
};
await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
  }
};

const u = await novoUsuario("cartao@s.com");
const outro = await novoUsuario("outro@s.com");
const banco = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Banco', 1000) returning id`, [u])).id;
const bancoOutro = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Banco', 1000) returning id`, [outro])).id;
const cartao = (await um(`insert into contas (user_id, nome, saldo, tipo, limite_total, dia_fechamento, dia_vencimento) values ($1, 'Nubank', -200, 'cartao_credito', 1000, 5, 12) returning id`, [u])).id;
const saldo = async (id) => Number((await um(`select saldo from contas where id = $1`, [id])).saldo);

confere("conta comum fica com tipo 'conta'", (await um(`select tipo from contas where id = $1`, [banco])).tipo === "conta");
await espera("cartão sem limite é recusado", () => q(`insert into contas (user_id, nome, tipo) values ($1, 'X', 'cartao_credito')`, [u]), "check");
await espera("tipo inválido é recusado", () => q(`update contas set tipo = 'poupanca' where id = $1`, [banco]), "check");
await espera("dia de vencimento fora de 1..31 é recusado", () => q(`update contas set dia_vencimento = 40 where id = $1`, [cartao]), "check");
await espera("cadastro já acima do limite é recusado", () => q(`insert into contas (user_id, nome, saldo, tipo, limite_total) values ($1, 'Y', -500, 'cartao_credito', 100)`, [u]), "Limite do cartão");

// Gasto dentro do limite passa; acima, não.
await q(`update contas set saldo = saldo - 700 where id = $1`, [cartao]);
confere("gasto dentro do limite passa (disponível 100)", (await saldo(cartao)) === -900);
await espera("gasto acima do disponível é recusado", () => q(`update contas set saldo = saldo - 150 where id = $1`, [cartao]), "Limite do cartão");
confere("o saldo não mudou após a recusa", (await saldo(cartao)) === -900);
await q(`update contas set saldo = saldo - 100 where id = $1`, [cartao]);
confere("gasto exato até o limite passa", (await saldo(cartao)) === -1000);
await q(`update contas set nome = 'Nubank Roxo' where id = $1`, [cartao]);
confere("editar o nome com o limite cheio não trava", true);

// Pagar fatura.
const r = (await como(u, `select pagar_fatura_cartao($1, $2, 400, '2026-10-05') as r`, [cartao, banco]))[0].r;
confere("pagar fatura quita parte da dívida", Number(r.pago) === 400 && Number(r.divida_restante) === 600, JSON.stringify(r));
confere("sai da conta e libera o limite", (await saldo(banco)) === 600 && (await saldo(cartao)) === -600);
const movs = await q(`select tipo, afeta_lucro, categoria from movimentacoes_financeiras where user_id = $1 and origem = 'Fatura de cartão' order by tipo`, [u]);
confere("duas movimentações que não afetam o lucro", movs.length === 2 && movs.every((m) => m.afeta_lucro === false && m.categoria === "Fatura de cartão"));
await q(`update contas set saldo = saldo - 300 where id = $1`, [cartao]);
confere("depois de pagar, o limite liberado pode ser usado de novo", (await saldo(cartao)) === -900);

await espera("valor acima da fatura é recusado", () => como(u, `select pagar_fatura_cartao($1, $2, 5000, null)`, [cartao, banco]), "passa da fatura");
await espera("valor zero é recusado", () => como(u, `select pagar_fatura_cartao($1, $2, 0, null)`, [cartao, banco]), "valor");
await espera("data no futuro é recusada", () => como(u, `select pagar_fatura_cartao($1, $2, 10, '2999-01-01')`, [cartao, banco]), "futuro");
await espera("origem que é cartão é recusada", () => como(u, `select pagar_fatura_cartao($1, $2, 10, null)`, [cartao, cartao]), "conta de onde sai");
await espera("pagar uma conta comum como se fosse cartão é recusado", () => como(u, `select pagar_fatura_cartao($1, $2, 10, null)`, [banco, banco]), "Cartão não encontrado");
await espera("conta de outra pessoa como origem é recusada", () => como(u, `select pagar_fatura_cartao($1, $2, 10, null)`, [cartao, bancoOutro]), "conta de onde sai");
await espera("cartão alheio é recusado", () => como(outro, `select pagar_fatura_cartao($1, $2, 10, null)`, [cartao, bancoOutro]), "Cartão não encontrado");
await db.exec(`set role anon`);
await espera("anônimo não executa", () => db.query(`select pagar_fatura_cartao($1, $2, 10, null)`, [cartao, banco]), "permission denied");
await db.exec(`reset role`);

const zerado = (await um(`insert into contas (user_id, nome, saldo, tipo, limite_total) values ($1, 'Sem fatura', 0, 'cartao_credito', 500) returning id`, [u])).id;
await espera("cartão sem fatura em aberto não recebe pagamento", () => como(u, `select pagar_fatura_cartao($1, $2, 10, null)`, [zerado, banco]), "não tem fatura");

await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [u]);
await espera("conta suspensa não paga fatura", () => como(u, `select pagar_fatura_cartao($1, $2, 10, null)`, [cartao, banco]), "sem acesso");

await db.exec(await lerMigracao("0092_contas_cartao_credito.sql"));
confere("0092 roda 2x sem erro e mantém os dados", (await saldo(cartao)) === -900 && (await um(`select limite_total l from contas where id = $1`, [cartao])).l == 1000);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
