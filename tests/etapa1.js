// Testes da Etapa 1 (contratos por motorista, DR, persistência).
// Uso: node tests/etapa1.js [config-antiga.json]
// O ficheiro de configuração antiga (dados reais) é opcional e não está no repositório.
'use strict';
const fs = require('fs');
const path = require('path');
const { carregarApp } = require('./dom-simulado');

let falhas = 0;
function verificar(condicao, descricao) {
  console.log((condicao ? '  ✔ ' : '  ✗ ') + descricao);
  if (!condicao) falhas++;
}
const perto = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.01 : tol);
const r2 = v => Math.round(v * 100) / 100;

// Etapa 3: definir partilhado (converte a facturação e as gorjetas mensais em valores por dia ativo).
const { definir } = require('./cenarios-teste');
const modelo = app => app.correr('calcModelo(lerCfgDoDOM())');
const cfgDom = app => JSON.parse(app.correr('JSON.stringify(lerCfgDoDOM())'));

function resumoDR(mod) {
  return {
    facturacaoSemIVA: r2(mod.Fsem), ivaLiquidado: r2(mod.ivaLiquidado), receitaLiq: r2(mod.receitaLiq),
    ebitda: r2(mod.ebitda), salarios14: r2(mod.pessoal.salario14), ssPatronal14: r2(mod.pessoal.ssP14),
    ajudas: r2(mod.pessoal.ajudas), subRef: r2(mod.pessoal.subRef), comInd: r2(mod.comInd), encSS: r2(mod.encSS),
    depreciacao: r2(mod.deprMes), juros: r2(mod.fin.juros), ebt: r2(mod.ebt), irc: r2(mod.irc),
    resLiq: r2(mod.resLiq), fluxo: r2(mod.fluxo), resAnual: r2(mod.resA)
  };
}

async function main() {
  // ── 1. Página nova
  console.log('\n[1] Página nova (sem configuração carregada)');
  const nova = carregarApp();
  const cNova = cfgDom(nova);
  verificar(cNova.motoristas.every(m => m.contrato === 'independente'), 'dois motoristas Activos e Independentes');
  verificar(cNova.motoristas.every(m => m.pct.uber === 0 && m.pct.bolt === 0), 'percentagens a 0');
  verificar(cNova.plataformas.uber.activa && !cNova.plataformas.bolt.activa, 'Uber activa, Bolt desactivada');
  verificar(cNova.iva.regime === 'normal' && cNova.iva.taxa === 6 && cNova.iva.taxa_autoliq === 23 && cNova.base_iva === 'sem', 'IVA normal 6%, autoliquidação 23%, base sem IVA');
  verificar(cNova.plataformas.uber.comissao === 25, 'comissão Uber por omissão 25%');
  verificar(cNova.fin_taxa === 8.25, 'TAN por omissão 8,25%');
  verificar(/não inclui comissões/.test(nova.texto('dr-avisos')), 'aviso visível: DR sem comissões enquanto as percentagens não forem definidas');
  console.log('  DR mensal:', JSON.stringify(resumoDR(modelo(nova))));

  // ── 2. Comparação com o baseline por omissão (decomposição das diferenças)
  console.log('\n[2] Comparação com baseline-76e75e1-defaults.json');
  const base = require('./baseline-76e75e1-defaults.json');
  const num = s => parseFloat(s.split('|').pop().replace(/[^0-9,−-]/g, '').replace('−', '-').replace(',', '.'));
  const linhaBase = (re) => num(base.drMensal.find(l => re.test(l)));
  const bReceita = linhaBase(/^Receita líquida/), bEbitda = linhaBase(/^= EBITDA/), bEbt = linhaBase(/^= EBT/);
  const bSal = -linhaBase(/^\(−\) Salário bruto/), bSS = -linhaBase(/^\(−\) SS patronal/), bJuros = -linhaBase(/^\(−\) Juros/);

  const eq = carregarApp();
  // Mesmos pressupostos do modelo antigo: Alexandre Dependente com ajudas 862, Motorista 2 Inactivo.
  // rec_dia antigo = depósito após comissão (opção B): bruto = depósito / (1 − 25%).
  definir(eq, { m0_contrato: 'dependente', m1_contrato: 'inactivo', ajudas: 862 });
  const mEq = modelo(eq);
  const F = mEq.F, ivaParte = F * 6 / 106, depr = 30000 / 72;
  verificar(perto(F, bReceita / 0.75, 0.01), `bruto Gross Fare = depósito antigo / 0,75 (${r2(F)} = ${bReceita} / 0,75)`);
  verificar(perto(mEq.deposito, bReceita, 0.01), `depósito da plataforma = receita líquida antiga (${r2(mEq.deposito)} vs ${bReceita})`);
  verificar(perto(mEq.comPlat, F * 0.25) && perto(mEq.ivaLiquidado, ivaParte), `comissão = 25% × bruto (${r2(mEq.comPlat)}); IVA liquidado = bruto × 6/106 (${r2(ivaParte)})`);
  verificar(perto(mEq.receitaLiq, bReceita - ivaParte, 0.02), `receita líquida = depósito − IVA (${r2(mEq.receitaLiq)} = ${bReceita} − ${r2(ivaParte)})`);
  // Etapa 3: o EBITDA antigo (antes dos custos com motoristas) chama-se agora "margem antes de pessoal".
  verificar(perto(mEq.margemAntesPessoal, bEbitda - ivaParte, 0.02), `margem antes de pessoal (EBITDA anterior à Etapa 3) = baseline − IVA (${r2(mEq.margemAntesPessoal)})`);
  verificar(perto(mEq.fin.juros, bJuros), `juros do mês actual (mês 1) iguais ao baseline (${r2(mEq.fin.juros)})`);
  verificar(perto(mEq.autoliqNaoDed, 0) && perto(mEq.autoliq, mEq.comPlat * 0.23), `autoliquidação 23% sobre comissões (${r2(mEq.autoliq)}) com efeito nulo no regime normal`);
  const dif14 = (bSal + bSS) * 2 / 12;
  verificar(perto(mEq.pessoal.salario14 - bSal, bSal * 2 / 12) && perto(mEq.pessoal.ssP14 - bSS, bSS * 2 / 12), `14 meses: +${r2(bSal * 2 / 12)} salários e +${r2(bSS * 2 / 12)} SS patronal por mês`);
  verificar(perto(mEq.ebt, bEbt - dif14 - depr - ivaParte, 0.03), `EBT = baseline − 14 meses − depreciação − IVA (${r2(mEq.ebt)} = ${bEbt} − ${r2(dif14)} − ${r2(depr)} − ${r2(ivaParte)})`);
  console.log('  Passo (EBT/mês, antes de IRC)                               EBT/mês');
  [['Modelo antigo (baseline 76e75e1)', bEbt],
   ['− 14 meses (dependente)', bEbt - dif14],
   ['− depreciação da viatura (6 anos)', bEbt - dif14 - depr],
   ['− IVA 6% contido no depósito (modelo novo)', mEq.ebt]].forEach(([n, v]) => console.log('  ' + n.padEnd(58) + String(r2(v)).padStart(9)));
  definir(eq, { ajudas: 0 });
  const mAj = modelo(eq);
  console.log('  ' + '+ ajudas de custo a 0 (novo valor por omissão)'.padEnd(58) + String(r2(mAj.ebt)).padStart(9));
  console.log('  Modelo novo: resultado líquido ' + r2(mEq.resLiq) + ' (ajudas 862) / ' + r2(mAj.resLiq) + ' (ajudas 0); fluxo ' + r2(mEq.fluxo) + ' / ' + r2(mAj.fluxo) + '; baseline: resultado ' + linhaBase(/^= RESULTADO/) + ', fluxo ' + linhaBase(/^= Fluxo/));
  verificar(!/distribui|dividend/i.test(eq.texto('kpi-rem')) && /Distribuição/.test(eq.tabela('dist-table').join()), 'dividendos fora do rendimento do Alexandre; "Distribuição à sócia" separada');

  // ── 3. Configuração antiga (config_extra = NULL)
  const ficheiroAntigo = process.argv[2];
  if (ficheiroAntigo) {
    console.log('\n[3] Carregar configuração antiga (config_extra = NULL)');
    const linha = Object.assign({ id: 'tvde_alexandre', config_extra: null, atualizado_em: '2026-01-01T00:00:00+00:00' }, JSON.parse(fs.readFileSync(ficheiroAntigo, 'utf8')));
    const antiga = carregarApp({ fetch: async () => ({ ok: true, status: 200, json: async () => [linha] }) });
    await antiga.correr('carregarConfig()');
    const c = cfgDom(antiga);
    console.log('  Estado:', antiga.el('sb-status').textContent);
    verificar(c.motoristas.every(m => m.contrato === 'independente'), 'dois motoristas Activos e Independentes');
    // Etapa 3: a facturação é guardada por dia ativo; o bruto mensal vem do modelo (por dia × dias × semanas).
    verificar(perto(modelo(antiga).motoristas[0].F, r2(linha.rec_dia * linha.dias_sem * linha.sem_mes / 0.75), 1e-6), 'bruto Uber do Alexandre = (rec_dia × dias × semanas) / (1 − 25%)');
    verificar(c.salario === linha.salario && c.sub_ref_dias === linha.sub_ref_dias && c.ajudas === linha.ajudas, 'dados do dependente preservados nas colunas planas');
    verificar(c.fin_taxa === 0 && /sem juros/.test(antiga.el('badge-credito').textContent), 'TAN 0% mantida; cabeçalho "sem juros"');
    verificar(/não inclui comissões/.test(antiga.texto('dr-avisos')), 'aviso de percentagens por definir visível');
    console.log('  DR mensal:', JSON.stringify(resumoDR(modelo(antiga))));
    const mAnt = modelo(antiga);
    const depositoAntigo = linha.rec_dia * linha.dias_sem * linha.sem_mes;
    console.log('  Bruto ' + r2(mAnt.F) + ' · IVA liquidado ' + r2(mAnt.ivaLiquidado) + ' · receita sem IVA ' + r2(mAnt.Fsem) + ' · comissão ' + r2(mAnt.comPlat) +
      ' · autoliquidação ' + r2(mAnt.autoliq) + ' (efeito nulo) · depósito ' + r2(mAnt.deposito) + ' · receita líquida ' + r2(mAnt.receitaLiq));
    verificar(perto(mAnt.deposito, depositoAntigo, 0.01), 'depósito = rec_dia × dias × semanas (opção B)');
    verificar(perto(mAnt.ivaLiquidado, mAnt.F * 6 / 106) && perto(mAnt.receitaLiq, mAnt.F / 1.06 - mAnt.F * 0.25), 'IVA = bruto × 6/106; receita líquida = bruto/1,06 − 25% × bruto');
    definir(antiga, { iva_regime: 'isento' });
    const mIs = modelo(antiga);
    console.log('  (só para referência) regime isento: receita líquida ' + r2(mIs.receitaLiq) + ' · autoliquidação como custo ' + r2(mIs.autoliqNaoDed) + ' · EBT ' + r2(mIs.ebt) + ' · resultado ' + r2(mIs.resLiq));
    verificar(perto(mIs.autoliqNaoDed, mIs.comPlat * 0.23), 'regime isento: autoliquidação é custo');
  } else {
    console.log('\n[3] (configuração antiga não indicada — passo omitido)');
  }

  // ── 4. Guardar e Carregar com contratos diferentes
  const combinacoes = {
    'Alexandre Dependente + Motorista 2 Independente': {
      m0_contrato: 'dependente', salario: 950, ajudas: 0, sub_ref_dias: 21, sub_ref_val: 9.5, sit_familiar: 'C1',
      m0_fat_uber: 4000, m0_gorj_uber: 50,
      m1_contrato: 'independente', m1_nome: 'Rui', m1_dias_sem: 5, m1_horas_dia: 8, m1_fat_uber: 2500, m1_gorj_uber: 30, m1_bonus_uber: 40,
      m1_pct_uber: 55, m1_dependencia: '50a80', m1_iva_recibo: 'normal', plat_uber_comissao: 25, fin_mes_atual: 7, vida_util_anos: 5
    },
    'Dois Independentes (com Bolt e base com IVA)': {
      m0_contrato: 'independente', m0_fat_uber: 3800, m0_pct_uber: 60, m0_fat_bolt: 400, m0_pct_bolt: 50,
      m1_contrato: 'independente', m1_dias_sem: 4, m1_horas_dia: 7, m1_fat_uber: 1800, m1_pct_uber: 45,
      plat_bolt_activa: true, plat_bolt_comissao: 20, plat_bolt_incl_bonus: false, base_iva: 'com', iva_regime: 'normal'
    }
  };
  for (const [nome, valores] of Object.entries(combinacoes)) {
    console.log('\n[4] Guardar → Carregar: ' + nome);
    let corpo = null;
    const origem = carregarApp({ fetch: async (url, op) => { corpo = op.body; return { ok: true, status: 201 }; } });
    definir(origem, valores);
    await origem.correr('guardarConfig()');
    verificar(origem.el('sb-status').textContent === '✔ Guardado', 'guardado sem erros');
    const enviado = JSON.parse(corpo);
    const colunas = Object.keys(enviado).sort();
    const esperadas = ['id', 'atualizado_em', 'config_extra'].concat(origem.correr('COLUNAS_PLANAS.slice()')).sort();
    verificar(JSON.stringify(colunas) === JSON.stringify(esperadas), '26 colunas planas + config_extra, nada mais (' + colunas.length + ' campos)');
    const destino = carregarApp({ fetch: async () => ({ ok: true, status: 200, json: async () => [JSON.parse(corpo)] }) });
    await destino.correr('carregarConfig()');
    verificar(destino.el('sb-status').textContent === '✔ Configuração carregada', 'carregado: ' + destino.el('sb-status').textContent);
    const a = cfgDom(origem), b = cfgDom(destino);
    verificar(JSON.stringify(a) === JSON.stringify(b), 'configuração idêntica depois da viagem completa');
    verificar(JSON.stringify(origem.tabela('dr-table')) === JSON.stringify(destino.tabela('dr-table')), 'DR idêntica depois da viagem completa');
    console.log('  DR mensal:', JSON.stringify(resumoDR(modelo(destino))));
  }

  // ── 5. Erro HTTP ao carregar
  console.log('\n[5] Erro HTTP ao carregar');
  const erro = carregarApp({ fetch: async () => ({ ok: false, status: 401, json: async () => ({ message: 'JWT expired' }) }) });
  await erro.correr('carregarConfig()');
  verificar(erro.el('sb-status').textContent === '✗ Erro ao carregar a configuração (HTTP 401)', 'mensagem: ' + erro.el('sb-status').textContent);

  // ── 6. Validação
  console.log('\n[6] Validação');
  let chamou = false;
  const val = carregarApp({ fetch: async () => { chamou = true; return { ok: true, status: 201 }; } });
  definir(val, { m0_pct_uber: 150, m1_contrato: '' });
  await val.correr('guardarConfig()');
  const errosTxt = val.texto('motoristas-avisos');
  verificar(!chamou, 'Guardar bloqueado com erros');
  verificar(/Alexandre — Uber: a percentagem do motorista tem de estar entre 0 e 100%/.test(errosTxt), 'erro de percentagem em PT-PT');
  verificar(/Motorista 2: o tipo de contrato é obrigatório/.test(errosTxt), 'erro de contrato obrigatório em PT-PT');
  definir(val, { m0_pct_uber: 50, m1_contrato: 'independente', m1_horas_dia: 16, horas_dia: 12, m1_dias_sem: 7 });
  const avisosTxt = val.texto('motoristas-avisos');
  verificar(/excedem a capacidade de uma viatura \(24 h\/dia\)/.test(avisosTxt), 'aviso de turnos acima da capacidade da viatura');
  verificar(/excede o limite de 10 h/.test(avisosTxt), 'aviso de limite de 10 h por motorista');

  // ── 7. Nove combinações de contratos
  console.log('\n[7] 9 combinações de contratos (DR sem erros, linhas separadas)');
  const tipos = ['dependente', 'independente', 'inactivo'];
  for (const t0 of tipos) for (const t1 of tipos) {
    const app = carregarApp();
    definir(app, { m0_contrato: t0, m1_contrato: t1, m0_pct_uber: 50, m1_fat_uber: 2000, m1_dias_sem: 5, m1_horas_dia: 8, m1_salario: 870, m1_pct_uber: 40 });
    const m = modelo(app);
    const temDep = [t0, t1].includes('dependente'), temInd = [t0, t1].includes('independente');
    const ok = (m.custoPessoal > 0) === temDep && (m.comInd > 0) === temInd && isFinite(m.resLiq);
    verificar(ok, `${t0.padEnd(12)} + ${t1.padEnd(12)} pessoal ${String(r2(m.custoPessoal)).padStart(8)} · comissões ${String(r2(m.comInd)).padStart(8)} · SS contratante ${String(r2(m.encSS)).padStart(7)} · resultado ${String(r2(m.resLiq)).padStart(9)}`);
  }

  console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'));
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(e => { console.error('Erro inesperado nos testes:', e); process.exit(1); });
