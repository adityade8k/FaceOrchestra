import { BaseInstrument } from "./BaseInstrument.js";

export class HonkInstrument extends BaseInstrument {
  constructor(options = {}) {
    super(options);
    this.type = "honk";
  }

  isPlayable() {
    return Boolean(this.state?.interactive && this.root?.visible);
  }
}
