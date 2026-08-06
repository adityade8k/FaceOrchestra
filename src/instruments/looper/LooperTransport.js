export const LooperTransportState = Object.freeze({
  STOPPED: "stopped",
  ARMED_RECORDING: "armed-recording",
  ARMED_PLAYBACK: "armed-playback",
  RECORDING: "recording",
  PLAYING: "playing",
  PAUSED: "paused",
});

export const LooperTransportAction = Object.freeze({
  RECORD: "record",
  ARM_RECORD: "armRecord",
  ARM_PLAY: "armPlay",
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

  get recordArmed() {
    return this.state === LooperTransportState.ARMED_RECORDING;
  }

  get playArmed() {
    return this.state === LooperTransportState.ARMED_PLAYBACK;
  }

  get armed() {
    return this.recordArmed || this.playArmed;
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

  armRecord() {
    const previousState = this.state;
    this.state = LooperTransportState.ARMED_RECORDING;
    return createResult(LooperTransportAction.ARM_RECORD, previousState, this.state, {
      restarted: previousState === LooperTransportState.ARMED_RECORDING,
    });
  }

  armPlay() {
    const previousState = this.state;
    this.state = LooperTransportState.ARMED_PLAYBACK;
    return createResult(LooperTransportAction.ARM_PLAY, previousState, this.state, {
      restarted: true,
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
