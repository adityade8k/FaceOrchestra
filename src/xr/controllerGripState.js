export function setControllerGripTarget(controllerState, transformTarget, source = transformTarget) {
  if (!controllerState) {
    return null;
  }

  controllerState.gripHeld = Boolean(transformTarget);
  controllerState.gripInstrumentState = transformTarget || null;
  controllerState.gripSourceInstrumentState = transformTarget
    ? source || transformTarget.source || transformTarget
    : null;
  return controllerState.gripInstrumentState;
}

export function clearControllerGripTarget(controllerState) {
  if (!controllerState) {
    return null;
  }

  const previousTarget = controllerState.gripInstrumentState;
  setControllerGripTarget(controllerState, null, null);
  return previousTarget;
}
