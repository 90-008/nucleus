import { writable } from 'svelte/store';
import { defaultTheme, type Theme } from './theme.svelte';

export type ApiEndpoints = Record<string, string> & {
	slingshot: string;
	spacedust: string;
	constellation: string;
};
export type Settings = {
	endpoints: ApiEndpoints;
	theme: Theme;
};

export const defaultSettings: Settings = {
	endpoints: {
		slingshot: 'https://slingshot.microcosm.blue',
		spacedust: 'https://spacedust.microcosm.blue',
		constellation: 'https://constellation.microcosm.blue'
	},
	theme: defaultTheme
};

const createSettingsStore = () => {
	const stored = localStorage.getItem('settings');

	const initial: Partial<Settings> = stored ? JSON.parse(stored) : defaultSettings;
	initial.endpoints = initial.endpoints ?? defaultSettings.endpoints;
	initial.theme = initial.theme ?? defaultSettings.theme;

	const { subscribe, set, update } = writable<Settings>(initial as Settings);

	subscribe((settings) => {
		const theme = settings.theme;
		document.documentElement.style.setProperty('--nucleus-bg', theme.bg);
		document.documentElement.style.setProperty('--nucleus-fg', theme.fg);
		document.documentElement.style.setProperty('--nucleus-accent', theme.accent);
		document.documentElement.style.setProperty('--nucleus-accent2', theme.accent2);
	});

	return {
		subscribe,
		set: (value: Settings) => {
			localStorage.setItem('settings', JSON.stringify(value));
			set(value);
		},
		update: (fn: (value: Settings) => Settings) => {
			update((value) => {
				const newValue = fn(value);
				localStorage.setItem('settings', JSON.stringify(newValue));
				return newValue;
			});
		},
		reset: () => {
			localStorage.setItem('settings', JSON.stringify(defaultSettings));
			set(defaultSettings);
		}
	};
};

export const settings = createSettingsStore();

export const needsReload = (current: Settings, other: Settings): boolean => {
	return (
		current.endpoints.slingshot !== other.endpoints.slingshot ||
		current.endpoints.spacedust !== other.endpoints.spacedust ||
		current.endpoints.constellation !== other.endpoints.constellation
	);
};
