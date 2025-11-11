import { writable } from 'svelte/store';
import { AtpClient, type NotificationsStream } from './at/client';
import { SvelteMap } from 'svelte/reactivity';
import type { Did, ResourceUri } from '@atcute/lexicons';
import type { Backlink } from './at/constellation';
import type { PostWithUri } from './at/fetch';
import type { AtprotoDid } from '@atcute/lexicons/syntax';
// import type { JetstreamSubscription } from '@atcute/jetstream';

export const notificationStream = writable<NotificationsStream | null>(null);
// export const jetstream = writable<JetstreamSubscription | null>(null);

export type PostActions = {
	like: Backlink | null;
	repost: Backlink | null;
	// reply: Backlink | null;
	// quote: Backlink | null;
};
export const postActions = new SvelteMap<`${Did}:${ResourceUri}`, PostActions>();

export const pulsingPostId = writable<string | null>(null);

export const viewClient = new AtpClient();
export const clients = new SvelteMap<AtprotoDid, AtpClient>();

export const posts = new SvelteMap<Did, SvelteMap<ResourceUri, PostWithUri>>();
export const cursors = new SvelteMap<Did, { value?: string; end: boolean }>();
