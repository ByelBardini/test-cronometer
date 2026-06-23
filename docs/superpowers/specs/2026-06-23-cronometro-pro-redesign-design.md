# Design — Cronômetro Pro (redesenho de entrada e visual)

**Data:** 2026-06-23
**Status:** Aprovado para implementação

## 1. Motivação

A primeira versão tem dois problemas graves relatados pelo usuário:

1. **Funcional:** aberto com 2 cliques (`file://`), os `import` de ES Modules são
   bloqueados por CORS no navegador → o JS inteiro não roda. O `<input>` vira
   texto livre (aparece "5151515" sem máscara) e o botão **Iniciar**, que nasce
   `disabled` no HTML e só seria liberado via JS, **trava para sempre**. Por isso
   "não dá play".
2. **Experiência/visual:** a entrada estilo micro-ondas (digitar dentro do display
   gigante) é pouco intuitiva e o visual não passa sensação de produto profissional.

Este redesenho resolve os dois sem jogar fora o que já é bom.

## 2. Objetivos e não-objetivos

**Objetivos**
- Servir a página por HTTP (`npm start`) para os ES Modules carregarem — fim do
  bug de não iniciar.
- Entrada nova: **chips de atalho que somam** (`+1m`, `+5m`, `+10m`, `+30m`,
  `+1h`) + **Limpar**, com digitação direta no display mantida como caminho
  secundário (exato). **Iniciar habilita assim que o total > 0.**
- Visual **dark premium**: anel de progresso circular (SVG) ao redor do número,
  glow e cor por estágio (azul → amarelo → vermelho), painel com profundidade.
- Preservar motor anti-drift, efeitos sonoros, acessibilidade e reduced-motion.
- Manter a suíte de testes verde; nova lógica pura coberta por testes (TDD).

**Não-objetivos (YAGNI)**
- Sem framework, sem bundler/etapa de build, sem dependências de runtime.
- Sem persistência, múltiplos timers ou contagem progressiva.
- Sem reconfigurar o tempo durante a contagem (só parado/resetado).

## 3. O que muda e o que fica

**Fica (intocado):** [src/timer.js](../../../src/timer.js) (motor),
[src/effects.js](../../../src/effects.js) (estágios + beep), e o grosso de
[src/format.js](../../../src/format.js). Testes existentes continuam.

**Muda:** `index.html` (markup novo: chips + SVG do anel), `style.css` (visual
premium), `src/app.js` (camada de tela: chips, anel, fluxo). **Acrescenta:**
`server.mjs` + script `start` no `package.json`, e funções puras novas em
`src/format.js` com testes.

## 4. Servidor de dev (resolve o "não dá play")

`server.mjs`: servidor estático **sem dependências** usando o módulo `http` do
Node (~30 linhas). Serve a raiz do projeto com os MIME types certos
(`text/html`, `text/css`, `text/javascript` para `.js`/`.mjs`). `package.json`
ganha `"start": "node server.mjs"`. Servido por HTTP, `<script type="module">`
e os `import` funcionam normalmente. `npm test` segue igual (`node --test`).

## 5. Entrada por chips (lógica pura em `format.js`)

Fonte de verdade do tempo configurado continua a **string de dígitos** (`digitsString`),
mas presets operam em milissegundos e re-derivam a string em forma canônica
(sempre válida). Duas funções puras novas, testadas:

```js
// ms -> "HHMMSS" canônico (6 dígitos), com clamp em [0, 99:59:59]
export function msToDigits(ms): string

// soma um delta (ms) ao tempo atual dos dígitos e devolve novos dígitos canônicos
export function applyPreset(digits, deltaMs): string
//   = msToDigits(digitsToParts(digits).ms + deltaMs)
```

Comportamento:
- `applyPreset('', +5min)` → `"000500"` → display `00:05:00`.
- Tocar `+5m` 3× soma para `00:15:00`. Tudo clampado em `99:59:59`.
- Tocar um preset normaliza uma entrada inválida (ex.: `mm=99`) para forma canônica.
- **Limpar** zera `digitsString` para `''`.
- Digitação direta no display (máscara micro-ondas) permanece para valor exato.

Os chips e o botão Iniciar só ficam ativos/visíveis no estado `IDLE`.

## 6. Visual — dark premium com anel

- **Anel circular SVG** ao redor do número central. Em RUNNING, o anel esvazia
  via `stroke-dashoffset` proporcional a `restante / total` (o total é capturado
  no `start`). No `IDLE` o anel fica cheio (prévia).
- Cor do anel, do número e do glow migram pelos estágios já existentes:
  `normal` (azul) → `warning` ≤60s (amarelo) → `danger` ≤10s (vermelho, pulsar) →
  `finished` (banner "Tempo esgotado!", shake). Beep nos últimos 5s e beep longo no fim.
- Painel com gradiente sutil, borda fina e sombra em camadas; número com
  `tabular-nums` para não "dançar".
- `prefers-reduced-motion`: mantém cores, remove animações e a transição do anel.

## 7. Camada de tela (`app.js`)

Responsabilidades novas, além de religar os elementos:
- Tratar clique nos chips (`applyPreset`) e em Limpar; `render()` reflete no display.
- Manter `totalMs` (capturado no `start`) e atualizar o `stroke-dashoffset` do anel
  a cada frame do loop, junto do número.
- Mostrar/esconder a barra de chips conforme `IDLE`.
- Botão principal toggla Iniciar/Pausar/Retomar; Resetar volta a IDLE.
- Acessibilidade: chips com `aria-label`, `aria-live` para status, foco coerente.

## 8. Estratégia de testes

`format.test.js` ganha casos para:
- `msToDigits`: zero, valores típicos, clamp no teto (`> 99:59:59` → `"995959"`),
  clamp de negativo (`< 0` → `"000000"`), padding correto.
- `applyPreset`: soma a partir de vazio, soma acumulada, clamp no teto,
  normalização de entrada inválida, delta negativo não passa de zero.

Verificação manual: `npm start`, abrir no navegador, confirmar que **Iniciar
funciona**, chips somam, anel esvazia e os estágios/efeitos disparam.

## 9. Critérios de sucesso

1. `npm start` serve a página e o app roda (sem erro de módulo); **dá play**.
2. Todos os testes passam (`node --test`), incluindo os novos.
3. Chips somam corretamente, com clamp em `99:59:59`; Limpar zera; digitação
   direta ainda funciona.
4. Anel esvazia proporcional ao tempo; cor/glow migram por estágio; beep e
   banner finais funcionam.
5. Acessibilidade e `prefers-reduced-motion` preservados.
6. Motor, formatação e efeitos antigos permanecem intactos e testados.
