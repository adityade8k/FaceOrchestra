export const SpawnMenuPrimaryAction = Object.freeze({
  duplicate: "duplicate",
  open: "open",
  suppress: "suppress",
});

export function resolveSpawnMenuPrimaryAction({
  controllerState = null,
  gripPressed = false,
} = {}) {
  const gripActive = Boolean(
    gripPressed || controllerState?.grip || controllerState?.gripHeld,
  );
  if (!gripActive) {
    return { type: SpawnMenuPrimaryAction.open, source: null };
  }

  const source = getDuplicableGripSource(controllerState);
  if (source) {
    return { type: SpawnMenuPrimaryAction.duplicate, source };
  }
  return { type: SpawnMenuPrimaryAction.suppress, source: null };
}

export function getDuplicableGripSource(controllerState) {
  if (!controllerState?.gripHeld) {
    return null;
  }

  const transformTarget = controllerState.gripInstrumentState;
  const candidates = [
    controllerState.gripSourceInstrumentState,
    transformTarget?.source,
    transformTarget,
  ];
  for (const source of candidates) {
    if (!isDuplicableInstrument(source)) {
      continue;
    }
    if (transformTarget?.id && source.id && transformTarget.id !== source.id) {
      continue;
    }
    return source;
  }
  return null;
}

function isDuplicableInstrument(source) {
  return Boolean(
    source?.root?.visible &&
    !source.disposed &&
    !source.pendingPlacement &&
    (source.kind === "honk" || source.kind === "looper")
  );
}
