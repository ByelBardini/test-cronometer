import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatTime, digitsToParts } from '../src/format.js';

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
