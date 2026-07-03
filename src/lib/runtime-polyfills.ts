type PromiseWithResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

declare global {
  interface PromiseConstructor {
    withResolvers?<T>(): PromiseWithResolvers<T>;
  }

  interface Map<K, V> {
    getOrInsertComputed?<T extends V>(key: K, compute: (key: K) => T): T;
  }
}

if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers<T>(): PromiseWithResolvers<T> {
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
  };
}

if (typeof Map.prototype.getOrInsertComputed !== "function") {
  Map.prototype.getOrInsertComputed = function getOrInsertComputed<K, V>(
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
  };
}

export {};
