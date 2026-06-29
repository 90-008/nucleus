import { settings } from '$lib/settings';
import type { Did } from '@atcute/lexicons';

export const slingshotUrl: URL = new URL(settings.current.endpoints.slingshot);
export const spacedustUrl: URL = new URL(settings.current.endpoints.spacedust);
export const constellationUrl: URL = new URL(settings.current.endpoints.constellation);
export const pocketUrl: URL = new URL(settings.current.endpoints.pocket);
export const cdnUrl: URL = new URL(settings.current.endpoints.cdn);

export const httpToDidWeb = (url: string): Did => `did:web:${new URL(url).hostname}`;
