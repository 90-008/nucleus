import { createCache } from 'async-cache-dedupe';

const DB_NAME = 'nucleus-cache';
const STORE_NAME = 'keyvalue';
const DB_VERSION = 1;

type WriteOp =
	| {
			type: 'put';
			key: string;
			value: { value: unknown; expires: number };
			resolve: () => void;
			reject: (err: unknown) => void;
	  }
	| { type: 'delete'; key: string; resolve: () => void; reject: (err: unknown) => void };
type ReadOp = {
	key: string;
	resolve: (val: unknown) => void;
	reject: (err: unknown) => void;
};

class IDBStorage {
	private dbPromise: Promise<IDBDatabase> | null = null;

	private getBatch: ReadOp[] = [];
	private writeBatch: WriteOp[] = [];

	private getFlushScheduled = false;
	private writeFlushScheduled = false;

	constructor() {
		if (typeof indexedDB === 'undefined') return;

		this.dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => {
				console.error('IDB open error:', request.error);
				reject(request.error);
			};

			request.onsuccess = () => resolve(request.result);

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			};
		});
	}

	async get(key: string): Promise<unknown> {
		// checking in-flight writes
		for (let i = this.writeBatch.length - 1; i >= 0; i--) {
			const op = this.writeBatch[i];
			if (op.key === key) {
				if (op.type === 'delete') return undefined;
				if (op.type === 'put') {
					// if expired we dont want it
					if (op.value.expires < Date.now()) return undefined;
					return op.value.value;
				}
			}
		}

		if (!this.dbPromise) return undefined;

		return new Promise((resolve, reject) => {
			this.getBatch.push({ key, resolve, reject });
			this.scheduleGetFlush();
		});
	}

	private scheduleGetFlush() {
		if (this.getFlushScheduled) return;
		this.getFlushScheduled = true;
		queueMicrotask(() => this.flushGetBatch());
	}

	private async flushGetBatch() {
		this.getFlushScheduled = false;
		const batch = this.getBatch;
		this.getBatch = [];

		if (batch.length === 0) return;

		try {
			const db = await this.dbPromise;
			if (!db) throw new Error('DB not available');

			const transaction = db.transaction(STORE_NAME, 'readonly');
			const store = transaction.objectStore(STORE_NAME);

			batch.forEach(({ key, resolve }) => {
				try {
					const request = store.get(key);
					request.onsuccess = () => {
						const result = request.result;
						if (!result) {
							resolve(undefined);
							return;
						}
						if (result.expires < Date.now()) {
							// Fire-and-forget removal for expired items
							this.remove(key).catch(() => {});
							resolve(undefined);
							return;
						}
						resolve(result.value);
					};
					request.onerror = () => resolve(undefined);
				} catch {
					resolve(undefined);
				}
			});
		} catch (error) {
			batch.forEach(({ reject }) => reject(error));
		}
	}

	async set(key: string, value: unknown, ttl: number): Promise<void> {
		if (!this.dbPromise) return;

		const expires = Date.now() + ttl * 1000;
		const storageValue = { value, expires };

		return new Promise((resolve, reject) => {
			this.writeBatch.push({ type: 'put', key, value: storageValue, resolve, reject });
			this.scheduleWriteFlush();
		});
	}

	async remove(key: string): Promise<void> {
		if (!this.dbPromise) return;

		return new Promise((resolve, reject) => {
			this.writeBatch.push({ type: 'delete', key, resolve, reject });
			this.scheduleWriteFlush();
		});
	}

	private scheduleWriteFlush() {
		if (this.writeFlushScheduled) return;
		this.writeFlushScheduled = true;
		queueMicrotask(() => this.flushWriteBatch());
	}

	private async flushWriteBatch() {
		this.writeFlushScheduled = false;
		const batch = this.writeBatch;
		this.writeBatch = [];

		if (batch.length === 0) return;

		try {
			const db = await this.dbPromise;
			if (!db) throw new Error('DB not available');

			const transaction = db.transaction(STORE_NAME, 'readwrite');
			const store = transaction.objectStore(STORE_NAME);

			batch.forEach((op) => {
				try {
					let request: IDBRequest;
					if (op.type === 'put') request = store.put(op.value, op.key);
					else request = store.delete(op.key);

					request.onsuccess = () => op.resolve();
					request.onerror = () => op.reject(request.error);
				} catch (err) {
					op.reject(err);
				}
			});
		} catch (error) {
			batch.forEach(({ reject }) => reject(error));
		}
	}

	async clear(): Promise<void> {
		if (!this.dbPromise) return;
		try {
			const db = await this.dbPromise;
			return new Promise<void>((resolve, reject) => {
				const transaction = db.transaction(STORE_NAME, 'readwrite');
				const store = transaction.objectStore(STORE_NAME);
				const request = store.clear();

				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve();
			});
		} catch (e) {
			console.error('IDB clear error', e);
		}
	}

	async exists(key: string): Promise<boolean> {
		return (await this.get(key)) !== undefined;
	}

	async invalidate(key: string): Promise<void> {
		return this.remove(key);
	}

	// noops
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async getTTL(key: string): Promise<void> {
		return;
	}
	async refresh(): Promise<void> {
		return;
	}
}

export const cache = createCache({
	storage: {
		type: 'custom',
		options: {
			storage: new IDBStorage()
		}
	},
	ttl: 60 * 60 * 24, // 24 hours
	onError: (err) => console.error(err)
});
