// The geometry/observation unit tests do not rasterize text; browsers verify it.
export const cueCanvas = () => ({ width: 0, height: 0, getContext: () => ({
  clearRect() {}, fillRect() {}, fillText() {},
}) });
