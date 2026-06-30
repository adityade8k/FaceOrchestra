import { HonkInstrument } from "./HonkInstrument.js";

export class ChordInstrument extends HonkInstrument {
  constructor(options = {}) {
    super(options);
    this.type = options.componentOption?.id || "honk-chord";
    this.preset = options.componentOption?.preset || null;
  }
}
