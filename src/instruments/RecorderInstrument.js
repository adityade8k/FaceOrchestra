import { LooperInstrument } from "./LooperInstrument.js";

export class RecorderInstrument extends LooperInstrument {
  constructor(options = {}) {
    super(options);
    this.type = "recorder";
  }
}
