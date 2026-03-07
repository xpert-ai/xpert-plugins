export function pick<T extends Record<string, unknown>, K extends keyof T>(
  object: T,
  keys: readonly K[]
): Pick<T, K> {
  return keys.reduce((result, key) => {
    if (key in object) {
      result[key] = object[key];
    }
    return result;
  }, {} as Pick<T, K>);
}
