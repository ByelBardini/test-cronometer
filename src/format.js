/**
 * Formatação e parsing de tempo. Módulo puro — sem DOM.
 */

const MAX_MS = (99 * 3600 + 59 * 60 + 59) * 1000; // 99:59:59

/**
 * Converte milissegundos em "hh:mm:ss".
 * Clampa negativos em 0 e satura no teto de 99:59:59.
 * @param {number} ms
 * @returns {string}
 */
export function formatTime(ms) {
  const clamped = Math.min(MAX_MS, Math.max(0, ms));
  const totalSec = Math.floor(clamped / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Interpreta uma sequência de dígitos (estilo micro-ondas) como HHMMSS,
 * preenchendo da direita para a esquerda. Usa no máximo os 6 últimos dígitos.
 * @param {string} digits - apenas caracteres 0-9
 * @returns {{hh:number, mm:number, ss:number, ms:number, valid:boolean}}
 */
export function digitsToParts(digits) {
  const padded = String(digits).slice(-6).padStart(6, '0');
  const hh = Number(padded.slice(0, 2));
  const mm = Number(padded.slice(2, 4));
  const ss = Number(padded.slice(4, 6));
  const ms = (hh * 3600 + mm * 60 + ss) * 1000;
  const valid = mm <= 59 && ss <= 59 && ms > 0;
  return { hh, mm, ss, ms, valid };
}

/**
 * Converte milissegundos na string canônica "HHMMSS" (6 dígitos) usada pela
 * máscara. Clampa em [0, 99:59:59] e trunca fração de segundo. O resultado é
 * sempre válido (mm/ss entre 00 e 59), ao contrário do que o usuário pode digitar.
 * @param {number} ms
 * @returns {string} exatamente 6 dígitos
 */
export function msToDigits(ms) {
  const clamped = Math.min(MAX_MS, Math.max(0, ms));
  const totalSec = Math.floor(clamped / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join('');
}

/**
 * Soma um delta (ms) ao tempo atualmente representado pelos dígitos e devolve
 * novos dígitos canônicos. Base é o tempo dos dígitos (interpretados como
 * minutos/segundos mesmo se "inválidos"), então o resultado é normalizado e
 * clampado em [0, 99:59:59]. Usado pelos chips de atalho (+1m, +5m, ...).
 * @param {string} digits
 * @param {number} deltaMs
 * @returns {string} dígitos canônicos "HHMMSS"
 */
export function applyPreset(digits, deltaMs) {
  const { ms } = digitsToParts(digits);
  return msToDigits(ms + deltaMs);
}
