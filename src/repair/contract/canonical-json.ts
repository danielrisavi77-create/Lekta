import type { JsonValue } from './types.ts';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function encodeCanonical(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Kanonski JSON dopusta samo konacne brojeve.');
    return JSON.stringify(value);
  }

  if (typeof value !== 'object') {
    throw new TypeError('Vrijednost nije valjani JSON podatak.');
  }

  if (ancestors.has(value)) throw new TypeError('Kanonski JSON ne dopusta cikluse.');
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => encodeCanonical(item, ancestors)).join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Kanonski JSON dopusta samo obicne objekte.');
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new TypeError('Kanonski JSON ne dopusta simbolicke kljuceve.');
    }

    const stringKeys = keys as string[];
    for (const key of stringKeys) {
      if (FORBIDDEN_KEYS.has(key)) throw new TypeError(`Zabranjeni JSON kljuc: ${key}`);
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError('Kanonski JSON dopusta samo enumerabilna podatkovna polja.');
      }
    }

    stringKeys.sort();
    return `{${stringKeys
      .map((key) => `${JSON.stringify(key)}:${encodeCanonical(descriptors[key].value, ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: JsonValue): string {
  return encodeCanonical(value, new WeakSet());
}

export function canonicalUtf8(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
