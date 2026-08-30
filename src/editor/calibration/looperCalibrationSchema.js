import { ASSET_PATHS } from "../../config/assets.js";
import { LOOPER_CONTROL_COLLIDERS } from "../../config/looper.js";
import { resolveArcMotion } from "../../instruments/core/arcMotionMath.js";
import {
  assertFiniteNumber,
  assertFiniteVector,
  roundCalibrationNumber,
} from "../../instruments/core/calibrationMath.js";
import {
  CalibrationSchemaError,
  colorNumberToJson,
  colorToNumber,
} from "./metronomeCalibrationSchema.js";

export const LOOPER_CALIBRATION_SCHEMA_VERSION = 1;
export const LOOPER_EDITOR_AUTOSAVE_KEY = "face-orchestra-looper-editor-v1";

export function createRepositoryLooperCalibration() {
  return {
    schemaVersion: LOOPER_CALIBRATION_SCHEMA_VERSION,
    instrument: "looper",
    modelPath: ASSET_PATHS.models.looper,
    modelFileName: null,
    looper: { controlColliders: deepClone(LOOPER_CONTROL_COLLIDERS) },
  };
}

export function cloneLooperCalibration(value) {
  return deepClone(value);
}

export function validateLooperCalibration(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CalibrationSchemaError("Calibration must be an object.");
  }
  if (value.schemaVersion !== LOOPER_CALIBRATION_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${LOOPER_CALIBRATION_SCHEMA_VERSION}.`);
  }
  if (value.instrument !== "looper") errors.push('instrument must be "looper".');
  if (value.modelPath !== null && typeof value.modelPath !== "string") {
    errors.push("modelPath must be a string or null for a local GLB.");
  }
  const controls = value.looper?.controlColliders;
  if (!controls || typeof controls !== "object" || Array.isArray(controls)) {
    errors.push("looper.controlColliders is required.");
  } else {
    for (const control of ["volume", "gap"]) validateControl(controls[control], control, errors);
  }
  if (errors.length) throw new CalibrationSchemaError(errors);
  return { valid: true, warnings: [] };
}

export function createLooperCalibrationExport(value) {
  validateLooperCalibration(value);
  const controls = value.looper.controlColliders;
  const document = {
    schemaVersion: LOOPER_CALIBRATION_SCHEMA_VERSION,
    instrument: "looper",
    modelPath: value.modelPath ?? null,
    modelFileName: value.modelPath === null ? value.modelFileName || null : null,
    looper: {
      controlColliders: Object.fromEntries(
        ["volume", "gap"].map((control) => [control, orderedControl(controls[control])]),
      ),
    },
  };
  validateLooperCalibration(document);
  return document;
}

export function serializeLooperCalibration(value) {
  return JSON.stringify(createLooperCalibrationExport(value), null, 2);
}

export function parseLooperCalibration(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CalibrationSchemaError(`Invalid JSON: ${error.message}`);
  }
  validateLooperCalibration(parsed);
  return hydrateColors(createLooperCalibrationExport(parsed));
}

export function generateLooperConfigJavaScript(value) {
  const controls = hydrateColors(createLooperCalibrationExport(value)).looper.controlColliders;
  return [
    "// Paste this replacement into src/config/looper.js.",
    `export const LOOPER_CONTROL_COLLIDERS = ${emitJavaScript(controls)};`,
  ].join("\n\n");
}

function validateControl(config, control, errors) {
  const path = `controlColliders.${control}`;
  if (!config || typeof config !== "object") {
    errors.push(`${path} is required.`);
    return;
  }
  if (config.movementMode !== "arc") errors.push(`${path}.movementMode must be "arc".`);
  for (const field of ["dragSensitivity", "colliderRadius"]) validateFinite(config[field], `${path}.${field}`, errors);
  if (Number.isFinite(config.dragSensitivity) && config.dragSensitivity < 0) errors.push(`${path}.dragSensitivity cannot be negative.`);
  if (Number.isFinite(config.colliderRadius) && config.colliderRadius <= 0) errors.push(`${path}.colliderRadius must be greater than zero.`);
  if (typeof config.invertDrag !== "boolean") errors.push(`${path}.invertDrag must be boolean.`);
  for (const field of ["colliderColor", "pivotColor", "planeColor", "arcColor"]) {
    try { colorToNumber(config[field]); } catch (error) { errors.push(`${path}.${field}: ${error.message}`); }
  }
  try {
    const arc = resolveArcMotion(config.arc, { label: `${control} arc` });
    if (Math.abs(arc.parallelOffsetAmount) > 1e-8) {
      errors.push(`${path}.arc.colliderOffset must lie in the circular plane; remove its axis-parallel component.`);
    }
  } catch (error) {
    errors.push(error.message);
  }
  if (!config.morphTargets || typeof config.morphTargets.up !== "string" || typeof config.morphTargets.down !== "string") {
    errors.push(`${path}.morphTargets must contain string up and down names.`);
  }
}

function orderedControl(config) {
  return {
    movementMode: "arc",
    dragSensitivity: rounded(config.dragSensitivity),
    invertDrag: Boolean(config.invertDrag),
    colliderRadius: rounded(config.colliderRadius),
    colliderColor: colorNumberToJson(config.colliderColor),
    pivotColor: colorNumberToJson(config.pivotColor),
    planeColor: colorNumberToJson(config.planeColor),
    arcColor: colorNumberToJson(config.arcColor),
    arc: {
      center: roundedVector(config.arc.center),
      axis: roundedVector(resolveArcMotion(config.arc).axis),
      colliderOffset: roundedVector(config.arc.colliderOffset),
      minAngleDegrees: rounded(config.arc.minAngleDegrees),
      maxAngleDegrees: rounded(config.arc.maxAngleDegrees),
      referenceAngleDegrees: rounded(config.arc.referenceAngleDegrees),
    },
    morphTargets: { down: config.morphTargets.down, up: config.morphTargets.up },
  };
}

function roundedVector(value) {
  assertFiniteVector(value);
  return { x: rounded(value.x), y: rounded(value.y), z: rounded(value.z) };
}

function rounded(value) {
  return roundCalibrationNumber(value, 9);
}

function validateFinite(value, label, errors) {
  try { assertFiniteNumber(value, label); } catch (error) { errors.push(error.message); }
}

function hydrateColors(value) {
  if (Array.isArray(value)) return value.map(hydrateColors);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    key.endsWith("Color") ? colorToNumber(nested) : hydrateColors(nested),
  ]));
}

function emitJavaScript(value, depth = 0) {
  const indent = "  ".repeat(depth);
  const next = "  ".repeat(depth + 1);
  if (Array.isArray(value)) return `[${value.map((item) => emitJavaScript(item, depth + 1)).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, nested]) => (
      `${next}${key}: ${emitJavaScript(nested, depth + 1)}`
    ));
    return `{\n${entries.join(",\n")}\n${indent}}`;
  }
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return `0x${value.slice(1)}`;
  return JSON.stringify(value);
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
