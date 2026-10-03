// Testes da Etapa 3 (correcções do modelo: receita por dia ativo, crédito de IVA, SS da entidade contratante,
// EBITDA, cenário dependente e art. 53.º nos recibos).
// Uso: node tests/etapa3.js
// Requer tests/baseline-f4aba6b.json (node tests/baseline-etapa3.js). As configurações reais e o respectivo
// baseline (tests/config-supabase-*.json, tests/baseline-f4aba6b-supabase.json) são opcionais e estão fora do git.
'use strict';
const fs = require('fs');
const path = require('path');
const { carregarApp } = require('./dom-simulado');
const { TIPOS, cenariosDR, definir, capturarDR } = require('./cenarios-teste');
const { capturar, htmlDoCommit } = require('./baseline-etapa3');

let falhas = 0;
function verificar(condicao, descricao) {
  console.log((condicao ? '  ✔ ' : '  ✗ ') + descricao);
  if (!condicao) falhas++;
}
const r2 = v => Math.round(v * 100) / 100;
const TOL = 0.005;
const perto = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const col = (v, n) => String(v).padStart(n);
const json = (app, expr) => JSON.parse(app.correr('JSON.stringify(' + expr + ')'));
const modelo = app => json(app, 'calcModelo(lerCfgDoDOM())');
const balancoN = (app, N) => json(app, `calcBalanco(Object.assign(lerCfgDoDOM(), { balanco: Object.assign(lerCfgDoDOM().balanco, { horizonte: ${N} }) }), calcModelo(lerCfgDoDOM()))`);
const fmtPt = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const HTML_ANTIGO = htmlDoCommit();
const BASE = require('./baseline-f4aba6b.json');
const FICHEIRO_BASE_REAL = path.join(__dirname, 'baseline-f4aba6b-supabase.json');

// ── Caminho da versão anterior: a página antiga (f4aba6b) guarda a configuração e a página nova carrega-a.
async function guardarNaPaginaAntiga(valores) {
  let corpo = null;
  const antiga = carregarApp({ html: HTML_ANTIGO, fetch: async (url, op) => { corpo = op.body; return { ok: true, status: 201 }; } });
  definir(antiga, valores);
  await antiga.correr('guardarConfig()');
  return corpo ? JSON.parse(corpo) : null;
}
async function carregarLinhaNova(linha) {
  const app = carregarApp({ fetch: async () => ({ ok: true, status: 200, json: async () => [linha] }) });
  await app.correr('carregarConfig()');
  return app;
}

// ── Diferenças entre listas de linhas (multiconjunto): o que saiu e o que entrou.
function diferenca(antes, depois) {
  const conta = new Map();
  antes.forEach(l => conta.set(l, (conta.get(l) || 0) + 1));
  const entrou = [];
  depois.forEach(l => { if (conta.get(l) > 0) conta.set(l, conta.get(l) - 1); else entrou.push(l); });
  const saiu = [];
  conta.forEach((n, l) => { for (let i = 0; i < n; i++) saiu.push(l); });
  return { saiu, entrou };
}
const valorDe = linha => linha.split(' | ').slice(1).join(' | ');

// Alterações permitidas na DR (correcção 1): "= EBITDA" antigo passa a "= Margem antes de pessoal" com o mesmo
// valor, e entra a linha nova do EBITDA.
function alteracaoDRPermitida(antes, depois) {
  const d = diferenca(antes, depois);
  if (d.saiu.length === 0 && d.entrou.length === 0) return { ok: true, linhas: [] };
  const ebitdaAntigo = d.saiu.filter(l => l.startsWith('= EBITDA |'));
  const margem = d.entrou.filter(l => l.startsWith('= Margem antes de pessoal |'));
  const ebitdaNovo = d.entrou.filter(l => l.startsWith('= EBITDA (antes de depreciações, juros e impostos) |'));
  const ok = d.saiu.length === 1 && ebitdaAntigo.length === 1 && d.entrou.length === 2 && margem.length === 1 && ebitdaNovo.length === 1 &&
    valorDe(ebitdaAntigo[0]) === valorDe(margem[0]);
  return { ok, linhas: d.saiu.map(l => '− ' + l).concat(d.entrou.map(l => '+ ' + l)) };
}

// Grelhas dos Cenários: EBITDA → Margem antes de pessoal (mesmo valor), EBITDA novo, secção "Depreciações";
// salários abaixo do mínimo marcados com ⚠.
function alteracaoGrelhaPermitida(id, antes, depois) {
  const d = diferenca(antes, depois);
  const resto = { saiu: [], entrou: [] };
  const semMarca = l => l.replace(/ ⚠/g, '');
  const entrouSemMarca = d.entrou.map(semMarca);
  d.saiu.forEach(l => {
    const j = entrouSemMarca.indexOf(l);
    if (/^(Salário bruto) \|/.test(l) && j >= 0) { entrouSemMarca[j] = null; return; }
    resto.saiu.push(l);
  });
  d.entrou.forEach((l, i) => { if (entrouSemMarca[i] !== null) resto.entrou.push(l); });
  if (id === 'cn-grid-drm' || id === 'cn-grid-dr') {
    const e = resto.saiu.filter(l => l.startsWith('= EBITDA |'));
    const m = resto.entrou.filter(l => l.startsWith('= Margem antes de pessoal |'));
    const n = resto.entrou.filter(l => l.startsWith('= EBITDA |'));
    const s = resto.entrou.filter(l => l === '§ Depreciações');
    const ok = resto.saiu.length === 1 && e.length === 1 && m.length === 1 && n.length === 1 && s.length === 1 && resto.entrou.length === 3 &&
      valorDe(e[0]) === valorDe(m[0]);
    return { ok, linhas: resto.saiu.concat(resto.entrou) };
  }
  return { ok: resto.saiu.length === 0 && resto.entrou.length === 0, linhas: resto.saiu.map(l => '− ' + l).concat(resto.entrou.map(l => '+ ' + l)) };
}

// Balanço visível: entram as três linhas informativas da caixa; muda o rótulo da SS da entidade contratante.
function alteracaoBalancoPermitida(antes, depois, mudaValores) {
  const d = diferenca(antes, depois);
  const info = d.entrou.filter(l => l.startsWith('· dos quais:'));
  const ssNovo = d.entrou.filter(l => l.startsWith('Segurança Social — entidade contratante'));
  const ssAntigo = d.saiu.filter(l => l.startsWith('Segurança Social — entidade contratante'));
  const outrosSaiu = d.saiu.filter(l => !l.startsWith('Segurança Social — entidade contratante'));
  const outrosEntrou = d.entrou.filter(l => !l.startsWith('· dos quais:') && !l.startsWith('Segurança Social — entidade contratante'));
  const rotuloOk = ssAntigo.length === 1 && ssNovo.length === 1 && (mudaValores || valorDe(ssAntigo[0]) === valorDe(ssNovo[0]));
  const ok = info.length === 3 && rotuloOk && (mudaValores
    ? outrosSaiu.every(l => /^(Caixa e depósitos|= TOTAL DO ATIVO|= TOTAL DO PASSIVO|= TOTAL DO CAPITAL PRÓPRIO E DO PASSIVO|Autonomia financeira|Endividamento)/.test(l)) &&
      outrosEntrou.every(l => /^(Caixa e depósitos|= TOTAL DO ATIVO|= TOTAL DO PASSIVO|= TOTAL DO CAPITAL PRÓPRIO E DO PASSIVO|Autonomia financeira|Endividamento)/.test(l))
    : outrosSaiu.length === 0 && outrosEntrou.length === 0);
  return { ok, linhas: d.saiu.map(l => '− ' + l).concat(d.entrou.map(l => '+ ' + l)) };
}

// Comparação completa de um caso com o baseline. Devolve as linhas alteradas por tabela e a lista de falhas.
// factorCenarios: nos Cenários o Alexandre é simulado como dependente; se estiver inactivo, os dias dele passam a
// contar para km e custos variáveis (correcção 2). factorCenarios = dias da viatura com ele ÷ dias sem ele.
function compararComBaseline(nome, esperado, obtido, registo, factorCenarios) {
  const erros = [];
  const regista = (tabela, linhas) => linhas.forEach(l => { const k = tabela + ' :: ' + l.replace(/\| .*$/, '').trim(); registo[k] = (registo[k] || 0) + 1; });
  const E = esperado.dr, O = obtido.dr;
  // DR mensal e anual, conta de exploração
  [['drMensal', E.drMensal, O.drMensal], ['drAnual', E.drAnual, O.drAnual], ['conta-table', E['conta-table'], O['conta-table']]].forEach(([t, a, b]) => {
    const r = alteracaoDRPermitida(a, b);
    regista(t, r.linhas);
    if (!r.ok) erros.push(t + ': ' + r.linhas.join(' ; '));
  });
  // Restantes tabelas: idênticas
  ['rem-table', 'dist-table', 'energia-table', 'rvp-table', 'amort-table', 'kpi-mensal', 'kpi-rem', 'kpi-rvp'].forEach(t => {
    if (JSON.stringify(E[t]) !== JSON.stringify(O[t])) erros.push(t + ' diferente');
  });
  // KPI da DR: só muda a margem EBITDA
  const semMargem = t => t.replace(/[−\-\d.,]+% margem EBITDA/, '#% margem EBITDA');
  ['kpiDrMensal', 'kpiDrAnual'].forEach(t => {
    if (semMargem(E[t]) !== semMargem(O[t])) erros.push(t + ' diferente fora da margem EBITDA');
    if (E[t] !== O[t]) regista(t, ['margem EBITDA']);
  });
  // Grelhas dos Cenários
  if (factorCenarios) {
    // Energia e variáveis dos Cenários escalam com os dias do Alexandre; o resto da DR dos Cenários segue daí.
    const euros = l => parseFloat(valorDe(l).split(' | ')[0].replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.'));
    ['(−) Energia', '(−) Variáveis'].forEach(r => {
      const a = E.grelhas['cn-grid-drm'].find(l => l.startsWith(r + ' |')), b = O.grelhas['cn-grid-drm'].find(l => l.startsWith(r + ' |'));
      if (!a || !b || Math.abs(euros(a) * factorCenarios - euros(b)) > 1) erros.push('Cenários: ' + r + ' não escala com os dias do Alexandre (' + a + ' × ' + factorCenarios + ' ≠ ' + b + ')');
    });
    regista('Cenários com o Alexandre inactivo (simulado como dependente): km e variáveis × ' + r2(factorCenarios), ['grelhas dos Cenários']);
  } else {
    Object.keys(E.grelhas).forEach(id => {
      const r = alteracaoGrelhaPermitida(id, E.grelhas[id], O.grelhas[id]);
      regista(id, r.linhas);
      if (!r.ok) erros.push(id + ': ' + r.linhas.join(' ; '));
    });
  }
  // Avisos: os antigos mantêm-se; podem entrar avisos novos (correcções 2, 5 e 6)
  const partes = t => t.split(/(?=[⚠✗])/).map(x => x.trim()).filter(Boolean);
  ['cn-aviso', 'dr-avisos'].forEach(id => {
    const a = partes(E.textos[id]), b = partes(O.textos[id]);
    const d = diferenca(a, b);
    if (d.saiu.length) erros.push(id + ': avisos removidos: ' + d.saiu.join(' ; '));
    regista(id, d.entrou.map(l => l.slice(0, 60)));
  });
  // Modelo: todos os campos numéricos iguais, excepto o EBITDA (correcção 1)
  const mE = E.modelo, mO = O.modelo;
  Object.keys(mE).forEach(k => {
    if (typeof mE[k] !== 'number' || k === 'ebitda') return;
    if (!perto(mE[k], mO[k], 1e-6 * Math.max(1, Math.abs(mE[k])))) erros.push('modelo.' + k + ': ' + mE[k] + ' ≠ ' + mO[k]);
  });
  ['ebit', 'ebt', 'resLiq', 'irc', 'fluxo', 'ebtA', 'ircA', 'resA', 'fluxoA'].forEach(k => { if (!perto(mE[k], mO[k], 1e-6 * Math.max(1, Math.abs(mE[k])))) erros.push('modelo.' + k + ' mudou'); });
  if (!perto(mO.margemAntesPessoal, mE.ebitda, 1e-9)) erros.push('margem antes de pessoal ≠ EBITDA antigo');
  if (!perto(mO.ebitda - mO.deprMes, mO.ebit, 1e-9)) erros.push('EBITDA − depreciação ≠ EBIT');
  // Balanço ao mês 12: idêntico (a SS da entidade contratante do ano 1 só é paga no ano 2)
  const B12e = esperado.bal.bal12, B12o = obtido.bal.bal12;
  ['ativo', 'passivo', 'cp'].forEach(g => Object.keys(B12e[g]).forEach(k => {
    if (!perto(B12e[g][k], B12o[g][k], 1e-6)) erros.push('bal12.' + g + '.' + k + ': ' + B12e[g][k] + ' ≠ ' + B12o[g][k]);
  }));
  if (!perto(B12e.caixaMin, B12o.caixaMin, 1e-6)) erros.push('bal12.caixaMin mudou');
  const t12 = alteracaoBalancoPermitida(esperado.bal.tabelaBal12, obtido.bal.tabelaBal12, false);
  regista('balanco-table (N=12)', t12.linhas);
  if (!t12.ok) erros.push('tabela do Balanço N=12: ' + t12.linhas.join(' ; '));
  // Balanço ao mês 24: só a caixa e a SS da entidade contratante (correcção 3) e os totais
  const B24e = esperado.bal.bal24, B24o = obtido.bal.bal24;
  const ss1 = B12e.passivo.ssContratante;
  const MUDAM = { 'ativo.caixa': -ss1, 'ativo.total': -ss1, 'passivo.ssContratante': -ss1, 'passivo.total': -ss1 };
  ['ativo', 'passivo', 'cp'].forEach(g => Object.keys(B24e[g]).forEach(k => {
    const delta = MUDAM[g + '.' + k] || 0;
    if (!perto(B24e[g][k] + delta, B24o[g][k], 1e-6)) erros.push('bal24.' + g + '.' + k + ': ' + B24e[g][k] + ' + ' + delta + ' ≠ ' + B24o[g][k]);
  }));
  if (Math.abs(B24o.diferenca) >= TOL) erros.push('bal24 não fecha');
  const t24 = alteracaoBalancoPermitida(esperado.bal.tabelaBal24, obtido.bal.tabelaBal24, ss1 > 0);
  regista('balanco-table (N=24)', t24.linhas);
  if (!t24.ok) erros.push('tabela do Balanço N=24: ' + t24.linhas.join(' ; '));
  // Caixa mês a mês: igual até ao mês 14; a partir do mês 15 (março do ano 2) menos a SS do ano 1
  esperado.bal.caixa.forEach((c, i) => {
    const delta = i + 1 >= 15 ? -ss1 : 0;
    if (!perto(c + delta, obtido.bal.caixa[i], 1e-6)) erros.push('caixa do mês ' + (i + 1) + ': ' + c + ' + ' + delta + ' ≠ ' + obtido.bal.caixa[i]);
  });
  if (erros.length) console.log('    ✗ ' + nome + ': ' + erros.slice(0, 4).join(' | ').slice(0, 600));
  return { ok: erros.length === 0, ss1, caixaMinAntes: B24e.caixaMin, caixaMinDepois: B24o.caixaMin };
}

// ── 1. Regressão: 82 configurações da versão anterior e configurações reais
async function testeRegressao() {
  console.log('\n[1] Regressão contra o baseline f4aba6b: configurações guardadas pela página antiga e carregadas pela nova');
  const registo = {};
  let iguais = 0, total = 0, guardadas = 0, ssPagas = 0;
  for (const c of cenariosDR()) {
    const linha = await guardarNaPaginaAntiga(c.valores);
    if (!linha) { console.log('    ✗ ' + c.nome + ': a página antiga não guardou'); total++; continue; }
    guardadas++;
    if (linha.config_extra.versao !== 1) console.log('    ✗ ' + c.nome + ': versão guardada ' + linha.config_extra.versao);
    const app = await carregarLinhaNova(linha);
    const cfgN = json(app, 'lerCfgDoDOM()');
    const diasSem = json(app, 'diasAtivosSemana(lerCfgDoDOM())');
    const factor = cfgN.motoristas[0].contrato === 'inactivo' && diasSem > 0 ? (diasSem + cfgN.motoristas[0].dias_sem) / diasSem : 0;
    const r = compararComBaseline(c.nome, BASE.cenarios[c.nome], capturar(app), registo, factor);
    total++;
    if (r.ok) iguais++;
    if (r.ss1 > 0) ssPagas++;
  }
  verificar(guardadas === total, 'página antiga guardou as ' + guardadas + '/' + total + ' configurações (config_extra versão 1)');
  verificar(iguais === total, total + ' configurações: só mudam as linhas pedidas em ' + iguais + '/' + total + ' (' + ssPagas + ' com SS da entidade contratante paga no mês 15)');

  if (fs.existsSync(FICHEIRO_BASE_REAL)) {
    const baseReal = require(FICHEIRO_BASE_REAL);
    for (const f of Object.keys(baseReal.configs)) {
      const ficheiro = path.join(__dirname, f);
      if (!fs.existsSync(ficheiro)) continue;
      const linha = Object.assign({ id: 'tvde_alexandre', config_extra: null, atualizado_em: '2026-01-01T00:00:00+00:00' }, JSON.parse(fs.readFileSync(ficheiro, 'utf8')));
      const app = await carregarLinhaNova(linha);
      const estadoOk = app.el('sb-status').textContent === baseReal.configs[f].estado;
      const r = compararComBaseline(f, baseReal.configs[f], capturar(app), registo);
      verificar(r.ok && estadoOk, 'configuração real ' + f + ' (versão ' + (linha.config_extra ? linha.config_extra.versao : 'sem config_extra') + '): carregada sem erro, só mudam as linhas pedidas; caixa mínima 24 m ' +
        fmtPt(r.caixaMinAntes) + ' → ' + fmtPt(r.caixaMinDepois) + ' €');
    }
  } else {
    console.log('  (baseline das configurações reais não encontrado — comparação omitida)');
  }
  console.log('  Linhas alteradas (tabela :: linha → n.º de casos):');
  Object.entries(registo).sort().forEach(([k, n]) => console.log('    ' + k.slice(0, 110).padEnd(112) + col(n, 4)));
}

// ── 2. Correcção 2: receita e custos variáveis escalam com dias e semanas
function cenarioEscala() {
  const app = carregarApp();
  definir(app, { m0_contrato: 'independente', m0_pct_uber: 60, m1_contrato: 'independente', m1_dias_sem: 5, m1_horas_dia: 6, m1_pct_uber: 55, m1_fat_uber: 1500, m0_gorj_uber: 60 });
  return app;
}
function contribuicaoMotorista(m, mod) {
  const autoliqNaoDed = mod.regimeIva === 'isento' ? m.plataformas.reduce((s, p) => s + p.autoliq, 0) : 0;
  return m.liquido - m.pagamento - m.encSS - m.ivaReciboNaoDed - autoliqNaoDed;
}
function testeEscala() {
  console.log('\n[2] Correcção 2: receita, energia e custos variáveis escalam com dias ativos e semanas por mês');
  console.log('  Entradas e dependências:');
  const tabela = [
    ['Gross Fare (por motorista e plataforma)', '€/dia × dias ativos/semana do motorista × semanas/mês', 'sim (era €/mês)'],
    ['Gorjetas', '€/dia × dias ativos/semana do motorista × semanas/mês', 'sim (era €/mês)'],
    ['Bónus da plataforma', '€/mês (campanhas da plataforma)', 'não'],
    ['Comissões das plataformas, IVA, autoliquidação', '% do Gross Fare', 'sim (via receita)'],
    ['Comissões a independentes, SS entidade contratante, IVA dos recibos', '% do valor líquido', 'sim (via receita)'],
    ['Km / energia', 'km/dia ativo × Σ dias ativos/semana × semanas/mês × consumo × tarifa', 'sim (era km/semana fixo: só semanas)'],
    ['Portagens, manutenção, limpeza', '€/dia ativo × Σ dias ativos/semana × semanas/mês', 'sim (era €/mês)'],
    ['Salário, TSU, subsídios de férias e Natal', '€/mês × 14/12', 'não (contrato)'],
    ['Subsídio de refeição', 'dias/mês (entrada) × €/dia', 'não; aviso se diferir dos dias ativos'],
    ['Ajudas de custo', '€/mês (entrada)', 'não (valor acordado, a validar)'],
    ['Estrutura (seguros, contabilidade, telemóvel, garagem)', '€/mês', 'não'],
    ['Depreciação, juros, prestação', 'capital, taxa, prazo, vida útil', 'não'],
    ['Horas (capacidade da viatura)', 'h/dia × dias/semana × semanas', 'sim; só avisos (a receita é por dia, não por hora)']
  ];
  tabela.forEach(l => console.log('    ' + l[0].padEnd(70) + l[1].padEnd(76) + l[2]));

  const app = cenarioEscala();
  const m0 = modelo(app);
  console.log('  Caso: 2 independentes (60 % / 55 %), 6 e 5 dias, Uber 25 %. MC = margem de contribuição (receita líquida − energia, variáveis e custos dos independentes)');
  console.log('  ' + 'Variação'.padEnd(26) + col('Bruto', 11) + col('Energia', 9) + col('Variáveis', 10) + col('MC/dia', 9) + col('MC/dia mot.', 12) + col('Res. líq.', 11) + col('Δ res.', 9) + '  sentido');
  let proporcional = true, sentidoOk = true;
  const linha = (nome, m, mcRef, delta) => {
    const dRes = m.resLiq - m0.resLiq;
    const esperado = Math.sign(mcRef * delta);
    const ok = Math.abs(dRes) < 1e-9 ? delta === 0 || mcRef === 0 : Math.sign(dRes) === esperado;
    if (!ok) sentidoOk = false;
    console.log('  ' + nome.padEnd(26) + col(fmtPt(m.F), 11) + col(fmtPt(m.energia), 9) + col(fmtPt(m.varTotal), 10) + col(fmtPt(m.mcDia), 9) + col(fmtPt(mcRef), 12) + col(fmtPt(m.resLiq), 11) + col(fmtPt(dRes), 9) + '  ' + (ok ? '✔' : '✗'));
  };
  linha('base (4,3 semanas)', m0, m0.mcDia, 0);
  [4.0, 4.3, 4.345].forEach(sem => {
    definir(app, { sem_mes: sem });
    const m = modelo(app);
    const f = sem / 4.3;
    if (!perto(m.F, m0.F * f, 1e-6) || !perto(m.varTotal, m0.varTotal * f, 1e-6) || !perto(m.energia, m0.energia * f, 1e-6)) proporcional = false;
    linha('semanas ' + String(sem).replace('.', ','), m, m0.margemContribuicao, sem - 4.3);
    // Com menos semanas o resultado só melhora se a margem de contribuição for negativa
    if (sem < 4.3 && m.resLiq > m0.resLiq && m0.margemContribuicao >= 0) sentidoOk = false;
  });
  definir(app, { sem_mes: 4.3 });
  [[0, -1], [0, 1], [1, -1], [1, 1]].forEach(([i, d]) => {
    const id = i === 0 ? 'dias_sem' : 'm1_dias_sem';
    const antes = m0.motoristas[i].dias_sem;
    definir(app, { [id]: antes + d });
    const m = modelo(app);
    const mot0 = m0.motoristas[i];
    const fM = (antes + d) / antes;
    const fV = (m0.diasSemViatura + d) / m0.diasSemViatura;
    if (!perto(m.motoristas[i].F, mot0.F * fM, 1e-6) || !perto(m.varTotal, m0.varTotal * fV, 1e-6) || !perto(m.energia, m0.energia * fV, 1e-6)) proporcional = false;
    // MC de um dia deste motorista: contribuição por dia dele − energia e variáveis por dia da viatura
    const mcMot = contribuicaoMotorista(mot0, m0) / mot0.diasMes - (m0.energia + m0.varTotal) / m0.diasMesViatura;
    linha(m0.motoristas[i].nome + ' ' + (d > 0 ? '+' : '−') + '1 dia', m, mcMot, d);
    definir(app, { [id]: antes });
  });
  verificar(proporcional, 'receita, energia e custos variáveis escalam em proporção com semanas (4,0 / 4,3 / 4,345) e com os dias de cada motorista (±1)');
  verificar(sentidoOk, 'o sentido do resultado coincide com a margem de contribuição por dia; com menos semanas o resultado não melhora com MC ≥ 0');

  // Sentido inverso: com MC negativa por dia (comissões a 100 %), menos semanas melhoram o resultado
  const neg = cenarioEscala();
  definir(neg, { m0_pct_uber: 100, m1_pct_uber: 100 });
  const n0 = modelo(neg);
  definir(neg, { sem_mes: 4.0 });
  const n1 = modelo(neg);
  verificar(n0.mcDia < 0 && n1.resLiq > n0.resLiq, 'com MC/dia negativa (' + fmtPt(n0.mcDia) + ' €), 4,0 semanas melhoram o resultado (' + fmtPt(n0.resLiq) + ' → ' + fmtPt(n1.resLiq) + ' €): coerente');

  // Valor mensal visível e só de leitura
  const appV = cenarioEscala();
  const mV = modelo(appV);
  const txt = appV.el('m0_fatmes_uber').textContent;
  verificar(txt === mV.motoristas[0].plataformas[0].F.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €', 'facturação mensal visível (só leitura): ' + txt);

  // Avisos de capacidade mantêm-se
  const cap = cenarioEscala();
  definir(cap, { horas_dia: 14, m1_horas_dia: 12, dias_sem: 7, m1_dias_sem: 7 });
  const av = cap.texto('dr-avisos');
  verificar(/excedem a capacidade de uma viatura \(24 h\/dia\)/.test(av) && /excedem a capacidade de uma viatura \(168 h\/semana\)/.test(av) && /excede o limite de 10 h/.test(av),
    'avisos de capacidade (24 h/dia, 168 h/semana, 10 h de condução) continuam a aparecer');
}

// ── 2b. Retrocompatibilidade e viagem completa no formato novo
async function testeFormato() {
  console.log('\n[2b] Formato da configuração: versão 1 com dias ou semanas a 0, Guardar → Carregar na versão 2');
  // Motorista 2 activo com facturação mensal e 0 dias: mantém o valor mensal e assinala
  const linha = await guardarNaPaginaAntiga({ m1_contrato: 'independente', m1_fat_uber: 900, m1_pct_uber: 40, m1_dias_sem: 0 });
  const antigo = carregarApp({ html: HTML_ANTIGO });
  definir(antigo, { m1_contrato: 'independente', m1_fat_uber: 900, m1_pct_uber: 40, m1_dias_sem: 0 });
  const novo = await carregarLinhaNova(linha);
  const mA = modelo(antigo), mN = modelo(novo);
  verificar(perto(mA.F, mN.F) && perto(mA.resLiq, mN.resLiq) && mN.motoristas[1].usaFixo && /valor mensal fixo/.test(novo.texto('dr-avisos')),
    'motorista com 0 dias: facturação mensal mantida (' + fmtPt(mN.motoristas[1].F) + ' €), DR igual e aviso visível');
  // Editar o valor por dia (mesmo para 0) anula o valor mensal fixo herdado
  definir(novo, { m1_dias_sem: 5 });
  novo.correr("setVal('m1_fatdia_uber', 0); aoEditarPorDia('m1_fatdia_uber')");
  verificar(modelo(novo).motoristas[1].F === 0 && !modelo(novo).motoristas[1].usaFixo, 'Gross Fare por dia editado para 0: o valor mensal fixo herdado deixa de contar (receita 0)');
  // Semanas a 0: km e custos variáveis mantidos como valores mensais fixos
  const l0 = await guardarNaPaginaAntiga({ sem_mes: 0 });
  const a0 = carregarApp({ html: HTML_ANTIGO }); definir(a0, { sem_mes: 0 });
  const n0 = await carregarLinhaNova(l0);
  verificar(perto(modelo(a0).resLiq, modelo(n0).resLiq) && modelo(n0).usaFixosViatura, 'semanas a 0: resultado igual ao da versão anterior e km/custos variáveis assinalados como fixos');

  // Guardar → Carregar no formato novo
  let corpo = null;
  const o = carregarApp({ fetch: async (url, op) => { corpo = op.body; return { ok: true, status: 201 }; } });
  definir(o, { m0_contrato: 'dependente', m1_contrato: 'independente', m1_dias_sem: 4, m1_horas_dia: 7, m1_fatdia_uber: 95.5, m1_gorjdia_uber: 2.25, m1_bonus_uber: 40, m1_pct_uber: 45,
    km_dia: 310, portagens_dia: 3.2, manut_dia: 4.1, limpeza_dia: 1.5, bal_iva_recuperacao: 'reembolso', bal_iva_reembolso_meses: 9, bal_mes_ss_contratante: 5, bal_ano_inicio: 2027 });
  await o.correr('guardarConfig()');
  const extra = JSON.parse(corpo).config_extra;
  const d = await carregarLinhaNova(JSON.parse(corpo));
  const cfgO = json(o, 'lerCfgDoDOM()'), cfgD = json(d, 'lerCfgDoDOM()');
  verificar(extra.versao === 2 && extra.actividade.km_dia === 310 && extra.motoristas[1].receita.uber.fat_dia === 95.5 && extra.balanco.iva_recuperacao === 'reembolso',
    'config_extra guardado na versão 2 (valores por dia, actividade e parâmetros novos do Balanço)');
  verificar(JSON.stringify(cfgO) === JSON.stringify(cfgD) && JSON.stringify(capturarDR(o)) === JSON.stringify(capturarDR(d)) &&
    JSON.stringify(o.tabela('balanco-table')) === JSON.stringify(d.tabela('balanco-table')), 'Guardar → Carregar: configuração, DR e Balanço idênticos');
  const planas = JSON.parse(corpo);
  const mO = modelo(o);
  verificar(perto(planas.km_sem, mO.kmSemana, 1e-4) && perto(planas.portagens, mO.custosVar.portagens, 1e-4) && perto(planas.manut, mO.custosVar.manut, 1e-4),
    'colunas planas km_sem, portagens, manut e limpeza guardadas com os valores calculados (compatibilidade)');
}

// ── 3. Correcção 4: crédito de IVA e reembolso
function cenarioIva(valores) {
  const app = carregarApp();
  definir(app, Object.assign({ m0_contrato: 'independente', m0_pct_uber: 70, m0_iva_recibo: 'normal', m1_contrato: 'independente', m1_dias_sem: 5, m1_horas_dia: 4,
    m1_fat_uber: 1310, m1_pct_uber: 70, m1_iva_recibo: 'normal', iva_regime: 'normal' }, valores || {}));
  return app;
}
function testeIva() {
  console.log('\n[3] Correcção 4: crédito de IVA (recibos com IVA a 23 %) e recuperação');
  const modos = [
    ['recibos isentos', { m0_iva_recibo: 'isento', m1_iva_recibo: 'isento' }],
    ['reporte (por omissão)', {}],
    ['reembolso ao fim de 12 meses', { bal_iva_recuperacao: 'reembolso', bal_iva_reembolso_meses: 12 }],
    ['reembolso ao fim de 6 meses', { bal_iva_recuperacao: 'reembolso', bal_iva_reembolso_meses: 6 }],
    ['reembolso, IVA mensal, 12 meses', { bal_iva_recuperacao: 'reembolso', bal_iva_reembolso_meses: 12, bal_iva_periodicidade: 'mensal' }]
  ];
  console.log('  ' + 'Modo'.padEnd(34) + col('IVA liq./mês', 13) + col('IVA ded./mês', 13) + col('Crédito N=24', 14) + col('Reemb. pedido', 15) + col('Reemb. recebido', 17) + col('Caixa mín. 24 m', 17) + col('Mês', 5) + col('Fecha', 7));
  const res = {};
  let fecham = true, drIgual = true, drRef = null;
  modos.forEach(([nome, v]) => {
    const app = cenarioIva(v);
    const m = modelo(app);
    let ok = true;
    for (let N = 1; N <= 24; N++) if (Math.abs(balancoN(app, N).diferenca) >= TOL) ok = false;
    const b = balancoN(app, 24);
    if (!ok) fecham = false;
    const drSemIvaRecibo = JSON.stringify([m.resLiq, m.ebitda, m.ebit, m.resA]);
    if (nome !== 'recibos isentos') { if (drRef === null) drRef = drSemIvaRecibo; else if (drRef !== drSemIvaRecibo) drIgual = false; }
    res[nome] = { m, b };
    console.log('  ' + nome.padEnd(34) + col(fmtPt(m.ivaLiquidado), 13) + col(fmtPt(m.ivaRecibosDedutivel), 13) + col(fmtPt(b.ativo.ivaRecuperar + b.ativo.ivaReembolso), 14) +
      col(fmtPt(b.fluxos.ivaReembolsoPedido), 15) + col(fmtPt(b.fluxos.ivaReembolsado), 17) + col(fmtPt(b.caixaMin), 17) + col(b.mesCaixaMin, 5) + col(ok ? '✔' : '✗', 7));
  });
  const isento = res['recibos isentos'], reporte = res['reporte (por omissão)'], r12 = res['reembolso ao fim de 12 meses'], r6 = res['reembolso ao fim de 6 meses'];
  verificar(fecham, 'Balanço fecha a 0,00 € em N = 1…24 em todos os modos');
  verificar(drIgual && JSON.stringify([isento.m.resLiq, isento.m.ebitda]) === JSON.stringify([reporte.m.resLiq, reporte.m.ebitda]), 'a DR não muda com o regime dos recibos nem com o modo de recuperação (IVA dedutível no regime normal)');
  verificar(isento.b.ativo.ivaRecuperar === 0 && isento.m.ivaRecibosDedutivel === 0, 'recibos isentos: sem IVA dedutível, crédito zero');
  verificar(reporte.b.ativo.ivaRecuperar > 0 && reporte.b.fluxos.ivaReembolsado === 0 && reporte.b.fluxos.ivaPago === 0, 'reporte: crédito acumulado no ativo (' + fmtPt(reporte.b.ativo.ivaRecuperar) + ' €), sem reembolsos nem IVA pago');
  verificar(r12.b.fluxos.ivaReembolsado > 0 && r12.b.caixaMin > reporte.b.caixaMin, 'reembolso aos 12 meses: ' + fmtPt(r12.b.fluxos.ivaReembolsado) + ' € recebidos; caixa mínima ' + fmtPt(reporte.b.caixaMin) + ' → ' + fmtPt(r12.b.caixaMin) + ' €');
  // Reembolso antes dos 12 meses só com crédito > 3 000 € (CIVA, art. 22.º n.º 6)
  const pedidos6 = [];
  const app6 = cenarioIva({ bal_iva_recuperacao: 'reembolso', bal_iva_reembolso_meses: 6 });
  let antes = 0;
  for (let N = 1; N <= 24; N++) { const b = balancoN(app6, N); if (b.fluxos.ivaReembolsoPedido > antes) { pedidos6.push([N, b.fluxos.ivaReembolsoPedido - antes]); antes = b.fluxos.ivaReembolsoPedido; } }
  verificar(pedidos6.length > 0 && pedidos6.every(([, v]) => v > 3000) && r6.b.fluxos.ivaReembolsado >= r12.b.fluxos.ivaReembolsado,
    'N = 6: pedidos só com crédito > 3 000 € (' + pedidos6.map(([N, v]) => 'mês ' + N + ': ' + fmtPt(v) + ' €').join('; ') + ')');
  // Recebimento 2 meses depois do pedido
  const app12 = cenarioIva({ bal_iva_recuperacao: 'reembolso', bal_iva_reembolso_meses: 12 });
  let mesPedido = null, mesRecebido = null;
  for (let N = 1; N <= 24; N++) {
    const b = balancoN(app12, N);
    if (mesPedido === null && b.fluxos.ivaReembolsoPedido > 0) mesPedido = N;
    if (mesRecebido === null && b.fluxos.ivaReembolsado > 0) mesRecebido = N;
  }
  verificar(mesPedido !== null && mesRecebido === mesPedido + 2, 'reembolso pedido no mês ' + mesPedido + ' e recebido no mês ' + mesRecebido + ' (fim do 2.º mês seguinte, CIVA art. 22.º n.º 8)');
  const tab = app12.tabela('balanco-table');
  definir(app12, { bal_horizonte: mesPedido + 1 });
  verificar(app12.tabela('balanco-table').some(l => l.startsWith('Estado — reembolso de IVA pedido')) && tab.some(l => l.startsWith('· dos quais: reembolsos de IVA recebidos')),
    'Balanço mostra o reembolso pedido por receber e a linha própria na caixa');
}

// ── 4. Correcção 3: SS da entidade contratante paga no ano seguinte
function testeSSContratante() {
  console.log('\n[4] Correcção 3: SS da entidade contratante paga no mês configurado do ano seguinte');
  const app = cenarioIva({ m0_iva_recibo: 'isento', m1_iva_recibo: 'isento' });
  const m = modelo(app);
  const enc = m.encSS;
  const b12 = balancoN(app, 12), b14 = balancoN(app, 14), b15 = balancoN(app, 15), b24 = balancoN(app, 24);
  verificar(perto(b12.passivo.ssContratante, 12 * enc, 1e-6) && perto(b14.passivo.ssContratante, 14 * enc, 1e-6), 'até fevereiro do ano 2 fica no passivo (mês 12: ' + fmtPt(b12.passivo.ssContratante) + ' €; mês 14: ' + fmtPt(b14.passivo.ssContratante) + ' €)');
  verificar(perto(b15.passivo.ssContratante, 3 * enc, 1e-6) && perto(b15.fluxos.ssContratantePago, 12 * enc, 1e-6), 'em março do ano 2 (mês 15) sai da caixa a contribuição do ano 1: ' + fmtPt(b15.fluxos.ssContratantePago) + ' €');
  verificar(perto(b24.passivo.ssContratante, 12 * enc, 1e-6), 'mês 24: no passivo só a contribuição do ano 2 (' + fmtPt(b24.passivo.ssContratante) + ' €)');
  definir(app, { bal_mes_ss_contratante: 7 });
  const b18 = balancoN(app, 18), b19 = balancoN(app, 19);
  verificar(perto(b18.fluxos.ssContratantePago, 0) && perto(b19.fluxos.ssContratantePago, 12 * enc, 1e-6), 'mês de pagamento 7: paga no mês 19 (julho do ano 2)');
  // Fecho: todos os horizontes, meses de início e meses de pagamento; a DR não muda
  let casos = 0, ok = 0;
  const dr0 = JSON.stringify(modelo(app));
  for (const inicio of [1, 4, 11]) for (const mesSS of [1, 3, 12]) for (let N = 1; N <= 24; N++) {
    definir(app, { bal_mes_inicio: inicio, bal_mes_ss_contratante: mesSS });
    casos++;
    if (Math.abs(balancoN(app, N).diferenca) < TOL) ok++;
  }
  verificar(ok === casos, 'Balanço fecha em ' + ok + '/' + casos + ' casos (mês de início 1, 4, 11 × mês de pagamento 1, 3, 12 × N = 1…24); o simulador limita N a 24');
  verificar(JSON.stringify(modelo(app)) === dr0, 'a DR não muda com o mês de pagamento da SS');
}

// ── 5. Correcção 1: EBITDA
function testeEbitda() {
  console.log('\n[5] Correcção 1: EBITDA depois dos custos com motoristas');
  let casos = 0, ok = 0;
  for (const c of cenariosDR()) {
    const app = carregarApp();
    definir(app, c.valores);
    const m = modelo(app);
    casos++;
    const custoMot = m.custoPessoal + m.comInd + m.encSS + m.ivaNaoDed;
    if (perto(m.ebitda - m.deprMes, m.ebit, 1e-9) && perto(m.margemAntesPessoal - custoMot, m.ebitda, 1e-9) &&
        perto(m.receitaLiq - m.energia - m.estrutura - m.varTotal - m.autoliqNaoDed, m.margemAntesPessoal, 1e-9)) ok++;
  }
  verificar(ok === casos, 'EBITDA − depreciação = EBIT e EBITDA = margem antes de pessoal − custos com motoristas em ' + ok + '/' + casos + ' cenários');
  const app = carregarApp();
  definir(app, { m0_contrato: 'dependente', m1_contrato: 'independente', m1_dias_sem: 5, m1_horas_dia: 8, m1_fat_uber: 2000, m1_pct_uber: 40 });
  const dr = app.tabela('dr-table');
  const iM = dr.findIndex(l => l.startsWith('= Margem antes de pessoal')), iE = dr.findIndex(l => l.startsWith('= EBITDA (antes de')), iD = dr.findIndex(l => l.startsWith('(−) Depreciação da viatura'));
  const iC = dr.findIndex(l => l.startsWith('(−) Comissões a motoristas independentes'));
  verificar(iM >= 0 && iM < iC && iC < iE && iE < iD, 'DR: margem antes de pessoal → custos com motoristas → EBITDA → depreciação');
  const g = app.el('cn-grid-drm').innerHTML;
  verificar(g.indexOf('= Margem antes de pessoal') >= 0 && g.indexOf('= Margem antes de pessoal') < g.indexOf('= EBITDA') && g.indexOf('= EBITDA') < g.indexOf('Depreciações'), 'Cenários: mesma ordem na DR mensal');
}

// ── 6. Correcção 6: retribuição mínima e período normal de trabalho
function testeDependente() {
  console.log('\n[6] Correcção 6: cenário dependente (retribuição mínima e 40 h/semana)');
  const caso = (valores) => { const app = carregarApp(); definir(app, Object.assign({ m1_contrato: 'inactivo' }, valores)); return app; };
  const a = caso({ m0_contrato: 'dependente', salario: 900, dias_sem: 5, horas_dia: 8, bal_ano_inicio: 2026 });
  verificar(/abaixo da retribuição mínima proporcional de 920,00 €/.test(a.texto('dr-avisos')), '900 € a 40 h/semana em 2026: aviso (RMMG 920 €, Decreto-Lei n.º 139/2025)');
  const b = caso({ m0_contrato: 'dependente', salario: 920, dias_sem: 5, horas_dia: 8, bal_ano_inicio: 2026 });
  verificar(!/retribuição mínima/.test(b.texto('dr-avisos')) && !/período normal/.test(b.texto('dr-avisos')), '920 € a 40 h/semana: sem avisos');
  const c = caso({ m0_contrato: 'dependente', salario: 470, dias_sem: 5, horas_dia: 4, bal_ano_inicio: 2026 });
  const c2 = caso({ m0_contrato: 'dependente', salario: 450, dias_sem: 5, horas_dia: 4, bal_ano_inicio: 2026 });
  verificar(!/retribuição mínima/.test(c.texto('dr-avisos')) && /mínima proporcional de 460,00 €/.test(c2.texto('dr-avisos')), 'tempo parcial 20 h: mínimo proporcional 460 € (470 € sem aviso; 450 € com aviso)');
  const d = caso({ m0_contrato: 'dependente', salario: 950, dias_sem: 5, horas_dia: 8, bal_ano_inicio: 2027 });
  verificar(/970,00 €/.test(d.texto('dr-avisos')) && /Acordo 2025-2028/.test(d.texto('dr-avisos')) && /a validar/.test(d.texto('dr-avisos')), '2027: 970 € (Acordo 2025-2028, a validar)');
  const e = caso({ m0_contrato: 'dependente', salario: 1200, dias_sem: 6, horas_dia: 9 });
  verificar(/54,0 h\/semana excedem o período normal de 40 h/.test(e.texto('dr-avisos')), '6 × 9 h = 54 h/semana: aviso do período normal de trabalho (Código do Trabalho, art. 203.º)');
  const f = caso({ m0_contrato: 'independente', m0_pct_uber: 50 });
  verificar(!/retribuição mínima|período normal/.test(f.texto('dr-avisos')), 'independente: sem avisos de retribuição mínima nem de horas');
  // Guardar não é bloqueado
  let chamou = false;
  const g = carregarApp({ fetch: async () => { chamou = true; return { ok: true, status: 201 }; } });
  definir(g, { m0_contrato: 'dependente', salario: 500, m1_contrato: 'inactivo' });
  return g.correr('guardarConfig()').then(() => {
    verificar(chamou, 'o aviso não bloqueia o Guardar');
    // Cenários: salários abaixo do mínimo marcados
    const h = caso({ m0_contrato: 'dependente', dias_sem: 5, horas_dia: 8, bal_ano_inicio: 2026 });
    const rem = h.el('cn-grid-rem').innerHTML;
    verificar(/820 € ⚠/.test(rem) && /900 € ⚠/.test(rem.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')) && !/1200 € ⚠|1 200 € ⚠/.test(rem) && /retribuição mínima/.test(h.texto('cn-aviso')),
      'Cenários: 820 € e 900 € marcados com ⚠ (abaixo de 920 €), 1 200 € sem marca, aviso no topo');
    verificar(h.correr("document.getElementById('salario').value") === '900', 'salário por omissão mantém-se em 900 €');
  });
}

// ── 7. Correcção 5: limite do art. 53.º nos recibos
function testeArt53() {
  console.log('\n[7] Correcção 5: limite de 15 000 € do art. 53.º CIVA nos recibos isentos');
  const caso = v => { const app = carregarApp(); definir(app, Object.assign({ m0_contrato: 'independente', m1_contrato: 'inactivo' }, v)); return app; };
  const a = caso({ m0_pct_uber: 70, m0_iva_recibo: 'isento' });
  const ma = modelo(a);
  verificar(/excedem o limite de 15 000 € do art\. 53\.º CIVA/.test(a.texto('dr-avisos').replace(/ | /g, ' ')), 'comissões de ' + fmtPt(ma.motoristas[0].pagamento * 12) + ' €/ano com recibo isento: aviso');
  const b = caso({ m0_pct_uber: 70, m0_iva_recibo: 'normal' });
  verificar(!/art\. 53\.º CIVA: o recibo/.test(b.texto('dr-avisos')), 'mesmas comissões com recibo com IVA: sem aviso');
  const c = caso({ m0_pct_uber: 20, m0_iva_recibo: 'isento' });
  const mc = modelo(c);
  verificar(mc.motoristas[0].pagamento * 12 <= 15000 && !/art\. 53\.º CIVA: o recibo/.test(c.texto('dr-avisos')), 'comissões de ' + fmtPt(mc.motoristas[0].pagamento * 12) + ' €/ano (≤ 15 000 €): sem aviso');
}

// ── 8. Fecho do Balanço com os parâmetros novos
function testeFecho() {
  console.log('\n[8] O Balanço fecha: 9 combinações × regime × recibos × recuperação do IVA × N = 1…24');
  let casos = 0, ok = 0, maxDif = 0;
  for (const t0 of TIPOS) for (const t1 of TIPOS) for (const regime of ['normal', 'isento']) for (const recibo of ['isento', 'normal']) for (const rec of ['reporte', 'reembolso']) {
    const app = carregarApp();
    definir(app, { m0_contrato: t0, m1_contrato: t1, m0_pct_uber: 60, m1_fat_uber: 2000, m1_dias_sem: 5, m1_horas_dia: 8, m1_salario: 870, m1_pct_uber: 50,
      iva_regime: regime, m0_iva_recibo: recibo, m1_iva_recibo: recibo, bal_iva_recuperacao: rec, bal_iva_reembolso_meses: 7 });
    for (let N = 1; N <= 24; N++) {
      const d = Math.abs(balancoN(app, N).diferenca);
      casos++; maxDif = Math.max(maxDif, d);
      if (d < TOL) ok++;
    }
  }
  verificar(ok === casos, ok + '/' + casos + ' casos fecham; máx |diferença| = ' + maxDif.toExponential(2) + ' €');
}

// ── 9. Campos calculados (2 casas e "Origem:") e campos por dia ativo com valor exacto da conversão
async function testeCamposCalculados() {
  console.log('\n[9] Campos calculados e campos por dia ativo vindos da conversão da versão 1');
  const app = await carregarLinhaNova(await guardarNaPaginaAntiga({}));
  const exacto = 80 / (6 * 4.3);
  const el = app.el('portagens_dia');
  verificar(el.value === exacto.toFixed(2) && perto(json(app, "getVal('portagens_dia')"), exacto, 1e-12) && perto(modelo(app).custosVar.portagens, 80, 1e-9),
    'portagens por dia: caixa com 2 casas (' + el.value + '), cálculos com o valor exacto (' + exacto + '; 80 €/mês)');
  app.correr("focoPorDia(document.getElementById('portagens_dia'), true)");
  const emFoco = el.value;
  app.correr("focoPorDia(document.getElementById('portagens_dia'), false)");
  verificar(emFoco === String(exacto) && el.value === exacto.toFixed(2), 'em foco mostra o valor exacto; fora de foco volta às 2 casas');
  let corpo = null;
  app.contexto.fetch = async (url, op) => { corpo = op.body; return { ok: true, status: 201 }; };
  await app.correr('guardarConfig()');
  verificar(perto(JSON.parse(corpo).config_extra.actividade.portagens_dia, exacto, 1e-12), 'Guardar grava o valor exacto');
  app.correr("document.getElementById('portagens_dia').value = '2.5'; aoEditarPorDia('portagens_dia')");
  verificar(json(app, "getVal('portagens_dia')") === 2.5, 'editado pelo utilizador: passa a valer o que escreveu (2,5)');
  const rec = json(app, "getVal('rec_dia')");
  verificar(app.el('rec_dia_vis').value === rec.toFixed(2).replace('.', ',') && rec !== Math.round(rec * 100) / 100 &&
    /Gross Fare .* = .*Editar no separador Motoristas/.test(app.el('rec_dia_origem').innerHTML),
    'rec_dia: caixa só de leitura com 2 casas (' + app.el('rec_dia_vis').value + '), valor guardado exacto e linha "Origem:"');
  definir(app, { m0_contrato: 'inactivo' });
  verificar(/só de referência/.test(app.el('rec_dia_origem').innerHTML), 'Alexandre Inactivo: "Origem:" indica valor só de referência');
}

async function main() {
  await testeRegressao();
  testeEscala();
  await testeFormato();
  testeIva();
  testeSSContratante();
  testeEbitda();
  await testeDependente();
  testeArt53();
  testeFecho();
  await testeCamposCalculados();
  console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'));
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(e => { console.error('Erro inesperado nos testes:', e); process.exit(1); });
