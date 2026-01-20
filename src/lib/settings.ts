import { writable } from 'svelte/store';
import { defaultTheme, type Theme } from './theme';
import type { FeedGenerator } from './at/feeds';

export type ApiEndpoints = Record<string, string> & {
	slingshot: string;
	spacedust: string;
	constellation: string;
	jetstream: string;
};
export type SavedFeed = {
	feed: FeedGenerator,
	pinned: boolean,
};

export type Settings = {
	endpoints: ApiEndpoints;
	theme: Theme;
	socialAppUrl: string;
	feeds: SavedFeed[];
};

export const defaultSettings: Settings = {
	endpoints: {
		slingshot: 'https://slingshot.microcosm.blue',
		spacedust: 'https://spacedust.microcosm.blue',
		constellation: 'https://constellation.microcosm.blue',
		jetstream: 'wss://jetstream2.fr.hose.cam'
	},
	theme: defaultTheme,
	socialAppUrl: 'https://bsky.app',
	feeds: []
};

const createSettingsStore = () => {
	// Prevent SSR crash if localStorage is missing
	const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('settings') : null;

	const initial: Partial<Settings> = stored ? JSON.parse(stored) : defaultSettings;
	initial.endpoints = { ...defaultSettings.endpoints, ...initial.endpoints };
	initial.theme = { ...defaultSettings.theme, ...initial.theme };
	initial.socialAppUrl = initial.socialAppUrl ?? defaultSettings.socialAppUrl;
	initial.feeds = initial.feeds ?? defaultSettings.feeds;

	const { subscribe, set, update } = writable<Settings>(initial as Settings);

	subscribe((settings) => {
		if (typeof document === 'undefined') return;
		const theme = settings.theme;
		document.documentElement.style.setProperty('--nucleus-bg', theme.bg);
		document.documentElement.style.setProperty('--nucleus-fg', theme.fg);
		document.documentElement.style.setProperty('--nucleus-accent', theme.accent);
		document.documentElement.style.setProperty('--nucleus-accent2', theme.accent2);

		const oldMeta = document.querySelector('meta[name="theme-color"]');
		if (oldMeta) oldMeta.remove();

		const metaThemeColor = document.createElement('meta');
		metaThemeColor.setAttribute('name', 'theme-color');
		metaThemeColor.setAttribute('content', theme.bg);
		document.head.appendChild(metaThemeColor);
	});

	return {
		subscribe,
		set: (value: Settings) => {
			if (typeof localStorage !== 'undefined')
				localStorage.setItem('settings', JSON.stringify(value));
			set(value);
		},
		update: (fn: (value: Settings) => Settings) => {
			update((value) => {
				const newValue = fn(value);
				if (typeof localStorage !== 'undefined')
					localStorage.setItem('settings', JSON.stringify(newValue));
				return newValue;
			});
		},
		reset: () => {
			if (typeof localStorage !== 'undefined')
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
		current.endpoints.constellation !== other.endpoints.constellation ||
		current.endpoints.jetstream !== other.endpoints.jetstream
	);
};
