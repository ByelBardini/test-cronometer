/**
 * Motor do cronômetro de contagem regressiva. Módulo puro — sem DOM.
 *
 * Correção temporal (anti-drift): enquanto RUNNING, o tempo restante é SEMPRE
 * derivado de um timestamp-alvo absoluto (`target - now()`), nunca de um contador
 * decrementado a cada tick. Assim, um tick atrasado (CPU ocupada, aba em segundo
 * plano) não acumula erro — o próximo cálculo se corrige sozinho.
 *
 * O relógio é injetado (`now`) para tornar a contagem determinística nos testes.
 */

export const Status = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
});

/**
 * @param {{ now?: () => number }} [deps] - `now` retorna milissegundos. Em
 *   produção, use `() => performance.now()`. Nos testes, um relógio controlável.
 */
export function createTimer({ now = () => performance.now() } = {}) {
  let status = Status.IDLE;
  let configuredDuration = 0; // ms definidos por setDuration
  let remaining = 0; // ms restantes materializados (válido quando != RUNNING)
  let target = 0; // timestamp-alvo (válido quando RUNNING)

  function assert(condition, message) {
    if (!condition) throw new Error(`Transição inválida: ${message}`);
  }

  return {
    /**
     * Define a duração configurada. Só permitido parado (IDLE/FINISHED).
     * @param {number} ms
     */
    setDuration(ms) {
      assert(
        status === Status.IDLE || status === Status.FINISHED,
        `setDuration não é permitido em ${status}`,
      );
      configuredDuration = Math.max(0, Math.floor(ms));
      remaining = configuredDuration;
      status = Status.IDLE;
    },

    /** Inicia a contagem a partir da duração configurada. Só de IDLE/FINISHED. */
    start() {
      assert(
        status === Status.IDLE || status === Status.FINISHED,
        `start não é permitido em ${status}`,
      );
      remaining = configuredDuration;
      target = now() + remaining;
      status = Status.RUNNING;
    },

    /** Pausa, congelando o restante atual. Só de RUNNING. */
    pause() {
      assert(status === Status.RUNNING, `pause não é permitido em ${status}`);
      remaining = Math.max(0, target - now());
      status = Status.PAUSED;
    },

    /** Retoma de onde parou, recalculando o alvo. Só de PAUSED. */
    resume() {
      assert(status === Status.PAUSED, `resume não é permitido em ${status}`);
      target = now() + remaining;
      status = Status.RUNNING;
    },

    /** Volta ao estado IDLE com a duração configurada. Permitido de qualquer estado. */
    reset() {
      remaining = configuredDuration;
      status = Status.IDLE;
    },

    /**
     * Avança a máquina de estados. Se RUNNING e o tempo acabou, vai para FINISHED.
     * Deve ser chamado a cada frame do loop de animação.
     */
    tick() {
      if (status === Status.RUNNING && target - now() <= 0) {
        remaining = 0;
        status = Status.FINISHED;
      }
    },

    /** Tempo restante em ms. Em RUNNING deriva do alvo; nunca negativo. */
    getRemaining() {
      if (status === Status.RUNNING) return Math.max(0, target - now());
      return remaining;
    },

    /** @returns {"IDLE"|"RUNNING"|"PAUSED"|"FINISHED"} */
    getStatus() {
      return status;
    },
  };
}
