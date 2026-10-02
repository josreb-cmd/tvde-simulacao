// Testes da Etapa 2 (Balanço por acumulação de fluxos, partidas dobradas).
// Uso: node tests/etapa2.js [config-antiga.json]
// O ficheiro de configuração antiga (dados reais) é opcional e não está no repositório; o baseline
// correspondente (tests/baseline-78041a2-dr-supabase.json) também não.
'use strict';
const fs = require('fs');
const path = require('path');
const { carregarApp } = require('./dom-simulado');
const { TIPOS, valoresCombinacao, valoresVariante, cenariosDR, definir, capturarDR } = require('./cenarios-teste');

let falhas = 0;
function verificar(condicao, descricao) {
  console.log((condicao ? '  ✔ ' : '  ✗ ') + descricao);
  if (!condicao) falhas++;
}
const perto = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.01 : tol);
const r2 = v => Math.round(v * 100) / 100;
const TOL = 0.005;
const modelo = app => app.correr('calcModelo(lerCfgDoDOM())');
const balanco = app => JSON.parse(app.correr('JSON.stringify(calcBalanco(lerCfgDoDOM(), calcModelo(lerCfgDoDOM())))'));
const cfgDom = app => JSON.parse(app.correr('JSON.stringify(lerCfgDoDOM())'));
const col = (v, n) => String(v).padStart(n);

function verificacaoVisivel(app) {
  const html = app.el('balanco-verificacao').innerHTML;
  return /verificacao ok/.test(html) && /Ativo − \(Passivo \+ CP\) = 0,00 €/.test(html);
}

// Balanço do separador Cenários: os 3 cenários fecham e não há aviso "provisório".
function cenariosFecham(app) {
  const t = app.texto('cn-grid-balanco');
  return (t.match(/✔/g) || []).length === 3 && !/✗/.test(t) && app.texto('cn-balanco-avisos') === '';
}

function primeiraDiferenca(a, b, caminho) {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) {
      const d = primeiraDiferenca(a[k], b[k], caminho + '.' + k);
      if (d) return d;
    }
  }
  return caminho + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b);
}

// ── 1. O balanço fecha em todas as combinações
function testeFecho() {
  console.log('\n[1] O balanço fecha: 9 combinações × regime × base × Bolt × N (1, 6, 12, 24) × distribuição × mês actual do crédito (1, 7); TAN 8,25%');
  const horizontes = [1, 6, 12, 24];
  const porCombinacao = {};
  const porHorizonte = {};
  let total = 0, maxDif = 0, falhou = [], cenariosOk = 0;
  const tan = new Set();
  for (const t0 of TIPOS) for (const t1 of TIPOS) for (const regime of ['normal', 'isento']) for (const base of ['sem', 'com']) for (const bolt of [false, true]) {
    const app = carregarApp();
    definir(app, Object.assign({}, valoresCombinacao(t0, t1), valoresVariante(regime, base, bolt)));
    for (const N of horizontes) for (const dist of [false, true]) for (const mesAtual of [1, 7]) {
      definir(app, { bal_horizonte: N, bal_distribuicao: dist, fin_mes_atual: mesAtual });
      const b = balanco(app);
      const dif = Math.abs(b.diferenca);
      const ok = dif < TOL && verificacaoVisivel(app);
      tan.add(cfgDom(app).fin_taxa);
      if (cenariosFecham(app)) cenariosOk++;
      const chave = t0 + ' + ' + t1;
      const c = porCombinacao[chave] = porCombinacao[chave] || { casos: 0, ok: 0, maxDif: 0, caixaMin: Infinity, ativo12: null };
      c.casos++; c.ok += ok ? 1 : 0; c.maxDif = Math.max(c.maxDif, dif); c.caixaMin = Math.min(c.caixaMin, b.caixaMin);
      const h = porHorizonte[N] = porHorizonte[N] || { casos: 0, ok: 0, maxDif: 0 };
      h.casos++; h.ok += ok ? 1 : 0; h.maxDif = Math.max(h.maxDif, dif);
      total++; maxDif = Math.max(maxDif, dif);
      if (!ok) falhou.push([chave, regime, base, bolt ? 'Bolt' : 'sem Bolt', 'N=' + N, dist ? 'com dist.' : 'sem dist.', 'mês actual ' + mesAtual, b.diferenca].join(' · '));
    }
  }
  console.log('  ' + 'Combinação'.padEnd(28) + col('casos', 6) + col('fecham', 8) + col('máx |dif| (€)', 15) + col('caixa mínima (€)', 18));
  Object.entries(porCombinacao).forEach(([k, c]) =>
    console.log('  ' + k.padEnd(28) + col(c.casos, 6) + col(c.ok, 8) + col(c.maxDif.toExponential(1), 15) + col(r2(c.caixaMin), 18)));
  console.log('  ' + 'Horizonte'.padEnd(28) + col('casos', 6) + col('fecham', 8) + col('máx |dif| (€)', 15));
  Object.entries(porHorizonte).forEach(([N, h]) =>
    console.log('  ' + ('N = ' + N).padEnd(28) + col(h.casos, 6) + col(h.ok, 8) + col(h.maxDif.toExponential(1), 15)));
  falhou.slice(0, 10).forEach(f => console.log('    ✗ ' + f));
  verificar(tan.size === 1 && tan.has(8.25), 'TAN em todos os casos: ' + [...tan].join(', ') + '% (juros > 0); mês actual do crédito 1 e 7');
  verificar(cenariosOk === total, 'separador Cenários: Balanço dos 3 cenários fecha em ' + cenariosOk + '/' + total + ' casos, sem aviso "provisório"');
  verificar(falhou.length === 0, total + ' casos: todos fecham (|diferença| < 0,005 €) e a linha de verificação está a verde; máx |dif| = ' + maxDif.toExponential(2) + ' €');

  // Parâmetros do Balanço fora do caso por omissão
  const extra = [
    { bal_mes_inicio: 7, bal_iva_periodicidade: 'mensal', bal_prazo_comissoes: 0, bal_horizonte: 24, bal_distribuicao: true },
    { bal_mes_inicio: 11, bal_prazo_receber: 45, bal_capital_social: 5000, bal_suprimentos: 10000, bal_horizonte: 17, bal_distribuicao: true },
    { bal_mes_inicio: 3, bal_mes_ferias: 8, bal_mes_natal: 11, bal_prazo_comissoes: 3, bal_horizonte: 23, fin_taxa: 0, vida_util_anos: 1 }
  ];
  let okExtra = 0;
  for (const t0 of TIPOS) for (const t1 of TIPOS) for (const v of extra) {
    const app = carregarApp();
    definir(app, Object.assign({}, valoresCombinacao(t0, t1), valoresVariante('normal', 'sem', true), v));
    if (Math.abs(balanco(app).diferenca) < TOL && verificacaoVisivel(app)) okExtra++;
  }
  verificar(okExtra === TIPOS.length * TIPOS.length * extra.length, 'mês de início, IVA mensal, prazos, capital, suprimentos e vida útil curta: ' + okExtra + '/' + (TIPOS.length * TIPOS.length * extra.length) + ' fecham');
}

// ── 2. DR idêntica ao baseline do commit 78041a2
// O Balanço dos Cenários mudou de propósito (passou a usar o novo Balanço): fica fora da comparação
// com o baseline e é testado em [1]. Tudo o resto, incluindo a DR dos Cenários, tem de ser idêntico.
const semBalancoCenarios = r => { const c = Object.assign({}, r); delete c['cn-grid-balanco']; return c; };
function compararComBaseline(nome, esperadoCompleto, app) {
  const esperado = semBalancoCenarios(esperadoCompleto);
  const obtido = semBalancoCenarios(capturarDR(app));
  const d = primeiraDiferenca(esperado, obtido, nome);
  if (d) console.log('    ✗ ' + d.slice(0, 300));
  return !d;
}

async function testeBaseline(ficheiroAntigo) {
  console.log('\n[2] DR idêntica ao baseline do commit 78041a2 (DR mensal e anual, indicadores, DR dos Cenários e restantes separadores)');
  const base = require('./baseline-78041a2-dr.json');
  let iguais = 0, iguaisComParametros = 0;
  const cenarios = cenariosDR();
  for (const c of cenarios) {
    const app = carregarApp();
    definir(app, c.valores);
    if (compararComBaseline(c.nome, base.cenarios[c.nome], app)) iguais++;
    // Mudar os parâmetros do Balanço não pode alterar a DR.
    definir(app, { bal_horizonte: 24, bal_distribuicao: true, bal_mes_inicio: 5, bal_iva_periodicidade: 'mensal', bal_suprimentos: 2000 });
    if (compararComBaseline(c.nome + ' (parâmetros do Balanço alterados)', base.cenarios[c.nome], app)) iguaisComParametros++;
  }
  verificar(iguais === cenarios.length, 'idêntica em ' + iguais + '/' + cenarios.length + ' cenários (por omissão, 9 combinações e 72 variantes)');
  verificar(iguaisComParametros === cenarios.length, 'idêntica com parâmetros do Balanço alterados: ' + iguaisComParametros + '/' + cenarios.length);

  const ficheiroBaseAntiga = path.join(__dirname, 'baseline-78041a2-dr-supabase.json');
  if (ficheiroAntigo && fs.existsSync(ficheiroBaseAntiga)) {
    const baseAntiga = require(ficheiroBaseAntiga);
    const app = await carregarAntiga(ficheiroAntigo);
    verificar(compararComBaseline('configuração antiga', baseAntiga.dr, app), 'configuração antiga: DR idêntica ao baseline');
  } else {
    console.log('  (configuração antiga não indicada — comparação omitida)');
  }
}

// ── 3. Mecânica dos lançamentos (valores esperados calculados à mão)
function testeMecanica() {
  console.log('\n[3] Mecânica dos lançamentos');
  const app = carregarApp();
  definir(app, { bal_horizonte: 1 });
  let m = modelo(app), b = balanco(app);
  verificar(perto(b.cp.resultados, m.resLiq), 'N = 1: resultados acumulados = resultado líquido da DR do mês 1 (' + r2(b.cp.resultados) + ')');
  verificar(perto(b.ativo.receber, m.deposito * 7 / (365 / 12)), 'valores a receber = depósito × 7 dias / (365/12) (' + r2(b.ativo.receber) + ')');
  verificar(perto(b.ativo.deprAcum, m.deprMes) && perto(b.passivo.dividaCorrente + b.passivo.dividaNaoCorrente, 30000 - m.fin.plano[0].amort), 'depreciação de 1 mês; dívida = capital − amortização do mês 1');

  definir(app, { bal_horizonte: 12 });
  m = modelo(app); b = balanco(app);
  verificar(perto(b.passivo.ivaPagar, 3 * m.ivaLiquidado), 'IVA trimestral, mês 12 (dezembro): 4.º trimestre por pagar = 3 × IVA mensal (' + r2(b.passivo.ivaPagar) + ')');
  definir(app, { bal_iva_periodicidade: 'mensal' });
  b = balanco(app);
  verificar(perto(b.passivo.ivaPagar, 2 * m.ivaLiquidado), 'IVA mensal, mês 12: novembro e dezembro por pagar = 2 × IVA mensal');
  definir(app, { bal_iva_periodicidade: 'trimestral', bal_horizonte: 8 });
  b = balanco(app);
  verificar(perto(b.passivo.ivaPagar, 5 * m.ivaLiquidado), 'mês 8 (agosto): 2.º trimestre prorrogado para setembro (CIVA, art. 27.º n.º 10) + julho e agosto = 5 × IVA mensal');
  const somaAmort = m.fin.plano.slice(0, 8).reduce((s, l) => s + l.amort, 0);
  verificar(perto(b.passivo.dividaCorrente + b.passivo.dividaNaoCorrente, 30000 - somaAmort), 'dívida = capital − amortizações dos meses 1 a 8 (prestação sem juros fora da DR)');
  verificar(b.passivo.irc > 0 && perto(b.passivo.irc, 0.15 * (b.cp.resultados + b.passivo.irc)), 'IRC por pagar = 15% × resultado antes de imposto dos meses 1 a 8 (' + r2(b.passivo.irc) + ')');

  // Juros: TAN 8,25%; o Balanço segue o plano real desde o mês 1; a DR mostra o "mês actual do crédito".
  const jur = carregarApp();
  definir(jur, { bal_horizonte: 12, fin_mes_atual: 1 });
  const mj1 = modelo(jur), bj1 = balanco(jur);
  verificar(cfgDom(jur).fin_taxa === 8.25 && perto(bj1.jurosAcum, mj1.fin.anual.jurosAnual) && perto(bj1.jurosMes[0], mj1.fin.juros),
    'TAN 8,25%, mês actual 1, N = 12: juros do Balanço (meses 1 a 12) = juros da DR anual (' + r2(bj1.jurosAcum) + ' = ' + r2(mj1.fin.anual.jurosAnual) + '); mês 1 = DR mensal (' + r2(mj1.fin.juros) + ')');
  definir(jur, { fin_mes_atual: 7 });
  const mj7 = modelo(jur), bj7 = balanco(jur);
  verificar(perto(bj7.jurosMes[6], mj7.fin.juros), 'mês actual 7: juro do mês 7 do Balanço = juro da DR mensal (' + r2(bj7.jurosMes[6]) + ' = ' + r2(mj7.fin.juros) + ')');
  verificar(JSON.stringify(bj7) === JSON.stringify(bj1), 'o mês actual do crédito só escolhe o mês mostrado na DR: Balanço igual com mês actual 1 e 7');
  definir(jur, { bal_horizonte: 18 });
  const bj18 = balanco(jur);
  const jurosMeses7a18 = bj18.jurosMes.slice(6, 18).reduce((t, j) => t + j, 0);
  verificar(perto(jurosMeses7a18, mj7.fin.anual.jurosAnual), 'mês actual 7: juros dos meses 7 a 18 do Balanço = juros da DR anual (' + r2(jurosMeses7a18) + ' = ' + r2(mj7.fin.anual.jurosAnual) + ')');

  // Dependente: férias pagas em junho, Natal em dezembro
  const dep = carregarApp();
  definir(dep, { m0_contrato: 'dependente', m1_contrato: 'inactivo', bal_horizonte: 12 });
  const md = modelo(dep), d = md.motoristas[0].dep;
  b = balanco(dep);
  const acr = (d.sal + d.ssP) / 12;
  verificar(perto(b.passivo.feriasNatal, 6 * acr), 'mês 12: subsídio de Natal pago; férias de julho a dezembro por pagar = 6/12 × (salário + TSU) (' + r2(b.passivo.feriasNatal) + ')');
  // Natal pago em dezembro = 12/12 → salário bruto + TSU patronal; a SS do subsídio é igual à de um mês.
  verificar(perto(b.passivo.ss, 2 * (d.ssP + d.ssT)), 'SS a pagar no mês 12 = SS de dezembro + SS do subsídio de Natal (' + r2(b.passivo.ss) + ')');
  definir(dep, { bal_horizonte: 6 });
  b = balanco(dep);
  verificar(perto(b.passivo.feriasNatal, 6 * acr), 'mês 6: férias pagas em junho; Natal de janeiro a junho por pagar = 6/12');

  // Independentes, regime isento e distribuição
  const ind = carregarApp();
  definir(ind, { m0_pct_uber: 30, m1_contrato: 'inactivo', bal_horizonte: 12 });
  const mi = modelo(ind);
  b = balanco(ind);
  verificar(perto(b.passivo.comissoes, mi.comInd) && perto(b.passivo.ssContratante, 12 * mi.encSS), 'comissões de dezembro por pagar; SS da entidade contratante dos 12 meses no passivo');
  definir(ind, { iva_regime: 'isento' });
  const mis = modelo(ind);
  b = balanco(ind);
  verificar(perto(b.passivo.ivaPagar, mis.autoliqNaoDed) && perto(mis.ivaLiquidado, 0), 'regime isento: sem IVA nas viagens; autoliquidação do último mês por pagar (' + r2(b.passivo.ivaPagar) + ')');
  definir(ind, { iva_regime: 'normal', bal_horizonte: 24, bal_distribuicao: true });
  const comDist = balanco(ind);
  definir(ind, { bal_distribuicao: false });
  const semDist = balanco(ind);
  const resAno1 = (function () { definir(ind, { bal_horizonte: 12 }); return balanco(ind).cp.resultados; })();
  verificar(resAno1 > 0 && perto(comDist.cp.distribuicoes, 0.6 * resAno1) && perto(semDist.cp.distribuicoes, 0), 'distribuição ligada: 60% do resultado do ano 1 paga em março do ano 2 (' + r2(comDist.cp.distribuicoes) + '); desligada: 0');
  verificar(perto(semDist.ativo.caixa - comDist.ativo.caixa, comDist.cp.distribuicoes), 'distribuição reduz a caixa (líquida + IRS 28% entregue no mês seguinte)');

  // Caixa negativa
  const neg = carregarApp();
  definir(neg, { m0_contrato: 'dependente', salario: 2500, m1_contrato: 'dependente', m1_salario: 2500, bal_horizonte: 12 });
  b = balanco(neg);
  verificar(b.ativo.caixa < 0 && Math.abs(b.diferenca) < TOL && /Necessidade de financiamento/.test(neg.texto('balanco-avisos')),
    'caixa negativa (' + r2(b.ativo.caixa) + ' €): aviso "necessidade de financiamento" e o balanço fecha');
  verificar(!/provisório/.test(neg.texto('balanco-avisos')), 'sem aviso "provisório" quando a verificação fecha');

  // Se a verificação falhar (simulado com uma classificação errada), a linha fica a vermelho e volta o "provisório".
  const falha = carregarApp();
  falha.correr('const classificarOriginal = classificarBalanco; classificarBalanco = (l, c) => Object.assign(classificarOriginal(l, c), { diferenca: 12.34, fecha: false }); calcular();');
  verificar(/verificacao falha/.test(falha.el('balanco-verificacao').innerHTML) && /12,34 €/.test(falha.texto('balanco-verificacao')) && /Balanço provisório/.test(falha.texto('balanco-avisos')),
    'verificação falhada: linha a vermelho com a diferença e aviso "Balanço provisório"');
}

// ── 4. Quadro com 4 cenários ao mês 12
function testeQuadro() {
  console.log('\n[4] Quadro de cenários: DR (mês) e Balanço ao fim do mês 12');
  const cenarios = {
    'Dependente + Independente': { m0_contrato: 'dependente', m1_contrato: 'independente', m1_fat_uber: 2000, m1_dias_sem: 5, m1_horas_dia: 8, m1_pct_uber: 40 },
    '2 Independentes': { m0_contrato: 'independente', m0_pct_uber: 50, m1_contrato: 'independente', m1_fat_uber: 2000, m1_dias_sem: 5, m1_horas_dia: 8, m1_pct_uber: 40 },
    '2 Dependentes': { m0_contrato: 'dependente', m1_contrato: 'dependente', m1_fat_uber: 2000, m1_dias_sem: 5, m1_horas_dia: 8, m1_salario: 870 },
    '1 Inactivo (Alexandre ind.)': { m0_contrato: 'independente', m0_pct_uber: 50, m1_contrato: 'inactivo' }
  };
  const linhas = [
    ['Receita líquida (mês)', (m) => m.receitaLiq], ['EBITDA (mês)', (m) => m.ebitda], ['Resultado líquido (mês)', (m) => m.resLiq],
    ['Viatura líquida', (m, b) => b.ativo.viaturaLiq], ['Caixa', (m, b) => b.ativo.caixa], ['A receber plataformas', (m, b) => b.ativo.receber],
    ['TOTAL ATIVO', (m, b) => b.ativo.total], ['Dívida da viatura', (m, b) => b.passivo.dividaCorrente + b.passivo.dividaNaoCorrente],
    ['Estado e SS', (m, b) => b.passivo.ivaPagar + b.passivo.irc + b.passivo.irs + b.passivo.ss + b.passivo.ssContratante],
    ['Comissões + férias/Natal', (m, b) => b.passivo.comissoes + b.passivo.feriasNatal], ['TOTAL PASSIVO', (m, b) => b.passivo.total],
    ['Resultados acumulados', (m, b) => b.cp.resultados], ['TOTAL CAPITAL PRÓPRIO', (m, b) => b.cp.total],
    ['Verificação A − (P + CP)', (m, b) => Math.abs(b.diferenca) < TOL ? 0 : b.diferenca]
  ];
  const res = Object.entries(cenarios).map(([nome, v]) => {
    const app = carregarApp();
    definir(app, Object.assign({ bal_horizonte: 12 }, v));
    return { nome, m: modelo(app), b: balanco(app), visivel: verificacaoVisivel(app), cfg: cfgDom(app) };
  });
  const c0 = res[0].cfg;
  console.log('  Comparação: DR do mês ' + c0.fin_mes_atual + ' (resultado mensal) e Balanço ao fim do mês 12 (mês civil de início ' + c0.balanco.mes_inicio + ', ou seja, janeiro a dezembro do ano 1).');
  console.log('  Comum aos 4: só Uber (comissão ' + c0.plataformas.uber.comissao + '%), IVA ' + c0.iva.regime + ' (' + c0.iva.taxa + '%), base da percentagem ' + c0.base_iva + ' IVA, crédito ' + c0.fin_capital + ' € a ' + c0.fin_taxa + '% / ' + c0.fin_prazo + ' meses,');
  const bc = c0.balanco;
  console.log('  depreciação ' + c0.vida_util_anos + ' anos, IVA ' + bc.iva_periodicidade + ', recebimento ' + bc.prazo_receber_dias + ' dias, comissões pagas ' + bc.prazo_comissoes_meses + ' mês depois, distribuição ' + (bc.distribuicao ? 'ligada' : 'desligada') + ', capital social ' + bc.capital_social + ' €, suprimentos ' + bc.suprimentos + ' €.');
  console.log('  Pressupostos por motorista (facturação Gross Fare Uber €/mês · dias × horas · contrato · % ou salário bruto):');
  res.forEach(r => {
    const desc = r.cfg.motoristas.map(m => {
      const base = m.nome + ': ' + m.contrato;
      if (m.contrato === 'inactivo') return base + ' (sem receita nem custos)';
      const extra = m.contrato === 'independente' ? m.pct.uber + '% do valor líquido sem IVA' : 'salário ' + m.dep.salario + ' € × 14, sub. refeição ' + m.dep.sub_ref_dias + ' × ' + m.dep.sub_ref_val + ' €';
      return base + ', ' + r2(m.receita.uber.faturacao) + ' €/mês, ' + m.dias_sem + ' × ' + m.horas_dia + ' h, ' + extra;
    }).join(' | ');
    console.log('    ' + r.nome.padEnd(28) + desc);
  });
  console.log('  ' + ''.padEnd(26) + res.map(r => col(r.nome, 28)).join(''));
  linhas.forEach(([lbl, f]) => console.log('  ' + lbl.padEnd(26) + res.map(r => col(r2(f(r.m, r.b)).toFixed(2), 28)).join('')));
  verificar(res.every(r => Math.abs(r.b.diferenca) < TOL && r.visivel), 'verificação a 0,00 € (verde) nos 4 cenários');
}

// ── 5. Carregamento: configuração antiga e configuração da Etapa 1 sem os campos novos
async function carregarAntiga(ficheiro) {
  const linha = Object.assign({ id: 'tvde_alexandre', config_extra: null, atualizado_em: '2026-01-01T00:00:00+00:00' }, JSON.parse(fs.readFileSync(ficheiro, 'utf8')));
  const app = carregarApp({ fetch: async () => ({ ok: true, status: 200, json: async () => [linha] }) });
  await app.correr('carregarConfig()');
  return app;
}

async function testeCarregamento(ficheiroAntigo) {
  console.log('\n[5] Carregamento de configurações');
  const omissao = JSON.parse(carregarApp().correr('JSON.stringify(BALANCO_OMISSAO)'));
  if (ficheiroAntigo) {
    const antiga = await carregarAntiga(ficheiroAntigo);
    const b = balanco(antiga);
    verificar(antiga.el('sb-status').textContent === '✔ Configuração antiga carregada: motoristas como Independentes', 'configuração antiga carregada: ' + antiga.el('sb-status').textContent);
    verificar(JSON.stringify(cfgDom(antiga).balanco) === JSON.stringify(omissao) && Math.abs(b.diferenca) < TOL && verificacaoVisivel(antiga), 'parâmetros do Balanço por omissão; balanço ao mês 12 fecha');
    console.log('\n  Balanço da configuração antiga ao fim do mês 12:');
    antiga.tabela('balanco-table').forEach(l => console.log('    ' + l));
    console.log('    ' + antiga.texto('balanco-verificacao'));
    const avisos = antiga.texto('balanco-avisos');
    if (avisos) console.log('    ' + avisos);
  } else {
    console.log('  (configuração antiga não indicada — passo omitido)');
  }

  // Configuração guardada pela Etapa 1: config_extra sem "balanco"
  let corpo = null;
  const origem = carregarApp({ fetch: async (url, op) => { corpo = op.body; return { ok: true, status: 201 }; } });
  definir(origem, { m0_pct_uber: 50 });
  await origem.correr('guardarConfig()');
  const linha = JSON.parse(corpo);
  verificar(linha.config_extra.balanco && Object.keys(linha).length === 27, 'Guardar: parâmetros do Balanço em config_extra.balanco; 24 colunas planas + id + atualizado_em + config_extra');
  delete linha.config_extra.balanco;
  const etapa1 = carregarApp({ fetch: async () => ({ ok: true, status: 200, json: async () => [linha] }) });
  await etapa1.correr('carregarConfig()');
  const b = balanco(etapa1);
  verificar(etapa1.el('sb-status').textContent === '✔ Configuração carregada' && JSON.stringify(cfgDom(etapa1).balanco) === JSON.stringify(omissao),
    'config sem os campos novos: carregada sem erro, valores por omissão (' + etapa1.el('sb-status').textContent + ')');
  verificar(Math.abs(b.diferenca) < TOL && etapa1.texto('motoristas-avisos').indexOf('Balanço:') < 0, 'balanço fecha e não há erros de validação');

  // Viagem completa com parâmetros do Balanço alterados
  let corpo2 = null;
  const o2 = carregarApp({ fetch: async (url, op) => { corpo2 = op.body; return { ok: true, status: 201 }; } });
  definir(o2, { bal_horizonte: 18, bal_mes_inicio: 9, bal_iva_periodicidade: 'mensal', bal_prazo_receber: 14, bal_prazo_comissoes: 2, bal_mes_ferias: 7, bal_mes_natal: 11, bal_capital_social: 2500, bal_suprimentos: 3000, bal_distribuicao: true });
  await o2.correr('guardarConfig()');
  const d2 = carregarApp({ fetch: async () => ({ ok: true, status: 200, json: async () => [JSON.parse(corpo2)] }) });
  await d2.correr('carregarConfig()');
  verificar(JSON.stringify(cfgDom(o2)) === JSON.stringify(cfgDom(d2)) && JSON.stringify(o2.tabela('balanco-table')) === JSON.stringify(d2.tabela('balanco-table')),
    'Guardar → Carregar com parâmetros do Balanço alterados: configuração e Balanço idênticos');

  // Validação
  let chamou = false;
  const val = carregarApp({ fetch: async () => { chamou = true; return { ok: true, status: 201 }; } });
  definir(val, { bal_horizonte: 30, bal_prazo_comissoes: -1 });
  await val.correr('guardarConfig()');
  const erros = val.texto('dr-avisos');
  verificar(!chamou && /Balanço: o mês N tem de ser um número inteiro entre 1 e 24/.test(erros) && /prazo de pagamento das comissões/.test(erros), 'parâmetros inválidos: erros em PT-PT e Guardar bloqueado');
}

async function main() {
  const ficheiroAntigo = process.argv[2];
  testeFecho();
  await testeBaseline(ficheiroAntigo);
  testeMecanica();
  testeQuadro();
  await testeCarregamento(ficheiroAntigo);
  console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'));
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(e => { console.error('Erro inesperado nos testes:', e); process.exit(1); });
