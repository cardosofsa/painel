/** Insumos/embalagem próprios da variação (0094): custo, motor de kit, validação, isolamento. Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('vi@v.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('vi2@v.com') returning id`)).id;
for (const id of [u, outro])
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
    await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
  }
};
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);

const pai = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'BCO', 'Bainha', 10, 30, 100) returning id`, [u])).id;
const caixa = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque) values ($1, 'CX-G', 'Caixa grande', 2, 0, 50) returning id`, [u])).id;
const alheio = (await um(`insert into produtos (user_id, sku, nome, custo_base, estoque) values ($1, 'ALHEIO', 'Alheio', 1, 9) returning id`, [outro])).id;
await como(u, `select salvar_variacoes_produto($1, $2::jsonb)`, [pai, JSON.stringify([{ variante_nome: "Kit 2", quantidade: 2, sku: "BCO-K2", preco_venda: 55 }, { variante_nome: "Kit 12", quantidade: 12, sku: "BCO-K12", preco_venda: 300 }])]);
const fil = (sku) => um(`select * from produtos where sku = $1 and user_id = $2`, [sku, u]);
const k2 = await fil("BCO-K2");
const k12 = await fil("BCO-K12");

confere("coluna nova nasce vazia e o custo continua pai × N (20 e 120)", JSON.stringify(k2.insumos_variacao) === "[]" && Number(k2.custo) === 20 && Number(k12.custo) === 120);

// Embalagem só custo (sem produtoId) no Kit 12: 3 × 1,50.
const emb = [{ id: "e1", nome: "Plástico bolha", quantidade: 3, custoUnitario: 1.5 }];
await q(`update produtos set insumos_variacao = $2::jsonb where id = $1`, [k12.id, JSON.stringify(emb)]);
let a = await fil("BCO-K12");
confere("custo = pai × N + extras (120 + 4,50 = 124,50)", Number(a.custo) === 124.5, String(a.custo));
confere("insumos = [pai × N] || extras", a.insumos.length === 2 && a.insumos[0].produtoId === pai && a.insumos[1].nome === "Plástico bolha");
confere("o Kit 2 não muda", Number((await fil("BCO-K2")).custo) === 20);

// custo do pai muda → o extra continua somado.
await q(`update produtos set custo_base = 11 where id = $1`, [pai]);
a = await fil("BCO-K12");
confere("pai mudou custo (11): kit 12 = 132 + 4,50", Number(a.custo) === 136.5, String(a.custo));

// Custo próprio prevalece como total.
await q(`update produtos set custo_manual = 99 where id = $1`, [k12.id]);
confere("custo próprio prevalece sobre a composição", Number((await fil("BCO-K12")).custo) === 99);
await q(`update produtos set custo_manual = null where id = $1`, [k12.id]);

// Extra com produtoId (caixa em estoque): entra no motor de kit.
await q(`update produtos set insumos_variacao = $2::jsonb where id = $1`, [k12.id, JSON.stringify([{ id: "e2", nome: "Caixa grande", quantidade: 1, custoUnitario: 2, produtoId: caixa }])]);
a = await fil("BCO-K12");
confere("estoque do kit 12 = min(pai 100 ÷ 12 = 8, caixa 50 ÷ 1) = 8", a.estoque === 8, String(a.estoque));
await q(`update produtos set estoque = 3 where id = $1`, [caixa]);
confere("caixa acaba → o kit 12 cai junto (3)", (await fil("BCO-K12")).estoque === 3);
await q(`update produtos set estoque = 50 where id = $1`, [caixa]);

const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
await um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'paga', p_conta_id => $2, p_forma_pagamento => 'Pix', p_valor_entrega => 0, p_reservar => false)`, [JSON.stringify([{ produto_id: k12.id, quantidade: 2, preco_unitario: 300 }]), conta]);
const depois = await um(`select (select estoque from produtos where id = $1) pai, (select estoque from produtos where id = $2) cx`, [pai, caixa]);
confere("vender 2 kits 12 baixa 24 do pai e 2 da caixa", depois.pai === 76 && depois.cx === 48, JSON.stringify(depois));

// Dimensões são colunas comuns do filho.
await q(`update produtos set peso_g = 850, altura_cm = 12, largura_cm = 20, comprimento_cm = 30 where id = $1`, [k12.id]);
const d = await fil("BCO-K12");
confere("dimensões da variação gravam e ficam", d.peso_g === 850 && Number(d.altura_cm) === 12);

// Validação no banco.
await espera("composição que não é lista é recusada", () => q(`update produtos set insumos_variacao = '{"a":1}'::jsonb where id = $1`, [k2.id]), "no máximo 30");
await espera("item sem custo é recusado", () => q(`update produtos set insumos_variacao = '[{"nome":"x","quantidade":1}]'::jsonb where id = $1`, [k2.id]), "Item inválido");
await espera("quantidade negativa é recusada", () => q(`update produtos set insumos_variacao = '[{"nome":"x","quantidade":-1,"custoUnitario":1}]'::jsonb where id = $1`, [k2.id]), "Item inválido");
await espera("mais de 30 itens é recusado", () => q(`update produtos set insumos_variacao = (select jsonb_agg(jsonb_build_object('nome','i','quantidade',1,'custoUnitario',1)) from generate_series(1,31)) where id = $1`, [k2.id]), "no máximo 30");
await espera("usar o produto principal na composição é recusado", () => q(`update produtos set insumos_variacao = $2::jsonb where id = $1`, [k2.id, JSON.stringify([{ nome: "pai", quantidade: 1, custoUnitario: 1, produtoId: pai }])]), "próprio produto principal");
await espera("produto de OUTRA conta na composição é recusado", () => q(`update produtos set insumos_variacao = $2::jsonb where id = $1`, [k2.id, JSON.stringify([{ nome: "x", quantidade: 1, custoUnitario: 1, produtoId: alheio }])]), "não encontrado");
confere("a recusa não alterou o Kit 2", JSON.stringify((await fil("BCO-K2")).insumos_variacao) === "[]");

// Salvar variações em lote não apaga a composição.
await como(u, `select salvar_variacoes_produto($1, $2::jsonb)`, [pai, JSON.stringify([{ id: k2.id, variante_nome: "Kit 2", quantidade: 2, sku: "BCO-K2", preco_venda: 56 }, { id: k12.id, variante_nome: "Kit 12", quantidade: 12, sku: "BCO-K12", preco_venda: 310 }])]);
confere("salvar em lote preserva a composição do kit 12", (await fil("BCO-K12")).insumos_variacao.length === 1 && Number((await fil("BCO-K12")).preco_venda) === 310);

// Isolamento: outra conta não edita a variação.
const alterou = await como(outro, `update produtos set insumos_variacao = '[]'::jsonb where id = $1 returning id`, [k12.id]);
confere("outra conta não altera a variação", alterou.length === 0);

await db.exec(await lerMigracao("0094_variacao_insumos_proprios.sql"));
confere("0094 roda 2x e mantém a composição", (await fil("BCO-K12")).insumos_variacao.length === 1);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
