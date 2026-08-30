import { ASSET_PATHS } from "../config/assets.js";
import { LooperEditorAdapter } from "./LooperEditorAdapter.js";
import { MetronomeEditorAdapter } from "./MetronomeEditorAdapter.js";
import {
  cloneMetronomeCalibration,
  createRepositoryMetronomeCalibration,
  generateMetronomeConfigJavaScript,
  METRONOME_EDITOR_AUTOSAVE_KEY,
  parseMetronomeCalibration,
  serializeMetronomeCalibration,
  validateMetronomeCalibration,
} from "./calibration/metronomeCalibrationSchema.js";
import {
  cloneLooperCalibration,
  createRepositoryLooperCalibration,
  generateLooperConfigJavaScript,
  LOOPER_EDITOR_AUTOSAVE_KEY,
  parseLooperCalibration,
  serializeLooperCalibration,
  validateLooperCalibration,
} from "./calibration/looperCalibrationSchema.js";

export const COLLIDER_EDITOR_INSTRUMENTS = new Map([
  ["metronome", {
    id: "metronome",
    label: "Metronome",
    modelLabel: "metronome",
    modelPath: ASSET_PATHS.models.metronome,
    texturePaths: ASSET_PATHS.textures.metronome,
    autosaveKey: METRONOME_EDITOR_AUTOSAVE_KEY,
    downloadName: "metronome-calibration.json",
    createRepositoryState: createRepositoryMetronomeCalibration,
    clone: cloneMetronomeCalibration,
    validate: validateMetronomeCalibration,
    serialize: serializeMetronomeCalibration,
    parse: parseMetronomeCalibration,
    generateJavaScript: generateMetronomeConfigJavaScript,
    createAdapter: (options) => new MetronomeEditorAdapter(options),
    resetEntity(state, repository, entity) {
      const source = repository.metronome;
      const target = state.metronome;
      if (entity.type === "settings") target.settings = cloneMetronomeCalibration(source.settings);
      if (entity.type === "port") target.connectionPorts[entity.index] = cloneMetronomeCalibration(source.connectionPorts[entity.index]);
      if (entity.type === "handle") target.handleControls[entity.index] = cloneMetronomeCalibration(source.handleControls[entity.index]);
      if (entity.type === "eye") target.eyeControls[entity.index] = cloneMetronomeCalibration(source.eyeControls[entity.index]);
      if (entity.type === "pendulum") target.pendulum = cloneMetronomeCalibration(source.pendulum);
    },
  }],
  ["looper", {
    id: "looper",
    label: "Looper",
    modelLabel: "looper",
    modelPath: ASSET_PATHS.models.looper,
    texturePaths: ASSET_PATHS.textures.looper,
    autosaveKey: LOOPER_EDITOR_AUTOSAVE_KEY,
    downloadName: "looper-calibration.json",
    createRepositoryState: createRepositoryLooperCalibration,
    clone: cloneLooperCalibration,
    validate: validateLooperCalibration,
    serialize: serializeLooperCalibration,
    parse: parseLooperCalibration,
    generateJavaScript: generateLooperConfigJavaScript,
    createAdapter: (options) => new LooperEditorAdapter(options),
    resetEntity(state, repository, entity) {
      const control = entity.control;
      if (!control) return;
      state.looper.controlColliders[control] = cloneLooperCalibration(
        repository.looper.controlColliders[control],
      );
    },
  }],
]);

export function getColliderEditorInstrument(id) {
  const profile = COLLIDER_EDITOR_INSTRUMENTS.get(id);
  if (!profile) throw new TypeError(`Unknown collider-editor instrument: ${id}`);
  return profile;
}
