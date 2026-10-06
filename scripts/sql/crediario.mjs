/** Crediário completo: encargos, recebimento com valor livre, parcelas da nota (0065). Rode com `npm run test:sql`. */
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
    confere(nome, !trecho || e.message.includes(trecho), e.message.slice(0, 100));
  }
};

const u = (await um(`insert into auth.users (email) values ('cr@c.com') returning id`)).id;
await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [u]);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const caixa = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
const camisa = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'CAM', 'Camisa', 20, 50, 50) returning id`, [u])).id;
const cliente = (await um(`insert into clientes (user_id, nome, permite_fiado, limite_fiado) values ($1, 'Ana', true, 10000) returning id`, [u])).id;
const saldo = async () => Number((await um(`select saldo from contas where id = $1`, [caixa])).saldo);
const venda = (qtd, parcelas) =>
  um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'fiado', p_conta_id => $2, p_forma_pagamento => 'Crediário', p_cliente_id => $3, p_parcelas_fiado => $4)`, [
    JSON.stringify([{ produto_id: camisa, quantidade: qtd, preco_unitario: 50 }]),
    caixa,
    cliente,
    parcelas,
  ]);

// 1) Perfil: multa acima de 2% é recusada (CDC).
await q(`insert into perfil_negocio (user_id, nome_negocio) values ($1, 'Loja') on conflict (user_id) do nothing`, [u]);
await espera("multa > 2% recusada", () => q(`update perfil_negocio set multa_atraso_pct = 5 where user_id = $1`, [u]), "multa_cdc");
await q(`update perfil_negocio set multa_atraso_pct = 2, juros_mes_pct = 1, pix_chave = 'loja@x.com', pix_nome = 'LOJA', pix_cidade = 'RECIFE' where user_id = $1`, [u]);
confere("perfil guarda Pix e encargos", (await um(`select pix_chave, multa_atraso_pct from perfil_negocio where user_id = $1`, [u])).pix_chave === "loja@x.com");

// 2) Parcela paga com encargo: dois lançamentos, saldo soma tudo.
const v1 = await venda(2, 2);
const p1 = await um(`select id, valor from venda_parcelas where venda_id = $1 order by numero limit 1`, [v1.venda_id]);
const antes = await saldo();
await q(`select marcar_parcela_paga($1, $2, '2026-10-05', $3)`, [p1.id, Number(p1.valor) + 3, caixa]);
const movs = await q(`select categoria, valor from movimentacoes_financeiras where referencia_venda_id = $1 and categoria in ('Recebimento de crediário', 'Juros e multa de crediário') order by valor desc`, [v1.venda_id]);
confere("parcela: principal e encargo em lançamentos separados", movs.length === 2 && Number(movs[1].valor) === 3 && movs[1].categoria === "Juros e multa de crediário", JSON.stringify(movs));
confere("saldo soma principal + encargo", Math.abs((await saldo()) - antes - (Number(p1.valor) + 3)) < 0.01);

// 3) Crediário de parcela única: receber em duas vezes, a segunda com juros.
const v2 = await venda(1, null);
const cpr = await um(`select id, valor from contas_a_pagar_receber where referencia_venda_id = $1`, [v2.venda_id]);
await q(`select receber_conta($1, 20, '2026-10-01', $2)`, [cpr.id, caixa]);
let r = await um(`select status, valor_pago from contas_a_pagar_receber where id = $1`, [cpr.id]);
confere("recebeu 20 de 50: segue pendente", r.status === "pendente" && Number(r.valor_pago) === 20);
await q(`select receber_conta($1, 31, '2026-10-05', $2)`, [cpr.id, caixa]);
r = await um(`select status, valor_pago from contas_a_pagar_receber where id = $1`, [cpr.id]);
const juros = await um(`select valor from movimentacoes_financeiras where referencia_venda_id = $1 and categoria = 'Juros e multa de crediário'`, [v2.venda_id]);
confere("completou com R$ 1 de juros à parte", r.status === "recebido" && Number(r.valor_pago) === 50 && Number(juros?.valor) === 1);
await espera("parcelado não recebe pela conta-pai", async () => {
  const pai = await um(`select id from contas_a_pagar_receber where referencia_venda_id = $1`, [v1.venda_id]);
  if (pai) await q(`select receber_conta($1, 1, null, $2)`, [pai.id, caixa]);
  else throw new Error("receba pelas parcelas (sem conta-pai)");
}, "parcelas");

// 4) Compra com as duplicatas da nota.
const forn = (await um(`insert into fornecedores (user_id, nome) values ($1, 'Atacado') returning id`, [u])).id;
const ped = (await um(`insert into pedidos_compra (user_id, fornecedor_id, valor_total, status) values ($1, $2, 300, 'pendente') returning id`, [u, forn])).id;
await espera("parcelas que não somam o total", () => q(`select gerar_pagamento_compra_parcelas($1, $2::jsonb, $3)`, [ped, JSON.stringify([{ valor: 100, vencimento: "2026-11-01" }]), caixa]), "somam");
await q(`select gerar_pagamento_compra_parcelas($1, $2::jsonb, $3)`, [ped, JSON.stringify([{ valor: 120, vencimento: "2026-11-01" }, { valor: 180, vencimento: "2026-11-20" }]), caixa]);
const dup = await q(`select valor, data_vencimento, parcela_numero, total_parcelas from contas_a_pagar_receber where referencia_pedido_compra_id = $1 order by parcela_numero`, [ped]);
confere("duplicatas com valor e data próprios", dup.length === 2 && Number(dup[1].valor) === 180 && dup[1].data_vencimento.toISOString().slice(0, 10) === "2026-11-20" && dup[1].total_parcelas === 2);

await db.exec(await lerMigracao("0065_crediario_pix_encargos.sql"));
confere("0065 roda 2x sem erro", true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
