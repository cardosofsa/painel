/** Instruções de base e exemplos da marca (0109). Rode com `npm run test:sql`. */
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

const u = await novoUsuario("exemplos@e.com");
const outro = await novoUsuario("exemplos2@e.com");
const perfil = (await como(u, `insert into perfis_marca (nome) values ('Loja Chá') returning id, instrucoes_titulo, instrucoes_descricao`))[0];
confere("perfil novo nasce sem instruções", perfil.instrucoes_titulo === null && perfil.instrucoes_descricao === null);

await como(u, `update perfis_marca set instrucoes_titulo = 'Comece pelo nome do chá', instrucoes_descricao = 'Tom acolhedor, frases curtas' where id = $1`, [perfil.id]);
const lido = (await como(u, `select instrucoes_titulo, instrucoes_descricao from perfis_marca where id = $1`, [perfil.id]))[0];
confere("grava as instruções", lido.instrucoes_titulo.startsWith("Comece") && lido.instrucoes_descricao.startsWith("Tom"));
await espera("instrução acima de 2.000 caracteres é recusada", () => como(u, `update perfis_marca set instrucoes_descricao = repeat('a', 2001) where id = $1`, [perfil.id]), "violates check");

const ex = (await como(u, `insert into marca_exemplos (perfil_id, tipo, origem, texto, texto_ia) values ($1, 'descricao', 'edicao', 'Chá de camomila para o fim do dia.', 'Texto da IA') returning id, ativo`, [perfil.id]))[0];
confere("grava exemplo de edição, ativo", !!ex.id && ex.ativo === true);
await como(u, `insert into marca_exemplos (perfil_id, tipo, origem, texto, referencia) values ($1, 'titulo', 'loja', 'Chá de Camomila 100g Flores Secas', '12345')`, [perfil.id]);
await espera("tipo desconhecido é recusado", () => como(u, `insert into marca_exemplos (perfil_id, tipo, origem, texto) values ($1, 'capa', 'loja', 'texto qualquer aqui')`, [perfil.id]), "violates check");
await espera("origem desconhecida é recusada", () => como(u, `insert into marca_exemplos (perfil_id, tipo, origem, texto) values ($1, 'titulo', 'ia', 'texto qualquer aqui')`, [perfil.id]), "violates check");
await espera("texto curto demais é recusado", () => como(u, `insert into marca_exemplos (perfil_id, tipo, origem, texto) values ($1, 'titulo', 'loja', 'curto')`, [perfil.id]), "violates check");

confere("outra conta não vê os exemplos", (await como(outro, `select count(*)::int n from marca_exemplos`))[0].n === 0);
await como(outro, `delete from marca_exemplos`);
confere("outra conta não apaga os exemplos", (await como(u, `select count(*)::int n from marca_exemplos`))[0].n === 2);
await espera("outra conta não grava exemplo no perfil alheio", () => como(outro, `insert into marca_exemplos (perfil_id, tipo, origem, texto) values ($1, 'titulo', 'loja', 'Título de outra conta')`, [perfil.id]));
await espera("não grava exemplo em nome de outra conta", () => como(outro, `insert into marca_exemplos (user_id, tipo, origem, texto) values ($1, 'titulo', 'loja', 'Título de outra conta')`, [u]), "row-level security");

await como(u, `delete from perfis_marca where id = $1`, [perfil.id]);
confere("apagar o perfil apaga os exemplos dele", (await como(u, `select count(*)::int n from marca_exemplos`))[0].n === 0);

await db.close();
if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
