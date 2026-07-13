import { INTERACTION_TARGET_NAMES } from "../../config/honk.js";
import { HONK_CONNECTION_TARGET_NAME } from "../../config/looper.js";

const HONK_ROLES = Object.freeze({
  [INTERACTION_TARGET_NAMES.body]: "honk.body",
  [INTERACTION_TARGET_NAMES.mouth]: "honk.mouth",
  [INTERACTION_TARGET_NAMES.horn]: "honk.squeeze",
  [INTERACTION_TARGET_NAMES.leftEar]: "honk.ear.left",
  [INTERACTION_TARGET_NAMES.rightEar]: "honk.ear.right",
  [INTERACTION_TARGET_NAMES.nose]: "honk.nose",
  [HONK_CONNECTION_TARGET_NAME]: "honk.looper-connector",
});

export function getInteractionRole(kind, target) {
  if (kind === "honk") return HONK_ROLES[target?.name] || "honk.interaction";
  if (kind === "looper") {
    if (target?.userData.isLooperButton) return `looper.button.${target.userData.looperAction}`;
    if (target?.userData.isLooperControl) return `looper.control.${target.userData.looperControl}`;
    if (target?.userData.isLooperNode) return "looper.track-node";
    if (target?.name === INTERACTION_TARGET_NAMES.body) return "looper.body";
    return "looper.interaction";
  }
  if (kind === "stick") return "stick.strike-volume";
  return `${kind}.interaction`;
}
