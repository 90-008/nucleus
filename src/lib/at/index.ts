import { settings } from '$lib/settings';
import type { Did } from '@atcute/lexicons';
import { get } from 'svelte/store';

export const slingshotUrl: URL = new URL(get(settings).endpoints.slingshot);
export const spacedustUrl: URL = new URL(get(settings).endpoints.spacedust);
export const constellationUrl: URL = new URL(get(settings).endpoints.constellation);
export const pocketUrl: URL = new URL(get(settings).endpoints.pocket);
export const cdnUrl: URL = new URL(get(settings).endpoints.cdn);

export const httpToDidWeb = (url: string): Did => `did:web:${new URL(url).hostname}`;
