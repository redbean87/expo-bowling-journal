/**
 * The device's globals, simulated for the runtime-compatibility suites.
 *
 * Node has what the phone does not, and that is exactly why the suites that
 * only run in Node miss the device failures:
 *
 * - the Hermes engine an Expo Android build runs has a `crypto` object with no
 *   `randomUUID` member (and older runtimes have no `getRandomValues` either);
 * - React Native's `Blob` — the polyfill `@expo/metro-runtime` installs —
 *   rejects `ArrayBuffer` and `ArrayBufferView` parts, which is what the
 *   native picker's bytes are.
 *
 * These helpers install those absences for the duration of one test body and
 * put the originals back, so a suite can prove a path works with what a device
 * actually has rather than with what Node happens to provide. The replacement
 * members (`withCryptoMembers`'s values) additionally pin WHICH source a path
 * picks, not just that it survived.
 */

/** The canonical 8-4-4-4-12 v4 form every id source here must produce. */
export const CANONICAL_V4_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * The object the global `crypto` members actually live on.
 *
 * Node's `crypto` global is an instance whose members sit on its prototype, so
 * deleting a member from the instance would leave the prototype's copy visible.
 * The members are removed where they are found.
 */
const CRYPTO_MEMBERS = Object.getPrototypeOf(
  globalThis.crypto
) as unknown as Record<string, unknown>;

/** Every `ArrayBufferView` constructor, the shape RN's Blob rejects. */
const BYTE_VIEWS = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  DataView,
];

function isByteCarrier(value: unknown): boolean {
  return (
    value instanceof ArrayBuffer ||
    BYTE_VIEWS.some((view) => value instanceof view)
  );
}

/**
 * Run `body` with the named `crypto` members replaced, `undefined` meaning
 * absent (the way the phone's runtime has them), then restore the originals.
 */
export async function withCryptoMembers(
  replacements: Record<string, unknown>,
  body: () => Promise<void>
): Promise<void> {
  const originals: Array<[string, PropertyDescriptor | undefined]> =
    Object.keys(replacements).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(CRYPTO_MEMBERS, name),
    ]);

  try {
    for (const [name, value] of Object.entries(replacements)) {
      if (value === undefined) {
        delete CRYPTO_MEMBERS[name];
      } else {
        CRYPTO_MEMBERS[name] = value;
      }
    }

    await body();
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor === undefined) {
        delete CRYPTO_MEMBERS[name];
      } else {
        Object.defineProperty(CRYPTO_MEMBERS, name, descriptor);
      }
    }
  }
}

/**
 * Run `body` with a `Blob` that refuses bytes, the way React Native's does.
 *
 * Only the construction is hostile: a `Blob` built from text still behaves
 * like the real one, so the upload path — which never wraps bytes — stays
 * reachable inside the same body.
 */
export async function withDeviceBlob(body: () => Promise<void>): Promise<void> {
  const realBlob = globalThis.Blob;

  const deviceBlob = new Proxy(realBlob, {
    construct(target, argumentsList) {
      const parts = argumentsList[0];

      const carriesBytes = Array.isArray(parts)
        ? parts.some((part) => isByteCarrier(part))
        : isByteCarrier(parts);

      if (carriesBytes) {
        throw new TypeError(
          "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"
        );
      }

      return Reflect.construct(target, argumentsList);
    },
  });

  (globalThis as Record<string, unknown>).Blob = deviceBlob;

  try {
    await body();
  } finally {
    (globalThis as Record<string, unknown>).Blob = realBlob;
  }
}

/**
 * The phone's runtime: no `crypto.randomUUID()`, and a `Blob` that rejects
 * bytes. `getRandomValues` is still there, which is what Hermes ships.
 */
export async function withHermesRuntime(
  body: () => Promise<void>
): Promise<void> {
  await withCryptoMembers({ randomUUID: undefined }, () =>
    withDeviceBlob(body)
  );
}

/**
 * The harshest runtime worth simulating: no CSPRNG member at all, so only the
 * last-resort id source remains. The `Blob` is hostile too, so one body covers
 * both device failures at once.
 */
export async function withBareRuntime(
  body: () => Promise<void>
): Promise<void> {
  await withCryptoMembers(
    { randomUUID: undefined, getRandomValues: undefined },
    () => withDeviceBlob(body)
  );
}
