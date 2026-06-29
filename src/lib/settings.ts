import { defaultTheme, type Theme } from './theme';
import type { FeedGenerator } from './at/feeds';

export type ApiEndpoints = Record<string, string> & {
	slingshot: string;
	spacedust: string;
	constellation: string;
	jetstream: string;
	pocket: string;
	cdn: string;
};

export type SavedFeed = {
	feed: FeedGenerator;
	pinned: boolean;
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
		jetstream: 'wss://jetstream2.fr.hose.cam',
		pocket: 'https://pocket.at-app.net',
		cdn: 'https://cdn.bsky.app'
	},
	theme: defaultTheme,
	socialAppUrl: 'https://bsky.app',
	feeds: []
};

const applyThemeToDocument = (theme: Theme) => {
	if (typeof document === 'undefined') return;
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
};

// Private reactive state
let _settings = $state<Settings>(defaultSettings);

if (typeof localStorage !== 'undefined') {
	const stored = localStorage.getItem('settings');
	if (stored) {
		try {
			const parsed = JSON.parse(stored);
			_settings = {
				endpoints: { ...defaultSettings.endpoints, ...parsed.endpoints },
				theme: { ...defaultSettings.theme, ...parsed.theme },
				socialAppUrl: parsed.socialAppUrl ?? defaultSettings.socialAppUrl,
				feeds: parsed.feeds ?? defaultSettings.feeds
			};
		} catch (e) {
			console.error('Failed to parse settings from localStorage', e);
		}
	}
}

// Apply theme initially if in browser
if (typeof document !== 'undefined') {
	applyThemeToDocument(_settings.theme);
}

export const settings = {
	get current() {
		return _settings;
	},
	set current(value: Settings) {
		_settings = value;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('settings', JSON.stringify(value));
		}
		applyThemeToDocument(value.theme);
	},
	// Compatibility wrapper for settings.set
	set(value: Settings) {
		this.current = value;
	},
	// Compatibility wrapper for settings.update
	update(fn: (value: Settings) => Settings) {
		this.current = fn(this.current);
	},
	reset() {
		this.current = defaultSettings;
	}
};

export const needsReload = (current: Settings, other: Settings): boolean => {
	return (
		current.endpoints.slingshot !== other.endpoints.slingshot ||
		current.endpoints.spacedust !== other.endpoints.spacedust ||
		current.endpoints.constellation !== other.endpoints.constellation ||
		current.endpoints.jetstream !== other.endpoints.jetstream ||
		current.endpoints.pocket !== other.endpoints.pocket ||
		current.endpoints.cdn !== other.endpoints.cdn
	);
};
