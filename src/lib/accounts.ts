import type { Did, Handle } from '@atcute/lexicons';
import { writable } from 'svelte/store';
import { hashColor } from './theme.svelte';

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

export const generateColorForDid = (did: string) => hashColor(did);
