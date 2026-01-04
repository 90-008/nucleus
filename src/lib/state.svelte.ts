import { writable } from 'svelte/store';
import {
	AtpClient,
	newPublicClient,
	type NotificationsStream,
	type NotificationsStreamEvent
} from './at/client';
import { SvelteMap, SvelteDate, SvelteSet } from 'svelte/reactivity';
import type { Did, Handle, InferOutput, Nsid, RecordKey, ResourceUri } from '@atcute/lexicons';
import { fetchPosts, hydratePosts, type PostWithUri } from './at/fetch';
import { parseCanonicalResourceUri, type AtprotoDid } from '@atcute/lexicons/syntax';
import { AppBskyActorProfile, AppBskyFeedPost, type AppBskyGraphFollow } from '@atcute/bluesky';
import type { ComAtprotoRepoListRecords } from '@atcute/atproto';
import type { JetstreamSubscription, JetstreamEvent } from '@atcute/jetstream';
import { expect, ok } from './result';
import type { Backlink, BacklinksSource } from './at/constellation';
import { now as tidNow } from '@atcute/tid';
import type { Records } from '@atcute/lexicons/ambient';
import {
	extractDidFromUri,
	likeSource,
	replySource,
	repostSource,
	timestampFromCursor,
	toCanonicalUri
} from '$lib';
import { Router } from './router.svelte';

export const notificationStream = writable<NotificationsStream | null>(null);
export const jetstream = writable<JetstreamSubscription | null>(null);

export const profiles = new SvelteMap<Did, AppBskyActorProfile.Main>();
export const handles = new SvelteMap<Did, Handle>();

// source -> subject -> did (who did the interaction) -> rkey
export type BacklinksMap = SvelteMap<
	BacklinksSource,
	SvelteMap<ResourceUri, SvelteMap<Did, SvelteSet<RecordKey>>>
>;
export const allBacklinks: BacklinksMap = new SvelteMap();

export const addBacklinks = (
	subject: ResourceUri,
	source: BacklinksSource,
	links: Iterable<Backlink>
) => {
	let subjectMap = allBacklinks.get(source);
	if (!subjectMap) {
		subjectMap = new SvelteMap();
		allBacklinks.set(source, subjectMap);
	}

	let didMap = subjectMap.get(subject);
	if (!didMap) {
		didMap = new SvelteMap();
		subjectMap.set(subject, didMap);
	}

	for (const link of links) {
		let rkeys = didMap.get(link.did);
		if (!rkeys) {
			rkeys = new SvelteSet();
			didMap.set(link.did, rkeys);
		}
		rkeys.add(link.rkey);
	}
};

export const removeBacklinks = (
	subject: ResourceUri,
	source: BacklinksSource,
	links: Iterable<Backlink>
) => {
	const didMap = allBacklinks.get(source)?.get(subject);
	if (!didMap) return;

	for (const link of links) {
		const rkeys = didMap.get(link.did);
		if (!rkeys) continue;
		rkeys.delete(link.rkey);
		if (rkeys.size === 0) didMap.delete(link.did);
	}
};

export const findBacklinksBy = (subject: ResourceUri, source: BacklinksSource, did: Did) => {
	const rkeys = allBacklinks.get(source)?.get(subject)?.get(did) ?? [];
	// reconstruct the collection from the source
	const collection = source.split(':')[0] as Nsid;
	return rkeys.values().map((rkey) => ({ did, collection, rkey }));
};

export const hasBacklink = (subject: ResourceUri, source: BacklinksSource, did: Did): boolean => {
	return allBacklinks.get(source)?.get(subject)?.has(did) ?? false;
};

export const getAllBacklinksFor = (subject: ResourceUri, source: BacklinksSource): Backlink[] => {
	const subjectMap = allBacklinks.get(source);
	if (!subjectMap) return [];

	const didMap = subjectMap.get(subject);
	if (!didMap) return [];

	const collection = source.split(':')[0] as Nsid;
	const result: Backlink[] = [];

	for (const [did, rkeys] of didMap)
		for (const rkey of rkeys) result.push({ did, collection, rkey });

	return result;
};

export const isBlockedBy = (subject: Did, blocker: Did): boolean => {
	return hasBacklink(`at://${subject}`, 'app.bsky.graph.block:subject', blocker);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getNestedValue = (obj: any, path: string[]): any => {
	return path.reduce((current, key) => current?.[key], obj);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setNestedValue = (obj: any, path: string[], value: any): void => {
	const lastKey = path[path.length - 1];
	const parent = path.slice(0, -1).reduce((current, key) => {
		if (current[key] === undefined) current[key] = {};
		return current[key];
	}, obj);
	parent[lastKey] = value;
};

export const backlinksCursors = new SvelteMap<
	Did,
	SvelteMap<BacklinksSource, string | undefined>
>();

export const fetchLinksUntil = async (
	client: AtpClient,
	backlinkSource: BacklinksSource,
	timestamp: number = -1
) => {
	const did = client.user?.did;
	if (!did) return;

	let cursorMap = backlinksCursors.get(did);
	if (!cursorMap) {
		cursorMap = new SvelteMap<BacklinksSource, string | undefined>();
		backlinksCursors.set(did, cursorMap);
	}

	const [_collection, source] = backlinkSource.split(':');
	const collection = _collection as keyof Records;
	const cursor = cursorMap.get(backlinkSource);

	// if already fetched we dont need to fetch again
	const cursorTimestamp = timestampFromCursor(cursor);
	if (cursorTimestamp && cursorTimestamp <= timestamp) return;

	console.log(`${did}: fetchLinksUntil`, backlinkSource, cursor, timestamp);
	const result = await client.listRecordsUntil(collection, cursor, timestamp);

	if (!result.ok) {
		console.error('failed to fetch links until', result.error);
		return;
	}
	cursorMap.set(backlinkSource, result.value.cursor);

	const path = source.split('.');
	for (const record of result.value.records) {
		const uri = getNestedValue(record.value, path);
		const parsedUri = parseCanonicalResourceUri(record.uri);
		if (!parsedUri.ok) continue;
		addBacklinks(uri, `${collection}:${source}`, [
			{
				did: parsedUri.value.repo,
				collection: parsedUri.value.collection,
				rkey: parsedUri.value.rkey
			}
		]);
	}
};

export const deletePostBacklink = async (
	client: AtpClient,
	post: PostWithUri,
	source: BacklinksSource
) => {
	const did = client.user?.did;
	if (!did) return;
	const collection = source.split(':')[0] as Nsid;
	const links = findBacklinksBy(post.uri, source, did);
	removeBacklinks(post.uri, source, links);
	await Promise.allSettled(
		links.map((link) =>
			client.atcute?.post('com.atproto.repo.deleteRecord', {
				input: { repo: did, collection, rkey: link.rkey! }
			})
		)
	);
};

export const createPostBacklink = async (
	client: AtpClient,
	post: PostWithUri,
	source: BacklinksSource
) => {
	const did = client.user?.did;
	if (!did) return;
	const [_collection, subject] = source.split(':');
	const collection = _collection as Nsid;
	const rkey = tidNow();
	addBacklinks(post.uri, source, [
		{
			did,
			collection,
			rkey
		}
	]);
	const record = {
		$type: collection,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		createdAt: new Date().toISOString()
	};
	const subjectPath = subject.split('.');
	setNestedValue(record, subjectPath, post.uri);
	setNestedValue(record, [...subjectPath.slice(0, -1), 'cid'], post.cid);
	await client.atcute?.post('com.atproto.repo.createRecord', {
		input: {
			repo: did,
			collection,
			rkey,
			record
		}
	});
};

export const pulsingPostId = writable<string | null>(null);

export const viewClient = new AtpClient();
export const clients = new SvelteMap<Did, AtpClient>();
export const getClient = async (did: Did): Promise<AtpClient> => {
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
	const res = await client.listRecordsUntil('app.bsky.graph.follow');
	if (!res.ok) return;
	addFollows(
		did,
		res.value.records.map((follow) => [follow.uri, follow.value as AppBskyGraphFollow.Main])
	);
};

// this fetches up to three days of posts and interactions for using in following list
export const fetchForInteractions = async (did: AtprotoDid) => {
	const threeDaysAgo = (Date.now() - 3 * 24 * 60 * 60 * 1000) * 1000;

	const client = await getClient(did);
	const res = await client.listRecordsUntil('app.bsky.feed.post', undefined, threeDaysAgo);
	if (!res.ok) return;
	addPostsRaw(did, res.value);

	const cursorTimestamp = timestampFromCursor(res.value.cursor) ?? -1;
	const timestamp = Math.min(cursorTimestamp, threeDaysAgo);
	console.log(`${did}: fetchForInteractions`, res.value.cursor, timestamp);
	await Promise.all([repostSource].map((s) => fetchLinksUntil(client, s, timestamp)));
};

export const allPosts = new SvelteMap<Did, SvelteMap<ResourceUri, PostWithUri>>();
// did -> post uris that are replies to that did
export const replyIndex = new SvelteMap<Did, SvelteSet<ResourceUri>>();

export const getPost = (did: Did, rkey: RecordKey) =>
	allPosts.get(did)?.get(toCanonicalUri({ did, collection: 'app.bsky.feed.post', rkey }));
const hydrateCacheFn: Parameters<typeof hydratePosts>[3] = (did, rkey) => {
	const cached = getPost(did, rkey);
	return cached ? ok(cached) : undefined;
};

export const addPostsRaw = (
	did: AtprotoDid,
	newPosts: InferOutput<ComAtprotoRepoListRecords.mainSchema['output']['schema']>
) => {
	const postsWithUri = newPosts.records.map(
		(post) =>
			({ cid: post.cid, uri: post.uri, record: post.value as AppBskyFeedPost.Main }) as PostWithUri
	);
	addPosts(postsWithUri);
};

export const addPosts = (newPosts: Iterable<PostWithUri>) => {
	for (const post of newPosts) {
		const parsedUri = expect(parseCanonicalResourceUri(post.uri));
		let posts = allPosts.get(parsedUri.repo);
		if (!posts) {
			posts = new SvelteMap();
			allPosts.set(parsedUri.repo, posts);
		}
		posts.set(post.uri, post);
		if (post.record.reply) {
			addBacklinks(post.record.reply.parent.uri, replySource, [
				{
					did: parsedUri.repo,
					collection: parsedUri.collection,
					rkey: parsedUri.rkey
				}
			]);

			// update reply index
			const parentDid = extractDidFromUri(post.record.reply.parent.uri);
			if (parentDid) {
				let set = replyIndex.get(parentDid);
				if (!set) {
					set = new SvelteSet();
					replyIndex.set(parentDid, set);
				}
				set.add(post.uri);
			}
		}
	}
};

export const timelines = new SvelteMap<Did, SvelteSet<ResourceUri>>();
export const postCursors = new SvelteMap<Did, { value?: string; end: boolean }>();

const traversePostChain = (post: PostWithUri) => {
	const result = [post.uri];
	const parentUri = post.record.reply?.parent.uri;
	if (parentUri) {
		const parentPost = allPosts.get(extractDidFromUri(parentUri)!)?.get(parentUri);
		if (parentPost) result.push(...traversePostChain(parentPost));
	}
	return result;
};
export const addTimeline = (did: Did, uris: Iterable<ResourceUri>) => {
	let timeline = timelines.get(did);
	if (!timeline) {
		timeline = new SvelteSet();
		timelines.set(did, timeline);
	}
	for (const uri of uris) {
		const post = allPosts.get(did)?.get(uri);
		// we need to traverse the post chain to add all posts in the chain to the timeline
		// because the parent posts might not be in the timeline yet
		const chain = post ? traversePostChain(post) : [uri];
		for (const uri of chain) timeline.add(uri);
	}
};

export const fetchTimeline = async (
	did: AtprotoDid,
	limit: number = 6,
	withBacklinks: boolean = true
) => {
	const targetClient = await getClient(did);

	const cursor = postCursors.get(did);
	if (cursor && cursor.end) return;

	const accPosts = await fetchPosts(targetClient, cursor?.value, limit, withBacklinks);
	if (!accPosts.ok) throw `cant fetch posts ${did}: ${accPosts.error}`;

	// if the cursor is undefined, we've reached the end of the timeline
	postCursors.set(did, { value: accPosts.value.cursor, end: !accPosts.value.cursor });
	const hydrated = await hydratePosts(targetClient, did, accPosts.value.posts, hydrateCacheFn);
	if (!hydrated.ok) throw `cant hydrate posts ${did}: ${hydrated.error}`;

	addPosts(hydrated.value.values());
	addTimeline(did, hydrated.value.keys());

	console.log(`${did}: fetchTimeline`, accPosts.value.cursor);
};

export const fetchInteractionsUntil = async (client: AtpClient, did: Did) => {
	const cursor = postCursors.get(did);
	if (!cursor) return;
	const timestamp = timestampFromCursor(cursor.value);
	await Promise.all([likeSource, repostSource].map((s) => fetchLinksUntil(client, s, timestamp)));
};

export const handleJetstreamEvent = async (event: JetstreamEvent) => {
	if (event.kind !== 'commit') return;

	const { did, commit } = event;
	const uri: ResourceUri = toCanonicalUri({ did, ...commit });
	if (commit.collection === 'app.bsky.feed.post') {
		if (commit.operation === 'create') {
			const posts = [
				{
					record: commit.record as AppBskyFeedPost.Main,
					uri,
					cid: commit.cid
				}
			];
			const client = await getClient(did);
			const hydrated = await hydratePosts(client, did, posts, hydrateCacheFn);
			if (!hydrated.ok) {
				console.error(`cant hydrate posts ${did}: ${hydrated.error}`);
				return;
			}
			addPosts(hydrated.value.values());
			addTimeline(did, hydrated.value.keys());
		} else if (commit.operation === 'delete') {
			allPosts.get(did)?.delete(uri);
		}
	}
};

const handlePostNotification = async (event: NotificationsStreamEvent & { type: 'message' }) => {
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
	const posts = [
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
	];
	const hydrated = await hydratePosts(client, did, posts, hydrateCacheFn);
	if (!hydrated.ok) {
		console.error(`cant hydrate posts ${did}: ${hydrated.error}`);
		return;
	}

	// console.log(hydrated);
	addPosts(hydrated.value.values());
	addTimeline(did, hydrated.value.keys());
};

const handleBacklink = (event: NotificationsStreamEvent & { type: 'message' }) => {
	const parsedSource = expect(parseCanonicalResourceUri(event.data.link.source_record));
	addBacklinks(event.data.link.subject, event.data.link.source, [
		{
			did: parsedSource.repo,
			collection: parsedSource.collection,
			rkey: parsedSource.rkey
		}
	]);
};

export const handleNotification = async (event: NotificationsStreamEvent) => {
	if (event.type === 'message') {
		if (event.data.link.source.startsWith('app.bsky.feed.post')) handlePostNotification(event);
		else handleBacklink(event);
	}
};

export const currentTime = new SvelteDate();

if (typeof window !== 'undefined')
	setInterval(() => {
		currentTime.setTime(Date.now());
	}, 1000);

export const router = new Router();
