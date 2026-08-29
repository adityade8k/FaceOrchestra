import { ASSET_PATHS } from "../../config/assets.js";
import {
  METRONOME_BODY_COLLIDER,
  METRONOME_CONNECTION_PORTS,
  METRONOME_EYE_CONTROLS,
  METRONOME_HANDLE_CONTROLS,
  METRONOME_PENDULUM_SETTINGS,
  METRONOME_SETTINGS,
} from "../../config/metronome.js";
import {
  assertFiniteNumber,
  assertFiniteVector,
  normalizeCalibrationAxis,
  roundCalibrationNumber,
} from "../../instruments/core/calibrationMath.js";

export const METRONOME_CALIBRATION_SCHEMA_VERSION = 1;
export const METRONOME_EDITOR_AUTOSAVE_KEY = "face-orchestra-metronome-editor-v1";

const COLOR_FIELDS = new Set([
  "colliderColor",
  "pivotColor",
  "planeColor",
  "arcColor",
]);
const REQUIRED_PORT_IDS = Object.freeze(METRONOME_CONNECTION_PORTS.map(({ portId }) => portId));

export class CalibrationSchemaError extends TypeError {
  constructor(errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    super(list.join("\n"));
    this.name = "CalibrationSchemaError";
    this.errors = list;
  }
}

export function createRepositoryMetronomeCalibration() {
  return {
    schemaVersion: METRONOME_CALIBRATION_SCHEMA_VERSION,
    modelPath: ASSET_PATHS.models.metronome,
    modelFileName: null,
    metronome: {
      settings: deepClone(METRONOME_SETTINGS),
      bodyCollider: deepClone(METRONOME_BODY_COLLIDER),
      connectionPorts: deepClone(METRONOME_CONNECTION_PORTS),
      eyeControls: deepClone(METRONOME_EYE_CONTROLS),
      handleControls: deepClone(METRONOME_HANDLE_CONTROLS),
      pendulum: deepClone(METRONOME_PENDULUM_SETTINGS),
    },
  };
}

export function cloneMetronomeCalibration(value) {
  return deepClone(value);
}

export function validateMetronomeCalibration(value, { nodeNames = null } = {}) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CalibrationSchemaError("Calibration must be an object.");
  }
  if (value.schemaVersion !== METRONOME_CALIBRATION_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${METRONOME_CALIBRATION_SCHEMA_VERSION}.`);
  }
  if (value.modelPath !== null && typeof value.modelPath !== "string") {
    errors.push("modelPath must be a string or null for a local GLB.");
  }
  const metronome = value.metronome;
  if (!metronome || typeof metronome !== "object") {
    errors.push("metronome is required.");
    throw new CalibrationSchemaError(errors);
  }

  validateSettings(metronome.settings, errors);
  validateBody(metronome.bodyCollider, errors);
  validatePorts(metronome.connectionPorts, errors);
  validateEyes(metronome.eyeControls, errors);
  validateHandles(metronome.handleControls, errors);
  validatePendulum(metronome.pendulum, errors);

  const warnings = [];
  if (nodeNames) {
    const available = nodeNames instanceof Set ? nodeNames : new Set(nodeNames);
    for (const [label, nodeName] of configuredNodeNames(metronome)) {
      if (nodeName && !available.has(nodeName)) warnings.push(`${label}: node "${nodeName}" is absent from the loaded GLB.`);
    }
  }
  if (errors.length) throw new CalibrationSchemaError(errors);
  return { valid: true, warnings };
}

export function createMetronomeCalibrationExport(value, options = {}) {
  validateMetronomeCalibration(value, options);
  const source = value.metronome;
  const document = {
    schemaVersion: METRONOME_CALIBRATION_SCHEMA_VERSION,
    modelPath: value.modelPath ?? null,
    modelFileName: value.modelPath === null ? value.modelFileName || null : null,
    metronome: {
      settings: orderedSettings(source.settings),
      bodyCollider: orderedBody(source.bodyCollider),
      connectionPorts: source.connectionPorts.map(orderedPort),
      eyeControls: source.eyeControls.map(orderedEye),
      handleControls: source.handleControls.map(orderedHandle),
      pendulum: orderedPendulum(source.pendulum),
    },
  };
  validateMetronomeCalibration(document, options);
  return document;
}

export function serializeMetronomeCalibration(value, options = {}) {
  return JSON.stringify(createMetronomeCalibrationExport(value, options), null, 2);
}

export function parseMetronomeCalibration(text, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CalibrationSchemaError(`Invalid JSON: ${error.message}`);
  }
  validateMetronomeCalibration(parsed, options);
  return hydrateColors(createMetronomeCalibrationExport(parsed, options));
}

export function generateMetronomeConfigJavaScript(value, options = {}) {
  const document = createMetronomeCalibrationExport(value, options);
  const { metronome } = hydrateColors(document);
  return [
    "// Paste these replacements into src/config/metronome.js.",
    emitExport("METRONOME_SETTINGS", metronome.settings),
    emitExport("METRONOME_BODY_COLLIDER", metronome.bodyCollider),
    emitExport("METRONOME_CONNECTION_PORTS", metronome.connectionPorts),
    emitExport("METRONOME_EYE_CONTROLS", metronome.eyeControls),
    emitExport("METRONOME_PENDULUM_SETTINGS", metronome.pendulum),
    emitExport("METRONOME_HANDLE_CONTROLS", metronome.handleControls),
  ].join("\n\n");
}

export function colorNumberToJson(value) {
  const number = colorToNumber(value);
  return `#${number.toString(16).padStart(6, "0")}`;
}

export function colorToNumber(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
  if (typeof value === "string" && /^(?:#|0x)[0-9a-fA-F]{6}$/.test(value)) {
    return Number.parseInt(value.replace(/^#|^0x/, ""), 16);
  }
  throw new CalibrationSchemaError(`Invalid color "${String(value)}"; use #rrggbb, 0xrrggbb, or a 24-bit integer.`);
}

function validateSettings(settings, errors) {
  if (!settings || typeof settings !== "object") return errors.push("metronome.settings is required.");
  for (const field of [
    "spawnYawDegrees",
    "defaultBpm", "minBpm", "maxBpm",
    "defaultVolume", "minVolume", "maxVolume",
  ]) validateFinite(settings[field], `settings.${field}`, errors);
  if (Number.isFinite(settings.minBpm) && Number.isFinite(settings.maxBpm) && settings.minBpm >= settings.maxBpm) {
    errors.push("settings.minBpm must be less than settings.maxBpm.");
  }
  if (Number.isFinite(settings.minVolume) && Number.isFinite(settings.maxVolume) && settings.minVolume >= settings.maxVolume) {
    errors.push("settings.minVolume must be less than settings.maxVolume.");
  }
}

function validateBody(body, errors) {
  if (!body || typeof body !== "object") return errors.push("bodyCollider is required.");
  validateVector(body.position, "bodyCollider.position", errors);
  validateVector(body.scale, "bodyCollider.scale", errors);
  if (body.scale && ["x", "y", "z"].some((axis) => Number.isFinite(body.scale[axis]) && body.scale[axis] <= 0)) {
    errors.push("bodyCollider.scale axes must be greater than zero.");
  }
}

function validatePorts(ports, errors) {
  if (!Array.isArray(ports)) return errors.push("connectionPorts must be an array.");
  const ids = ports.map(({ portId } = {}) => portId);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) errors.push(`Duplicate port IDs: ${[...new Set(duplicates)].join(", ")}.`);
  const missing = REQUIRED_PORT_IDS.filter((id) => !ids.includes(id));
  if (missing.length) errors.push(`Missing required port IDs: ${missing.join(", ")}.`);
  ports.forEach((port, index) => {
    const path = `connectionPorts[${index}]`;
    validateRequiredString(port?.portId, `${path}.portId`, errors);
    validateRequiredString(port?.name, `${path}.name`, errors);
    validateVector(port?.position, `${path}.position`, errors);
    validateFinite(port?.colliderScale, `${path}.colliderScale`, errors);
    if (Number.isFinite(port?.colliderScale) && port.colliderScale < 0) errors.push(`${path}.colliderScale cannot be negative.`);
    validateColor(port?.colliderColor, `${path}.colliderColor`, errors);
    validateAxis(port?.socketDirection, `${path}.socketDirection`, errors);
  });
}

function validateEyes(eyes, errors) {
  if (!Array.isArray(eyes)) return errors.push("eyeControls must be an array.");
  eyes.forEach((eye, index) => {
    const path = `eyeControls[${index}]`;
    validateRequiredString(eye?.nodeName, `${path}.nodeName`, errors);
    validateRequiredString(eye?.action, `${path}.action`, errors);
    if (typeof eye?.latching !== "boolean") errors.push(`${path}.latching must be boolean.`);
    validateVector(eye?.pressedOffset, `${path}.pressedOffset`, errors);
    if (eye?.releaseDelayMs !== null) validateFinite(eye?.releaseDelayMs, `${path}.releaseDelayMs`, errors);
    validateFinite(eye?.colliderScale, `${path}.colliderScale`, errors);
    if (Number.isFinite(eye?.colliderScale) && eye.colliderScale < 0) errors.push(`${path}.colliderScale cannot be negative.`);
    validateColor(eye?.colliderColor, `${path}.colliderColor`, errors);
  });
}

function validateHandles(handles, errors) {
  if (!Array.isArray(handles)) return errors.push("handleControls must be an array.");
  handles.forEach((handle, index) => {
    const path = `handleControls[${index}]`;
    validateRequiredString(handle?.nodeName, `${path}.nodeName`, errors);
    validateRequiredString(handle?.parameter, `${path}.parameter`, errors);
    validateAxis(handle?.axis, `${path}.axis`, errors);
    for (const field of ["minAngleDegrees", "maxAngleDegrees", "referenceAngleDegrees", "colliderRadius"]) {
      validateFinite(handle?.[field], `${path}.${field}`, errors);
    }
    if (Number.isFinite(handle?.colliderRadius) && handle.colliderRadius < 0) errors.push(`${path}.colliderRadius cannot be negative.`);
    if (Number.isFinite(handle?.minAngleDegrees) && Number.isFinite(handle?.maxAngleDegrees)
      && handle.minAngleDegrees >= handle.maxAngleDegrees) {
      errors.push(`${path}.minAngleDegrees must be less than maxAngleDegrees.`);
    }
    validateVector(handle?.colliderOffset, `${path}.colliderOffset`, errors);
    for (const field of ["colliderColor", "pivotColor", "planeColor", "arcColor"]) {
      validateColor(handle?.[field], `${path}.${field}`, errors);
    }
    if (typeof handle?.invertDrag !== "boolean") errors.push(`${path}.invertDrag must be boolean.`);
  });
}

function validatePendulum(pendulum, errors) {
  if (!pendulum || typeof pendulum !== "object") return errors.push("pendulum is required.");
  validateRequiredString(pendulum.nodeName, "pendulum.nodeName", errors);
  validateAxis(pendulum.modelLocalAxis, "pendulum.modelLocalAxis", errors);
  validateFinite(pendulum.swingDegrees, "pendulum.swingDegrees", errors);
  if (Number.isFinite(pendulum.swingDegrees) && pendulum.swingDegrees < 0) errors.push("pendulum.swingDegrees cannot be negative.");
}

function validateAxis(value, label, errors) {
  try {
    normalizeCalibrationAxis(value, label);
  } catch (error) {
    errors.push(error.message);
  }
}

function validateVector(value, label, errors) {
  try {
    assertFiniteVector(value, label);
  } catch (error) {
    errors.push(error.message);
  }
}

function validateFinite(value, label, errors) {
  try {
    assertFiniteNumber(value, label);
  } catch (error) {
    errors.push(error.message);
  }
}

function validateColor(value, label, errors) {
  try {
    colorToNumber(value);
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
  }
}

function validateRequiredString(value, label, errors) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${label} must be a non-empty string.`);
}

function orderedSettings(settings) {
  return Object.fromEntries(Object.keys(settings || {}).sort().map((key) => [key, orderedPlainValue(settings[key])]));
}

function orderedBody(body) {
  return { position: roundedVector(body.position), scale: roundedVector(body.scale) };
}

function orderedPort(port) {
  return {
    portId: port.portId,
    name: port.name,
    position: roundedVector(port.position),
    colliderScale: rounded(port.colliderScale),
    colliderColor: colorNumberToJson(port.colliderColor),
    socketDirection: roundedVector(normalizeCalibrationAxis(port.socketDirection, `${port.portId} socketDirection`)),
  };
}

function orderedEye(eye) {
  return {
    nodeName: eye.nodeName,
    action: eye.action,
    latching: eye.latching,
    pressedOffset: roundedVector(eye.pressedOffset),
    releaseDelayMs: eye.releaseDelayMs === null ? null : rounded(eye.releaseDelayMs),
    colliderScale: rounded(eye.colliderScale),
    colliderColor: colorNumberToJson(eye.colliderColor),
  };
}

function orderedHandle(handle) {
  return {
    nodeName: handle.nodeName,
    parameter: handle.parameter,
    axis: roundedVector(normalizeCalibrationAxis(handle.axis, `${handle.parameter} axis`)),
    minAngleDegrees: rounded(handle.minAngleDegrees),
    maxAngleDegrees: rounded(handle.maxAngleDegrees),
    referenceAngleDegrees: rounded(handle.referenceAngleDegrees),
    colliderRadius: rounded(handle.colliderRadius),
    colliderOffset: roundedVector(handle.colliderOffset),
    colliderColor: colorNumberToJson(handle.colliderColor),
    pivotColor: colorNumberToJson(handle.pivotColor),
    planeColor: colorNumberToJson(handle.planeColor),
    arcColor: colorNumberToJson(handle.arcColor),
    invertDrag: handle.invertDrag,
  };
}

function orderedPendulum(pendulum) {
  return {
    nodeName: pendulum.nodeName,
    modelLocalAxis: roundedVector(normalizeCalibrationAxis(pendulum.modelLocalAxis, "pendulum axis")),
    swingDegrees: rounded(pendulum.swingDegrees),
  };
}

function orderedPlainValue(value) {
  if (Number.isFinite(value)) return rounded(value);
  if (Array.isArray(value)) return value.map(orderedPlainValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, orderedPlainValue(value[key])]));
  }
  return value;
}

function roundedVector(vector) {
  return { x: rounded(vector.x), y: rounded(vector.y), z: rounded(vector.z) };
}

function rounded(value) {
  return roundCalibrationNumber(value, 6);
}

function hydrateColors(value) {
  if (Array.isArray(value)) return value.map(hydrateColors);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    COLOR_FIELDS.has(key) ? colorToNumber(nested) : hydrateColors(nested),
  ]));
}

function configuredNodeNames(metronome) {
  return [
    ...metronome.handleControls.map((control) => [`Handle ${control.parameter}`, control.nodeName]),
    ["Pendulum", metronome.pendulum.nodeName],
    ...metronome.eyeControls.map((control) => [`Eye ${control.action}`, control.nodeName]),
  ];
}

function emitExport(name, value) {
  return `export const ${name} = ${emitJavaScriptValue(value, 0, null)};`;
}

function emitJavaScriptValue(value, depth, key) {
  if (COLOR_FIELDS.has(key)) return `0x${colorToNumber(value).toString(16).padStart(6, "0")}`;
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);
  if (Array.isArray(value)) {
    if (!value.length) return "Object.freeze([])";
    return `Object.freeze([\n${value.map((item) => `${childIndent}${emitJavaScriptValue(item, depth + 1, null)},`).join("\n")}\n${indent}])`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return "Object.freeze({})";
  return `Object.freeze({\n${entries.map(([entryKey, entryValue]) => (
    `${childIndent}${entryKey}: ${emitJavaScriptValue(entryValue, depth + 1, entryKey)},`
  )).join("\n")}\n${indent}})`;
}

function mapObject(object, mapper) {
  return Object.fromEntries(Object.entries(object || {}).map(([key, value]) => [key, mapper(key, value)]));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
