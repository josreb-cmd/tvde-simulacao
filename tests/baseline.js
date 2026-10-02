// Baseline do modelo actual (commit 76e75e1): corre o código real de index.html
// num DOM simulado e extrai a DR (mensal e anual) e o Balanço.
// Uso: node tests/baseline.js [ficheiro-config.json] > tests/baseline-76e75e1-defaults.json
// Lê index.html do commit 76e75e1 (git show), para não depender da versão actual.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { execSync } = require('child_process');
const html = execSync('git show 76e75e1:index.html', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const blocos = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const codigo = blocos[blocos.length - 1];

// Valores dos <input>/<select> tal como estão no HTML (valores por omissão da página)
const valoresHtml = {};
for (const m of html.matchAll(/<input[^>]*\sid="([^"]+)"[^>]*>/g)) {
  const v = /\svalue="([^"]*)"/.exec(m[0]);
  if (v) valoresHtml[m[1]] = v[1];
}
valoresHtml.sit_familiar = 'NC';

const cfgFicheiro = process.argv[2];
const cfg = cfgFicheiro ? JSON.parse(fs.readFileSync(cfgFicheiro, 'utf8')) : {};

const elementos = {};
function el(id) {
  if (!elementos[id]) {
    const valor = cfg[id] !== undefined ? String(cfg[id]) : valoresHtml[id];
    elementos[id] = { id, value: valor, innerHTML: '', textContent: '', className: '', style: {}, classList: { add() {}, remove() {} } };
  }
  return elementos[id];
}
const sandbox = {
  console, Math, Infinity, parseFloat, Number, Date, JSON,
  document: { getElementById: el, querySelectorAll: () => [] },
  window: { print() {} },
  supabase: { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} } }) },
  fetch: async () => { throw new Error('sem rede no baseline'); },
  setTimeout() {}
};
vm.createContext(sandbox);
vm.runInContext(codigo, sandbox);

function tabelaParaLinhas(htmlTabela) {
  return [...htmlTabela.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(tr => {
    const celulas = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(td => td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    return celulas.join(' | ');
  });
}

const resultado = { commit: '76e75e1', config: cfgFicheiro || '(valores por omissão do HTML)' };
vm.runInContext("drToggle('mensal')", sandbox);
resultado.contaExploracao = tabelaParaLinhas(el('conta-table').innerHTML);
resultado.drMensal = tabelaParaLinhas(el('dr-table').innerHTML);
resultado.balanco = tabelaParaLinhas(el('balanco-table').innerHTML);
vm.runInContext("drToggle('anual')", sandbox);
resultado.drAnual = tabelaParaLinhas(el('dr-table').innerHTML);
console.log(JSON.stringify(resultado, null, 2));
