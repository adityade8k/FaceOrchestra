export const INSTRUMENT_KINDS = Object.freeze({
  honk: "honk",
  stick: "stick",
  looper: "looper",
  metronome: "metronome",
});

export const INSTRUMENT_CAPABILITIES = Object.freeze({
  placeable: "placeable",
  equippable: "equippable",
  transformable: "transformable",
  playable: "playable",
  morphable: "morphable",
  chordCapable: "chord-capable",
  looperConnectable: "looper-connectable",
  recordable: "recordable",
  recordableSource: "recordable-source",
  collisionDriven: "collision-driven",
  persistable: "persistable",
  persistablePreference: "persistable-preference",
});

export const DEFAULT_CAPABILITIES_BY_KIND = Object.freeze({
  [INSTRUMENT_KINDS.honk]: Object.freeze([
    INSTRUMENT_CAPABILITIES.placeable,
    INSTRUMENT_CAPABILITIES.transformable,
    INSTRUMENT_CAPABILITIES.playable,
    INSTRUMENT_CAPABILITIES.morphable,
    INSTRUMENT_CAPABILITIES.chordCapable,
    INSTRUMENT_CAPABILITIES.looperConnectable,
    INSTRUMENT_CAPABILITIES.persistable,
  ]),
  [INSTRUMENT_KINDS.stick]: Object.freeze([
    INSTRUMENT_CAPABILITIES.equippable,
    INSTRUMENT_CAPABILITIES.playable,
    INSTRUMENT_CAPABILITIES.collisionDriven,
    INSTRUMENT_CAPABILITIES.recordableSource,
    INSTRUMENT_CAPABILITIES.persistablePreference,
  ]),
  [INSTRUMENT_KINDS.looper]: Object.freeze([
    INSTRUMENT_CAPABILITIES.placeable,
    INSTRUMENT_CAPABILITIES.transformable,
    INSTRUMENT_CAPABILITIES.playable,
    INSTRUMENT_CAPABILITIES.recordable,
    INSTRUMENT_CAPABILITIES.persistable,
  ]),
  [INSTRUMENT_KINDS.metronome]: Object.freeze([
    INSTRUMENT_CAPABILITIES.placeable,
    INSTRUMENT_CAPABILITIES.transformable,
    INSTRUMENT_CAPABILITIES.playable,
    INSTRUMENT_CAPABILITIES.persistable,
  ]),
});

const VALID_KINDS = new Set(Object.values(INSTRUMENT_KINDS));
const VALID_CAPABILITIES = new Set(Object.values(INSTRUMENT_CAPABILITIES));

export function assertInstrumentKind(kind) {
  if (!VALID_KINDS.has(kind)) {
    throw new TypeError(`Unknown instrument kind: ${String(kind)}`);
  }
  return kind;
}

export function createCapabilitySet(capabilities = []) {
  const result = new Set();
  for (const capability of capabilities) {
    if (!VALID_CAPABILITIES.has(capability)) {
      throw new TypeError(`Unknown instrument capability: ${String(capability)}`);
    }
    result.add(capability);
  }
  return result;
}

export function getDefaultCapabilities(kind) {
  return createCapabilitySet(DEFAULT_CAPABILITIES_BY_KIND[assertInstrumentKind(kind)] || []);
}

export function hasCapability(instrument, capability) {
  return Boolean(instrument?.capabilities?.has?.(capability));
}
