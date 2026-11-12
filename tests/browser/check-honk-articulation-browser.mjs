import { createBrowserSession } from "../../scripts/browser-session.mjs";
const session = await createBrowserSession();
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Render real Web Audio, not mocks or just the inputs passed to HonkVoice.
// Moving only the scheduling time must not change a Honk's attack or timbre.
const root = session.dataRoot;
let service, browser;
try {
  service = await session.start();
  if (process.platform === "darwin") process.env.CAPTURE_SOFTWARE_GL ??= "0";
  browser = session.browser;
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const report = await browser.evaluate(`(async () => {
    const { HonkVoice } = await import('/src/audio/honk/HonkVoice.js');
    const { tuningForMidi } = await import("/src/instruments/honk/HonkTuning.js");
    const { createHonkTuning } = await import('/src/instruments/honk/HonkTuning.js');
    const { HONK_MASTER_GAIN, HONK_RELEASE_SETTINGS } = await import('/src/config/audio.js');
    const { HONK_RELEASE_ORIGINS } = await import('/src/audio/honk/HonkReleaseProfile.js');
    const render = async (midi, duration, scheduled, movingSqueeze) => {
      const rate = 48000, start = .125, end = start + duration;
      const offline = new OfflineAudioContext(1, Math.ceil((end + .3) * rate), rate);
      let now = 0;
      const context = {
        get currentTime() { return now; },
        destination: offline.destination,
        createOscillator: () => offline.createOscillator(),
        createGain: () => offline.createGain(),
        createBiquadFilter: () => offline.createBiquadFilter(),
      };
      const voice = new HonkVoice({ context });
      const tuning = createHonkTuning(tuningForMidi(midi));
      const update = (at, amount) => {
        now = scheduled ? 0 : at;
        voice.update({ hornAmount: amount, masterGain: HONK_MASTER_GAIN,
          leftEar: tuning.pitchControl, rightEar: tuning.octaveControl,
          noteGain: 1, pitchBendSemitones: 0, activeVoiceCount: 1 },
          scheduled ? { scheduledTime: at } : {});
      };
      now = scheduled ? 0 : start;
      voice.start(scheduled ? start : undefined);
      if (movingSqueeze) {
        for (let i = 0; i / 60 < duration; i++) update(start + i / 60, 1 - .82 ** (i + 1));
      } else update(start, 1);
      now = scheduled ? 0 : end;
      voice.release(HONK_RELEASE_SETTINGS.liveFadeSeconds, undefined, {
        origin: HONK_RELEASE_ORIGINS.controller, ...(scheduled ? { scheduledTime: end } : {}),
      });
      const buffer = await offline.startRendering();
      return buffer.getChannelData(0);
    };
    const cases = [];
    for (const midi of [40, 55, 71, 83]) for (const duration of [.06, .35, 1.4]) for (const movingSqueeze of [false, true]) {
      const live = await render(midi, duration, false, movingSqueeze);
      const scheduled = await render(midi, duration, true, movingSqueeze);
      let error = 0, energy = 0, maximumDifference = 0, peak = 0, tailPeak = 0;
      for (let i = 0; i < live.length; i++) {
        const difference = scheduled[i] - live[i];
        error += difference * difference; energy += live[i] * live[i];
        maximumDifference = Math.max(maximumDifference, Math.abs(difference));
        peak = Math.max(peak, Math.abs(scheduled[i]));
        if (i > (.125 + duration + HONK_RELEASE_SETTINGS.liveFadeSeconds + .01) * 48000) tailPeak = Math.max(tailPeak, Math.abs(scheduled[i]));
      }
      cases.push({ midi, duration, movingSqueeze, relativeRmsError: Math.sqrt(error / energy), maximumDifference, peak, tailPeak });
    }
    return { sampleRate: 48000, cases };
  })()`);
  await mkdir(`${session.output}/rishte-human`, { recursive: true });
  await writeFile(
    `${session.output}/rishte-human/articulation.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  for (const result of report.cases) {
    assert.ok(result.peak > 0.0001, "Honk must be audible");
    assert.ok(
      result.relativeRmsError < 1e-6,
      `Scheduled/live waveform differs: ${JSON.stringify(result)}`,
    );
    assert.equal(result.tailPeak, 0, "Release must end in silence");
  }
  assert.deepEqual(browser.errors, []);
} finally {
  await session.close();
}
