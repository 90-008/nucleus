import type { Did, Handle } from '@atcute/lexicons';
import { writable } from 'svelte/store';
import { createXXHash3, type IHasher } from 'hash-wasm';

export type Account = {
	did: Did;
	handle: Handle;
	password: string;
};

let _accounts: Account[] = [];
export const accounts = (() => {
	const raw = localStorage.getItem('accounts');
	_accounts = raw ? JSON.parse(raw) : [];
	const store = writable<Account[]>(_accounts);
	store.subscribe((accounts) => {
		_accounts = accounts;
		localStorage.setItem('accounts', JSON.stringify(accounts));
	});
	return store;
})();

export const addAccount = (account: Account): void => {
	accounts.update((accounts) => [...accounts, account]);
};

// fucked up and evil (i hate promises :3)
const _initHasher = () => {
	createXXHash3(90001, 8008135).then((s) => (hasher = s));
	return null;
};
let hasher: IHasher | null = _initHasher();

export const generateColorForDid = (did: string): string | null => {
	const h = hasher!;
	h.init();
	h.update(did);
	const hex = h.digest();
	const color = hex.slice(-6);
	return `#${color}`;
};
