// Baseline de regressão da Etapa 3: corre index.html do commit f4aba6b e guarda, para as 82 configurações
// dos testes anteriores e para as configurações reais (opcionais), a DR mensal e anual (com todas as tabelas
// da página), o Balanço aos meses 12 e 24 e a caixa mínima nos meses 1 a 24.
// Uso: node tests/baseline-etapa3.js [config-real.json ...]
//   → tests/baseline-f4aba6b.json (sem dados reais; pode ir para o git)
//   → tests/baseline-f4aba6b-supabase.json (só com configurações reais; fora do git)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { carregarApp } = require('./dom-simulado');
const { cenariosDR, definir, capturarDR } = require('./cenarios-teste');

const COMMIT = 'f4aba6b';

function htmlDoCommit() {
  return execSync('git show ' + COMMIT + ':index.html', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

// Carrega uma linha guardada (com ou sem config_extra) através de carregarConfig().
async function carregarLinha(html, ficheiro) {
  const linha = Object.assign({ id: 'tvde_alexandre', config_extra: null, atualizado_em: '2026-01-01T00:00:00+00:00' },
    JSON.parse(fs.readFileSync(ficheiro, 'utf8')));
  const app = carregarApp({ html, fetch: async () => ({ ok: true, status: 200, json: async () => [linha] }) });
  await app.correr('carregarConfig()');
  return app;
}

// Balanço aos meses 12 e 24 (objecto e tabela visível) e caixa no fim de cada mês 1 a 24.
function capturarBalanco(app) {
  const r = {};
  for (const N of [12, 24]) {
    definir(app, { bal_horizonte: N });
    r['bal' + N] = JSON.parse(app.correr('JSON.stringify(calcBalanco(lerCfgDoDOM(), calcModelo(lerCfgDoDOM())))'));
    r['tabelaBal' + N] = app.tabela('balanco-table');
  }
  r.caixa = JSON.parse(app.correr(`(function(){
    const cfg = lerCfgDoDOM(); const mod = calcModelo(cfg); const s = [];
    for (let N = 1; N <= 24; N++) s.push(calcBalanco(Object.assign({}, cfg, { balanco: Object.assign({}, cfg.balanco, { horizonte: N }) }), mod).ativo.caixa);
    return JSON.stringify(s); })()`));
  r.caixaMin24 = r.bal24.caixaMin;
  r.mesCaixaMin24 = r.bal24.mesCaixaMin;
  return r;
}

// As grelhas dos Cenários são <div> (não <tr>): capturarDR devolve-as vazias; guarda-se o texto.
const TEXTOS_CENARIOS = ['cn-grid-dr', 'cn-grid-drm', 'cn-grid-emp', 'cn-grid-rem', 'cn-grid-div', 'cn-grid-decisao', 'cn-grid-balanco', 'cn-aviso', 'dr-avisos'];

// Linhas de uma grelha dos Cenários: [rótulo, célula A, célula B, célula C]; secções como "§ título".
function linhasGrelha(app, id) {
  const limpar = t => t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const linhas = [];
  for (const m of app.el(id).innerHTML.matchAll(/<div class="(cn-[\w-]+)[^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
    if (m[1] === 'cn-lbl') linhas.push([limpar(m[2])]);
    else if (m[1] === 'cn-sec') linhas.push(['§ ' + limpar(m[2])]);
    else if (m[1] === 'cn-cell' && linhas.length) linhas[linhas.length - 1].push(limpar(m[2]));
  }
  return linhas.map(l => l.join(' | '));
}
const GRELHAS_CENARIOS = ['cn-grid-dr', 'cn-grid-drm', 'cn-grid-emp', 'cn-grid-rem', 'cn-grid-div', 'cn-grid-decisao', 'cn-grid-balanco'];

function capturar(app) {
  const horizonte = app.correr("document.getElementById('bal_horizonte').value");
  const dr = capturarDR(app);
  dr.textos = {};
  TEXTOS_CENARIOS.forEach(id => { dr.textos[id] = app.texto(id); });
  dr.grelhas = {};
  GRELHAS_CENARIOS.forEach(id => { dr.grelhas[id] = linhasGrelha(app, id); });
  const bal = capturarBalanco(app);
  definir(app, { bal_horizonte: horizonte });
  return { dr, bal };
}

async function main() {
  const html = htmlDoCommit();
  const resultado = { commit: COMMIT, cenarios: {} };
  for (const c of cenariosDR()) {
    const app = carregarApp({ html });
    definir(app, c.valores);
    resultado.cenarios[c.nome] = capturar(app);
  }
  const destino = path.join(__dirname, 'baseline-' + COMMIT + '.json');
  fs.writeFileSync(destino, JSON.stringify(resultado));
  console.log('Baseline gravado: ' + path.basename(destino) + ' (' + Object.keys(resultado.cenarios).length + ' configurações)');

  const reais = process.argv.slice(2);
  if (reais.length) {
    const r = { commit: COMMIT, configs: {} };
    for (const f of reais) {
      const app = await carregarLinha(html, f);
      r.configs[path.basename(f)] = Object.assign({ estado: app.el('sb-status').textContent }, capturar(app));
      console.log('  ' + path.basename(f) + ': ' + app.el('sb-status').textContent);
    }
    const destinoReal = path.join(__dirname, 'baseline-' + COMMIT + '-supabase.json');
    fs.writeFileSync(destinoReal, JSON.stringify(r));
    console.log('Baseline das configurações reais gravado: ' + path.basename(destinoReal));
  }
}

if (require.main === module) main().catch(e => { console.error('Erro ao gerar o baseline:', e); process.exit(1); });

module.exports = { capturar, capturarBalanco, carregarLinha, htmlDoCommit, linhasGrelha, TEXTOS_CENARIOS, GRELHAS_CENARIOS };
