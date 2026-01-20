import { type ActorIdentifier, type Did, type RecordKey } from '@atcute/lexicons/syntax';
import { type AtpClient } from './client.svelte';
import { AppBskyFeedGenerator } from '@atcute/bluesky';
import { img } from '$lib/cdn';
import type { Blob as AtprotoBlob } from '@atcute/lexicons';

export type FeedGenerator = {
    uri: string;
    displayName: string;
    description?: string;
    avatar?: string;
    did: string;
};

export function parseFeedUri(uri: string): { repo: ActorIdentifier; rkey: RecordKey } | null {
    if (uri.startsWith('at://')) {
        const match = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/);
        if (!match) return null;
        return { repo: match[1] as ActorIdentifier, rkey: match[2] as RecordKey };
    } else if (uri.startsWith('https://') || uri.startsWith('http://')) {
        const match = uri.match(/^https?:\/\/(?:[^/]+)\/profile\/([^/]+)\/feed\/([^/]+)$/);
        if (!match) return null;
        return { repo: match[1] as ActorIdentifier, rkey: match[2] as RecordKey };
    }
    return null;
}

export async function fetchFeedGenerator(client: AtpClient, uri: string): Promise<FeedGenerator | null> {
    const parsed = parseFeedUri(uri);
    if (!parsed) return null;

    try {
        const response = await client.getRecord(AppBskyFeedGenerator.mainSchema, parsed.repo, parsed.rkey);
        if (!response.ok) return null;

        const value = response.value.record;
        const did = response.value.uri.split('/')[2] as Did;
        const avatar = value.avatar ? img('avatar_thumbnail', did, (value.avatar as AtprotoBlob<string>).ref.$link, 'webp') : undefined;

        return {
            uri: response.value.uri,
            displayName: value.displayName,
            description: value.description,
            did: value.did,
            avatar,
        };
    } catch {
        return null;
    }
}

export type FeedSkeletonItem = {
    post: string;
    reason?: { $type: string; repost?: string };
};

export type FeedSkeleton = {
    feed: FeedSkeletonItem[];
    cursor?: string;
};

export async function fetchFeedSkeleton(
    client: AtpClient,
    feedUri: string,
    feedServiceDid: string,
    cursor?: string
): Promise<FeedSkeleton | null> {
    const auth = client.user;
    if (!auth) return null;

    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const url = `/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(feedUri)}${cursorParam}`;

    try {
        const response = await auth.atcute.handler(url, {
            method: 'GET',
            headers: {
                'atproto-proxy': `${feedServiceDid}#bsky_fg`
            }
        });

        if (!response.ok) return null;
        return (await response.json()) as FeedSkeleton;
    } catch {
        return null;
    }
}

