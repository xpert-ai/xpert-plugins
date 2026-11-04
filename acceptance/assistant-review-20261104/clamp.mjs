/** Return a finite number constrained to the inclusive [minimum, maximum] range. */
export function clamp(value, minimum, maximum) {
  if (![value, minimum, maximum].every(Number.isFinite)) {
    throw new TypeError('All arguments must be finite numbers');
  }
  if (minimum > maximum) {
    throw new RangeError('minimum must be less than or equal to maximum');
  }
  return Math.min(maximum, Math.max(minimum, value));
}
