type PromiseWithResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

declare global {
  interface PromiseConstructor {
    try?<TArgs extends unknown[], TResult>(
      callback: (...args: TArgs) => TResult | PromiseLike<TResult>,
      ...args: TArgs
    ): Promise<TResult>;
    withResolvers?<T>(): PromiseWithResolvers<T>;
  }

  interface Map<K, V> {
    getOrInsertComputed?<T extends V>(key: K, compute: (key: K) => T): T;
  }

  interface WeakMap<K extends object, V> {
    getOrInsertComputed?<T extends V>(key: K, compute: (key: K) => T): T;
  }

  interface Response {
    bytes?(): Promise<Uint8Array>;
  }
}

function defineValue<TTarget extends object, TValue>(
  target: TTarget,
  key: PropertyKey,
  value: TValue
) {
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value
  });
}

if (typeof Promise.withResolvers !== "function") {
  defineValue(Promise, "withResolvers", function withResolvers<T>(): PromiseWithResolvers<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return {
      promise,
      resolve,
      reject
    };
  });
}

if (typeof Promise.try !== "function") {
  defineValue(
    Promise,
    "try",
    function promiseTry<TArgs extends unknown[], TResult>(
      callback: (...args: TArgs) => TResult | PromiseLike<TResult>,
      ...args: TArgs
    ): Promise<TResult> {
      return Promise.resolve().then(() => callback(...args));
    }
  );
}

if (typeof Map.prototype.getOrInsertComputed !== "function") {
  defineValue(
    Map.prototype,
    "getOrInsertComputed",
    function getOrInsertComputed<K, V>(
      this: Map<K, V>,
      key: K,
      compute: (key: K) => V
    ): V {
      if (this.has(key)) {
        return this.get(key) as V;
      }

      const value = compute(key);
      this.set(key, value);
      return value;
    }
  );
}

if (typeof WeakMap.prototype.getOrInsertComputed !== "function") {
  defineValue(
    WeakMap.prototype,
    "getOrInsertComputed",
    function getOrInsertComputed<K extends object, V>(
      this: WeakMap<K, V>,
      key: K,
      compute: (key: K) => V
    ): V {
      if (this.has(key)) {
        return this.get(key) as V;
      }

      const value = compute(key);
      this.set(key, value);
      return value;
    }
  );
}

if (typeof (Array.prototype as Array<unknown> & { at?: unknown }).at !== "function") {
  defineValue(Array.prototype, "at", function at<T>(this: T[], index: number): T | undefined {
    const length = this.length >>> 0;
    if (length === 0) {
      return undefined;
    }

    const normalizedIndex = index >= 0 ? index : length + index;
    if (normalizedIndex < 0 || normalizedIndex >= length) {
      return undefined;
    }

    return this[normalizedIndex];
  });
}

if (
  typeof (Array.prototype as Array<unknown> & { findLast?: unknown }).findLast !== "function"
) {
  defineValue(
    Array.prototype,
    "findLast",
    function findLast<T>(
      this: T[],
      predicate: (value: T, index: number, array: T[]) => boolean,
      thisArg?: unknown
    ): T | undefined {
      for (let index = this.length - 1; index >= 0; index -= 1) {
        const value = this[index];
        if (predicate.call(thisArg, value, index, this)) {
          return value;
        }
      }

      return undefined;
    }
  );
}

if (
  typeof (Array.prototype as Array<unknown> & { findLastIndex?: unknown }).findLastIndex !==
  "function"
) {
  defineValue(
    Array.prototype,
    "findLastIndex",
    function findLastIndex<T>(
      this: T[],
      predicate: (value: T, index: number, array: T[]) => boolean,
      thisArg?: unknown
    ): number {
      for (let index = this.length - 1; index >= 0; index -= 1) {
        if (predicate.call(thisArg, this[index], index, this)) {
          return index;
        }
      }

      return -1;
    }
  );
}

if (typeof Response !== "undefined" && typeof Response.prototype.bytes !== "function") {
  defineValue(Response.prototype, "bytes", async function bytes(this: Response) {
    return new Uint8Array(await this.arrayBuffer());
  });
}

if (typeof globalThis.structuredClone !== "function") {
  defineValue(globalThis, "structuredClone", function structuredCloneFallback<T>(value: T): T {
    if (value instanceof Map) {
      return new Map(value) as T;
    }

    if (value instanceof Set) {
      return new Set(value) as T;
    }

    if (ArrayBuffer.isView(value)) {
      const view = value as unknown as ArrayBufferView;
      return new Uint8Array(view.buffer.slice(0)) as T;
    }

    if (value instanceof ArrayBuffer) {
      return value.slice(0) as T;
    }

    return JSON.parse(JSON.stringify(value)) as T;
  });
}

export {};
