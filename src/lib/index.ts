import { writable } from 'svelte/store';
import { type NotificationsStream } from './at/client';
// import type { JetstreamSubscription } from '@atcute/jetstream';

export const notificationStream = writable<NotificationsStream | null>(null);
// export const jetstream = writable<JetstreamSubscription | null>(null);
