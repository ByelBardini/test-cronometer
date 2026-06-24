/**
 * Camada de tela: liga o DOM e os eventos ao motor do cronômetro.
 * Toda a lógica de tempo/formatação/efeitos vive nos módulos puros importados.
 */

import { createTimer } from './timer.js';
import { formatTime, digitsToParts, applyPreset } from './format.js';
import { stageFor, shouldBeep, rednessFor, createBeeper } from './effects.js';

const timer = createTimer({ now: () => performance.now() });
const beeper = createBeeper();

// --- Elementos da tela ---
const bodyEl = document.body;
const stageEl = document.getElementById('stage');
const displayEl = document.getElementById('display');
const presetsEl = document.getElementById('presets');
const btnClear = document.getElementById('btn-clear');
const hintEl = document.getElementById('hint');
const errorEl = document.getElementById('error');
const btnToggle = document.getElementById('btn-toggle');
const btnLabel = btnToggle.querySelector('.btn-label');
const btnReset = document.getElementById('btn-reset');
const btnExit = document.getElementById('btn-exit');
const bannerEl = document.getElementById('finished-banner');
const srStatusEl = document.getElementById('sr-status');
const ringProgress = document.querySelector('.ring-progress');

const STAGE_CLASSES = ['normal', 'warning', 'danger', 'finished'];
const TOGGLE_LABELS = { IDLE: 'Iniciar', FINISHED: 'Iniciar', RUNNING: 'Pausar', PAUSED: 'Retomar' };

// Circunferência do anel (r=135 no viewBox 300). Definida uma vez no SVG.
const RING_RADIUS = 135;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

// --- Estado da camada de tela ---
let digitsString = ''; // dígitos da máscara (a duração configurada)
let totalMs = 0; // duração capturada no start (base do anel de progresso)
let rafId = null;
let lastBeepSecond = -1;
let finalSoundFired = false; // o som final já começou? (evita disparo duplo)
let inFocus = false; // modo foco (overlay de tela cheia) ativo?
let hideControlsTimer = null; // timer do auto-ocultar dos controles no foco

const HIDE_CONTROLS_MS = 3000; // ociosidade até sumir os controles no foco
const FINAL_LEAD_MS = 2000; // o som final começa este tanto antes de zerar

const pad2 = (n) => String(n).padStart(2, '0');
const announce = (msg) => { srStatusEl.textContent = msg; };

/** Qual estágio visual aplicar agora, conforme o estado do motor. */
function currentStage() {
  const status = timer.getStatus();
  if (status === 'FINISHED') return 'finished';
  if (status === 'RUNNING' || status === 'PAUSED') return stageFor(timer.getRemaining());
  return 'normal'; // IDLE
}

/** Texto a exibir no display conforme o estado. */
function displayText() {
  const status = timer.getStatus();
  if (status === 'IDLE') {
    // Mostra exatamente o que foi digitado (sem normalizar mm/ss inválidos).
    const { hh, mm, ss } = digitsToParts(digitsString);
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  if (status === 'FINISHED') return '00:00:00';
  // RUNNING/PAUSED: arredonda para cima para a contagem mostrar cada segundo.
  const rem = timer.getRemaining();
  return formatTime(Math.ceil(rem / 1000) * 1000);
}

/** Fração do anel preenchida (1 = cheio, 0 = vazio). */
function ringFraction() {
  const status = timer.getStatus();
  if (status === 'IDLE') return 1; // prévia cheia
  if (status === 'FINISHED' || totalMs <= 0) return 0;
  return Math.max(0, Math.min(1, timer.getRemaining() / totalMs));
}

/** Atualiza o anel SVG a partir da fração atual. */
function renderRing() {
  const offset = RING_CIRCUMFERENCE * (1 - ringFraction());
  ringProgress.style.strokeDashoffset = String(offset);
}

/** Redesenha toda a tela a partir do estado atual do motor. */
function render() {
  const status = timer.getStatus();
  const isIdle = status === 'IDLE';
  const { valid } = digitsToParts(digitsString);

  // Display
  displayEl.value = displayText();
  displayEl.readOnly = !isIdle;
  displayEl.setAttribute('aria-invalid', String(isIdle && !valid));

  // Estágio visual (uma classe por vez) + anel
  stageEl.classList.remove(...STAGE_CLASSES);
  stageEl.classList.add(currentStage());
  renderRing();

  // Modo foco: classe no body + cor do fundo avermelhando por frame
  bodyEl.classList.toggle('focus', inFocus);
  if (inFocus) {
    const redness = status === 'FINISHED' ? 1 : rednessFor(timer.getRemaining());
    bodyEl.style.setProperty('--focus-redness', redness.toFixed(3));
  }

  // Atalhos só quando parado
  presetsEl.hidden = !isIdle;

  // Botões: no foco, Resetar dá lugar a Sair
  btnLabel.textContent = TOGGLE_LABELS[status];
  btnToggle.setAttribute('aria-label', TOGGLE_LABELS[status]);
  // Iniciar só é permitido com tempo válido; Pausar/Retomar sempre.
  btnToggle.disabled = (status === 'IDLE' || status === 'FINISHED') ? !valid : false;
  btnReset.hidden = inFocus;
  btnExit.hidden = !inFocus;

  // Banner / erro / dica
  bannerEl.hidden = status !== 'FINISHED';
  errorEl.hidden = !(isIdle && digitsString !== '' && !valid);
  hintEl.hidden = !isIdle;
}

// --- Loop de animação (anti-drift: sempre recalcula do timestamp) ---
function loop() {
  timer.tick();
  render();

  const status = timer.getStatus();
  if (status === 'RUNNING') {
    const rem = timer.getRemaining();
    const sec = Math.ceil(rem / 1000);
    if (shouldBeep(rem) && sec !== lastBeepSecond) {
      beeper.shortBeep();
      lastBeepSecond = sec;
    }
    // Dispara o som final 2s antes de zerar (toca por cima da contagem),
    // subindo o volume aos poucos ao longo desse intervalo.
    if (rem <= FINAL_LEAD_MS && !finalSoundFired) {
      beeper.finalBeep(Math.max(0, rem));
      finalSoundFired = true;
    }
    rafId = requestAnimationFrame(loop);
  } else if (status === 'FINISHED') {
    onFinished();
  }
}

function startLoop() {
  lastBeepSecond = -1;
  cancelLoop();
  rafId = requestAnimationFrame(loop);
}

function cancelLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function onFinished() {
  cancelLoop();
  render();
  // Normalmente o som já começou 2s antes; só dispara aqui se ainda não tocou
  // (ex.: timer com duração menor que o lead, ou aba que estava em segundo plano).
  if (!finalSoundFired) {
    beeper.finalBeep();
    finalSoundFired = true;
  }
  announce('Tempo esgotado!');
  // Quando zera: no foco mostra o "Voltar" (e o foca); fora dele, foca o Resetar.
  if (inFocus) {
    showControls();
    btnExit.focus();
  } else {
    btnReset.focus();
  }
}

// --- Controles auto-ocultáveis (só no modo foco) ---
function showControls() {
  if (!inFocus) return;
  bodyEl.classList.add('controls-visible');
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  hideControlsTimer = null;
  // Pausado: mantém os controles visíveis (o usuário precisa deles à mão).
  if (timer.getStatus() === 'PAUSED') return;
  hideControlsTimer = setTimeout(hideControls, HIDE_CONTROLS_MS);
}

function hideControls() {
  bodyEl.classList.remove('controls-visible');
  if (hideControlsTimer) {
    clearTimeout(hideControlsTimer);
    hideControlsTimer = null;
  }
}

// --- Eventos ---
function onToggle() {
  const status = timer.getStatus();
  if (status === 'IDLE' || status === 'FINISHED') {
    const { ms, valid } = digitsToParts(digitsString);
    if (!valid) return; // guarda extra (o botão já estaria desabilitado)
    totalMs = ms; // base do anel de progresso
    finalSoundFired = false; // novo ciclo: o som final ainda vai tocar
    beeper.resume(); // cria/retoma o AudioContext sob o gesto do usuário
    timer.setDuration(ms);
    timer.start();
    inFocus = true; // entra no modo foco (tela cheia)
    announce('Cronômetro iniciado. Modo foco.');
    startLoop();
    showControls(); // pisca os controles por alguns segundos e some
  } else if (status === 'RUNNING') {
    timer.pause();
    cancelLoop();
    announce('Pausado.');
    render();
    showControls(); // pausado: controles ficam visíveis (não auto-some)
  } else if (status === 'PAUSED') {
    timer.resume();
    announce('Retomado.');
    startLoop();
    showControls(); // re-arma o auto-ocultar ao retomar
  }
}

function onReset() {
  leaveFocus();
  cancelLoop();
  timer.reset(); // volta a IDLE com a duração configurada
  announce('Cronômetro reiniciado.');
  render();
  displayEl.focus();
}

/** Sair do modo foco (botão Sair / Esc): para e volta para a configuração. */
function onExit() {
  leaveFocus();
  cancelLoop();
  beeper.stopFinal(); // "Voltar": corta o som final se ainda estiver tocando
  timer.reset();
  announce('Modo foco encerrado.');
  render();
  displayEl.focus();
}

/** Encerra o estado de foco e seus controles auto-ocultáveis. */
function leaveFocus() {
  inFocus = false;
  hideControls();
}

/** Clique nos chips de atalho (somar tempo / limpar). Só vale parado. */
function onPresetClick(e) {
  const btn = e.target.closest('.chip');
  if (!btn || timer.getStatus() !== 'IDLE') return;
  if (btn === btnClear) {
    digitsString = '';
  } else {
    digitsString = applyPreset(digitsString, Number(btn.dataset.delta));
  }
  render();
}

function onDisplayKeydown(e) {
  if (timer.getStatus() !== 'IDLE') {
    e.preventDefault();
    return;
  }
  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    if (digitsString.length < 6) {
      digitsString += e.key;
      render();
    }
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    digitsString = digitsString.slice(0, -1);
    render();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (!btnToggle.disabled) onToggle();
  } else if (e.key !== 'Tab') {
    // Bloqueia qualquer outra digitação (letras, símbolos, setas mexendo no valor)
    e.preventDefault();
  }
}

function onDisplayPaste(e) {
  e.preventDefault();
  if (timer.getStatus() !== 'IDLE') return;
  const text = (e.clipboardData || window.clipboardData).getData('text') || '';
  const digits = text.replace(/\D/g, '');
  digitsString = (digitsString + digits).slice(0, 6);
  render();
}

/** Qualquer interação revela os controles no modo foco (e re-arma o auto-ocultar). */
function onActivity() {
  if (inFocus) showControls();
}

/** Atalhos de teclado válidos só no modo foco: Esc sai, Espaço pausa/retoma. */
function onFocusKeydown(e) {
  if (!inFocus) return;
  showControls();
  if (e.key === 'Escape') {
    e.preventDefault();
    onExit();
    return;
  }
  if (e.key === ' ' || e.key === 'Spacebar') {
    // Se o foco está num botão, deixa o próprio botão tratar o Espaço.
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    e.preventDefault();
    const status = timer.getStatus();
    if (status === 'RUNNING' || status === 'PAUSED') onToggle();
  }
}

// Detecta o fim mesmo se a aba estava em segundo plano (rAF fica estrangulado).
function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (timer.getStatus() !== 'RUNNING') return;
  timer.tick();
  render();
  if (timer.getStatus() === 'FINISHED') onFinished();
  else if (rafId === null) startLoop();
}

btnToggle.addEventListener('click', onToggle);
btnReset.addEventListener('click', onReset);
btnExit.addEventListener('click', onExit);
presetsEl.addEventListener('click', onPresetClick);
displayEl.addEventListener('keydown', onDisplayKeydown);
displayEl.addEventListener('paste', onDisplayPaste);
document.addEventListener('visibilitychange', onVisibilityChange);
document.addEventListener('mousemove', onActivity, { passive: true });
document.addEventListener('touchstart', onActivity, { passive: true });
document.addEventListener('keydown', onFocusKeydown);

// Estado inicial na tela
render();
