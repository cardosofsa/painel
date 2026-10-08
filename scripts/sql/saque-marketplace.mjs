/** "Registrei um saque" do marketplace (0089): baixa FIFO dos repasses liberados, saldo, isolamento. Rode com `npm run test:sql`. */
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

const u = await novoUsuario("saque@s.com");
const outro = await novoUsuario("outro@s.com");
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Banco', 100) returning id`, [u])).id;
const contaOutro = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Banco', 0) returning id`, [outro])).id;
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Cardoso e-Shop') returning id`, [u, canal])).id;
const loja2 = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Mateus') returning id`, [u, canal])).id;
const canalO = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [outro])).id;
const lojaOutro = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Alheia') returning id`, [outro, canalO])).id;

confere("prazo de liberação padrão é 7 dias", (await um(`select dias_liberacao_repasse d from lojas_canal where id = $1`, [loja])).d === 7);
await espera("prazo fora de 0 a 60 é recusado", () => q(`update lojas_canal set dias_liberacao_repasse = 90 where id = $1`, [loja]), "check");

// Repasses de 3 pedidos da loja 1 (um aguardando), 1 da loja 2, em datas diferentes.
const repasse = async (numero, lojaId, valor, venc, extra = {}) => {
  const ped = (await um(`insert into pedidos_marketplace (user_id, loja_id, numero, status, repasse) values ($1, $2, $3, 'concluido', $4) returning id`, [u, lojaId, numero, valor])).id;
  return (await um(
    `insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento, status, aguardando_liberacao, referencia_pedido_marketplace_id)
     values ($1, 'receber', $2, $3, $4, 'pendente', $5, $6) returning id`,
    [u, `Repasse Cardoso e-Shop — pedido ${numero}`, valor, venc, !!extra.aguardando, ped],
  )).id;
};
const r1 = await repasse("P1", loja, 50, "2026-10-01");
const r2 = await repasse("P2", loja, 30.5, "2026-10-02");
const r3 = await repasse("P3", loja, 20, "2026-10-03");
const rAguard = await repasse("P4", loja, 99, "2026-10-04", { aguardando: true });
const rOutraLoja = await repasse("P5", loja2, 40, "2026-10-01");
const st = async (id) => (await um(`select status, valor_pago, conta_id from contas_a_pagar_receber where id = $1`, [id]));

// Saque de 80,50: baixa P1 (50) e P2 (30,50); P3 fica.
const r = (await como(u, `select registrar_saque_marketplace($1, 80.50, $2, '2026-10-05') as r`, [loja, conta]))[0].r;
confere("baixa os mais antigos até o valor do saque", r.baixados === 2 && Number(r.valor_baixado) === 80.5 && Number(r.diferenca) === 0, JSON.stringify(r));
confere("P1 e P2 viram recebidos, com a conta e o valor", (await st(r1)).status === "recebido" && Number((await st(r2)).valor_pago) === 30.5 && (await st(r2)).conta_id === conta);
confere("P3 continua pendente", (await st(r3)).status === "pendente");
confere("pedido aguardando e repasse de outra loja não são tocados", (await st(rAguard)).status === "pendente" && (await st(rOutraLoja)).status === "pendente");
confere("o saldo da conta sobe pelo valor sacado", Number((await um(`select saldo from contas where id = $1`, [conta])).saldo) === 180.5);
const mov = await um(`select * from movimentacoes_financeiras where user_id = $1 and origem = 'Saque marketplace'`, [u]);
confere("entra uma movimentação de caixa que não afeta o lucro", mov && Number(mov.valor) === 80.5 && mov.tipo === "entrada" && mov.afeta_lucro === false && mov.categoria === "Repasse marketplace");

// Saque maior que o devido: credita tudo, baixa o que cabe, informa a diferença.
const r2b = (await como(u, `select registrar_saque_marketplace($1, 25, $2, null) as r`, [loja, conta]))[0].r;
confere("saque maior que os repasses: baixa o que cabe e mostra a diferença", r2b.baixados === 1 && Number(r2b.diferenca) === 5, JSON.stringify(r2b));
confere("o saldo sobe pelo valor que caiu no banco", Number((await um(`select saldo from contas where id = $1`, [conta])).saldo) === 205.5);

// Saque menor que o menor repasse: não baixa nada, mas registra o dinheiro.
const r3b = (await como(u, `select registrar_saque_marketplace($1, 10, $2, null) as r`, [loja2, conta]))[0].r;
confere("saque menor que qualquer repasse não baixa nada", r3b.baixados === 0 && Number(r3b.diferenca) === 10 && (await st(rOutraLoja)).status === "pendente");

await espera("valor zero é recusado", () => como(u, `select registrar_saque_marketplace($1, 0, $2, null)`, [loja, conta]), "valor");
await espera("data no futuro é recusada", () => como(u, `select registrar_saque_marketplace($1, 5, $2, '2999-01-01')`, [loja, conta]), "futuro");
await espera("conta de outra pessoa é recusada", () => como(u, `select registrar_saque_marketplace($1, 5, $2, null)`, [loja, contaOutro]), "Escolha a conta");
await espera("loja de outra pessoa é recusada", () => como(u, `select registrar_saque_marketplace($1, 5, $2, null)`, [lojaOutro, conta]), "Loja não encontrada");
await espera("outra conta não saca a loja alheia", () => como(outro, `select registrar_saque_marketplace($1, 5, $2, null)`, [loja, contaOutro]), "Loja não encontrada");
await db.exec(`set role anon`);
await espera("anônimo não executa", () => db.query(`select registrar_saque_marketplace($1, 5, $2, null)`, [loja, conta]), "permission denied");
await db.exec(`reset role`);
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [u]);
await espera("conta suspensa não saca", () => como(u, `select registrar_saque_marketplace($1, 5, $2, null)`, [loja, conta]), "sem acesso");

await db.exec(await lerMigracao("0089_saque_marketplace_e_prazo_liberacao.sql"));
confere("0089 roda 2x sem erro e mantém o prazo configurado", (await um(`select dias_liberacao_repasse d from lojas_canal where id = $1`, [loja])).d === 7);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
