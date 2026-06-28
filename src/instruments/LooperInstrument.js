import { BaseInstrument } from "./BaseInstrument.js";

export class LooperInstrument extends BaseInstrument {
  constructor(options = {}) {
    super(options);
    this.type = "looper";
  }

  hasRuntimeData() {
    return Boolean(this.state?.looperData || this.state?.recorderData);
  }
}
