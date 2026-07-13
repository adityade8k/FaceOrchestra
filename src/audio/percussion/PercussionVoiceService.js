import { clamp, lerp } from "../audioMath.js";
import { PERCUSSION_PROFILES, PERCUSSION_TYPES } from "./percussionProfiles.js";

export class PercussionVoiceService {
  constructor({ ensureAudio, getDestination }) {
    this.ensureAudio = ensureAudio;
    this.getDestination = getDestination;
  }

  async trigger(type, { volume = 1 } = {}) {
    const context = await this.ensureAudio();
    if (type === PERCUSSION_TYPES.hihat) {
      this.triggerHihat(context, volume);
      return;
    }

    this.triggerBoink(context, volume);
  }

  createSoftClipCurve(amount = 1.4) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const drive = Math.max(amount, 0.01);
    const normalizer = Math.tanh(drive);

    for (let index = 0; index < samples; index += 1) {
      const x = (index / (samples - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * drive) / normalizer;
    }

    return curve;
  }

  triggerBoink(context, volume = 1) {
    if (!context) {
      return;
    }

    const settings = PERCUSSION_PROFILES.boink;
    const now = context.currentTime;
    const output = context.createGain();
    const bodyBus = context.createGain();
    const bodyDrive = context.createWaveShaper();
    const bodyTone = context.createBiquadFilter();
    const roomDelay = context.createDelay(0.18);
    const roomFeedback = context.createGain();
    const roomDamping = context.createBiquadFilter();
    const roomGain = context.createGain();
    const body = context.createOscillator();
    const bodyGain = context.createGain();
    const sub = context.createOscillator();
    const subGain = context.createGain();
    const shell = context.createOscillator();
    const shellGain = context.createGain();
    const malletSource = context.createBufferSource();
    const malletFilter = context.createBiquadFilter();
    const malletGain = context.createGain();
    const click = context.createOscillator();
    const clickGain = context.createGain();
    const bodySeconds = Math.max(settings.bodySeconds, 0.04);
    const subSeconds = Math.max(settings.subSeconds ?? bodySeconds, bodySeconds);
    const shellSeconds = Math.max(settings.shellSeconds ?? bodySeconds * 0.72, 0.03);
    const malletSeconds = Math.max(settings.malletSeconds ?? 0.04, 0.005);
    const roomTailSeconds = Math.max(settings.roomTailSeconds ?? 0.16, 0);
    const stopAt =
      now + Math.max(bodySeconds, subSeconds, shellSeconds, malletSeconds) + roomTailSeconds + 0.05;
    const malletSampleCount = Math.max(Math.floor(context.sampleRate * malletSeconds), 1);
    const malletBuffer = context.createBuffer(1, malletSampleCount, context.sampleRate);
    const malletSamples = malletBuffer.getChannelData(0);
    for (let index = 0; index < malletSampleCount; index += 1) {
      malletSamples[index] = Math.random() * 2 - 1;
    }

    output.gain.setValueAtTime(Math.max(volume, 0) * settings.gain, now);
    output.connect(this.getDestination(context));
    bodyBus.gain.setValueAtTime(1, now);
    bodyDrive.curve = this.createSoftClipCurve(settings.bodyDrive ?? 1.4);
    bodyDrive.oversample = "2x";
    bodyTone.type = "lowpass";
    bodyTone.frequency.setValueAtTime(settings.bodyToneFrequency ?? 1000, now);
    bodyTone.Q.setValueAtTime(0.72, now);
    roomDelay.delayTime.setValueAtTime(settings.roomDelaySeconds ?? 0.038, now);
    roomFeedback.gain.setValueAtTime(clamp(settings.roomFeedback ?? 0.2, 0, 0.82), now);
    roomDamping.type = "lowpass";
    roomDamping.frequency.setValueAtTime(settings.roomDampingFrequency ?? 520, now);
    roomGain.gain.setValueAtTime(settings.roomGain ?? 0.1, now);
    roomGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + Math.max(shellSeconds, bodySeconds * 0.55) + Math.max(roomTailSeconds, 0.04),
    );

    bodyBus.connect(bodyDrive);
    bodyDrive.connect(bodyTone);
    bodyTone.connect(output);
    bodyTone.connect(roomDelay);
    roomDelay.connect(roomGain);
    roomGain.connect(output);
    roomDelay.connect(roomFeedback);
    roomFeedback.connect(roomDamping);
    roomDamping.connect(roomDelay);

    body.type = "sine";
    body.frequency.setValueAtTime(settings.startFrequency, now);
    body.frequency.exponentialRampToValueAtTime(
      settings.endFrequency,
      now + settings.pitchDropSeconds,
    );
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(1, now + (settings.bodyAttackSeconds ?? 0.006));
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + bodySeconds);
    body.connect(bodyGain);
    bodyGain.connect(bodyBus);

    sub.type = "sine";
    sub.frequency.setValueAtTime(settings.subStartFrequency ?? settings.endFrequency, now);
    sub.frequency.exponentialRampToValueAtTime(
      settings.subEndFrequency ?? settings.endFrequency,
      now + (settings.subPitchDropSeconds ?? settings.pitchDropSeconds),
    );
    subGain.gain.setValueAtTime(settings.subGain ?? 0.36, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + subSeconds);
    sub.connect(subGain);
    subGain.connect(bodyBus);

    shell.type = "triangle";
    shell.frequency.setValueAtTime(settings.shellStartFrequency ?? 112, now);
    shell.frequency.exponentialRampToValueAtTime(
      settings.shellEndFrequency ?? 74,
      now + (settings.shellPitchDropSeconds ?? settings.pitchDropSeconds),
    );
    shellGain.gain.setValueAtTime(0.0001, now);
    shellGain.gain.exponentialRampToValueAtTime(settings.shellGain ?? 0.3, now + 0.008);
    shellGain.gain.exponentialRampToValueAtTime(0.0001, now + shellSeconds);
    shell.connect(shellGain);
    shellGain.connect(bodyBus);

    malletSource.buffer = malletBuffer;
    malletFilter.type = "bandpass";
    malletFilter.frequency.setValueAtTime(settings.malletFilterFrequency ?? 285, now);
    malletFilter.Q.setValueAtTime(settings.malletFilterQ ?? 0.9, now);
    malletGain.gain.setValueAtTime(settings.malletGain ?? 0.24, now);
    malletGain.gain.exponentialRampToValueAtTime(0.0001, now + malletSeconds);
    malletSource.connect(malletFilter);
    malletFilter.connect(malletGain);
    malletGain.connect(bodyBus);

    click.type = "triangle";
    click.frequency.setValueAtTime(settings.clickFrequency, now);
    clickGain.gain.setValueAtTime(settings.clickGain, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + settings.clickSeconds);
    click.connect(clickGain);
    clickGain.connect(output);

    body.start(now);
    sub.start(now);
    shell.start(now);
    malletSource.start(now);
    click.start(now);
    body.stop(stopAt);
    sub.stop(stopAt);
    shell.stop(stopAt);
    malletSource.stop(now + malletSeconds);
    click.stop(now + settings.clickSeconds + 0.02);
    body.onended = () => {
      disconnectNode(body);
      disconnectNode(bodyGain);
      disconnectNode(sub);
      disconnectNode(subGain);
      disconnectNode(shell);
      disconnectNode(shellGain);
      disconnectNode(malletSource);
      disconnectNode(malletFilter);
      disconnectNode(malletGain);
      disconnectNode(click);
      disconnectNode(clickGain);
      disconnectNode(bodyBus);
      disconnectNode(bodyDrive);
      disconnectNode(bodyTone);
      disconnectNode(roomDelay);
      disconnectNode(roomFeedback);
      disconnectNode(roomDamping);
      disconnectNode(roomGain);
      disconnectNode(output);
    };
  }

  triggerHihat(context, volume = 1) {
    if (!context) {
      return;
    }

    const settings = PERCUSSION_PROFILES.hihat;
    const now = context.currentTime;
    const sampleCount = Math.max(Math.floor(context.sampleRate * settings.noiseSeconds), 1);
    const noiseBuffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }

    const output = context.createGain();
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const bandpass = context.createBiquadFilter();
    const airHighpass = context.createBiquadFilter();
    const airGain = context.createGain();
    const noiseGain = context.createGain();
    const metallicBus = context.createGain();
    const metallicEchoDelay = context.createDelay(0.25);
    const metallicEchoFeedback = context.createGain();
    const metallicEchoDamping = context.createBiquadFilter();
    const metallicEchoGain = context.createGain();
    const noiseSeconds = Math.max(settings.noiseSeconds, 0.01);
    const noiseAttackSeconds = Math.min(
      settings.noiseAttackSeconds ?? 0.0015,
      noiseSeconds * 0.25,
    );
    const metallicDecaySeconds = Math.max(
      settings.metallicDecaySeconds ?? noiseSeconds,
      noiseSeconds,
    );
    const metallicEchoTailSeconds = Math.max(settings.metallicEchoTailSeconds ?? 0.2, 0);
    const stopAt =
      now + Math.max(noiseSeconds, metallicDecaySeconds) + metallicEchoTailSeconds + 0.06;

    output.gain.setValueAtTime(Math.max(volume, 0) * settings.gain, now);
    output.connect(this.getDestination(context));

    source.buffer = noiseBuffer;
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(settings.highpassFrequency, now);
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(settings.bandpassFrequency, now);
    bandpass.Q.setValueAtTime(settings.bandpassQ, now);
    airHighpass.type = "highpass";
    airHighpass.frequency.setValueAtTime(settings.airHighpassFrequency, now);
    airGain.gain.setValueAtTime(settings.airGain ?? 0.25, now);
    airGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseSeconds * 0.82);
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(settings.noiseGain ?? 1, now + noiseAttackSeconds);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseSeconds);
    metallicEchoDelay.delayTime.setValueAtTime(settings.metallicEchoDelaySeconds ?? 0.045, now);
    metallicEchoFeedback.gain.setValueAtTime(
      clamp(settings.metallicEchoFeedback ?? 0.3, 0, 0.9),
      now,
    );
    metallicEchoDamping.type = "lowpass";
    metallicEchoDamping.frequency.setValueAtTime(settings.metallicEchoDampingFrequency ?? 7600, now);
    metallicEchoGain.gain.setValueAtTime(settings.metallicEchoGain ?? 0.12, now);

    source.connect(highpass);
    highpass.connect(bandpass);
    highpass.connect(airHighpass);
    bandpass.connect(noiseGain);
    airHighpass.connect(airGain);
    noiseGain.connect(output);
    airGain.connect(output);
    metallicBus.connect(output);
    metallicBus.connect(metallicEchoDelay);
    metallicEchoDelay.connect(metallicEchoGain);
    metallicEchoGain.connect(output);
    metallicEchoDelay.connect(metallicEchoFeedback);
    metallicEchoFeedback.connect(metallicEchoDamping);
    metallicEchoDamping.connect(metallicEchoDelay);

    const metallicDetunes = settings.metallicDetuneCents || [];
    const metallicOscillators = settings.metallicFrequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const partialGain = settings.metallicGain / Math.sqrt(index + 1);
      const partialPosition =
        settings.metallicFrequencies.length > 1
          ? index / (settings.metallicFrequencies.length - 1)
          : 0;
      const partialDecay = metallicDecaySeconds * lerp(1, 0.56, partialPosition);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.detune.setValueAtTime(metallicDetunes[index] ?? 0, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(
        partialGain,
        now + (settings.metallicAttackSeconds ?? 0.0025),
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(partialDecay, 0.03));
      oscillator.connect(gain);
      gain.connect(metallicBus);
      oscillator.start(now);
      oscillator.stop(stopAt);
      return { oscillator, gain };
    });

    const cleanup = () => {
      disconnectNode(source);
      disconnectNode(highpass);
      disconnectNode(bandpass);
      disconnectNode(airHighpass);
      disconnectNode(airGain);
      disconnectNode(noiseGain);
      disconnectNode(metallicBus);
      disconnectNode(metallicEchoDelay);
      disconnectNode(metallicEchoFeedback);
      disconnectNode(metallicEchoDamping);
      disconnectNode(metallicEchoGain);
      for (const { oscillator, gain } of metallicOscillators) {
        disconnectNode(oscillator);
        disconnectNode(gain);
      }
      disconnectNode(output);
    };

    source.start(now);
    source.stop(now + noiseSeconds);

    const cleanupSource = metallicOscillators.at(-1)?.oscillator || source;
    cleanupSource.onended = cleanup;
  }
}

function disconnectNode(node, destination = undefined) {
  try {
    if (destination) {
      node?.disconnect?.(destination);
    } else {
      node?.disconnect?.();
    }
  } catch {
    // Already disconnected.
  }
}
