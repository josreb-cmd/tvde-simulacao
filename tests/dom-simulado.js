// DOM mínimo para correr o <script> de index.html em Node, sem browser.
// Regista os elementos com id do HTML estático e de cada innerHTML atribuído,
// com o valor inicial de <input> (value/checked) e de <select> (option selected ou a primeira).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function criarElemento(id) {
  let html = '';
  const el = {
    id, value: '', checked: false, textContent: '', className: '', disabled: false,
    style: {}, classList: { add() {}, remove() {} }
  };
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: (v) => { html = String(v); el._registar(html); }
  });
  return el;
}

function criarDocumento() {
  const elementos = {};
  function registar(html) {
    for (const m of html.matchAll(/<([a-zA-Z0-9]+)\b([^>]*)\sid="([^"]+)"([^>]*)>/g)) {
      const atributos = m[2] + ' ' + m[4];
      const el = criarElemento(m[3]);
      el._registar = registar;
      const v = /\svalue="([^"]*)"/.exec(' ' + atributos);
      if (v) el.value = v[1];
      el.checked = /\schecked\b/.test(' ' + atributos);
      elementos[m[3]] = el;
    }
    for (const m of html.matchAll(/<select\b[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
      const opcoes = [...m[2].matchAll(/<option\b([^>]*)>/g)];
      const sel = opcoes.find(o => /\sselected\b/.test(o[1])) || opcoes[0];
      const v = sel && /value="([^"]*)"/.exec(sel[1]);
      elementos[m[1]].value = v ? v[1] : '';
    }
  }
  return {
    registar,
    elementos,
    document: {
      getElementById: (id) => elementos[id] || null,
      querySelectorAll: () => []
    }
  };
}

// Carrega a aplicação. opcoes.fetch substitui o fetch da rede (para testar Guardar/Carregar).
function carregarApp(opcoes) {
  const o = opcoes || {};
  const html = o.html || fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const semScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const blocos = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const dom = criarDocumento();
  dom.registar(semScripts);
  const contexto = {
    console, Math, Infinity, parseFloat, Number, Date, JSON, Object, Array, String, isFinite,
    document: dom.document,
    window: { print() {} },
    supabase: { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} } }) },
    fetch: o.fetch || (async () => { throw new Error('sem rede'); }),
    setTimeout() {}
  };
  vm.createContext(contexto);
  vm.runInContext(blocos[blocos.length - 1], contexto);
  const correr = (codigo) => vm.runInContext(codigo, contexto);
  const tabela = (id) => [...dom.elementos[id].innerHTML.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(tr =>
    [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(td => td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
      .join(' | '));
  const texto = (id) => dom.elementos[id].innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { contexto, correr, tabela, texto, el: (id) => dom.elementos[id] };
}

module.exports = { carregarApp };
