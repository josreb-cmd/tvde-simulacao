# 🚗 TVDE Simulação — Alexandre Rebelo

Simulação financeira para operação TVDE em Portugal.  
Desenvolvido pela **Soluções Eficazes** (solucoeseficazes.pt).

## ✨ Funcionalidades

- Simulador interactivo com custos editáveis em tempo real
- Exportação de PDF directamente na app (sem servidor)
- PWA — instala no telemóvel e funciona offline
- Validado com dados reais Abr–Mai 2026
- Cenários pessimista / médio / optimista

## 📋 Pressupostos Base

| Indicador | Valor |
|---|---|
| Receita líquida semanal | 911 € (base real) |
| Semanas activas / mês | 4,3 (excl. 2ªs feiras) |
| ALD viatura eléctrica | 500 €/mês |
| Energia casa / fora | 60% / 40% |
| Estrutura jurídica | Unipessoal Lda. |

## 📁 Estrutura

```
tvde-simulacao/
├── index.html          # Simulador completo (PWA + PDF inline)
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline)
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

## 🚀 Como usar

### Standalone (ficheiro local)
Abrir `index.html` directamente no browser.

### PWA (telemóvel)
1. Publicar os ficheiros em qualquer servidor HTTPS (ex: Cloudflare Pages)
2. Abrir no Chrome (Android) ou Safari (iPhone)
3. Adicionar ao ecrã inicial

### Exportar PDF
Clicar no botão verde **⬇ Exportar PDF** — gera um relatório A4 com os valores actuais.

## 🏢 Sobre

Projecto desenvolvido no âmbito do plano de negócios TVDE da **Soluções Eficazes**.  
Website: [solucoeseficazes.pt](https://solucoeseficazes.pt)  
Email: geral@solucoeseficazes.pt

---
*Simulação de carácter informativo. Validar com contabilista certificado.*
