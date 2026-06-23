import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stageFor, shouldBeep, rednessFor, THRESHOLDS } from '../src/effects.js';

test('THRESHOLDS: valores esperados', () => {
  assert.equal(THRESHOLDS.WARN_MS, 60000);
  assert.equal(THRESHOLDS.DANGER_MS, 10000);
  assert.equal(THRESHOLDS.BEEP_MS, 5000);
  assert.equal(THRESHOLDS.REDDEN_MS, 60000);
});

test('stageFor: acima de 60s é normal', () => {
  assert.equal(stageFor(70000), 'normal');
  assert.equal(stageFor(60001), 'normal');
});

test('stageFor: exatamente 60s é warning (fronteira <=)', () => {
  assert.equal(stageFor(60000), 'warning');
});

test('stageFor: entre 10s e 60s é warning', () => {
  assert.equal(stageFor(11000), 'warning');
});

test('stageFor: exatamente 10s é danger (fronteira <=)', () => {
  assert.equal(stageFor(10000), 'danger');
});

test('stageFor: entre 0 e 10s é danger', () => {
  assert.equal(stageFor(5000), 'danger');
  assert.equal(stageFor(1), 'danger');
});

test('stageFor: zero é finished', () => {
  assert.equal(stageFor(0), 'finished');
});

test('stageFor: negativo é finished (clamp de segurança)', () => {
  assert.equal(stageFor(-100), 'finished');
});

test('shouldBeep: dentro dos últimos 5s (inclusive)', () => {
  assert.equal(shouldBeep(5000), true);
  assert.equal(shouldBeep(1000), true);
});

test('shouldBeep: acima de 5s não toca', () => {
  assert.equal(shouldBeep(5001), false);
});

test('shouldBeep: zero não toca (é o beep final, não o curto)', () => {
  assert.equal(shouldBeep(0), false);
});

test('shouldBeep: negativo não toca', () => {
  assert.equal(shouldBeep(-1), false);
});

// --- rednessFor: intensidade do avermelhamento do fundo (modo foco), em [0,1] ---

test('rednessFor: acima de 60s não avermelha (0)', () => {
  assert.equal(rednessFor(60001), 0);
  assert.equal(rednessFor(120000), 0);
});

test('rednessFor: exatamente 60s ainda é 0 (início do trecho)', () => {
  assert.equal(rednessFor(60000), 0);
});

test('rednessFor: zero é totalmente vermelho (1)', () => {
  assert.equal(rednessFor(0), 1);
});

test('rednessFor: negativo trava em 1 (passou do zero)', () => {
  assert.equal(rednessFor(-5000), 1);
});

test('rednessFor: sempre dentro de [0,1]', () => {
  for (const ms of [70000, 60000, 30000, 10000, 1000, 0, -1000]) {
    const r = rednessFor(ms);
    assert.ok(r >= 0 && r <= 1, `fora de faixa em ${ms}: ${r}`);
  }
});

test('rednessFor: monotônica — menos tempo, mais vermelho', () => {
  assert.ok(rednessFor(45000) < rednessFor(30000));
  assert.ok(rednessFor(30000) < rednessFor(10000));
  assert.ok(rednessFor(10000) < rednessFor(2000));
});

test('rednessFor: acelera no fim (ease-in)', () => {
  const r10 = rednessFor(10000);
  assert.ok(r10 > 0.6 && r10 < 0.7, `esperado ~0.67 em 10s, veio ${r10}`);
  assert.ok(rednessFor(30000) < 0.3, 'na metade do trecho deve estar bem abaixo de 0.5');
});
