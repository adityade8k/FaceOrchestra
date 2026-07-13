export class AudioContextService {
  constructor({ getAudioContextClass = getDefaultAudioContextClass } = {}) {
    this.getAudioContextClass = getAudioContextClass;
    this.context = null;
  }

  async ensureContext() {
    if (!this.context) {
      const AudioContextClass = this.getAudioContextClass();
      if (!AudioContextClass) {
        throw new Error("Web Audio is not available in this browser.");
      }
      this.context = new AudioContextClass();
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    return this.context;
  }
}

function getDefaultAudioContextClass() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}
