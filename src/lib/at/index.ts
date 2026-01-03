import { settings } from '$lib/settings';
import { get } from 'svelte/store';

export const slingshotUrl: URL = new URL(get(settings).endpoints.slingshot);
export const spacedustUrl: URL = new URL(get(settings).endpoints.spacedust);
export const constellationUrl: URL = new URL(get(settings).endpoints.constellation);
