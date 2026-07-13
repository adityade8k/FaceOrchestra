import { createEmptySceneData } from "../schema.js";

export function migrateV1ToV2(source = {}) {
  const migrated = createEmptySceneData();
  const usedIds = new Set();

  migrated.instruments = (Array.isArray(source.instruments) ? source.instruments : []).flatMap((saved, index) => {
    const componentId = saved?.componentId || "honk";
    const kind = componentId === "looper" ? "looper" : "honk";
    const id = uniqueId(`${kind}-${index + 1}`, usedIds);
    const position = validArray(saved.position, 3, [0, 0, 0]);
    const quaternion = validArray(saved.quaternion, 4, [0, 0, 0, 1]);
    const scale = Number.isFinite(saved.baseScale) ? saved.baseScale : 1;

    return [{
      id,
      kind,
      componentId: kind === "honk" ? "honk" : componentId,
      transform: {
        position,
        quaternion,
        scale: [scale, scale, scale],
      },
      tuning: saved.scalePresetNote ? { ...saved.scalePresetNote } : {},
      appearance: kind === "looper"
        ? { locked: Boolean(saved.locked) }
        : saved.locked ? { legacyLocked: true } : {},
      performanceDefaults: {},
      ...(kind === "looper" ? { controls: {}, timeline: null } : {}),
    }];
  });

  return migrated;
}

function validArray(value, length, fallback) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite)
    ? [...value]
    : [...fallback];
}

function uniqueId(base, used) {
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}
