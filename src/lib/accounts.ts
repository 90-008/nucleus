import type { Did, Handle } from '@atcute/lexicons';
import { writable } from 'svelte/store';

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

function hashColor(input: string | number): string {
	let hash = typeof input === 'string' ? stringToHash(input) : input;

	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x85ebca6b);
	hash ^= hash >>> 13;
	hash = Math.imul(hash, 0xb00b1355);
	hash ^= hash >>> 16;
	hash = hash >>> 0;

	const hue = hash % 360;
	const saturation = 0.7 + ((hash >>> 8) % 30) * 0.01;
	const value = 0.6 + ((hash >>> 16) % 40) * 0.01;

	const rgb = hsvToRgb(hue, saturation, value);
	const hex = rgb.map((value) => value.toString(16).padStart(2, '0')).join('');

	return `#${hex}`;
}

function stringToHash(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (Math.imul(hash << 5, 1) - hash + str.charCodeAt(i)) | 0;
	}
	return hash >>> 0;
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
	const c = v * s;
	const hPrime = h * 0.016666667;
	const x = c * (1 - Math.abs((hPrime % 2) - 1));
	const m = v - c;

	let r: number, g: number, b: number;

	if (h < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (h < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (h < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (h < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		g = 0;
		b = c;
	} else {
		r = c;
		g = 0;
		b = x;
	}

	return [((r + m) * 255) | 0, ((g + m) * 255) | 0, ((b + m) * 255) | 0];
}
