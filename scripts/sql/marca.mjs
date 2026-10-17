/** Padrão da loja (0098): isolamento entre contas, versionamento da ficha e vínculos. Rode com `npm run test:sql`. */
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

const u = await novoUsuario("marca@m.com");
const outro = await novoUsuario("marca2@m.com");
const canalO = (await um(`insert into canais (user_id, nome, tipo_taxa) values ($1, 'Shopee', 'faixas') returning id`, [outro])).id;
const lojaO = (await um(`insert into lojas_canal (user_id, canal_id, nome) values ($1, $2, 'Alheia') returning id`, [outro, canalO])).id;

const perfil = (await como(u, `insert into perfis_marca (nome, plataforma, nicho, link_loja) values ('Loja 1', 'shopee', 'qualquer coisa', 'https://shopee.com.br/loja1') returning id`))[0].id;
const outroPerfil = (await como(outro, `insert into perfis_marca (nome) values ('Dele') returning id`))[0].id;

confere("cria o perfil com user_id da sessão", (await como(u, `select count(*)::int n from perfis_marca`))[0].n === 1);
confere("outra conta não enxerga o perfil", (await como(outro, `select count(*)::int n from perfis_marca where nome = 'Loja 1'`))[0].n === 0);
await espera("nome repetido na mesma conta é recusado", () => como(u, `insert into perfis_marca (nome) values ('Loja 1')`), "duplicate key");
await espera("plataforma inválida é recusada", () => como(u, `insert into perfis_marca (nome, plataforma) values ('X', 'nenhuma')`), "violates check");
await espera("link sem http(s) é recusado", () => como(u, `insert into perfis_marca (nome, link_loja) values ('Y', 'javascript:alert(1)')`), "violates check");
await espera("mais de 8 imagens de referência é recusado", () => como(u, `insert into perfis_marca (nome, referencias) values ('Z', array['a','b','c','d','e','f','g','h','i'])`), "violates check");
await espera("não cria perfil em nome de outra conta", () => como(u, `insert into perfis_marca (user_id, nome) values ($1, 'Falso')`, [outro]), "row-level security");
await espera("não reatribui o perfil para outra conta", () => como(u, `update perfis_marca set user_id = $1 where id = $2`, [outro, perfil]), "row-level security");
await espera("loja de outra conta não pode ser vinculada", () => como(u, `update perfis_marca set loja_id = $1 where id = $2`, [lojaO, perfil]));

// Memória
await como(u, `insert into marca_memoria (perfil_id, texto, tipo) values ($1, 'Capas sem pessoa', 'preferencia')`, [perfil]);
await como(u, `insert into marca_memoria (texto) values ('Vale para a conta toda')`);
confere("memória por perfil e da conta convivem", (await como(u, `select count(*)::int n from marca_memoria`))[0].n === 2);
await espera("memória no perfil de outra conta é recusada", () => como(u, `insert into marca_memoria (perfil_id, texto) values ($1, 'invasão')`, [outroPerfil]));
await espera("texto curto demais é recusado", () => como(u, `insert into marca_memoria (texto) values ('ab')`), "violates check");

// Ficha versionada
const salvar = (id, perfilId, tipo, dados, origem = "usuario") => como(id, `select * from salvar_ficha_marca($1, $2, $3::jsonb, $4, null)`, [perfilId, tipo, JSON.stringify(dados), origem]);
const v1 = (await salvar(u, perfil, "capa_1", { fundo: "creme" }))[0];
const v2 = (await salvar(u, perfil, "capa_1", { fundo: "branco" }, "ajuste_ia"))[0];
confere("a primeira versão é 1 e a segunda é 2", v1.versao === 1 && v2.versao === 2);
const ativas = await como(u, `select versao from marca_fichas where perfil_id = $1 and tipo_imagem = 'capa_1' and ativa`, [perfil]);
confere("só a última versão fica ativa", ativas.length === 1 && ativas[0].versao === 2);
confere("tipos de imagem diferentes têm versão própria", (await salvar(u, perfil, "capa_2", { fundo: "x" }))[0].versao === 1);

await como(u, `select ativar_ficha_marca($1)`, [v1.id]);
const depois = await como(u, `select versao from marca_fichas where perfil_id = $1 and tipo_imagem = 'capa_1' and ativa`, [perfil]);
confere("voltar à versão 1 reativa só ela", depois.length === 1 && depois[0].versao === 1);
confere("o histórico continua guardado", (await como(u, `select count(*)::int n from marca_fichas where tipo_imagem = 'capa_1'`))[0].n === 2);

await espera("não salva ficha no perfil de outra conta", () => salvar(u, outroPerfil, "capa_1", {}), "Perfil não encontrado");
await espera("não reativa ficha de outra conta", async () => {
  const dela = (await salvar(outro, outroPerfil, "geral", { a: 1 }))[0].id;
  await como(u, `select ativar_ficha_marca($1)`, [dela]);
}, "Ficha não encontrada");
await espera("tipo de imagem inválido é recusado", () => salvar(u, perfil, "banner", {}), "Tipo de imagem inválido");
await espera("origem inválida é recusada", () => salvar(u, perfil, "geral", {}, "hacker"), "Origem inválida");
await espera("ficha que não é objeto é recusada", () => como(u, `select * from salvar_ficha_marca($1, 'geral', '[1,2]'::jsonb, 'usuario', null)`, [perfil]), "Ficha inválida");
await espera("ficha grande demais é recusada", () => salvar(u, perfil, "geral", { texto: "x".repeat(9000) }), "Ficha inválida");
confere("a conta não vê as fichas da outra", (await como(outro, `select count(*)::int n from marca_fichas where perfil_id = $1`, [perfil]))[0].n === 0);

await db.exec(`set role anon`);
await espera("anônimo não salva ficha", () => db.query(`select * from salvar_ficha_marca($1, 'geral', '{}'::jsonb, 'usuario', null)`, [perfil]), "permission denied");
await db.exec(`reset role`);

// Apagar o perfil leva memória e fichas junto.
await como(u, `delete from perfis_marca where id = $1`, [perfil]);
confere("apagar o perfil apaga fichas e memória dele", (await q(`select (select count(*) from marca_fichas where perfil_id = $1)::int f, (select count(*) from marca_memoria where perfil_id = $1)::int m`, [perfil]))[0].f === 0);

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nTudo certo.");
