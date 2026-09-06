import { METRONOME_EYE_CONTROLS } from "../../config/metronome.js";

export function attachMetronomeButtonAssets(
  root,
  buttonSource,
  configs = METRONOME_EYE_CONTROLS,
) {
  if (!root?.getObjectByName || !root?.add || !buttonSource?.getObjectByName) return 0;

  let attached = 0;
  for (const { nodeName } of configs) {
    if (root.getObjectByName(nodeName)) continue;
    const sourceNode = buttonSource.getObjectByName(nodeName);
    const button = sourceNode?.clone?.(true);
    if (!button) {
      console.warn(`Metronome button asset "${nodeName}" was not found.`);
      continue;
    }
    root.add(button);
    attached += 1;
  }
  return attached;
}
