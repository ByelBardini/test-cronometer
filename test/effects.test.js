import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stageFor, shouldBeep, THRESHOLDS } from '../src/effects.js';

test('THRESHOLDS: valores esperados', () => {
  assert.equal(THRESHOLDS.WARN_MS, 60000);
  assert.equal(THRESHOLDS.DANGER_MS, 10000);
  assert.equal(THRESHOLDS.BEEP_MS, 5000);
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
