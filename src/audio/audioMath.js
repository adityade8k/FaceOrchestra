export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

export function mapLinear(value, inputMin, inputMax, outputMin, outputMax) {
  return outputMin + ((value - inputMin) * (outputMax - outputMin)) / (inputMax - inputMin);
}
