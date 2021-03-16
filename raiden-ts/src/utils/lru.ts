/**
 * Simple Map-based LRU cache
 *
 * @param max - Maximum size of cache
 */
export class LruCache<K, V> extends Map<K, V> {
  constructor(public max: number) {
    super();
  }

  get(key: K): V | undefined {
    let value;
    if (this.has(key)) {
      // peek the entry, re-insert for LRU strategy
      value = super.get(key) as V;
      this.delete(key);
      super.set(key, value);
    }
    return value;
  }

  set(key: K, value: V) {
    this.get(key); // bump key on set if exists
    super.set(key, value);
    while (this.size > this.max) {
      // least-recently used cache eviction strategy
      const keyToDelete = this.keys().next().value;
      this.delete(keyToDelete);
    }
    return this;
  }
}
