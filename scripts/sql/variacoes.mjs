/** Produto pai com variações filhas (0084), de ponta a ponta. Rode com `npm run test:sql`. */
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

const u = (await um(`insert into auth.users (email) values ('v@v.com') returning id`)).id;
const outro = (await um(`insert into auth.users (email) values ('v2@v.com') returning id`)).id;
for (const id of [u, outro])
  await q(`insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`, [id]);
await db.exec(
  `grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`,
);
const como = async (id, sql, p = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ""}', false)`);
  await db.exec(`set role authenticated`);
  try {
    return (await db.query(sql, p)).rows;
  } finally {
    await db.exec(`reset role`);
    await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
  }
};
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);

const cat = (await um(`insert into categorias (user_id, nome) values ($1, 'Bike') returning id`, [u])).id;
const pai = (await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque, categoria_id, imagem_url) values ($1, 'FITA', 'Fita de guidão', 4, 15, 200, $2, 'https://x/fita.jpg') returning id`, [u, cat])).id;

// Cria as variações pela RPC (como a tela faz).
const salvar = (lista) => como(u, `select salvar_variacoes_produto($1, $2::jsonb) r`, [pai, JSON.stringify(lista)]);
let r = (await salvar([
  { variante_nome: "Kit 2", quantidade: 2, sku: "FITA-K2", preco_venda: 28 },
  { variante_nome: "Kit 3", quantidade: 3, sku: "FITA-K3", preco_venda: 40 },
  { variante_nome: "Kit 4", quantidade: 4, sku: "FITA-K4", preco_venda: 50, custo_manual: 14.5 },
]))[0].r;
confere("RPC cria 3 variações", r.novas === 3, JSON.stringify(r));

const est = async () => Object.fromEntries((await q(`select sku, estoque from produtos where id = $1 or produto_pai_id = $1`, [pai])).map((x) => [x.sku, x.estoque]));
const fil = async (sku) => um(`select * from produtos where sku = $1 and user_id = $2`, [sku, u]);

let e = await est();
confere("estoque derivado: 200 → kit2 100, kit3 66, kit4 50", e.FITA === 200 && e["FITA-K2"] === 100 && e["FITA-K3"] === 66 && e["FITA-K4"] === 50, JSON.stringify(e));

const k2 = await fil("FITA-K2");
const k3 = await fil("FITA-K3");
const k4 = await fil("FITA-K4");
confere("filho herda nome, categoria e foto do pai", k3.nome === "Fita de guidão" && k3.categoria_id === cat && k3.imagem_url === "https://x/fita.jpg" && k3.e_kit, JSON.stringify({ nome: k3.nome, e_kit: k3.e_kit }));
confere("custo padrão = custo do pai × N (4 × 3 = 12)", Number(k3.custo) === 12 && Number(k2.custo) === 8, `${k3.custo} / ${k2.custo}`);
confere("custo com override (kit 4 = 14,50)", Number(k4.custo) === 14.5, String(k4.custo));
confere("filho não ocupa armazém", (await um(`select count(*)::int n from estoque_armazem where produto_id = any($1::uuid[]) and quantidade > 0`, [[k2.id, k3.id, k4.id]])).n === 0);

await q(`update produtos set custo_base = 5, nome = 'Fita guidão' where id = $1`, [pai]);
confere("pai mudou custo e nome → filhos acompanham (kit 3 = 15; override fica)", Number((await fil("FITA-K3")).custo) === 15 && Number((await fil("FITA-K4")).custo) === 14.5 && (await fil("FITA-K2")).nome === "Fita guidão");

// Venda no PDV de 1 un. do kit 3 baixa 3 do pai.
const conta = (await um(`insert into contas (user_id, nome, saldo) values ($1, 'Caixa', 0) returning id`, [u])).id;
const venda = (prod, qtd, reservar = false) =>
  um(`select * from registrar_venda(p_itens => $1::jsonb, p_status => 'paga', p_conta_id => $2, p_forma_pagamento => 'Pix', p_valor_entrega => 0, p_reservar => $3)`, [
    JSON.stringify([{ produto_id: prod, quantidade: qtd, preco_unitario: 40 }]),
    conta,
    reservar,
  ]);
const v1 = await venda(k3.id, 1);
e = await est();
confere("venda de 1 kit 3 baixa 3 do pai (197; kit2 98, kit3 65, kit4 49)", e.FITA === 197 && e["FITA-K2"] === 98 && e["FITA-K3"] === 65 && e["FITA-K4"] === 49, JSON.stringify(e));
const mov = await um(`select quantidade, tipo from estoque_movimentacoes where produto_id = $1 order by data_movimentacao desc limit 1`, [pai]);
confere("movimentação de saída registrada no pai", mov?.tipo === "saida" && mov?.quantidade === 3, JSON.stringify(mov));

await um(`select cancelar_venda($1)`, [v1.venda_id]);
e = await est();
confere("cancelar devolve ao pai (200)", e.FITA === 200 && e["FITA-K3"] === 66, JSON.stringify(e));

// Reserva (esteira): reservar 2 kits 4 reserva 8 do pai.
const v2 = await venda(k4.id, 2, true);
const res = await q(`select produto_id, quantidade from estoque_reservas where venda_id = $1`, [v2.venda_id]);
e = await est();
confere("reserva do filho vira reserva do pai (8), filhos caem pelo disponível", res.length === 1 && res[0].produto_id === pai && res[0].quantidade === 8 && e.FITA === 200 && e["FITA-K2"] === 96, JSON.stringify({ res, e }));
await um(`select cancelar_venda($1)`, [v2.venda_id]);
e = await est();
confere("cancelar a reserva libera (kit2 volta a 100)", e.FITA === 200 && e["FITA-K2"] === 100, JSON.stringify(e));

// Marketplace: pedido com o filho já resolvido pelo vínculo → baixa N do pai; cancelado estorna.
const canal = (await um(`insert into canais (user_id, nome, tipo_taxa, icone, cor) values ($1, 'Shopee', 'faixas', 'ShoppingBag', '#EE4D2D') returning id`, [u])).id;
const loja = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Loja') returning id`, [u, canal])).id;
const ped = (numero, status, original, item) =>
  JSON.stringify([{ numero, status, status_original: original, criado_em: new Date().toISOString(), pago_em: null, comprador: "x", cidade: null, uf: "SP", rastreio: null, subtotal: 28, desconto_vendedor: 0, cupom_vendedor: 0, comissao: 2, taxa_servico: 1, taxa_transacao: 0, frete_comprador: 0, repasse: 25, custo: 0, imposto: 0, lucro: 0, custo_incompleto: false, itens: [item] }]);
const itemK2 = { produto_id: k2.id, sku: null, sku_principal: "FITA", nome: "Fita", variacao: "Kit 2", quantidade: 1, preco_unitario: 28, custo_unitario: 10 };
await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, ped("MKT-V1", "a_enviar", "PROCESSED", itemK2)]);
e = await est();
confere("pedido Shopee de 1 kit 2 baixa 2 do pai (198)", e.FITA === 198 && e["FITA-K2"] === 99, JSON.stringify(e));
await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, ped("MKT-V1", "cancelado", "CANCELLED", itemK2)]);
e = await est();
confere("pedido Shopee cancelado devolve ao pai (200)", e.FITA === 200, JSON.stringify(e));

// Vínculo depois do pedido, pela chave da variação (anúncio sem SKU por variação).
const chave = (await um(`select chave_item_marketplace(null, 'FITA', 'Fita', 'Kit 3') c`)).c;
confere("chave da variação sem SKU próprio = 'FITA · Kit 3'", chave === "FITA · Kit 3", chave);
confere("chave normaliza 'Azul,P' → 'Azul · P'", (await um(`select chave_item_marketplace('', 'X', 'n', 'Azul,P') c`)).c === "X · Azul · P");
const itemSem = { produto_id: null, sku: null, sku_principal: "FITA", nome: "Fita", variacao: "Kit 3", quantidade: 2, preco_unitario: 40, custo_unitario: null };
const itemOutra = { ...itemSem, variacao: "Kit 2", quantidade: 1 };
await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, ped("MKT-V2", "a_enviar", "PROCESSED", itemSem)]);
await um(`select importar_pedidos_marketplace($1, $2::jsonb)`, [loja, ped("MKT-V3", "a_enviar", "PROCESSED", itemOutra)]);
const rv = await um(`select revincular_itens_marketplace($1, $2, $3, 0) r`, [loja, "FITA · Kit 3", k3.id]);
e = await est();
const semVinc = await um(`select count(*)::int n from pedidos_marketplace_itens where produto_id is null`);
confere("vincular a variação 'Kit 3' baixa 2 × 3 = 6 do pai e não pega a 'Kit 2'", rv.r.pedidos === 1 && e.FITA === 194 && semVinc.n === 1, JSON.stringify({ r: rv.r, e, semVinc }));
confere("vínculo gravado pela chave da variação", (await um(`select count(*)::int n from marketplace_vinculos where sku_externo = 'FITA · Kit 3' and produto_id = $1`, [k3.id])).n === 1);

// Mudar N recalcula o filho.
r = (await salvar([
  { id: k2.id, variante_nome: "Kit 2", quantidade: 2, sku: "FITA-K2", preco_venda: 28 },
  { id: k3.id, variante_nome: "Kit 3", quantidade: 3, sku: "FITA-K3", preco_venda: 40 },
  { id: k4.id, variante_nome: "Kit 12", quantidade: 12, sku: "FITA-K12", preco_venda: 120 },
]))[0].r;
e = await est();
confere("editar N (4 → 12) recalcula: 194/12 = 16", r.atualizadas === 3 && e["FITA-K12"] === 16, JSON.stringify(e));
confere("custo padrão some quando o override é apagado (5 × 12 = 60)", Number((await fil("FITA-K12")).custo) === 60);

// Regras.
await espera("variação de variação é recusada", () => q(`insert into produtos (user_id, sku, nome, produto_pai_id, quantidade_por_unidade) values ($1, 'Z', 'z', $2, 2)`, [u, k2.id]), "não pode ter variações");
await espera("pai com variações não vira kit", () => q(`update produtos set e_kit = true where id = $1`, [pai]), "não pode virar kit");
await espera("variação não vira produto avulso", () => q(`update produtos set produto_pai_id = null where id = $1`, [k2.id]), "avulso");
await espera("SKU vazio é recusado", () => salvar([{ variante_nome: "A", quantidade: 2, sku: "", preco_venda: 1 }]), "SKU");
await espera("nome repetido é recusado", () => salvar([{ variante_nome: "A", quantidade: 2, sku: "A1" }, { variante_nome: "a", quantidade: 3, sku: "A2" }]), "mesmo nome");

// RLS entre contas.
const alheioPai = (await um(`insert into produtos (user_id, sku, nome, custo_base, estoque) values ($1, 'ALHEIO', 'Alheio', 1, 50) returning id`, [outro])).id;
confere("outra conta não vê as variações", (await como(outro, `select count(*)::int n from produtos where produto_pai_id = $1`, [pai]))[0].n === 0);
await espera("outra conta não grava variações no meu pai", () => como(outro, `select salvar_variacoes_produto($1, '[]'::jsonb)`, [pai]), "não encontrado");
await espera(
  "variação apontando para pai de outra conta é recusada",
  () => como(u, `insert into produtos (sku, nome, produto_pai_id, quantidade_por_unidade) values ('ROUBO', 'x', $1, 2)`, [alheioPai]),
  "pai não encontrado",
);
confere("tentativa não mexeu no estoque alheio", (await um(`select estoque from produtos where id = $1`, [alheioPai])).estoque === 50);

// Vitrine: filho não aparece e não entra em pedido.
await q(`insert into catalogos (user_id, nome, slug) values ($1, 'Loja', 'loja-var')`, [u]);
const vitrine = await como(null, `select produto_id from obter_catalogo_publico('loja-var')`);
const ids = vitrine.map((x) => x.produto_id);
confere("vitrine mostra o pai e nenhum filho", ids.includes(pai) && !ids.includes(k2.id) && !ids.includes(k3.id), `${ids.length} produto(s)`);
await espera(
  "pedido da vitrine com variação filha é recusado",
  () => q(`select * from criar_pedido_vitrine(p_slug => 'loja-var', p_itens => $1::jsonb, p_nome => 'Ana', p_whatsapp => '11999999999', p_observacao => null, p_idempotencia => gen_random_uuid())`, [JSON.stringify([{ produto_id: k2.id, quantidade: 1 }])]),
  "saíram do catálogo",
);

// Remover a variação da lista apaga só ela; o pai fica.
r = (await salvar([{ id: k2.id, variante_nome: "Kit 2", quantidade: 2, sku: "FITA-K2", preco_venda: 28 }]))[0].r;
e = await est();
confere("tirar variações da lista remove só elas", r.removidas === 2 && Object.keys(e).length === 2 && e.FITA === 194, JSON.stringify(e));

// Idempotência.
await db.exec(await lerMigracao("0084_produto_pai_variacoes.sql"));
await db.exec(await lerMigracao("0084_produto_pai_variacoes.sql"));
e = await est();
confere("0084 roda 2x sem erro e sem mexer no estoque", e.FITA === 194 && e["FITA-K2"] === 97, JSON.stringify(e));

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo");
process.exitCode = falhas ? 1 : 0;
