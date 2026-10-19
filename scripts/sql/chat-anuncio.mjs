/** Chat do anúncio (0110): ações aplicadas, anexos e exemplo colado. Rode com `npm run test:sql`. */
import { criarBancoDeTeste } from "./banco.mjs";

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

const u = await novoUsuario("chat@e.com");
const outro = await novoUsuario("chat2@e.com");
const produto = (await um(`insert into produtos (user_id, sku, nome) values ($1, 'SKU1', 'Bolsa') returning id`, [u])).id;
const rascunho = (await como(u, `insert into anuncio_rascunhos (produto_id) values ($1) returning id`, [produto]))[0].id;

const msg = (await como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, acoes) values ($1, 'ia', 'Sugiro isto', '[{"tipo":"gerar_titulos"}]') returning id, acoes_feitas, anexos`, [rascunho]))[0];
confere("mensagem nova nasce sem ações feitas e sem anexos", msg.acoes_feitas.length === 0 && Array.isArray(msg.anexos) && msg.anexos.length === 0);

await como(u, `update anuncio_rascunho_mensagens set acoes_feitas = array_append(acoes_feitas, 0) where id = $1`, [msg.id]);
confere("marca a ação como feita", (await como(u, `select acoes_feitas from anuncio_rascunho_mensagens where id = $1`, [msg.id]))[0].acoes_feitas.join() === "0");
await espera("mais de 8 ações feitas é recusado", () => como(u, `update anuncio_rascunho_mensagens set acoes_feitas = '{0,1,2,3,4,5,6,7,8}' where id = $1`, [msg.id]), "violates check");

const anexos = JSON.stringify([{ tipo: "texto", qual: "descricao", deOutraLoja: false, texto: "a".repeat(3000) }, { tipo: "imagem", path: `${u}/estudio-chat-1.jpg` }]);
await como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, anexos) values ($1, 'usuario', 'Olha esta', $2::jsonb)`, [rascunho, anexos]);
confere("grava anexos de texto e imagem", (await como(u, `select count(*)::int n from anuncio_rascunho_mensagens where jsonb_array_length(anexos) = 2`))[0].n === 1);
await espera("anexos que não são lista são recusados", () => como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, anexos) values ($1, 'usuario', 'x', '{}'::jsonb)`, [rascunho]), "violates check");
await espera("mais de 5 anexos é recusado", () => como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, anexos) values ($1, 'usuario', 'x', '[1,2,3,4,5,6]'::jsonb)`, [rascunho]), "violates check");
await espera("anexos grandes demais são recusados", () => como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, anexos) values ($1, 'usuario', 'x', jsonb_build_array(repeat('a', 8100)))`, [rascunho]), "violates check");

const acaoLonga = JSON.stringify([{ tipo: "guardar_exemplo", tipoExemplo: "descricao", texto: "b".repeat(10000) }]);
await como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, acoes) values ($1, 'ia', 'Guardo?', $2::jsonb)`, [rascunho, acaoLonga]);
confere("ações aceitam até 16.000 caracteres", true);
await espera("ações acima de 16.000 caracteres são recusadas", () => como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, acoes) values ($1, 'ia', 'x', jsonb_build_array(repeat('c', 16100)))`, [rascunho]), "violates check");

confere("outra conta não lê a conversa", (await como(outro, `select count(*)::int n from anuncio_rascunho_mensagens`))[0].n === 0);
await como(outro, `update anuncio_rascunho_mensagens set acoes_feitas = '{1}' where id = $1`, [msg.id]);
confere("outra conta não marca ação como feita", (await como(u, `select acoes_feitas from anuncio_rascunho_mensagens where id = $1`, [msg.id]))[0].acoes_feitas.join() === "0");

const perfil = (await como(u, `insert into perfis_marca (nome) values ('Loja') returning id`))[0].id;
await como(u, `insert into marca_exemplos (perfil_id, tipo, origem, texto) values ($1, 'descricao', 'referencia', 'Descrição que o lojista colou no chat.')`, [perfil]);
confere("exemplo com origem 'referencia' é aceito", (await como(u, `select count(*)::int n from marca_exemplos where origem = 'referencia'`))[0].n === 1);
await espera("origem desconhecida continua recusada", () => como(u, `insert into marca_exemplos (perfil_id, tipo, origem, texto) values ($1, 'titulo', 'ia', 'texto qualquer aqui')`, [perfil]), "violates check");

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
