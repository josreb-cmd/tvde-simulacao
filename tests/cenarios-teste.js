// Cenários de teste partilhados (baseline da DR e testes da Etapa 2) e captura das saídas da página.
'use strict';

const TIPOS = ['dependente', 'independente', 'inactivo'];

// Valores base das 9 combinações de contratos (os mesmos do teste [7] da Etapa 1).
function valoresCombinacao(t0, t1) {
  return { m0_contrato: t0, m1_contrato: t1, m0_pct_uber: 50, m1_fat_uber: 2000, m1_dias_sem: 5, m1_horas_dia: 8, m1_salario: 870, m1_pct_uber: 40 };
}

// Variantes que alteram a DR: regime de IVA, base da percentagem e Bolt activa/desactivada.
function valoresVariante(regime, base, bolt) {
  const v = { iva_regime: regime, base_iva: base, plat_bolt_activa: bolt };
  if (bolt) Object.assign(v, { plat_bolt_comissao: 20, m0_fat_bolt: 500, m0_pct_bolt: 45, m1_fat_bolt: 300, m1_pct_bolt: 40, m1_gorj_bolt: 15, m1_bonus_bolt: 25 });
  return v;
}

// Lista de cenários da DR: por omissão, 9 combinações e 9 × 2 × 2 × 2 variantes.
function cenariosDR() {
  const lista = [{ nome: 'por omissão', valores: {} }];
  for (const t0 of TIPOS) for (const t1 of TIPOS) {
    lista.push({ nome: t0 + '+' + t1, valores: valoresCombinacao(t0, t1) });
  }
  for (const t0 of TIPOS) for (const t1 of TIPOS) for (const regime of ['normal', 'isento']) for (const base of ['sem', 'com']) for (const bolt of [false, true]) {
    lista.push({
      nome: [t0, t1, regime, 'base-' + base, bolt ? 'bolt' : 'sem-bolt'].join('+'),
      valores: Object.assign({}, valoresCombinacao(t0, t1), valoresVariante(regime, base, bolt))
    });
  }
  return lista;
}

// Campos mensais da versão 1 (m{i}_fat_{p}, m{i}_gorj_{p}): na versão 2 a página pede valores por dia ativo.
// Se a página não tiver o campo mensal, converte-o com os dias e semanas já definidos (como a migração da v1).
const CAMPO_MENSAL_V1 = /^m(\d)_(fat|gorj)_(\w+)$/;

function definir(app, valores) {
  const directos = Object.entries(valores).filter(([id]) => !CAMPO_MENSAL_V1.test(id));
  const mensais = Object.entries(valores).filter(([id]) => CAMPO_MENSAL_V1.test(id));
  const js = directos.map(([id, v]) =>
    typeof v === 'boolean'
      ? `setChk(${JSON.stringify(id)}, ${v});`
      : `document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(String(v))};`).join('\n');
  const jsMensais = mensais.map(([id, v]) => {
    const [, i, tipo, p] = CAMPO_MENSAL_V1.exec(id);
    return `(function(){ const el = document.getElementById(${JSON.stringify(id)});
      if (el) { el.value = ${JSON.stringify(String(v))}; return; }
      const d = getVal(idCampo(${i}, 'dias_sem')) * getVal('sem_mes'); const v = ${Number(v)};
      setVal('m${i}_${tipo}dia_${p}', d > 0 ? v / d : 0); setVal('m${i}_${tipo}fixo_${p}', d > 0 ? 0 : v); })();`;
  }).join('\n');
  app.correr(js + '\n' + jsMensais + '\ncalcular();');
}

// Tudo o que a DR, os Cenários e os restantes separadores mostram (o Balanço do separador DR fica de fora).
const TABELAS_DR = ['conta-table', 'rem-table', 'dist-table', 'energia-table', 'rvp-table', 'amort-table',
  'cn-grid-dr', 'cn-grid-drm', 'cn-grid-emp', 'cn-grid-rem', 'cn-grid-div', 'cn-grid-decisao', 'cn-grid-balanco'];
const TEXTOS_DR = ['kpi-mensal', 'kpi-rem', 'kpi-rvp', 'cn-kpi-decisao'];

function capturarDR(app) {
  const r = {};
  app.correr("drToggle('mensal')");
  r.drMensal = app.tabela('dr-table');
  r.kpiDrMensal = app.texto('kpi-dr');
  app.correr("drToggle('anual')");
  r.drAnual = app.tabela('dr-table');
  r.kpiDrAnual = app.texto('kpi-dr');
  app.correr("drToggle('mensal')");
  TABELAS_DR.forEach(id => { r[id] = app.tabela(id); });
  TEXTOS_DR.forEach(id => { r[id] = app.texto(id); });
  r.modelo = JSON.parse(app.correr('(function(){ const m = calcModelo(lerCfgDoDOM()); const c = JSON.parse(JSON.stringify(m)); delete c.fin.plano; return JSON.stringify(c); })()'));
  return r;
}

// ── Etapa 3: comparação com baselines anteriores
// Os cenários definidos campo a campo mudam os dias depois do carregamento; na versão 2 a receita, os km e os
// custos variáveis escalam com os dias. Para comparar com os baselines das etapas anteriores, a configuração é
// guardada pela página do commit f4aba6b (versão 1) e carregada pela página actual (migração para a versão 2).
const COMMIT_V1 = 'f4aba6b';
let htmlV1 = null;
function htmlDaVersao1() {
  if (!htmlV1) {
    const { execSync } = require('child_process');
    htmlV1 = execSync('git show ' + COMMIT_V1 + ':index.html', { cwd: require('path').join(__dirname, '..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  }
  return htmlV1;
}
async function definirComoV1(valores) {
  const { carregarApp } = require('./dom-simulado');
  let corpo = null;
  const antiga = carregarApp({ html: htmlDaVersao1(), fetch: async (url, op) => { corpo = op.body; return { ok: true, status: 201 }; } });
  definir(antiga, valores);
  await antiga.correr('guardarConfig()');
  if (!corpo) throw new Error('A página da versão 1 não guardou a configuração');
  const app = carregarApp({ fetch: async () => ({ ok: true, status: 200, json: async () => [JSON.parse(corpo)] }) });
  await app.correr('carregarConfig()');
  return app;
}

// Desfaz na captura as alterações pedidas na Etapa 3 (correcção 1: "= EBITDA" passou a "= Margem antes de pessoal"
// e entrou o EBITDA depois dos custos com motoristas; campos novos do modelo), para comparar o resto ao cêntimo.
const CAMPOS_NOVOS_MODELO = ['margemAntesPessoal', 'kmSemana', 'diasSemViatura', 'diasMesViatura', 'custosVar', 'usaFixosViatura', 'margemContribuicao', 'mcDia'];
function desfazerEtapa3(captura) {
  const r = JSON.parse(JSON.stringify(captura));
  const linhasDR = t => (t || []).filter(l => !l.startsWith('= EBITDA (antes de depreciações, juros e impostos) |'))
    .map(l => l.replace(/^= Margem antes de pessoal \|/, '= EBITDA |'));
  ['drMensal', 'drAnual', 'conta-table'].forEach(k => { if (r[k]) r[k] = linhasDR(r[k]); });
  ['kpiDrMensal', 'kpiDrAnual'].forEach(k => { if (r[k]) r[k] = r[k].replace(/[−\-\d.,]+% margem EBITDA/, '#% margem EBITDA'); });
  if (r.modelo) {
    if ('margemAntesPessoal' in r.modelo) r.modelo.ebitda = r.modelo.margemAntesPessoal;
    CAMPOS_NOVOS_MODELO.forEach(k => { delete r.modelo[k]; });
    (r.modelo.motoristas || []).forEach(m => {
      ['diasMes', 'usaFixo', 'regimeRecibo'].forEach(k => { delete m[k]; });
      (m.plataformas || []).forEach(p => { delete p.usaFixo; });
    });
  }
  return r;
}
function normalizarMargemEbitda(captura) {
  const r = JSON.parse(JSON.stringify(captura));
  ['kpiDrMensal', 'kpiDrAnual'].forEach(k => { if (r[k]) r[k] = r[k].replace(/[−\-\d.,]+% margem EBITDA/, '#% margem EBITDA'); });
  return r;
}

module.exports = { TIPOS, valoresCombinacao, valoresVariante, cenariosDR, definir, capturarDR, definirComoV1, desfazerEtapa3, normalizarMargemEbitda };
