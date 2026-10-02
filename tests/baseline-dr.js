// Baseline de regressão da DR (Etapa 2): corre index.html do commit 78041a2 e guarda a DR mensal e anual,
// os indicadores e os Cenários para a configuração por omissão, as 9 combinações de contratos e as variantes.
// Uso: node tests/baseline-dr.js [config-antiga.json]
//   → tests/baseline-78041a2-dr.json (sem dados reais; vai para o git)
//   → tests/baseline-78041a2-dr-supabase.json (só com config-antiga.json; dados reais, fora do git)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { carregarApp } = require('./dom-simulado');
const { cenariosDR, definir, capturarDR } = require('./cenarios-teste');

const COMMIT = '78041a2';

function htmlDoCommit() {
  return execSync('git show ' + COMMIT + ':index.html', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

// Carrega uma linha antiga da tabela (config_extra = NULL) através de carregarConfig().
async function carregarAntiga(html, ficheiro) {
  const linha = Object.assign({ id: 'tvde_alexandre', config_extra: null, atualizado_em: '2026-01-01T00:00:00+00:00' },
    JSON.parse(fs.readFileSync(ficheiro, 'utf8')));
  const app = carregarApp({ html, fetch: async () => ({ ok: true, status: 200, json: async () => [linha] }) });
  await app.correr('carregarConfig()');
  return app;
}

async function main() {
  const html = htmlDoCommit();
  const resultado = { commit: COMMIT, cenarios: {} };
  for (const c of cenariosDR()) {
    const app = carregarApp({ html });
    definir(app, c.valores);
    resultado.cenarios[c.nome] = capturarDR(app);
  }
  const destino = path.join(__dirname, 'baseline-' + COMMIT + '-dr.json');
  fs.writeFileSync(destino, JSON.stringify(resultado));
  console.log('Baseline gravado: ' + path.basename(destino) + ' (' + Object.keys(resultado.cenarios).length + ' cenários)');

  const ficheiroAntigo = process.argv[2];
  if (ficheiroAntigo) {
    const app = await carregarAntiga(html, ficheiroAntigo);
    const antiga = { commit: COMMIT, config: path.basename(ficheiroAntigo), estado: app.el('sb-status').textContent, dr: capturarDR(app) };
    const destinoAntigo = path.join(__dirname, 'baseline-' + COMMIT + '-dr-supabase.json');
    fs.writeFileSync(destinoAntigo, JSON.stringify(antiga, null, 1));
    console.log('Baseline da configuração antiga gravado: ' + path.basename(destinoAntigo) + ' (' + antiga.estado + ')');
  }
}

main().catch(e => { console.error('Erro ao gerar o baseline:', e); process.exit(1); });
