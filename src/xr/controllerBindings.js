export const XR_BUTTONS = Object.freeze({
  trigger: 0,
  grip: 1,
  primary: 4,
  secondary: 5,
});

export const XR_AXES = Object.freeze({
  thumbstickX: 2,
  thumbstickY: 3,
});

// xr-standard primary thumbstick is button 3. Known nonstandard profiles
// must declare a mapping; guessing from controller order/axes causes toggles.
export function thumbstickButton(gamepad, profiles = []) {
  if (gamepad?.mapping === "xr-standard") return gamepad.buttons?.[3] || null;
  const known = profiles.some((p) =>
    [
      "oculus-touch",
      "meta-quest-touch-plus",
      "meta-quest-touch-pro",
      "valve-index",
      "microsoft-mixed-reality",
    ].includes(p),
  );
  return known ? gamepad?.buttons?.[3] || null : null;
}
