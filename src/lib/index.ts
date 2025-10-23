import { writable } from 'svelte/store';
import { type NotificationsStream } from './at/client';
import { SvelteMap } from 'svelte/reactivity';
import type { Did, ResourceUri } from '@atcute/lexicons';
import type { Backlink } from './at/constellation';
// import type { JetstreamSubscription } from '@atcute/jetstream';

export const selectedDid = writable<Did | null>(null);

export const notificationStream = writable<NotificationsStream | null>(null);
// export const jetstream = writable<JetstreamSubscription | null>(null);

export type PostActions = {
	like: Backlink | null;
	repost: Backlink | null;
	// reply: Backlink | null;
	// quote: Backlink | null;
};
export const postActions = new SvelteMap<`${Did}:${ResourceUri}`, PostActions>();
