import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatTime, digitsToParts, msToDigits, applyPreset } from '../src/format.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

test('formatTime: zero é 00:00:00', () => {
  assert.equal(formatTime(0), '00:00:00');
});

test('formatTime: um segundo', () => {
  assert.equal(formatTime(1000), '00:00:01');
});

test('formatTime: minuto e segundo (61s)', () => {
  assert.equal(formatTime(61000), '00:01:01');
});

test('formatTime: hora, minuto e segundo (1h01m01s)', () => {
  assert.equal(formatTime(3661000), '01:01:01');
});

test('formatTime: preenche cada campo com 2 dígitos', () => {
  assert.equal(formatTime(9 * 3600000 + 5 * 60000 + 7 * 1000), '09:05:07');
});

test('formatTime: ignora milissegundos fracionários (trunca)', () => {
  assert.equal(formatTime(1999), '00:00:01');
});

test('formatTime: valor negativo vira 00:00:00 (clamp)', () => {
  assert.equal(formatTime(-5000), '00:00:00');
});

test('formatTime: teto de 99:59:59', () => {
  assert.equal(formatTime(99 * 3600000 + 59 * 60000 + 59 * 1000), '99:59:59');
});

test('formatTime: acima do teto satura em 99:59:59', () => {
  assert.equal(formatTime(200 * 3600000), '99:59:59');
});

test('digitsToParts: um dígito preenche os segundos', () => {
  assert.deepEqual(digitsToParts('1'), { hh: 0, mm: 0, ss: 1, ms: 1000, valid: true });
});

test('digitsToParts: preenche da direita para a esquerda', () => {
  assert.deepEqual(digitsToParts('123'), {
    hh: 0, mm: 1, ss: 23, ms: 83000, valid: true,
  });
});

test('digitsToParts: seis dígitos viram hh:mm:ss', () => {
  const r = digitsToParts('123456');
  assert.deepEqual(r, {
    hh: 12, mm: 34, ss: 56, ms: (12 * 3600 + 34 * 60 + 56) * 1000, valid: true,
  });
});

test('digitsToParts: teto válido 99:59:59', () => {
  const r = digitsToParts('995959');
  assert.equal(r.valid, true);
  assert.equal(r.ms, (99 * 3600 + 59 * 60 + 59) * 1000);
});

test('digitsToParts: segundos >= 60 é inválido', () => {
  const r = digitsToParts('99'); // ss = 99
  assert.equal(r.valid, false);
});

test('digitsToParts: minutos >= 60 é inválido', () => {
  const r = digitsToParts('9900'); // mm = 99
  assert.equal(r.valid, false);
});

test('digitsToParts: string vazia é inválida (tempo zero)', () => {
  assert.equal(digitsToParts('').valid, false);
});

test('digitsToParts: todos zeros é inválido (tempo zero)', () => {
  assert.equal(digitsToParts('000000').valid, false);
});

test('digitsToParts: mais de 6 dígitos usa os últimos 6', () => {
  assert.deepEqual(digitsToParts('9123456'), digitsToParts('123456'));
});

// --- msToDigits: ms -> "HHMMSS" canônico (6 dígitos), com clamp ---

test('msToDigits: zero é "000000"', () => {
  assert.equal(msToDigits(0), '000000');
});

test('msToDigits: 5 minutos é "000500"', () => {
  assert.equal(msToDigits(5 * MIN), '000500');
});

test('msToDigits: 1h02m03s é "010203"', () => {
  assert.equal(msToDigits(1 * HOUR + 2 * MIN + 3 * 1000), '010203');
});

test('msToDigits: trunca milissegundos fracionários', () => {
  assert.equal(msToDigits(1999), '000001');
});

test('msToDigits: negativo clampa em "000000"', () => {
  assert.equal(msToDigits(-5000), '000000');
});

test('msToDigits: acima do teto satura em "995959"', () => {
  assert.equal(msToDigits(200 * HOUR), '995959');
});

test('msToDigits: produz string que digitsToParts entende de volta', () => {
  const digits = msToDigits(15 * MIN);
  assert.deepEqual(digitsToParts(digits), {
    hh: 0, mm: 15, ss: 0, ms: 15 * MIN, valid: true,
  });
});

// --- applyPreset: soma um delta ao tempo atual dos dígitos ---

test('applyPreset: a partir de vazio soma e canoniza', () => {
  assert.equal(applyPreset('', 5 * MIN), '000500');
});

test('applyPreset: soma acumulada (15min = 5min três vezes)', () => {
  let d = '';
  d = applyPreset(d, 5 * MIN);
  d = applyPreset(d, 5 * MIN);
  d = applyPreset(d, 5 * MIN);
  assert.equal(d, '001500');
});

test('applyPreset: soma carrega para a unidade maior (50min + 30min = 1h20m)', () => {
  assert.equal(applyPreset('005000', 30 * MIN), '012000');
});

test('applyPreset: satura no teto 99:59:59', () => {
  assert.equal(applyPreset('995900', 5 * MIN), '995959');
});

test('applyPreset: delta negativo não passa de zero', () => {
  assert.equal(applyPreset('000300', -10 * MIN), '000000');
});

test('applyPreset: normaliza entrada inválida (mm=99) ao somar', () => {
  // '009900' = 99 minutos = 1h39m; +1min -> 1h40m
  assert.equal(applyPreset('009900', 1 * MIN), '014000');
});
