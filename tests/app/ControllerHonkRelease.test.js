import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROLLER_HONK_RELEASE_OPTIONS,
  releaseControllerHonkVoice,
} from "../../src/app/runtime/ControllerHonkRelease.js";
import { HONK_RELEASE_ORIGINS } from "../../src/audio/honk/HonkReleaseProfile.js";
import { XRIntentMapper, XRIntentType } from "../../src/xr/XRIntentMapper.js";

test("trigger-up intent uses an explicit controller honk release origin", () => {
  const intents = new XRIntentMapper().map({
    type: "button.transition",
    button: "trigger",
    pressed: false,
    controllerId: "left",
  });
  const releases = [];
  const runtime = {
    releaseHonkVoice: (voiceId, options) => releases.push({ voiceId, options }),
  };

  assert.equal(intents[0].type, XRIntentType.TriggerEnd);
  releaseControllerHonkVoice(runtime, "left-chain-voice");

  assert.deepEqual(releases, [{
    voiceId: "left-chain-voice",
    options: { origin: HONK_RELEASE_ORIGINS.controller },
  }]);
  assert.equal(CONTROLLER_HONK_RELEASE_OPTIONS.origin, HONK_RELEASE_ORIGINS.controller);
});

test("controller release helper forwards duplicate calls without changing their profile", () => {
  const releases = [];
  const runtime = {
    releaseHonkVoice: (voiceId, options) => releases.push({ voiceId, options }),
  };

  releaseControllerHonkVoice(runtime, "rapid-voice");
  releaseControllerHonkVoice(runtime, "rapid-voice");

  assert.equal(releases.length, 2);
  assert.equal(releases[0].options, CONTROLLER_HONK_RELEASE_OPTIONS);
  assert.equal(releases[1].options, CONTROLLER_HONK_RELEASE_OPTIONS);
});
