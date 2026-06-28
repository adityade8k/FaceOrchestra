import { BaseInstrument } from "./BaseInstrument.js";
import { ChordInstrument } from "./ChordInstrument.js";
import { HonkInstrument } from "./HonkInstrument.js";
import { LooperInstrument } from "./LooperInstrument.js";
import { RecorderInstrument } from "./RecorderInstrument.js";

export function createInstrumentObject(options = {}) {
  const id = options.componentOption?.id;
  const preset = options.componentOption?.preset;
  const ClassRef = getInstrumentClass(id, preset);
  const instrument = new ClassRef(options);
  instrument.registerStateColliders();
  return instrument;
}

function getInstrumentClass(id, preset) {
  if (preset) {
    return ChordInstrument;
  }
  if (id === "honk") {
    return HonkInstrument;
  }
  if (id === "looper") {
    return RecorderInstrument;
  }
  if (id === "__legacy_looper") {
    return LooperInstrument;
  }
  return BaseInstrument;
}
