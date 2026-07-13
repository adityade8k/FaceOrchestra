export const LooperTransportState = Object.freeze({
  STOPPED: "stopped",
  RECORDING: "recording",
  PLAYING: "playing",
  PAUSED: "paused",
});

export const LooperTransportAction = Object.freeze({
  RECORD: "record",
  FINISH_RECORDING: "finishRecording",
  PLAY: "play",
  PAUSE: "pause",
  STOP: "stop",
  RESET: "reset",
});

function createResult(action, previousState, state, options = {}) {
  return Object.freeze({
    action,
    accepted: options.accepted !== false,
    changed: previousState !== state,
    previousState,
    state,
    resumed: Boolean(options.resumed),
    restarted: Boolean(options.restarted),
    reset: Boolean(options.reset),
  });
}

export class LooperTransport {
  constructor(initialState = LooperTransportState.STOPPED) {
    this.state = Object.values(LooperTransportState).includes(initialState)
      ? initialState
      : LooperTransportState.STOPPED;
  }

  get recording() {
    return this.state === LooperTransportState.RECORDING;
  }

  get playing() {
    return this.state === LooperTransportState.PLAYING;
  }

  get paused() {
    return this.state === LooperTransportState.PAUSED;
  }

  get stopped() {
    return this.state === LooperTransportState.STOPPED;
  }

  record() {
    const previousState = this.state;
    this.state = LooperTransportState.RECORDING;
    return createResult(LooperTransportAction.RECORD, previousState, this.state, {
      restarted: previousState === LooperTransportState.RECORDING,
    });
  }

  finishRecording() {
    const previousState = this.state;
    if (!this.recording) {
      return createResult(
        LooperTransportAction.FINISH_RECORDING,
        previousState,
        this.state,
        { accepted: false },
      );
    }
    this.state = LooperTransportState.STOPPED;
    return createResult(LooperTransportAction.FINISH_RECORDING, previousState, this.state);
  }

  play({ restart = false } = {}) {
    const previousState = this.state;
    if (this.recording || (this.playing && !restart)) {
      return createResult(LooperTransportAction.PLAY, previousState, this.state, {
        accepted: false,
      });
    }

    const resumed = this.paused && !restart;
    this.state = LooperTransportState.PLAYING;
    return createResult(LooperTransportAction.PLAY, previousState, this.state, {
      resumed,
      restarted: restart || previousState === LooperTransportState.STOPPED,
    });
  }

  pause() {
    const previousState = this.state;
    if (!this.playing) {
      return createResult(LooperTransportAction.PAUSE, previousState, this.state, {
        accepted: false,
      });
    }
    this.state = LooperTransportState.PAUSED;
    return createResult(LooperTransportAction.PAUSE, previousState, this.state);
  }

  stop() {
    const previousState = this.state;
    this.state = LooperTransportState.STOPPED;
    return createResult(LooperTransportAction.STOP, previousState, this.state);
  }

  reset() {
    const previousState = this.state;
    this.state = LooperTransportState.STOPPED;
    return createResult(LooperTransportAction.RESET, previousState, this.state, { reset: true });
  }
}
