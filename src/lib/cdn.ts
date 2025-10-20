import type { Did } from '@atcute/lexicons';

export const cdn = `https://cdn.bsky.app`;

export type ImageKind = 'avatar_thumbnail' | 'avatar' | 'feed_thumbnail' | 'feed_fullsize';
export type ImageFormat = 'webp' | 'png' | 'jpg';

export const img = (kind: ImageKind, did: Did, blob: string, format: ImageFormat = 'webp') =>
	`${cdn}/img/${kind}/plain/${did}/${blob}@${format}`;
