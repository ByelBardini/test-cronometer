# Design — Cronômetro (contagem regressiva)

**Data:** 2026-06-23
**Status:** Aprovado para implementação

## 1. Visão geral

Um cronômetro de **contagem regressiva** em HTML, CSS e JavaScript puro (sem
framework, sem build). O usuário configura uma duração de até `99:59:59`, inicia
a contagem e acompanha o tempo decrescendo no formato `hh:mm:ss`. Conforme o
tempo se aproxima do fim, a tela reage com efeitos visuais e sonoros.

A prioridade número um é **correção temporal**: o relógio não pode acumular erro
(drift). A lógica que garante isso é isolada num módulo puro e coberta por testes
automatizados.

## 2. Objetivos e não-objetivos

**Objetivos**
- Contagem regressiva precisa, sem drift, no formato `hh:mm:ss`.
- Configuração de 0 até `99:59:59` por campo único com máscara.
- Controles: Iniciar / Pausar (com retomar) e Resetar.
- Efeitos progressivos: mudança de cor, pulsar/piscar, beep e animação ao zerar.
- Código limpo, modular, com a lógica central testável e testes passando.

**Não-objetivos (YAGNI)**
- Sem cronômetro progressivo (contagem para cima) — apenas regressivo.
- Sem persistência entre recarregamentos da página.
- Sem múltiplos timers simultâneos.
- Sem reconfigurar o tempo durante a contagem (só quando parado/resetado).
- Sem dependências externas nem etapa de build.

## 3. Arquitetura e estrutura de arquivos

```
index.html            # estrutura da tela
style.css             # visual, cores e animações (efeitos)
src/
  timer.js            # MOTOR puro: máquina de estados + contagem sem drift
  format.js           # ms <-> "hh:mm:ss" e parse dos dígitos digitados
  effects.js          # decide qual estágio de efeito aplicar + beep (Web Audio)
  app.js              # camada de tela: liga DOM, eventos e o motor
test/
  timer.test.js       # testes do motor
  format.test.js      # testes de formatação/parse/validação
package.json          # "type": "module", script de teste (node --test)
```

**Princípio de separação:** `timer.js`, `format.js` e `effects.js` (na parte de
decisão) **não tocam no DOM**. Toda a manipulação de tela e eventos vive em
`app.js`. Isso mantém a lógica testável e os módulos com responsabilidade única.

Os arquivos em `src/` são **ES Modules** (`import`/`export`), carregados no
navegador via `<script type="module">` e importados igualzinho pelo Node nos
testes — por isso `package.json` tem `"type": "module"`.

## 4. Módulo `timer.js` — o motor

### Decisão central: relógio injetado

O motor não chama `Date.now()`/`performance.now()` diretamente. Ele recebe uma
função de relógio (`now`) na criação. Em produção, passamos o relógio real; nos
testes, passamos um relógio falso que avançamos manualmente. Isso torna a
contagem **determinística e testável**.

```js
// now: () => number  (milissegundos)
const timer = createTimer({ now: () => performance.now() });
```

### Máquina de estados

```
        setDuration                start              tick (restante<=0)
 IDLE ──────────────► IDLE ─────────────────► RUNNING ──────────────► FINISHED
   ▲                                            │  ▲                      │
   │ reset                              pause │  │ resume         reset │
   │                                            ▼  │                      │
   └──────────────────────── PAUSED ◄───────────┘  └──────────────────────┘
                          (reset volta para IDLE de qualquer estado)
```

Estados: `IDLE` (configurado, não iniciado), `RUNNING`, `PAUSED`, `FINISHED`.

### API pública

| Método | Vindo de | Efeito |
|---|---|---|
| `setDuration(ms)` | IDLE / FINISHED | Define a duração configurada e o restante. Lança erro se RUNNING/PAUSED. |
| `start()` | IDLE / FINISHED | `alvo = now() + restante`; vai para RUNNING. |
| `pause()` | RUNNING | `restante = alvo − now()`; vai para PAUSED. |
| `resume()` | PAUSED | `alvo = now() + restante`; vai para RUNNING. |
| `reset()` | qualquer | `restante = duração configurada`; vai para IDLE. |
| `tick()` | — | Atualiza; se RUNNING e `restante<=0` → FINISHED com restante 0. |
| `getRemaining()` | — | RUNNING: `max(0, alvo − now())`; senão o `restante` guardado. |
| `getStatus()` | — | Estado atual. |

**Anti-drift:** durante RUNNING o restante é sempre **recalculado** a partir do
`alvo` (timestamp absoluto). Um tick atrasado não acumula erro — o próximo se
corrige. `getRemaining` nunca retorna valor negativo (clamp em 0).

**Transições inválidas** (ex.: `start` quando já RUNNING, `pause` quando IDLE)
lançam `Error` em vez de falhar em silêncio. A tela (`app.js`) evita isso
desabilitando os botões fora de contexto, mas o motor se protege mesmo assim.

## 5. Módulo `format.js`

- `formatTime(ms) -> "hh:mm:ss"` — clampa negativo em 0, preenche com zero à
  esquerda (2 dígitos cada), horas de `00` a `99`.
- `digitsToParts(digits) -> { hh, mm, ss, ms, valid }` — recebe a string de até
  6 dígitos da máscara (preenchendo da direita), interpreta como `HHMMSS`.
  `valid` é falso se `mm > 59`, `ss > 59` ou total `0`. Limite de 6 dígitos
  garante o teto de `99:59:59`.

## 6. Configuração com máscara (em `app.js`, lógica pura em `format.js`)

Campo único estilo micro-ondas: os dígitos preenchem da direita para a esquerda.

```
"1"      -> 00:00:01
"123"    -> 00:01:23
"123456" -> 12:34:56   (máx. 6 dígitos)
```

`app.js` mantém a string de dígitos conforme o usuário digita/apaga e usa
`digitsToParts` para exibir e validar. Se `valid` for falso (mm/ss ≥ 60 ou tempo
zero), o botão **Iniciar** fica desabilitado e o campo recebe destaque de erro.

## 7. Efeitos — `effects.js` + `style.css`

Limiares como **constantes num único lugar** (topo de `effects.js`), fáceis de
ajustar:

```js
export const THRESHOLDS = {
  WARN_MS:   60_000, // <= 60s  -> estágio "warning"
  DANGER_MS: 10_000, // <= 10s  -> estágio "danger"
  BEEP_MS:    5_000, // <= 5s   -> beep a cada segundo
};
```

`effects.js` expõe `stageFor(remainingMs) -> "normal" | "warning" | "danger" |
"finished"`. `app.js` aplica a classe CSS correspondente no display:

| Estágio | Quando | Visual (CSS) | Som |
|---|---|---|---|
| `normal` | > 60s | cor base (verde/claro) | — |
| `warning` | ≤ 60s | amarelo | — |
| `danger` | ≤ 10s | vermelho + **pulsar** | — |
| (beep) | ≤ 5s | (mantém danger) | beep curto a cada segundo |
| `finished` | 00:00:00 | animação "Tempo esgotado!" (flash/shake) | beep longo |

**Som:** Web Audio API gera os beeps em tempo real (oscillator), sem arquivos de
áudio. O beep de cada segundo dispara uma única vez por segundo (controlado por
"último segundo em que tocou", para não repetir entre frames).

## 8. Loop de atualização (`app.js`)

Enquanto RUNNING, um laço com `requestAnimationFrame` chama `timer.tick()` e
redesenha. Como o valor vem do timestamp-alvo, o segundo exibido vira na hora
certa e o pulsar fica suave. Ao detectar FINISHED, para o laço, aplica a animação
final e toca o beep longo.

**Aba em segundo plano:** `requestAnimationFrame` é pausado pelo navegador, mas
como o restante é recalculado do timestamp, ao voltar o display já mostra o valor
correto; se o tempo terminou enquanto a aba estava oculta, o estado `finished` é
detectado no retorno.

## 9. Controles na tela

- **Botão principal** (toggle): "Iniciar" (IDLE/FINISHED) → "Pausar" (RUNNING) →
  "Retomar" (PAUSED). `app.js` escolhe `start`/`pause`/`resume` pelo estado.
- **Botão Resetar:** volta ao tempo configurado (IDLE), reabilita o campo de
  configuração e o botão Iniciar.

## 10. Estratégia de testes (`node --test`)

`timer.test.js`:
- Restante decresce corretamente conforme o relógio avança.
- **Sem drift:** avançar o relógio em saltos grandes/irregulares mantém
  `restante = alvo − now` exato.
- `pause`/`resume` preservam o restante (relógio avança durante a pausa sem
  afetar o restante).
- `reset` volta à duração configurada de qualquer estado.
- Chega a FINISHED exatamente em 0 e nunca fica negativo.
- Transições inválidas são rejeitadas (ex.: `setDuration` durante RUNNING).

`format.test.js`:
- `formatTime`: padding, horas até 99, clamp de negativo, vários valores.
- `digitsToParts`: preenchimento da direita, teto de 6 dígitos, `valid` falso
  para mm/ss ≥ 60 e para tempo zero.

## 11. Critérios de sucesso

1. Todos os testes passam com `node --test`.
2. A contagem bate com um relógio de referência ao longo do tempo (sem drift),
   inclusive após a aba perder o foco.
3. Configuração por máscara funciona até `99:59:59` e bloqueia entradas inválidas.
4. Iniciar/Pausar/Retomar/Resetar funcionam conforme a máquina de estados.
5. Os quatro efeitos (cor, pulsar, beep, animação ao zerar) disparam nos limiares.
6. Código modular, sem DOM nos módulos de lógica, sem gambiarra.
