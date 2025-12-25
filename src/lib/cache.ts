import { Cache, type CacheOptions } from '@wora/cache-persist';
import { LRUCache } from 'lru-cache';

export interface PersistedLRUOptions {
	prefix?: string;
	max: number;
	ttl?: number;
	persistOptions?: CacheOptions;
}

interface PersistedEntry<V> {
	value: V;
	addedAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class PersistedLRU<K extends string, V extends {}> {
	private memory: LRUCache<K, V>;
	private storage: Cache;
	private signals: Map<K, ((data: V) => void)[]>;

	private prefix = '';

	constructor(opts: PersistedLRUOptions) {
		this.memory = new LRUCache<K, V>({
			max: opts.max,
			ttl: opts.ttl
		});
		this.storage = new Cache(opts.persistOptions);
		this.prefix = opts.prefix ? `${opts.prefix}%` : '';
		this.signals = new Map();

		this.init();
	}

	async init(): Promise<void> {
		await this.storage.restore();

		const state = this.storage.getState();
		for (const [key, val] of Object.entries(state)) {
			try {
				const k = this.unprefix(key) as unknown as K;

				if (this.isPersistedEntry(val)) {
					const entry = val as PersistedEntry<V>;
					this.memory.set(k, entry.value, { start: entry.addedAt });
				} else {
					// Handle legacy data (before this update)
					this.memory.set(k, val as V);
				}
			} catch (err) {
				console.warn('skipping invalid persisted entry', key, err);
			}
		}
	}

	get(key: K): V | undefined {
		return this.memory.get(key);
	}

	getSignal(key: K): Promise<V> {
		return new Promise<V>((resolve) => {
			if (!this.signals.has(key)) {
				this.signals.set(key, [resolve]);
				return;
			}
			const signals = this.signals.get(key)!;
			signals.push(resolve);
			this.signals.set(key, signals);
		});
	}

	set(key: K, value: V): void {
		const addedAt = performance.now();
		this.memory.set(key, value, { start: addedAt });

		const entry: PersistedEntry<V> = { value, addedAt };
		this.storage.set(this.prefixed(key), entry);

		const signals = this.signals.get(key);
		let signal = signals?.pop();
		while (signal) {
			signal(value);
			signal = signals?.pop();
		}
		this.storage.flush();
	}

	has(key: K): boolean {
		return this.memory.has(key);
	}

	delete(key: K): void {
		this.memory.delete(key);
		this.storage.delete(this.prefixed(key));
		this.storage.flush();
	}

	clear(): void {
		this.memory.clear();
		this.storage.purge();
		this.storage.flush();
	}

	private prefixed(key: K): string {
		return this.prefix + key;
	}

	private unprefix(prefixed: string): string {
		return prefixed.slice(this.prefix.length);
	}

	// Type guard to check if data is our new PersistedEntry format
	private isPersistedEntry(data: unknown): data is PersistedEntry<V> {
		return (
			data !== null &&
			typeof data === 'object' &&
			'value' in data &&
			'addedAt' in data &&
			typeof data.addedAt === 'number'
		);
	}
}
