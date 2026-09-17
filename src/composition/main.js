import * as THREE from "three";
import { AudioSystem } from "../audio/AudioSystem.js";
import { HonkInstrument } from "../instruments/honk/HonkInstrument.js";
import { AssetRepository } from "../scene/AssetRepository.js";
import { SceneRuntime } from "../scene/SceneRuntime.js";
import { applyStandardInstrumentMaterials } from "../scene/materialUtils.js";
import { CompositionPlayer } from "./CompositionPlayer.js";
import { COMPOSITION_PITCHES, kuchToHuaHaiScore, tuningForCompositionPitch } from "./kuchToHuaHaiScore.js";

const stage = document.querySelector("#stage");
const status = document.querySelector("#playback-status");
const play = document.querySelector("#play");
const stop = document.querySelector("#stop");
const restart = document.querySelector("#restart");
const progress = document.querySelector("#progress");
const sectionName = document.querySelector("#section-name");
const phraseCount = document.querySelector("#phrase-count");
const phraseLabel = document.querySelector("#phrase-label");
const keys = new Map();
const highlights = new Map();
const held = new Set();

export const audioSystem = new AudioSystem();
export const honks = new Map();
export const sceneRuntime = new SceneRuntime({ container: stage });
export const player = new CompositionPlayer({
  audioSystem, honks, score: kuchToHuaHaiScore, onStateChange: updateControls,
});

sceneRuntime.fallbackEnvironment.visible = false;
sceneRuntime.renderer.xr.enabled = false;
sceneRuntime.camera.fov = 38;
const assets = new AssetRepository();
let ready = false;

function resize() {
  const width = stage.clientWidth;
  const height = Math.max(1, stage.clientHeight);
  const camera = sceneRuntime.camera;
  camera.aspect = width / height;
  // Fit both ordered rows inside the actual canvas, excluding desktop controls.
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const distance = Math.max(3.7 / (2 * Math.tan(verticalFov / 2)),
    7.8 / (2 * Math.tan(verticalFov / 2) * camera.aspect));
  camera.position.set(0, 1.6, distance + .4);
  camera.lookAt(0, 1.6, 0);
  camera.updateProjectionMatrix();
  sceneRuntime.renderer.setSize(width, height);
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(stage);

function makeLabel(pitch) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  context.font = "500 46px Arial";
  context.fillStyle = "#e9e3d9";
  context.textAlign = "center";
  context.fillText(pitch === "Bb3" ? "B♭3" : pitch, 128, 62);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  label.scale.set(.65, .24, 1);
  return label;
}

function createHonk(pitch, index, template) {
  const root = assets.cloneModel(template);
  root.name = `Composition_${pitch}`;
  root.visible = true;
  root.scale.setScalar(4.2);
  const row = index < 6 ? 0 : 1;
  const column = row === 0 ? index : index - 6;
  const x = (column - (row === 0 ? 2.5 : 2)) * 1.18;
  const y = row === 0 ? 2.5 : .85;
  root.position.set(x, y, 0);
  const honk = new HonkInstrument({
    id: `composition-honk-${index}`, root, voiceService: audioSystem,
    tuning: tuningForCompositionPitch(pitch),
  }).initialize();
  honk.attachTo(sceneRuntime.scene);
  honks.set(pitch, honk);

  const label = makeLabel(pitch);
  label.position.set(x, y - .7, .15);
  sceneRuntime.scene.add(label);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.46, .49, 64),
    new THREE.MeshBasicMaterial({ color: 0xf3c677, transparent: true, opacity: .85, depthWrite: false }));
  ring.position.set(x, y, -.28);
  ring.visible = false;
  sceneRuntime.scene.add(ring);
  highlights.set(pitch, ring);

  const button = document.createElement("button");
  button.textContent = pitch === "Bb3" ? "B♭3" : pitch;
  button.setAttribute("aria-label", `Hold to play ${pitch}`);
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || button.disabled) return;
    button.setPointerCapture(event.pointerId);
    beginAudition(pitch);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(event, () => endAudition(pitch));
  }
  button.addEventListener("keydown", (event) => {
    if (event.code !== "Space" && event.code !== "Enter") return;
    event.preventDefault();
    if (!event.repeat) beginAudition(pitch);
  });
  button.addEventListener("keyup", (event) => {
    if (event.code === "Space" || event.code === "Enter") endAudition(pitch);
  });
  button.addEventListener("blur", () => endAudition(pitch));
  document.querySelector("#note-keys").appendChild(button);
  keys.set(pitch, button);
}

function beginAudition(pitch) {
  if (!ready || held.has(pitch) || ["starting", "playing"].includes(player.state)) return;
  held.add(pitch);
  honks.get(pitch).beginSqueeze("desktop-audition").catch((error) => {
    endAudition(pitch);
    reportError(error);
  });
}

function endAudition(pitch) {
  if (!held.delete(pitch)) return;
  honks.get(pitch).endSqueeze("desktop-audition");
  honks.get(pitch).resolvePerformance();
}

function releaseAuditions() {
  for (const pitch of held) endAudition(pitch);
}

function updateControls(state) {
  const performing = state === "starting" || state === "playing";
  play.disabled = !ready || performing;
  stop.disabled = !ready || !performing;
  restart.disabled = !ready;
  for (const key of keys.values()) key.disabled = performing;
  status.textContent = {
    starting: "Starting…", playing: "Playing · once through", stopped: "Ready to play",
    finished: "Finished · all 14 phrases", error: "Could not start audio",
  }[state];
}

function reportError(error) {
  console.error(error);
  status.textContent = error.message;
}

play.addEventListener("click", () => {
  releaseAuditions();
  player.play().catch(reportError);
});
stop.addEventListener("click", () => player.stop());
restart.addEventListener("click", () => {
  releaseAuditions();
  player.restart().catch(reportError);
});
window.addEventListener("blur", releaseAuditions);
window.addEventListener("pagehide", () => {
  player.stop();
  releaseAuditions();
  audioSystem.releaseAll();
});

export const initialized = (async () => {
  const [template, textures] = await Promise.all([assets.loadModel("honk"), assets.loadTextureSet("honk")]);
  applyStandardInstrumentMaterials(template, textures);
  COMPOSITION_PITCHES.forEach((pitch, index) => createHonk(pitch, index, template));
  progress.max = kuchToHuaHaiScore.phrases.at(-1).startBeat + kuchToHuaHaiScore.phrases.at(-1).durationBeats;
  document.querySelector(".timing-note").textContent =
    `${kuchToHuaHaiScore.tempoBpm} BPM · First-pass rhythm · Hold a pitch below to try its Honk.`;
  ready = true;
  updateControls(player.state);
  resize();
  sceneRuntime.renderer.setAnimationLoop(() => {
    player.updatePresentation();
    for (const [pitch, honk] of honks) {
      // Auditioning uses the ordinary live Honk path, including its voice service.
      if (held.has(pitch)) honk.updatePerformance();
      const active = player.activePitches.has(pitch) || held.has(pitch);
      highlights.get(pitch).visible = active;
      keys.get(pitch).classList.toggle("active", active);
    }
    const beat = player.beat;
    progress.value = beat;
    const phrase = kuchToHuaHaiScore.phrases.findLast((entry) => beat >= entry.startBeat) || kuchToHuaHaiScore.phrases[0];
    sectionName.textContent = phrase.section;
    phraseCount.textContent = `${String(phrase.id).padStart(2, "0")} / 14`;
    phraseLabel.textContent = phrase.label;
    sceneRuntime.render();
  });
})().catch(reportError);
