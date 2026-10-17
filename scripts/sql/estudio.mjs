/** Estúdio de anúncios (0099): rascunhos e conversa isolados por conta, vínculos e tipos de IA novos. Rode com `npm run test:sql`. */
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

const u = await novoUsuario("estudio@e.com");
const outro = await novoUsuario("estudio2@e.com");
const produto = (await um(`insert into produtos (user_id, sku, nome) values ($1, 'SKU1', 'Bolsa') returning id`, [u])).id;
const produtoO = (await um(`insert into produtos (user_id, sku, nome) values ($1, 'SKU9', 'Dele') returning id`, [outro])).id;
const perfil = (await como(u, `insert into perfis_marca (nome) values ('Loja 1') returning id`))[0].id;
const perfilO = (await como(outro, `insert into perfis_marca (nome) values ('Dele') returning id`))[0].id;

const rasc = (await como(u, `insert into anuncio_rascunhos (produto_id, perfil_id, titulo, estado) values ($1, $2, 'Bolsa de Couro', '{"numeroImagens": 6}'::jsonb) returning id`, [produto, perfil]))[0].id;
confere("cria o rascunho com user_id da sessão e status padrão", (await como(u, `select status from anuncio_rascunhos where id = $1`, [rasc]))[0].status === "rascunho");
confere("outra conta não enxerga o rascunho", (await como(outro, `select count(*)::int n from anuncio_rascunhos`))[0].n === 0);
await espera("rascunho com produto de outra conta é recusado", () => como(u, `insert into anuncio_rascunhos (produto_id) values ($1)`, [produtoO]));
await espera("rascunho com perfil de outra conta é recusado", () => como(u, `insert into anuncio_rascunhos (produto_id, perfil_id) values ($1, $2)`, [produto, perfilO]));
await espera("não cria rascunho em nome de outra conta", () => como(u, `insert into anuncio_rascunhos (user_id, produto_id) values ($1, $2)`, [outro, produto]), "row-level security");
await espera("não reatribui o rascunho para outra conta", () => como(u, `update anuncio_rascunhos set user_id = $1 where id = $2`, [outro, rasc]), "row-level security");
await espera("status inválido é recusado", () => como(u, `update anuncio_rascunhos set status = 'publicado_demais' where id = $1`, [rasc]), "violates check");
await espera("estado que não é objeto é recusado", () => como(u, `update anuncio_rascunhos set estado = '[1]'::jsonb where id = $1`, [rasc]), "violates check");
await espera("estado grande demais é recusado", () => como(u, `update anuncio_rascunhos set estado = jsonb_build_object('x', repeat('a', 61000)) where id = $1`, [rasc]), "violates check");

// Conversa
await como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, acoes) values ($1, 'usuario', 'quero 6 imagens', '[]'::jsonb)`, [rasc]);
await como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, acoes) values ($1, 'ia', 'Combinado.', '[{"tipo":"definir_numero_imagens","n":6}]'::jsonb)`, [rasc]);
confere("a conversa fica guardada na ordem", (await como(u, `select papel from anuncio_rascunho_mensagens where rascunho_id = $1 order by criado_em, papel desc`, [rasc])).length === 2);
confere("outra conta não lê a conversa", (await como(outro, `select count(*)::int n from anuncio_rascunho_mensagens`))[0].n === 0);
await espera("mensagem em rascunho de outra conta é recusada", () => como(outro, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto) values ($1, 'usuario', 'invasão')`, [rasc]));
await espera("papel inválido é recusado", () => como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto) values ($1, 'sistema', 'x')`, [rasc]), "violates check");
await espera("mensagem vazia é recusada", () => como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto) values ($1, 'usuario', '   ')`, [rasc]), "violates check");
await espera("ações que não são lista são recusadas", () => como(u, `insert into anuncio_rascunho_mensagens (rascunho_id, papel, texto, acoes) values ($1, 'ia', 'x', '{}'::jsonb)`, [rasc]), "violates check");

// Apagar o produto leva o rascunho e a conversa; apagar o perfil só solta o vínculo.
await como(u, `delete from perfis_marca where id = $1`, [perfil]);
confere("apagar o perfil mantém o rascunho, sem perfil", (await como(u, `select perfil_id from anuncio_rascunhos where id = $1`, [rasc]))[0].perfil_id === null);

// Tipos de IA
for (const tipo of ["concorrentes", "assistente", "consultor", "titulo"]) {
  const ok = await como(u, `select ia_guardar_sugestao($1, 'h1', '{}', '{}', null)`, [tipo]).then(() => true, () => false);
  confere(`ia_guardar_sugestao aceita o tipo '${tipo}'`, ok);
}
confere("ia_buscar_sugestao devolve o que foi guardado para o tipo novo", (await como(u, `select texto from ia_buscar_sugestao('concorrentes', 'h1')`)).length === 1);
await espera("tipo de IA desconhecido continua recusado", () => como(u, `select ia_guardar_sugestao('qualquer', 'h2', '{}', '{}', null)`), "Tipo de geração inválido");
await espera("ia_consumir recusa tipo desconhecido", () => como(u, `select * from ia_consumir('qualquer', 'sistema')`), "Tipo de geração inválido");

await como(u, `delete from produtos where id = $1`, [produto]).catch(() => {});
await q(`delete from produtos where id = $1`, [produto]);
confere("apagar o produto apaga o rascunho e a conversa", (await q(`select (select count(*) from anuncio_rascunhos where id = $1)::int r, (select count(*) from anuncio_rascunho_mensagens where rascunho_id = $1)::int m`, [rasc]))[0].r === 0);

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
