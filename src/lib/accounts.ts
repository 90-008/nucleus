import type { Handle } from '@atcute/lexicons';
import { writable } from 'svelte/store';
import { hashColor } from './theme';
import type { AtprotoDid } from '@atcute/lexicons/syntax';

export type Account = {
	did: AtprotoDid;
	handle: Handle | null;
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

export const loggingIn = {
	set: (account: Account | null) => {
		if (!account) {
			localStorage.removeItem('loggingIn');
		} else {
			localStorage.setItem('loggingIn', JSON.stringify(account));
		}
	},
	get: (): Account | null => {
		const raw = localStorage.getItem('loggingIn');
		return raw ? JSON.parse(raw) : null;
	}
};

export const generateColorForDid = (did: string) => hashColor(did);
