import { writable } from 'svelte/store';
import {
	AtpClient,
	newPublicClient,
	type NotificationsStream,
	type NotificationsStreamEvent
} from './at/client';
import { SvelteMap, SvelteDate } from 'svelte/reactivity';
import type { Did, InferOutput, ResourceUri } from '@atcute/lexicons';
import type { Backlink } from './at/constellation';
import { fetchPostsWithBacklinks, hydratePosts, type PostWithUri } from './at/fetch';
import { parseCanonicalResourceUri, type AtprotoDid } from '@atcute/lexicons/syntax';
import { AppBskyFeedPost, type AppBskyGraphFollow } from '@atcute/bluesky';
import type { ComAtprotoRepoListRecords } from '@atcute/atproto';
import type { JetstreamSubscription, JetstreamEvent } from '@atcute/jetstream';
import { expect } from './result';

export const notificationStream = writable<NotificationsStream | null>(null);
export const jetstream = writable<JetstreamSubscription | null>(null);

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
export const getClient = async (did: AtprotoDid): Promise<AtpClient> => {
	if (!clients.has(did)) clients.set(did, await newPublicClient(did));
	return clients.get(did)!;
};

export const follows = new SvelteMap<Did, SvelteMap<ResourceUri, AppBskyGraphFollow.Main>>();

export const addFollows = (
	did: Did,
	followMap: Iterable<[ResourceUri, AppBskyGraphFollow.Main]>
) => {
	if (!follows.has(did)) {
		follows.set(did, new SvelteMap(followMap));
		return;
	}
	const map = follows.get(did)!;
	for (const [uri, record] of followMap) map.set(uri, record);
};

export const fetchFollows = async (did: AtprotoDid) => {
	const client = await getClient(did);
	const res = await client.listRecordsAll('app.bsky.graph.follow');
	if (!res.ok) return;
	addFollows(
		did,
		res.value.records.map((follow) => [follow.uri, follow.value as AppBskyGraphFollow.Main])
	);
};

export const fetchFollowPosts = async (did: AtprotoDid) => {
	const client = await getClient(did);
	const res = await client.listRecords('app.bsky.feed.post');
	if (!res.ok) return;
	addPostsRaw(did, res.value);
};

export const posts = new SvelteMap<Did, SvelteMap<ResourceUri, PostWithUri>>();
export const cursors = new SvelteMap<Did, { value?: string; end: boolean }>();

export const addPostsRaw = (
	did: Did,
	_posts: InferOutput<ComAtprotoRepoListRecords.mainSchema['output']['schema']>
) => {
	const postsWithUri = new SvelteMap(
		_posts.records.map((post) => [
			post.uri,
			{ cid: post.cid, uri: post.uri, record: post.value as AppBskyFeedPost.Main } as PostWithUri
		])
	);
	addPosts(did, postsWithUri);
	cursors.set(did, { value: _posts.cursor, end: _posts.cursor === undefined });
};

export const addPosts = (did: Did, _posts: Iterable<[ResourceUri, PostWithUri]>) => {
	if (!posts.has(did)) {
		posts.set(did, new SvelteMap(_posts));
		return;
	}
	const map = posts.get(did)!;
	for (const [uri, record] of _posts) map.set(uri, record);
};

export const fetchTimeline = async (did: AtprotoDid, limit: number = 6) => {
	const client = await getClient(did);

	const cursor = cursors.get(did);
	if (cursor && cursor.end) return;

	const accPosts = await fetchPostsWithBacklinks(client, cursor?.value, limit);
	if (!accPosts.ok) throw `cant fetch posts ${did}: ${accPosts.error}`;

	// if the cursor is undefined, we've reached the end of the timeline
	if (!accPosts.value.cursor) {
		cursors.set(did, { ...cursor, end: true });
		return;
	}

	cursors.set(did, { value: accPosts.value.cursor, end: false });
	const hydrated = await hydratePosts(client, did, accPosts.value.posts);
	if (!hydrated.ok) throw `cant hydrate posts ${did}: ${hydrated.error}`;

	addPosts(did, hydrated.value);
};

export const handleJetstreamEvent = (event: JetstreamEvent) => {
	if (event.kind !== 'commit') return;

	const { did, commit } = event;
	if (commit.collection !== 'app.bsky.feed.post') return;

	const uri: ResourceUri = `at://${did}/${commit.collection}/${commit.rkey}`;

	if (commit.operation === 'create') {
		const { cid, record } = commit;

		const post: PostWithUri = {
			uri,
			cid,
			// assume record is valid, we trust the jetstream
			record: record as AppBskyFeedPost.Main
		};

		addPosts(did, [[uri, post]]);
	} else if (commit.operation === 'delete') {
		if (posts.has(did)) {
			posts.get(did)?.delete(uri);
		}
	}
};

export const handleNotification = async (event: NotificationsStreamEvent) => {
	if (event.type === 'message') {
		const parsedSubjectUri = expect(parseCanonicalResourceUri(event.data.link.subject));
		const did = parsedSubjectUri.repo as AtprotoDid;
		const client = await getClient(did);
		const subjectPost = await client.getRecord(
			AppBskyFeedPost.mainSchema,
			did,
			parsedSubjectUri.rkey
		);
		if (!subjectPost.ok) return;

		const parsedSourceUri = expect(parseCanonicalResourceUri(event.data.link.source_record));
		const hydrated = await hydratePosts(client, did, [
			{
				record: subjectPost.value.record,
				uri: event.data.link.subject,
				cid: subjectPost.value.cid,
				replies: {
					cursor: null,
					total: 1,
					records: [
						{
							did: parsedSourceUri.repo,
							collection: parsedSourceUri.collection,
							rkey: parsedSourceUri.rkey
						}
					]
				}
			}
		]);
		if (!hydrated.ok) {
			console.error(`cant hydrate posts ${did}: ${hydrated.error}`);
			return;
		}

		// console.log(hydrated);
		addPosts(did, hydrated.value);
	}
};

export const currentTime = new SvelteDate();

if (typeof window !== 'undefined')
	setInterval(() => {
		currentTime.setTime(Date.now());
	}, 1000);
