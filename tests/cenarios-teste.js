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

function definir(app, valores) {
  const js = Object.entries(valores).map(([id, v]) =>
    typeof v === 'boolean'
      ? `setChk(${JSON.stringify(id)}, ${v});`
      : `document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(String(v))};`).join('\n');
  app.correr(js + '\ncalcular();');
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

module.exports = { TIPOS, valoresCombinacao, valoresVariante, cenariosDR, definir, capturarDR };
