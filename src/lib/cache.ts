import { Cache, type CacheOptions } from '@wora/cache-persist';
import { LRUCache } from 'lru-cache';

export interface PersistedLRUOptions {
	prefix?: string;
	max: number;
	ttl?: number;
	persistOptions?: CacheOptions;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class PersistedLRU<K extends string, V extends {}> {
	private memory: LRUCache<K, V>;
	private storage: Cache; // from wora/cache-persist

	private prefix = ''; // or derive from options

	constructor(opts: PersistedLRUOptions) {
		this.memory = new LRUCache<K, V>({
			max: opts.max,
			ttl: opts.ttl
		});
		this.storage = new Cache(opts.persistOptions);
		this.prefix = opts.prefix ? `${opts.prefix}%` : '';

		this.init();
	}

	async init(): Promise<void> {
		await this.storage.restore();

		const state = this.storage.getState();
		for (const [key, val] of Object.entries(state)) {
			try {
				console.log('restoring', key);
				const k = this.unprefix(key) as unknown as K;
				const v = val as V;
				this.memory.set(k, v);
			} catch (err) {
				console.warn('skipping invalid persisted entry', key, err);
			}
		}
	}

	get(key: K): V | undefined {
		return this.memory.get(key);
	}
	set(key: K, value: V): void {
		this.memory.set(key, value);
		this.storage.set(this.prefixed(key), value);
		this.storage.flush(); // TODO: uh evil and fucked up (this whole file is evil honestly)
	}
	has(key: K): boolean {
		return this.memory.has(key);
	}
	delete(key: K): void {
		this.memory.delete(key);
		this.storage.delete(this.prefixed(key));
	}
	clear(): void {
		this.memory.clear();
		this.storage.purge(); // clears stored state
	}

	private prefixed(key: K): string {
		return this.prefix + key;
	}
	private unprefix(prefixed: string): string {
		return prefixed.slice(this.prefix.length);
	}
}
