/**
 * Roda os testes de banco (scripts/sql/*.mjs, menos o `banco.mjs`, que é a base deles).
 *
 * Cada script sobe o seu próprio PGlite e reaplica TODAS as migrações (~7 s só nisso), e eram
 * ~45 scripts em fila: o `test:sql` passava de 10 minutos. Aqui eles rodam em paralelo
 * (processos separados, então um não enxerga o banco do outro) e, no CI, ainda podem ser
 * divididos em fatias: `npm run test:sql -- --fatia=2/3` roda só a 2ª de 3.
 *
 *   npm run test:sql                 todos, em paralelo
 *   npm run test:sql -- --fatia=1/3  só a fatia 1 de 3
 *   npm run test:sql -- --paralelo=2 limita os processos simultâneos
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const DIR = new URL("./", import.meta.url);
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];

const todos = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".mjs") && f !== "banco.mjs" && f !== "rodar-todos.mjs")
  .sort();

let fatia = todos;
const f = arg("fatia");
if (f) {
  const [i, n] = f.split("/").map(Number);
  if (!(i >= 1 && n >= 1 && i <= n)) {
    console.error(`--fatia inválida: "${f}" (use, por exemplo, 2/3)`);
    process.exit(2);
  }
  // Revezado (e não em blocos) para espalhar os scripts mais pesados entre as fatias.
  fatia = todos.filter((_, idx) => idx % n === i - 1);
}

const paralelo = Math.max(1, Number(arg("paralelo")) || Math.min(os.availableParallelism(), 4));
console.log(`${fatia.length} scripts de banco${f ? ` (fatia ${f})` : ""}, ${paralelo} em paralelo`);

function rodar(nome) {
  return new Promise((resolve) => {
    const ini = Date.now();
    const filho = spawn(process.execPath, [new URL(nome, DIR).pathname], { stdio: ["ignore", "pipe", "pipe"] });
    let saida = "";
    filho.stdout.on("data", (d) => (saida += d));
    filho.stderr.on("data", (d) => (saida += d));
    filho.on("close", (codigo) => resolve({ nome, ok: codigo === 0, saida, seg: ((Date.now() - ini) / 1000).toFixed(1) }));
  });
}

const fila = [...fatia];
const falhas = [];
async function trabalhador() {
  while (fila.length) {
    const r = await rodar(fila.shift());
    console.log(`${r.ok ? "✓" : "✗"} ${r.nome} (${r.seg}s)`);
    if (!r.ok) {
      falhas.push(r);
      // A saída só interessa quando falha; evita um log de milhares de linhas "✓".
      console.log(r.saida.split("\n").map((l) => `    ${l}`).join("\n"));
    }
  }
}

const inicio = Date.now();
await Promise.all(Array.from({ length: Math.min(paralelo, fatia.length) }, trabalhador));
const total = ((Date.now() - inicio) / 1000).toFixed(0);
if (falhas.length) {
  console.error(`\n✗ ${falhas.length} script(s) falharam em ${total}s: ${falhas.map((r) => r.nome).join(", ")}`);
  process.exit(1);
}
console.log(`\nTudo certo: ${fatia.length} scripts em ${total}s`);
