import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTimer } from '../src/timer.js';

/** Helper: cria um timer com relógio falso controlável. */
function withFakeClock() {
  const clock = { now: 0 };
  const timer = createTimer({ now: () => clock.now });
  return { timer, clock };
}

test('estado inicial: IDLE com restante 0 antes de configurar', () => {
  const { timer } = withFakeClock();
  assert.equal(timer.getStatus(), 'IDLE');
  assert.equal(timer.getRemaining(), 0);
});

test('setDuration define o restante e mantém IDLE', () => {
  const { timer } = withFakeClock();
  timer.setDuration(30000);
  assert.equal(timer.getStatus(), 'IDLE');
  assert.equal(timer.getRemaining(), 30000);
});

test('start vai para RUNNING e o restante decresce com o relógio', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(30000);
  timer.start();
  assert.equal(timer.getStatus(), 'RUNNING');
  assert.equal(timer.getRemaining(), 30000);
  clock.now = 1000;
  assert.equal(timer.getRemaining(), 29000);
});

test('anti-drift: saltos grandes e irregulares não acumulam erro', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(30000);
  timer.start(); // alvo = 0 + 30000

  clock.now = 1000;
  assert.equal(timer.getRemaining(), 29000);

  clock.now = 18375; // salto irregular (aba em background)
  assert.equal(timer.getRemaining(), 30000 - 18375); // 11625, exato vs alvo

  clock.now = 29999;
  assert.equal(timer.getRemaining(), 1);
});

test('clamp: restante nunca fica negativo', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(5000);
  timer.start();
  clock.now = 50000; // muito além do alvo
  assert.equal(timer.getRemaining(), 0);
});

test('tick: ao chegar a 0 transiciona para FINISHED com restante 0', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(5000);
  timer.start();
  clock.now = 5000;
  timer.tick();
  assert.equal(timer.getStatus(), 'FINISHED');
  assert.equal(timer.getRemaining(), 0);
});

test('tick antes de zerar mantém RUNNING', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(5000);
  timer.start();
  clock.now = 4999;
  timer.tick();
  assert.equal(timer.getStatus(), 'RUNNING');
});

test('pause congela o restante; relógio avançar na pausa não o afeta', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(10000);
  timer.start();
  clock.now = 4000;
  timer.pause();
  assert.equal(timer.getStatus(), 'PAUSED');
  assert.equal(timer.getRemaining(), 6000);
  clock.now = 999999; // muito tempo parado
  assert.equal(timer.getRemaining(), 6000); // inalterado
});

test('resume recalcula o alvo e continua de onde parou', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(10000);
  timer.start();
  clock.now = 4000;
  timer.pause(); // restante 6000
  clock.now = 999999;
  timer.resume();
  assert.equal(timer.getStatus(), 'RUNNING');
  assert.equal(timer.getRemaining(), 6000);
  clock.now = 999999 + 2000;
  assert.equal(timer.getRemaining(), 4000);
});

test('reset volta para IDLE com a duração configurada (de RUNNING)', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(10000);
  timer.start();
  clock.now = 7000;
  timer.reset();
  assert.equal(timer.getStatus(), 'IDLE');
  assert.equal(timer.getRemaining(), 10000);
});

test('reset funciona de PAUSED', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(10000);
  timer.start();
  clock.now = 3000;
  timer.pause();
  timer.reset();
  assert.equal(timer.getStatus(), 'IDLE');
  assert.equal(timer.getRemaining(), 10000);
});

test('reset funciona de FINISHED', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(2000);
  timer.start();
  clock.now = 2000;
  timer.tick(); // FINISHED
  timer.reset();
  assert.equal(timer.getStatus(), 'IDLE');
  assert.equal(timer.getRemaining(), 2000);
});

test('após reset é possível reconfigurar e iniciar de novo', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(2000);
  timer.start();
  clock.now = 2000;
  timer.tick();
  timer.reset();
  timer.setDuration(8000);
  timer.start();
  assert.equal(timer.getStatus(), 'RUNNING');
  assert.equal(timer.getRemaining(), 8000);
});

test('start é permitido a partir de FINISHED (reinicia a mesma duração)', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(2000);
  timer.start();
  clock.now = 2000;
  timer.tick(); // FINISHED
  timer.start(); // reinicia
  assert.equal(timer.getStatus(), 'RUNNING');
  assert.equal(timer.getRemaining(), 2000);
});

// --- Transições inválidas lançam Error ---

test('setDuration lança erro em RUNNING', () => {
  const { timer } = withFakeClock();
  timer.setDuration(10000);
  timer.start();
  assert.throws(() => timer.setDuration(5000), /RUNNING|inválid|invalid/i);
});

test('setDuration lança erro em PAUSED', () => {
  const { timer, clock } = withFakeClock();
  timer.setDuration(10000);
  timer.start();
  clock.now = 1000;
  timer.pause();
  assert.throws(() => timer.setDuration(5000));
});

test('start lança erro se já RUNNING', () => {
  const { timer } = withFakeClock();
  timer.setDuration(10000);
  timer.start();
  assert.throws(() => timer.start());
});

test('pause lança erro fora de RUNNING (em IDLE)', () => {
  const { timer } = withFakeClock();
  timer.setDuration(10000);
  assert.throws(() => timer.pause());
});

test('resume lança erro fora de PAUSED (em RUNNING)', () => {
  const { timer } = withFakeClock();
  timer.setDuration(10000);
  timer.start();
  assert.throws(() => timer.resume());
});
