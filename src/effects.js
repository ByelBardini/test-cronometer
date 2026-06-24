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
 * Gerador de sons do cronômetro.
 *
 * Os beeps curtos (contagem) usam a Web Audio API — sem arquivos. O som FINAL,
 * porém, usa o arquivo de áudio que o usuário largar na pasta `end/` (qualquer
 * .mp3/.wav/.ogg/... — o servidor descobre e serve em `endSoundUrl`). Se a pasta
 * estiver vazia ou o arquivo falhar, cai no beep sintetizado de sempre.
 *
 * Tanto o AudioContext quanto o <audio> só "liberam" para tocar sob um gesto do
 * usuário (clique), por isso `resume()` deve ser chamado no clique de Iniciar:
 * ele cria/retoma o contexto E pré-carrega/destrava o som final.
 *
 * @param {{ endSoundUrl?: string }} [opts]
 * @returns {{ resume: () => void, shortBeep: () => void, finalBeep: (fadeMs?: number) => void, stopFinal: () => void, close: () => void }}
 */
export function createBeeper({ endSoundUrl = '/end-sound' } = {}) {
  let ctx = null;
  let endAudio = null; // HTMLAudioElement com o som da pasta end/ (ou null)
  let finalFired = false; // o som final já foi disparado? (evita corrida com o unlock)
  let fadeTimer = null; // intervalo que sobe o volume do som final (fade-in)

  const FADE_START_VOL = 0.05; // volume inicial do som final (quase inaudível)

  function clearFade() {
    if (fadeTimer !== null) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  // Sobe o volume do som final de FADE_START_VOL até 1 ao longo de durationMs,
  // numa curva ease-in (começa baixo e acelera). Com durationMs <= 0 toca cheio.
  function fadeInEndAudio(durationMs) {
    clearFade();
    if (!endAudio) return;
    if (durationMs <= 0) {
      endAudio.volume = 1;
      return;
    }
    const steps = 40;
    const stepMs = durationMs / steps;
    let i = 0;
    endAudio.volume = FADE_START_VOL;
    fadeTimer = setInterval(() => {
      i += 1;
      const frac = Math.min(1, i / steps);
      const eased = frac ** 1.6; // sobe devagar no início e acelera
      endAudio.volume = Math.min(1, FADE_START_VOL + (1 - FADE_START_VOL) * eased);
      if (frac >= 1) clearFade();
    }, stepMs);
  }

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

  // Pré-carrega o som da pasta end/ e o "destrava" para autoplay sob o gesto do
  // usuário: um play mudo + pause libera o elemento para tocar depois sozinho.
  function loadEndSound() {
    if (endAudio !== null || typeof Audio === 'undefined') return;
    try {
      endAudio = new Audio(endSoundUrl);
      endAudio.preload = 'auto';
      endAudio.muted = true;
      const p = endAudio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          // Se o tempo já zerou (timer curtíssimo), o som final já está tocando:
          // não pausa, só desmuta.
          if (!finalFired) {
            endAudio.pause();
            endAudio.currentTime = 0;
          }
          endAudio.muted = false;
        }).catch(() => {
          // 404 (pasta vazia) ou política de autoplay: segue com o fallback.
          endAudio.muted = false;
        });
      } else {
        endAudio.muted = false;
      }
    } catch {
      endAudio = null; // sem suporte a <audio>: usa só o beep sintetizado
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

  // Som final: tenta tocar o arquivo da pasta end/; em qualquer falha (pasta
  // vazia/404, formato não suportado, autoplay bloqueado) cai no beep sintetizado.
  function finalBeep(fadeMs = 0) {
    finalFired = true;
    if (endAudio) {
      try {
        endAudio.muted = false;
        endAudio.currentTime = 0;
        fadeInEndAudio(fadeMs); // começa baixo e vai subindo o volume
        const p = endAudio.play();
        if (p && typeof p.then === 'function') {
          p.catch(() => tone(440, 700)); // 404 / sem suporte / bloqueio: fallback
        }
        return;
      } catch {
        /* cai no beep sintetizado abaixo */
      }
    }
    tone(440, 700);
  }

  // Interrompe o som final (arquivo da pasta end/) caso esteja tocando e o
  // rearma para um próximo disparo. Não afeta os beeps sintetizados curtos.
  function stopFinal() {
    finalFired = false;
    clearFade();
    if (!endAudio) return;
    try {
      endAudio.pause();
      endAudio.currentTime = 0;
      endAudio.volume = 1; // rearma cheio para um próximo disparo sem fade
    } catch {
      /* ignore: elemento ainda não pronto ou sem suporte */
    }
  }

  return {
    resume: () => {
      ensureContext();
      loadEndSound();
    },
    shortBeep: () => tone(880, 120),
    finalBeep,
    stopFinal,
    close: () => {
      if (ctx) {
        ctx.close();
        ctx = null;
      }
    },
  };
}
