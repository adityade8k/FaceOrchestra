import { DEBUG_MODE } from "../config/debug.js";
import {
  HONK_CONNECTION_TARGET_NAME,
  LOOPER_DEBUG_COLORS,
} from "../config/looper.js";
import {
  getLooperButtonName,
  getLooperControlName,
} from "../instruments/looper/looperNames.js";

export const HIT_MARKER_OPACITY = DEBUG_MODE ? 0.24 : 0;
export const RAY_COLOR_DEFAULT = 0xf6d878;
export const RAY_COLOR_HOVER = 0x45f6ff;

export function getInteractionTargetColor(targetOrName) {
  const target = typeof targetOrName === "string" ? null : targetOrName;
  const name = typeof targetOrName === "string" ? targetOrName : targetOrName?.name;

  if (typeof target?.userData?.currentHitColor === "number") return target.userData.currentHitColor;
  if (typeof target?.userData?.hitColor === "number") return target.userData.hitColor;
  if (name === HONK_CONNECTION_TARGET_NAME) return LOOPER_DEBUG_COLORS.honkConnection;
  if (name?.startsWith("HIT_looper_node_")) return LOOPER_DEBUG_COLORS.nodeOpen;

  return {
    HIT_mouth: 0xf0a23c,
    HIT_horn: 0xf7d04a,
    HIT_nose: 0x5ac8fa,
    HIT_leftEar: 0x72d572,
    HIT_rightEar: 0x9e8cff,
    HIT_body: 0xffffff,
    [getLooperButtonName("play")]: LOOPER_DEBUG_COLORS.button.play,
    [getLooperButtonName("pause")]: LOOPER_DEBUG_COLORS.button.pause,
    [getLooperButtonName("record")]: LOOPER_DEBUG_COLORS.button.record,
    [getLooperButtonName("stop")]: LOOPER_DEBUG_COLORS.button.stop,
    [getLooperControlName("volume")]: LOOPER_DEBUG_COLORS.controlVolume,
    [getLooperControlName("gap")]: LOOPER_DEBUG_COLORS.controlGap,
  }[name] || 0xffffff;
}
