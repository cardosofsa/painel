/** Conta em aberto com o fornecedor (0095): saldo, pagamento avulso, estorno, em_aberto_por_fornecedor, isolamento. Rode com `npm run test:sql`. */
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

const u = await novoUsuario("aberta@s.com");
const outro = await novoUsuario("outro@s.com");
const forn = (await um(`insert into fornecedores (user_id, nome) values ($1, 'Couro SA') returning id`, [u])).id;
const forn2 = (await um(`insert into fornecedores (user_id, nome) values ($1, 'Fita Ltda') returning id`, [u])).id;
const fornOutro = (await um(`insert into fornecedores (user_id, nome) values ($1, 'Alheio') returning id`, [outro])).id;
const banco = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Itaú', 1000) returning id`, [u])).id;
const bancoOutro = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'X', 1000) returning id`, [outro])).id;
const saldo = async (id) => Number((await um(`select saldo from contas where id = $1`, [id])).saldo);
const aberto = async (f) => Number((await como(u, `select saldo_conta_aberta_fornecedor($1) s`, [f]))[0].s);

// Dívida antiga + compra em aberto.
let r = (await como(u, `select lancar_em_aberto_fornecedor($1, 4200, 'Saldo anterior', '2026-01-10', 'divida_antiga') r`, [forn]))[0].r;
confere("dívida antiga sobe o saldo", Number(r.saldo) === 4200);
const ped = (await um(`insert into pedidos_compra (user_id, fornecedor_id, valor_total, data_pedido, forma_pagamento, status) values ($1, $2, 800, current_date, 'Em aberto', 'pendente') returning id`, [u, forn])).id;
r = (await como(u, `select lancar_em_aberto_fornecedor($1, 800, 'Pedido', null, 'compra', $2) r`, [forn, ped]))[0].r;
confere("compra em aberto soma ao saldo (5.000)", Number(r.saldo) === 5000);
confere("lançar dívida não mexe no caixa", (await saldo(banco)) === 1000 && (await um(`select count(*)::int n from movimentacoes_financeiras where user_id = $1`, [u])).n === 0);

// Pagamentos avulsos.
r = (await como(u, `select pagar_em_aberto_fornecedor($1, 1500, $2, '2026-10-05', 'Pix') r`, [forn, banco]))[0].r;
confere("pagamento abate o saldo e devolve o restante", Number(r.pago) === 1500 && Number(r.saldo) === 3500, JSON.stringify(r));
confere("o pagamento sai da conta", (await saldo(banco)) === -500);
const mov = await um(`select tipo, valor, categoria, afeta_lucro from movimentacoes_financeiras where user_id = $1`, [u]);
confere("saída que afeta o lucro como compra de mercadoria", mov.tipo === "saida" && Number(mov.valor) === -1500 && mov.categoria === "Compra de mercadoria" && mov.afeta_lucro === true, JSON.stringify(mov));
await como(u, `select pagar_em_aberto_fornecedor($1, 500, $2, null, null)`, [forn, banco]);
confere("vários pagamentos, sem valor fixo (saldo 3.000)", (await aberto(forn)) === 3000);

await espera("pagar mais que o saldo é recusado", () => como(u, `select pagar_em_aberto_fornecedor($1, 3000.01, $2, null, null)`, [forn, banco]), "passa do que você deve");
await espera("valor zero é recusado", () => como(u, `select pagar_em_aberto_fornecedor($1, 0, $2, null, null)`, [forn, banco]), "valor");
await espera("data no futuro é recusada", () => como(u, `select pagar_em_aberto_fornecedor($1, 10, $2, '2999-01-01', null)`, [forn, banco]), "futuro");
await espera("fornecedor sem saldo recusa pagamento", () => como(u, `select pagar_em_aberto_fornecedor($1, 10, $2, null, null)`, [forn2, banco]), "passa do que você deve");
await espera("conta de outra pessoa é recusada", () => como(u, `select pagar_em_aberto_fornecedor($1, 10, $2, null, null)`, [forn, bancoOutro]), "Escolha a conta");
await espera("fornecedor de outra pessoa é recusado", () => como(u, `select lancar_em_aberto_fornecedor($1, 10, 'x', null, 'compra')`, [fornOutro]), "Fornecedor não encontrado");
await espera("outra conta não paga o fornecedor alheio", () => como(outro, `select pagar_em_aberto_fornecedor($1, 10, $2, null, null)`, [forn, bancoOutro]), "Fornecedor não encontrado");
await espera("pedido de outra pessoa é recusado", () => como(outro, `select lancar_em_aberto_fornecedor($1, 10, 'x', null, 'compra', $2)`, [fornOutro, ped]), "Pedido de compra não encontrado");
await espera("tipo inválido é recusado", () => como(u, `select lancar_em_aberto_fornecedor($1, 10, 'x', null, 'pagamento')`, [forn]), "Tipo");

// Extrato: só o dono lê, ninguém escreve direto.
confere("o dono lê o extrato (4 linhas)", (await como(u, `select count(*)::int n from fornecedor_lancamentos`))[0].n === 4);
confere("outra conta não lê", (await como(outro, `select count(*)::int n from fornecedor_lancamentos`))[0].n === 0);
await espera("escrita direta na tabela é recusada", () => como(u, `insert into fornecedor_lancamentos (fornecedor_id, tipo, valor) values ($1, 'pagamento', 1)`, [forn]), "row-level security");
const lanc = (await como(u, `select saldo_conta_aberta_fornecedor($1) s`, [forn2]))[0];
confere("saldo de outro fornecedor não mistura", Number(lanc.s) === 0);

// em_aberto_por_fornecedor soma parcelas com data + conta aberta.
await q(`insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento, status, fornecedor_id) values ($1, 'pagar', 'Parcela', 200, '2020-01-01', 'pendente', $2)`, [u, forn]);
const ab = (await como(u, `select * from em_aberto_por_fornecedor() where fornecedor_id = $1`, [forn]))[0];
confere("em aberto = conta aberta (3.000) + parcelas (200); só a parcela conta como atrasada", Number(ab.em_aberto) === 3200 && Number(ab.atrasado) === 200 && String(ab.proximo_vencimento).includes("2020"), JSON.stringify(ab));
confere("fornecedor sem dívida não aparece", (await como(u, `select count(*)::int n from em_aberto_por_fornecedor() where fornecedor_id = $1`, [forn2]))[0].n === 0);

// Estorno.
const pag = (await como(u, `select id from fornecedor_lancamentos where tipo = 'pagamento' order by valor desc limit 1`))[0].id;
await como(u, `select estornar_lancamento_fornecedor($1)`, [pag]);
confere("estornar pagamento devolve ao saldo (4.500) e à conta (500)", (await aberto(forn)) === 4500 && (await saldo(banco)) === 500, `${await aberto(forn)} / ${await saldo(banco)}`);
confere("a saída do pagamento some", (await um(`select count(*)::int n from movimentacoes_financeiras where user_id = $1`, [u])).n === 1);
const dividaId = (await como(u, `select id from fornecedor_lancamentos where tipo = 'divida_antiga'`))[0].id;
await como(u, `select lancar_em_aberto_fornecedor($1, 100, 'engano', null, 'compra')`, [forn]);
const engano = (await como(u, `select id from fornecedor_lancamentos where descricao = 'engano'`))[0].id;
await como(u, `select estornar_lancamento_fornecedor($1)`, [engano]);
confere("remover um débito lançado por engano é permitido e o saldo volta (4.500)", (await aberto(forn)) === 4500);
await como(u, `select pagar_em_aberto_fornecedor($1, 1000, $2, null, null)`, [forn, banco]);
await espera("remover débito que deixaria o saldo negativo é recusado", () => como(u, `select estornar_lancamento_fornecedor($1)`, [dividaId]), "Estorne primeiro");
await como(u, `select pagar_em_aberto_fornecedor($1, 3500, $2, null, 'quita')`, [forn, banco]);
confere("quitar leva o saldo a zero", (await aberto(forn)) === 0);
await espera("fornecedor de outra conta não estorna o lançamento alheio", () => como(outro, `select estornar_lancamento_fornecedor($1)`, [dividaId]), "Lançamento não encontrado");

await db.exec(`set role anon`);
await espera("anônimo não executa", () => db.query(`select pagar_em_aberto_fornecedor($1, 1, $2, null, null)`, [forn, banco]), "permission denied");
await db.exec(`reset role`);
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [u]);
await espera("conta suspensa não lança", () => como(u, `select lancar_em_aberto_fornecedor($1, 10, 'x', null, 'compra')`, [forn]), "sem acesso");

await db.exec(await lerMigracao("0095_conta_aberta_fornecedor.sql"));
confere("0095 roda 2x e mantém o extrato", (await um(`select count(*)::int n from fornecedor_lancamentos`)).n >= 3);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
