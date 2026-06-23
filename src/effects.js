/**
 * Decisão de efeitos (puro, sem DOM) + gerador de beep (Web Audio).
 * A parte pura é testável; createBeeper depende do navegador.
 */

/** Limiares dos efeitos, em milissegundos. Ajuste aqui para mudar o comportamento. */
export const THRESHOLDS = {
  WARN_MS: 60000, // <= 60s  -> "warning" (amarelo)
  DANGER_MS: 10000, // <= 10s -> "danger" (vermelho + pulsar)
  BEEP_MS: 5000, // <= 5s    -> beep curto a cada segundo
  REDDEN_MS: 60000, // <= 60s -> fundo do modo foco começa a avermelhar
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
 * Intensidade do "avermelhamento" do fundo no modo foco: 0 (sem vermelho) a 1
 * (vermelho total), em função do tempo restante. Puro e testável.
 *
 * Curva ease-in: a "proximidade do zero" (closeness) é elevada a uma potência,
 * para o vermelho ser sutil cedo e acelerar no fim. Depende SÓ do restante
 * (não da duração total): um timer de 5min e um de 1min avermelham igual no
 * trecho final.
 *
 *   remaining >= 60s -> 0          (antes do trecho final)
 *   remaining == 60s -> 0          (fronteira)
 *   remaining == 10s -> ~0.673     (ainda discreto)
 *   remaining -> 0   -> 1          (vermelho total)
 *   remaining < 0    -> 1          (passou do zero: trava no máximo)
 *
 * @param {number} remainingMs
 * @returns {number} valor em [0,1]
 */
export function rednessFor(remainingMs) {
  const span = THRESHOLDS.REDDEN_MS;
  const remaining = Math.max(0, remainingMs); // negativos contam como zero
  if (remaining >= span) return 0;
  const closeness = (span - remaining) / span; // 0 em 60s, 1 em 0
  const eased = closeness ** 2.2; // ease-in: acelera no fim
  return Math.min(1, Math.max(0, eased)); // trava de segurança em [0,1]
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
