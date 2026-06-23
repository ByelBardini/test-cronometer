/**
 * Decisão de efeitos (puro, sem DOM) + gerador de beep (Web Audio).
 * A parte pura é testável; createBeeper depende do navegador.
 */

/** Limiares dos efeitos, em milissegundos. Ajuste aqui para mudar o comportamento. */
export const THRESHOLDS = {
  WARN_MS: 60000, // <= 60s  -> "warning" (amarelo)
  DANGER_MS: 10000, // <= 10s -> "danger" (vermelho + pulsar)
  BEEP_MS: 5000, // <= 5s    -> beep curto a cada segundo
};

/**
 * Estágio visual para um tempo restante.
 * Avalia do mais crítico ao menos crítico.
 * @param {number} remainingMs
 * @returns {"normal"|"warning"|"danger"|"finished"}
 */
export function stageFor(remainingMs) {
  if (remainingMs <= 0) return 'finished';
  if (remainingMs <= THRESHOLDS.DANGER_MS) return 'danger';
  if (remainingMs <= THRESHOLDS.WARN_MS) return 'warning';
  return 'normal';
}

/**
 * Se deve tocar o beep curto (últimos segundos). O beep do instante 0 é o
 * beep longo final, tratado à parte — por isso aqui exige remainingMs > 0.
 * @param {number} remainingMs
 * @returns {boolean}
 */
export function shouldBeep(remainingMs) {
  return remainingMs > 0 && remainingMs <= THRESHOLDS.BEEP_MS;
}

/**
 * Gerador de beeps via Web Audio API — sem arquivos de áudio.
 * O AudioContext só pode ser criado/retomado sob um gesto do usuário (clique),
 * por isso `resume()` deve ser chamado no clique de Iniciar.
 * @returns {{ resume: () => void, shortBeep: () => void, finalBeep: () => void, close: () => void }}
 */
export function createBeeper() {
  let ctx = null;

  function ensureContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null; // navegador sem Web Audio: silencioso
    try {
      if (!ctx) ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null; // sem dispositivo de áudio: degrada em silêncio, não quebra o timer
    }
  }

  // Toca um tom com envelope de ganho (ataque e cauda suaves) para não estalar.
  function tone(freq, durationMs, peak = 0.3) {
    const ac = ensureContext();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const t0 = ac.currentTime;
    const end = t0 + durationMs / 1000;

    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(end + 0.02);
  }

  return {
    resume: () => ensureContext(),
    shortBeep: () => tone(880, 120),
    finalBeep: () => tone(440, 700),
    close: () => {
      if (ctx) {
        ctx.close();
        ctx = null;
      }
    },
  };
}
