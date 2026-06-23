/**
 * Camada de tela: liga o DOM e os eventos ao motor do cronômetro.
 * Toda a lógica de tempo/formatação/efeitos vive nos módulos puros importados.
 */

import { createTimer } from './timer.js';
import { formatTime, digitsToParts } from './format.js';
import { stageFor, shouldBeep, createBeeper } from './effects.js';

const timer = createTimer({ now: () => performance.now() });
const beeper = createBeeper();

// --- Elementos da tela ---
const stageEl = document.getElementById('stage');
const displayEl = document.getElementById('display');
const hintEl = document.getElementById('hint');
const errorEl = document.getElementById('error');
const btnToggle = document.getElementById('btn-toggle');
const btnReset = document.getElementById('btn-reset');
const bannerEl = document.getElementById('finished-banner');
const srStatusEl = document.getElementById('sr-status');

const STAGE_CLASSES = ['normal', 'warning', 'danger', 'finished'];
const TOGGLE_LABELS = { IDLE: 'Iniciar', FINISHED: 'Iniciar', RUNNING: 'Pausar', PAUSED: 'Retomar' };

// --- Estado da camada de tela ---
let digitsString = ''; // dígitos da máscara (a duração configurada)
let rafId = null;
let lastBeepSecond = -1;

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

/** Redesenha toda a tela a partir do estado atual do motor. */
function render() {
  const status = timer.getStatus();
  const isIdle = status === 'IDLE';
  const { valid } = digitsToParts(digitsString);

  // Display
  displayEl.value = displayText();
  displayEl.readOnly = !isIdle;
  displayEl.setAttribute('aria-invalid', String(isIdle && !valid));

  // Estágio visual (uma classe por vez)
  stageEl.classList.remove(...STAGE_CLASSES);
  stageEl.classList.add(currentStage());

  // Botões
  btnToggle.textContent = TOGGLE_LABELS[status];
  btnToggle.setAttribute('aria-label', TOGGLE_LABELS[status]);
  // Iniciar só é permitido com tempo válido; Pausar/Retomar sempre.
  btnToggle.disabled = (status === 'IDLE' || status === 'FINISHED') ? !valid : false;

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
  beeper.finalBeep();
  announce('Tempo esgotado!');
  btnReset.focus();
}

// --- Eventos ---
function onToggle() {
  const status = timer.getStatus();
  if (status === 'IDLE' || status === 'FINISHED') {
    const { ms, valid } = digitsToParts(digitsString);
    if (!valid) return; // guarda extra (o botão já estaria desabilitado)
    beeper.resume(); // cria/retoma o AudioContext sob o gesto do usuário
    timer.setDuration(ms);
    timer.start();
    announce('Cronômetro iniciado.');
    startLoop();
  } else if (status === 'RUNNING') {
    timer.pause();
    cancelLoop();
    announce('Pausado.');
    render();
  } else if (status === 'PAUSED') {
    timer.resume();
    announce('Retomado.');
    startLoop();
  }
}

function onReset() {
  cancelLoop();
  timer.reset(); // volta a IDLE com a duração configurada
  announce('Cronômetro reiniciado.');
  render();
  displayEl.focus();
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
displayEl.addEventListener('keydown', onDisplayKeydown);
displayEl.addEventListener('paste', onDisplayPaste);
document.addEventListener('visibilitychange', onVisibilityChange);

// Estado inicial na tela
render();
