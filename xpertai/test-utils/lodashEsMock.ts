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

export function isNil(value: unknown): value is null | undefined {
  return value == null;
}

export function omitBy<T extends Record<string, unknown>>(
  object: T,
  predicate: (value: T[keyof T], key: keyof T) => boolean
): Partial<T> {
  return Object.entries(object).reduce((result, [key, value]) => {
    if (!predicate(value as T[keyof T], key as keyof T)) {
      result[key as keyof T] = value as T[keyof T];
    }
    return result;
  }, {} as Partial<T>);
}
