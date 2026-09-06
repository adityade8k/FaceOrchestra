export const METRONOME_COMPONENT_ID = "metronome";

export const METRONOME_SETTINGS = Object.freeze({
  defaultBpm: 135,
  minBpm: 30,
  maxBpm: 240,
  defaultVolume: 0.5,
  minVolume: 0,
  maxVolume: 1,
  sphereSegments: 24,
  sphereRings: 16,
  debugOpacity: 0.24,
  renderOrder: 24,
  debug: Object.freeze({
    colliderOpacity: 0.32,
    planeOpacity: 0.08,
    ringOpacity: 0.8,
    arcOpacity: 1,
    pivotRadius: 0.5,
    radialLimits: true,
    circleSegments: 64,
    planeSizeMultiplier: 2.35,
  }),
  clickFrequency: 420,
  clickOscillatorType: "triangle",
  clickDurationSeconds: 0.035,
  clickGain: 0.18,
  baseScale: 2.5,
  minScale: 0.5,
  maxScale: 6,
  scaleStep: 0.25,
  spawnYawDegrees: 0,
  connectionWireColor: 0x8b5cf6,
  connectionWirePreviewColor: 0xc4b5fd,
  connectionPortOpacity: 0.32,
  connectionWireRenderOrder: 16,
  connectionWirePreviewRenderOrder: 17,
  honkBeatGateRatio: 0.24,
  honkBeatGateMinSeconds: 0.035,
  honkBeatGateMaxSeconds: 0.16,
  honkBeatReleaseFadeSeconds: 0.018,
});

export const METRONOME_CONNECTION_ROLE = "metronome.connection-port";

// Legacy scene/config compatibility only. Runtime grip raycasts use the
// imported visible meshes and expose no procedural body box.
export const METRONOME_BODY_COLLIDER = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  scale: Object.freeze({ x: 0.7, y: 0.8, z: 0.8 }),
});

export const METRONOME_CONNECTION_PORTS = Object.freeze([
  Object.freeze({
    portId: "port-0",
    name: "HIT_metronome_connection_port_0",
    position: Object.freeze({ x: -0.36, y: -0.25, z: -0.03 }),
    colliderScale: 0.035,
    colliderColor: 0x8b5cf6,
    socketDirection: Object.freeze({ x: -1, y: 0, z: 0 }),
  }),
  Object.freeze({
    portId: "port-1",
    name: "HIT_metronome_connection_port_1",
    position: Object.freeze({ x: -0.31, y: -0.115, z: -0.03 }),
    colliderScale: 0.035,
    colliderColor: 0xa78bfa,
    socketDirection: Object.freeze({ x: -1, y: 0, z: 0 }),
  }),
  Object.freeze({
    portId: "port-2",
    name: "HIT_metronome_connection_port_2",
    position: Object.freeze({ x: 0.365, y: -0.24, z: -0.03 }),
    colliderScale: 0.03,
    colliderColor: 0xc084fc,
    socketDirection: Object.freeze({ x: 1, y: 0, z: 0 }),
  }),
  Object.freeze({
    portId: "port-3",
    name: "HIT_metronome_connection_port_3",
    position: Object.freeze({ x: 0.32, y: -0.11, z: -0.05 }),
    colliderScale: 0.03,
    colliderColor: 0xe879f9,
    socketDirection: Object.freeze({ x: 1, y: 0, z: 0 }),
  }),
]);

export const METRONOME_BUTTON_ACTIONS = Object.freeze({
  play: "play",
  pause: "pause",
});

export const METRONOME_EYE_CONTROLS = Object.freeze([
  Object.freeze({
    nodeName: "L_button_geo",
    action: METRONOME_BUTTON_ACTIONS.play,
    latching: true,
    pressedOffset: Object.freeze({ x: 0, y: 0, z: -0.012 }),
    releaseDelayMs: null,
    colliderScale: 1.08,
    colliderColor: 0x72d572,
  }),
  Object.freeze({
    nodeName: "R_button_geo",
    action: METRONOME_BUTTON_ACTIONS.pause,
    latching: false,
    pressedOffset: Object.freeze({ x: 0, y: 0, z: -0.012 }),
    releaseDelayMs: 140,
    colliderScale: 1.08,
    colliderColor: 0xff8c42,
  }),
]);

// Axis is expressed in the imported model/root frame. The pendulum is a direct
// child of that root, so its swing delta is premultiplied onto the imported rest
// quaternion rather than applied around the mesh's post-import local axis.
export const METRONOME_PENDULUM_SETTINGS = Object.freeze({
  nodeName: "pendulum_geo",
  modelLocalAxis: Object.freeze({ x: 0, y: 0, z: 1 }),
  swingDegrees: 5,
});

// The outlets asset bakes both handle positions into geometry, so each control
// reconstructs its Ver-8 hinge in group1-local space. group1 maps local Y to
// the Metronome root's Z axis. Default values are the parameter midpoints, so
// both generated pivots initialize at the midpoint of their configured arcs.
export const METRONOME_HANDLE_CONTROLS = Object.freeze([
  Object.freeze({
    nodeName: "L_handle_geo",
    parameter: "bpm",
    axis: Object.freeze({ x: 0, y: 1, z: 0 }),
    pivot: Object.freeze({ x: 9.907267464, y: 14.899678701, z: 10.923128679 }),
    colliderOffset: Object.freeze({ x: 5, y: 0, z: -5 }),
    colliderRadius: 1.6,
    minAngleDegrees: -80,
    maxAngleDegrees: 30,
    referenceAngleDegrees: 0,
    colliderColor: 0xff8c42,
    pivotColor: 0xffd0a8,
    planeColor: 0xff8c42,
    arcColor: 0xffc08a,
    invertDrag: false,
  }),
  Object.freeze({
    nodeName: "R_handle_geo",
    parameter: "volume",
    axis: Object.freeze({ x: 0, y: 1, z: 0 }),
    pivot: Object.freeze({ x: -10.089564549, y: 14.890084927, z: 10.666345168 }),
    colliderOffset: Object.freeze({ x: -5, y: 0, z: -5 }),
    colliderRadius: 1.6,
    minAngleDegrees: -30,
    maxAngleDegrees: 90,
    referenceAngleDegrees: 0,
    colliderColor: 0x5ac8fa,
    pivotColor: 0xbdeaff,
    planeColor: 0x5ac8fa,
    arcColor: 0x9ee5ff,
    invertDrag: false,
  }),
]);

export const METRONOME_LABEL_SETTINGS = Object.freeze({
  color: 0xf7efe2,
  size: 0.055,
  depth: 0.008,
  curveSegments: 4,
  position: Object.freeze({ x: 0, y: 0.25, z: 0 }),
  rotationDegrees: Object.freeze({ x: -18, y: 0, z: 0 }),
  canvasWidth: 512,
  canvasHeight: 128,
  spriteWidth: 0.34,
  spriteHeight: 0.085,
  font: "700 72px Arial",
});
