// Teste de recuo: a página do commit f4aba6b (versão 1 do config_extra) carrega o registo gravado pela versão
// actual (versão 2, com os campos mensais da versão 1 gravados em paralelo) e mostra a MESMA DR mensal que com
// a configuração original, nos dois motoristas.
// Uso: node tests/recuo.js [config-real.json]
//   Sem argumento (ou com um ficheiro que não existe): só as 82 configurações dos testes. A configuração real
//   (fora do git) é opcional.
//   Sem o commit f4aba6b no repositório, o teste é omitido.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { carregarApp } = require('./dom-simulado');
const { cenariosDR, definir } = require('./cenarios-teste');

const COMMIT = 'f4aba6b';
let falhas = 0;
function verificar(condicao, descricao) {
  console.log((condicao ? '  ✔ ' : '  ✗ ') + descricao);
  if (!condicao) falhas++;
}
const json = (app, expr) => JSON.parse(app.correr('JSON.stringify(' + expr + ')'));
const fmtPt = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const col = (v, n) => String(v).padStart(n);

function htmlDoCommit() {
  try {
    return execSync('git show ' + COMMIT + ':index.html', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return null;
  }
}

const servir = linha => async () => ({ ok: true, status: 200, json: async () => [linha] });

// DR mensal visível e, por motorista, os valores da DR que lhe dizem respeito.
function capturar(app) {
  app.correr("drToggle('mensal')");
  const m = json(app, 'calcModelo(lerCfgDoDOM())');
  return {
    dr: app.tabela('dr-table'),
    F: m.F, comInd: m.comInd, resLiq: m.resLiq,
    motoristas: m.motoristas.map(x => ({ F: x.F, com: x.com, GB: x.GB, pagamento: x.pagamento, encSS: x.encSS, rendimento: x.rendimento }))
  };
}
const iguais = (a, b) => JSON.stringify(a.dr) === JSON.stringify(b.dr) &&
  a.motoristas.length === b.motoristas.length &&
  a.motoristas.every((m, i) => Object.keys(m).every(k => Math.abs(m[k] - b.motoristas[i][k]) <= 1e-6));

async function guardar(app) {
  let corpo = null;
  app.contexto.fetch = async (url, op) => { corpo = op.body; return { ok: true, status: 201 }; };
  await app.correr('guardarConfig()');
  return corpo ? JSON.parse(corpo) : null;
}
async function carregar(html, linha) {
  const app = carregarApp({ html, fetch: servir(linha) });
  await app.correr('carregarConfig()');
  return app;
}

// Uma configuração: referência = página antiga com a configuração original; recuo = página antiga com o registo
// gravado pela página nova; a página nova a recarregar o próprio registo não pode mudar a DR.
async function comparar(htmlAntigo, original, aplicarNaAntiga) {
  const ref = aplicarNaAntiga ? await aplicarNaAntiga() : await carregar(htmlAntigo, original);
  const linhaV1 = original || await guardar(ref);
  const nova = await carregar(undefined, linhaV1);
  const capNova = capturar(nova);
  const linhaNova = await guardar(nova);
  const recuo = await carregar(htmlAntigo, linhaNova);
  const nova2 = await carregar(undefined, linhaNova);
  return {
    ref: capturar(ref), recuo: capturar(recuo), estado: recuo.el('sb-status').textContent,
    novaIgual: JSON.stringify(capNova) === JSON.stringify(capturar(nova2)), linhaNova
  };
}

(async () => {
  const htmlAntigo = htmlDoCommit();
  if (!htmlAntigo) {
    console.log('Commit ' + COMMIT + ' não encontrado no repositório: teste de recuo omitido.');
    return;
  }

  console.log('[1] Gravação: campos mensais da versão 1 ao lado dos campos por dia ativo');
  const r0 = await comparar(htmlAntigo, null, async () => { const a = carregarApp({ html: htmlAntigo }); definir(a, { m1_fat_uber: 2000, m1_dias_sem: 5 }); return a; });
  const rec = r0.linhaNova.config_extra.motoristas.map(m => m.receita.uber);
  verificar(r0.linhaNova.config_extra.versao === 2 && rec.every(r => 'fat_dia' in r && 'faturacao' in r && 'gorjetas' in r),
    'config_extra versão 2 com fat_dia/gorj_dia e faturacao/gorjetas (mensais) em cada plataforma');
  verificar(Math.abs(rec[1].faturacao - 2000) < 1e-9 && Math.abs(rec[1].fat_dia * 5 * 4.3 - 2000) < 1e-9,
    'faturacao = Gross Fare por dia × dias × semanas (motorista 2: 2000 €)');

  const ficheiro = process.argv[2];
  console.log('\n[2] Configuração real gravada');
  if (ficheiro && !fs.existsSync(ficheiro)) {
    console.log('  (configuração real ' + ficheiro + ' não encontrada — passo omitido)');
  } else if (ficheiro) {
    const original = JSON.parse(fs.readFileSync(ficheiro, 'utf8'));
    const r = await comparar(htmlAntigo, original);
    console.log('  Linha                          f4aba6b, original   f4aba6b, gravada pela nova');
    const linhas = [['Gross Fare', r.ref.F, r.recuo.F], ['Comissões a independentes', -r.ref.comInd, -r.recuo.comInd], ['Resultado líquido', r.ref.resLiq, r.recuo.resLiq]];
    r.ref.motoristas.forEach((m, i) => linhas.push(['  motorista ' + (i + 1) + ': Gross Fare', m.F, r.recuo.motoristas[i].F], ['  motorista ' + (i + 1) + ': comissão', m.pagamento, r.recuo.motoristas[i].pagamento]));
    linhas.forEach(([n, a, b]) => console.log('  ' + n.padEnd(31) + col(fmtPt(a), 17) + col(fmtPt(b), 29)));
    verificar(r.estado === '✔ Configuração carregada', 'f4aba6b carrega sem erro (' + r.estado + ')');
    verificar(iguais(r.ref, r.recuo), 'f4aba6b: DR mensal e valores dos dois motoristas iguais aos da configuração original');
    verificar(r.novaIgual, 'versão nova: DR igual antes e depois de gravar e recarregar');
  } else {
    console.log('  (configuração real não indicada — passo omitido)');
  }

  console.log('\n[3] 82 configurações dos testes (DR mensal na f4aba6b: original vs registo gravado pela versão nova)');
  console.log('  ' + 'configuração'.padEnd(52) + col('Gross Fare', 11) + col('com. indep.', 12) + col('res. líquido', 13) + '  recuo  nova');
  let okRecuo = 0, okNova = 0, okEstado = 0;
  const lista = cenariosDR();
  for (const c of lista) {
    const r = await comparar(htmlAntigo, null, async () => { const a = carregarApp({ html: htmlAntigo }); definir(a, c.valores); return a; });
    const ok = iguais(r.ref, r.recuo);
    if (ok) okRecuo++;
    if (r.novaIgual) okNova++;
    if (r.estado === '✔ Configuração carregada') okEstado++;
    console.log('  ' + c.nome.padEnd(52) + col(fmtPt(r.ref.F), 11) + col(fmtPt(-r.ref.comInd), 12) + col(fmtPt(r.ref.resLiq), 13) +
      '  ' + (ok ? '✔' : '✗ ' + fmtPt(r.recuo.resLiq)).padEnd(5) + '  ' + (r.novaIgual ? '✔' : '✗'));
  }
  verificar(okEstado === lista.length, 'f4aba6b carrega sem erro ' + okEstado + '/' + lista.length + ' registos gravados pela versão nova');
  verificar(okRecuo === lista.length, 'f4aba6b: DR mensal e valores dos dois motoristas iguais aos originais em ' + okRecuo + '/' + lista.length + ' configurações');
  verificar(okNova === lista.length, 'versão nova: DR igual depois de gravar e recarregar em ' + okNova + '/' + lista.length + ' configurações');

  console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'));
  process.exitCode = falhas === 0 ? 0 : 1;
})().catch(e => { console.error(e); process.exit(1); });
