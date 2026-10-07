/**
 * Pedido da vitrine pública (criar_pedido_vitrine — 0027, refeita na 0033): é a única escrita
 * anônima do sistema, então as travas moram todas no banco. Confere pedido válido, preço vindo
 * do banco (nunca do navegador), intervalo de 10 s, limite diário, catálogo inativo, conta
 * suspensa e item sem estoque/inativo/sem preço. Rode com `npm run test:sql`.
 */
import { criarBancoDeTeste, lerMigracao } from "./banco.mjs";

const db = await criarBancoDeTeste();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const um = async (sql, p = []) => (await q(sql, p))[0];
let falhas = 0;
const confere = (nome, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!ok) falhas++;
};

const u = (await um(`insert into auth.users (email) values ('vit@c.com') returning id`)).id;
await q(
  `insert into perfis_acesso (user_id, email, papel, status, abas) values ($1, 'x', 'usuario', 'ativo', '{}') on conflict (user_id) do update set status = 'ativo'`,
  [u],
);
await db.exec(`select set_config('request.jwt.claim.sub', '${u}', false)`);
const cat = (await um(`insert into catalogos (user_id, nome, slug) values ($1, 'Loja', 'loja-vit') returning id`, [u])).id;
const prod = async (sku, extra = {}) =>
  (
    await um(`insert into produtos (user_id, sku, nome, custo_base, preco_venda, estoque, ativo) values ($1, $2, $2, 1, $3, $4, $5) returning id`, [
      u,
      sku,
      extra.preco ?? 25.5,
      extra.estoque ?? 5,
      extra.ativo ?? true,
    ])
  ).id;
const caneca = await prod("CANECA");
const semEstoque = await prod("TAMPA", { estoque: 0 });
const inativo = await prod("PIRES", { ativo: false });
const consultar = await prod("COLHER", { preco: 0 });
await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
await db.exec(`grant usage on schema public to anon`);

/** Chama a RPC como `anon` (como a vitrine faz). Devolve { linha } ou { erro }. */
const pedir = async (itens, extra = {}) => {
  await db.exec(`set role anon`);
  try {
    const r = await um(`select * from criar_pedido_vitrine($1, $2::jsonb, $3, $4, null, $5::uuid)`, [
      extra.slug ?? "loja-vit",
      JSON.stringify(itens),
      extra.nome ?? "Smoke Test",
      extra.zap ?? "(11) 98888-7777",
      extra.idem ?? crypto.randomUUID(),
    ]);
    return { linha: r };
  } catch (e) {
    return { erro: e.message };
  } finally {
    await db.exec(`reset role`);
  }
};
/** Libera a trava de 10 s (como se o tempo tivesse passado). */
const esperar10s = () => q(`update pedidos_vitrine_cota set ultimo_em = now() - interval '11 seconds' where catalogo_id = $1`, [cat]);
const cotaDoDia = async () => (await um(`select no_dia from pedidos_vitrine_cota where catalogo_id = $1`, [cat])).no_dia;

// 1) Pedido válido, com preço forjado pelo cliente.
const idem = crypto.randomUUID();
const ok = await pedir([{ produto_id: caneca, quantidade: 2, preco_unitario: 0.01, preco: 0.01 }], { idem });
confere("pedido válido é aceito", !!ok.linha, ok.erro);
confere("devolve só número e total", ok.linha && Object.keys(ok.linha).sort().join() === "numero,total", JSON.stringify(ok.linha));
confere("total usa o preço do banco (2 × 25,50), não o do cliente", ok.linha && Number(ok.linha.total) === 51, String(ok.linha?.total));
const item = await um(
  `select i.preco_unitario, i.quantidade from pedidos_vitrine_itens i join pedidos_vitrine p on p.id = i.pedido_id where p.idempotencia = $1`,
  [idem],
);
confere("item gravado com preço do banco", item && Number(item.preco_unitario) === 25.5 && item.quantidade === 2, JSON.stringify(item));
const ped = await um(`select user_id, status, cliente_whatsapp from pedidos_vitrine where idempotencia = $1`, [idem]);
confere(
  "pedido nasce pendente, do dono do catálogo, WhatsApp só com dígitos",
  ped?.user_id === u && ped?.status === "pendente" && ped?.cliente_whatsapp === "11988887777",
  JSON.stringify(ped),
);

// 2) Idempotência: reenviar a mesma chave devolve o mesmo pedido, sem gastar cota.
const repetido = await pedir([{ produto_id: caneca, quantidade: 2 }], { idem });
confere("mesma chave devolve o mesmo pedido", repetido.linha?.numero === ok.linha?.numero, repetido.erro);
confere("reenvio não duplica", Number((await um(`select count(*) n from pedidos_vitrine where catalogo_id = $1`, [cat])).n) === 1);

// 3) Intervalo de 10 s entre pedidos do mesmo catálogo.
const rapido = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("segundo pedido em menos de 10 s é recusado", /Muitos pedidos/.test(rapido.erro ?? ""), rapido.erro);
await esperar10s();
const depois = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("passados 10 s, aceita de novo", !!depois.linha, depois.erro);

// 4) Limite diário (300 por catálogo), que zera no dia seguinte.
await q(`update pedidos_vitrine_cota set no_dia = 300, ultimo_em = now() - interval '1 minute' where catalogo_id = $1`, [cat]);
const estourou = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("limite diário recusa o 301º", /Muitos pedidos/.test(estourou.erro ?? ""), estourou.erro);
await q(`update pedidos_vitrine_cota set dia = dia - 1 where catalogo_id = $1`, [cat]);
const outroDia = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("no dia seguinte a cota zera", !!outroDia.linha, outroDia.erro);
confere("contador recomeça em 1", (await cotaDoDia()) === 1);

// 5) Itens não elegíveis — e a recusa não gasta a cota (o insert da cota é desfeito junto).
const recusas = [
  ["sem estoque", [{ produto_id: semEstoque, quantidade: 1 }], /saíram do catálogo/],
  ["inativo", [{ produto_id: inativo, quantidade: 1 }], /saíram do catálogo/],
  ["de outra conta/inexistente", [{ produto_id: crypto.randomUUID(), quantidade: 1 }], /saíram do catálogo/],
  ["preço zero (Consultar)", [{ produto_id: consultar, quantidade: 1 }], /sem preço/],
  [
    "misturado com um válido",
    [
      { produto_id: caneca, quantidade: 1 },
      { produto_id: semEstoque, quantidade: 1 },
    ],
    /saíram do catálogo/,
  ],
  ["quantidade 0", [{ produto_id: caneca, quantidade: 0 }], /Quantidade inválida/],
  ["quantidade 100", [{ produto_id: caneca, quantidade: 100 }], /Quantidade inválida/],
  ["carrinho vazio", [], /carrinho está vazio/],
];
for (const [nome, itens, re] of recusas) {
  await esperar10s();
  const r = await pedir(itens);
  confere(`item ${nome} é recusado`, re.test(r.erro ?? ""), r.erro ?? "aceitou");
}
confere("recusas não gastaram a cota", (await cotaDoDia()) === 1);
await esperar10s();
const nomeVazio = await pedir([{ produto_id: caneca, quantidade: 1 }], { nome: "  " });
confere("nome vazio é recusado", /Informe seu nome/.test(nomeVazio.erro ?? ""), nomeVazio.erro);
const zapRuim = await pedir([{ produto_id: caneca, quantidade: 1 }], { zap: "123" });
confere("WhatsApp inválido é recusado", /WhatsApp/.test(zapRuim.erro ?? ""), zapRuim.erro);
const estoque = (await um(`select estoque from produtos where id = $1`, [caneca])).estoque;
confere("pedido da vitrine não mexe no estoque (só ao aprovar)", Number(estoque) === 5, String(estoque));

// 6) Catálogo inativo, slug inexistente e conta suspensa/vencida: mesma mensagem.
await q(`update catalogos set ativo = false where id = $1`, [cat]);
const inat = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("catálogo inativo recusa", /não está disponível/.test(inat.erro ?? ""), inat.erro);
await q(`update catalogos set ativo = true where id = $1`, [cat]);
const semSlug = await pedir([{ produto_id: caneca, quantidade: 1 }], { slug: "nao-existe" });
confere("slug inexistente recusa com a mesma mensagem", /não está disponível/.test(semSlug.erro ?? ""), semSlug.erro);
await q(`update perfis_acesso set status = 'suspenso' where user_id = $1`, [u]);
const susp = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("conta suspensa recusa", /não está disponível/.test(susp.erro ?? ""), susp.erro);
await q(`update perfis_acesso set status = 'ativo', expira_em = current_date - 1 where user_id = $1`, [u]);
const venc = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("conta vencida recusa", /não está disponível/.test(venc.erro ?? ""), venc.erro);
await q(`update perfis_acesso set expira_em = null where user_id = $1`, [u]);
await esperar10s();
const volta = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("reativada, volta a aceitar", !!volta.linha, volta.erro);

// 7) anon não lê as tabelas cruas.
await db.exec(`set role anon`);
let bloqueado = false;
try {
  const linhas = await q(`select * from pedidos_vitrine`);
  bloqueado = linhas.length === 0;
} catch {
  bloqueado = true;
}
await db.exec(`reset role`);
confere("anon não lê pedidos_vitrine direto", bloqueado);

// 8) A migração que define a RPC atual roda de novo por cima (idempotência), e a 0081 também.
// (A 0077 não é mais reaplicável por cima da 0081, que troca a assinatura de definir_pin_admin;
// o EXECUTE por papel dela é coberto por seguranca-0077.mjs, num banco anterior à 0081.)
for (let i = 0; i < 2; i++) await db.exec(await lerMigracao("0033_atacado_catalogo_consultar_endereco.sql"));
await db.exec(await lerMigracao("0081_pin_segredo_conta_ativa.sql"));
await esperar10s();
const deNovo = await pedir([{ produto_id: caneca, quantidade: 1 }]);
confere("0033 2x + 0081: RPC continua chamável por anon", !!deNovo.linha, deNovo.erro);

if (falhas) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nPedido da vitrine: tudo certo.");
