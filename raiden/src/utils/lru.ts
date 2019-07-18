/**
 * Simple Map-based LRU cache
 * @param max Maximum size of cache
 */
export class LruCache<K, V> {
  public values: Map<K, V> = new Map<K, V>();
  public max: number;

  public constructor(max: number) {
    this.max = max;
  }

  public get(key: K): V | undefined {
    const entry = this.values.get(key);
    if (entry) {
      // peek the entry, re-insert for LRU strategy
      this.values.delete(key);
      this.values.set(key, entry);
    }
    return entry;
  }

  public put(key: K, value: V) {
    if (this.values.size >= this.max) {
      // least-recently used cache eviction strategy
      const keyToDelete = this.values.keys().next().value;
      this.values.delete(keyToDelete);
    }
    this.values.set(key, value);
  }
}
