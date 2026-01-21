import { get, writable } from 'svelte/store';
import {
	AtpClient,
	setRecordCache,
	type NotificationsStream,
	type NotificationsStreamEvent
} from './at/client.svelte';
import { SvelteMap, SvelteDate, SvelteSet } from 'svelte/reactivity';
import type { Did, Handle, Nsid, RecordKey, ResourceUri } from '@atcute/lexicons';
import { fetchPosts, hydratePosts, type HydrateOptions, type PostWithUri } from './at/fetch';
import { parseCanonicalResourceUri, type AtprotoDid } from '@atcute/lexicons/syntax';
import {
	AppBskyActorProfile,
	AppBskyFeedPost,
	AppBskyGraphBlock,
	type AppBskyGraphFollow
} from '@atcute/bluesky';
import type { JetstreamSubscription, JetstreamEvent } from '@atcute/jetstream';
import { expect, ok } from './result';
import type { Backlink, BacklinksSource } from './at/constellation';
import { now as tidNow } from '@atcute/tid';
import type { Records } from '@atcute/lexicons/ambient';
import {
	blockSource,
	extractDidFromUri,
	likeSource,
	replyRootSource,
	replySource,
	repostSource,
	timestampFromCursor,
	toCanonicalUri
} from '$lib';
import { Router } from './router.svelte';
import { accounts, type Account } from './accounts';
import {
	getPreferences,
	putPreferences,
	type Preferences
} from './at/pocket';

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
	subject: Did,
	client: AtpClient,
	backlinkSource: BacklinksSource,
	timestamp: number = -1
) => {
	let cursorMap = backlinksCursors.get(subject);
	if (!cursorMap) {
		cursorMap = new SvelteMap<BacklinksSource, string | undefined>();
		backlinksCursors.set(subject, cursorMap);
	}

	const [_collection, source] = backlinkSource.split(':');
	const collection = _collection as keyof Records;
	const cursor = cursorMap.get(backlinkSource);

	// if already fetched we dont need to fetch again
	const cursorTimestamp = timestampFromCursor(cursor);
	if (cursorTimestamp && cursorTimestamp <= timestamp) return;

	console.log(`${subject}: fetchLinksUntil`, backlinkSource, cursor, timestamp);
	const result = await client.listRecordsUntil(subject, collection, cursor, timestamp);

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
			client.user?.atcute.post('com.atproto.repo.deleteRecord', {
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
	await client.user?.atcute.post('com.atproto.repo.createRecord', {
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

export const accountPreferences = new SvelteMap<Did, Preferences>();

const PREFS_STORAGE_KEY = 'accountPreferences';

const loadLocalPreferences = (): Map<Did, Preferences> => {
	if (typeof localStorage === 'undefined') return new Map();
	try {
		const stored = localStorage.getItem(PREFS_STORAGE_KEY);
		if (!stored) return new Map();
		return new Map(Object.entries(JSON.parse(stored))) as Map<Did, Preferences>;
	} catch {
		return new Map();
	}
};

const saveLocalPreferences = () => {
	if (typeof localStorage === 'undefined') return;
	const obj = Object.fromEntries(accountPreferences.entries());
	localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(obj));
};

export const loadAccountPreferences = async (account: Account) => {
	const client = clients.get(account.did);
	if (!client) return;

	const localPrefs = loadLocalPreferences().get(account.did);
	const remoteResult = await getPreferences(client);

	if (!remoteResult.ok) {
		console.error('failed to load preferences from pocket:', remoteResult.error);
		if (localPrefs) accountPreferences.set(account.did, localPrefs);
		return;
	}

	const remotePrefs = remoteResult.value;

	if (!remotePrefs && !localPrefs) {
		return;
	}

	if (!remotePrefs && localPrefs) {
		accountPreferences.set(account.did, localPrefs);
		await putPreferences(client, localPrefs);
		return;
	}

	if (remotePrefs && !localPrefs) {
		accountPreferences.set(account.did, remotePrefs);
		saveLocalPreferences();
		return;
	}

	// both exist - last modified wins
	const localTime = new Date(localPrefs!.updatedAt).getTime();
	const remoteTime = new Date(remotePrefs!.updatedAt).getTime();

	if (localTime > remoteTime) {
		accountPreferences.set(account.did, localPrefs!);
		await putPreferences(client, localPrefs!);
	} else {
		accountPreferences.set(account.did, remotePrefs!);
		saveLocalPreferences();
	}
};

export const setAccountPreferences = (
	did: Did,
	partial: Partial<Omit<Preferences, 'updatedAt'>>
) => {
	const existing = accountPreferences.get(did) ?? { updatedAt: '' };
	const updated: Preferences = {
		...existing,
		...partial,
		updatedAt: new Date().toISOString()
	};

	accountPreferences.set(did, updated);
	saveLocalPreferences();
	return updated;
};

export const syncAccountPreferences = async (did: Did) => {
	const prefs = accountPreferences.get(did);
	if (!prefs) return;

	const client = clients.get(did);
	if (client) {
		const result = await putPreferences(client, prefs);
		if (!result.ok) console.error('failed to sync preferences to pocket:', result.error);
	}
};

export const updateAccountPreferences = async (
	did: Did,
	partial: Partial<Omit<Preferences, 'updatedAt'>>
) => {
	setAccountPreferences(did, partial);
	await syncAccountPreferences(did);
};

type FollowWithUri = {
	uri: ResourceUri;
	record: AppBskyGraphFollow.Main;
};
export const follows = new SvelteMap<Did, SvelteMap<Did, FollowWithUri>>();

export const addFollows = (
	did: Did,
	followList: Iterable<FollowWithUri>
) => {
	let map = follows.get(did)!;
	if (!map) {
		map = new SvelteMap();
		follows.set(did, map);
	}
	for (const follow of followList) map.set(follow.record.subject, follow);
};

export const fetchFollows = async (
	account: Account
): Promise<IteratorObject<AppBskyGraphFollow.Main>> => {
	const client = clients.get(account.did)!;
	const res = await client.listRecordsUntil(account.did, 'app.bsky.graph.follow');
	if (!res.ok) {
		console.error("can't fetch follows:", res.error);
		return [].values();
	}
	addFollows(
		account.did,
		res.value.records.map((follow) => ({
			uri: follow.uri,
			record: follow.value as AppBskyGraphFollow.Main
		}))
	);
	return res.value.records.values().map((follow) => follow.value as AppBskyGraphFollow.Main);
};

// this fetches up to three days of posts and interactions for using in following list
export const fetchForInteractions = async (client: AtpClient, subject: Did) => {
	const userDid = client.user?.did;
	if (!userDid) return;

	const threeDaysAgo = (Date.now() - 3 * 24 * 60 * 60 * 1000) * 1000;

	// fetch only 1 item to prompt the cursor
	const res = await client.listRecordsUntil(subject, 'app.bsky.feed.post', undefined, threeDaysAgo);
	if (!res.ok) return;
	const postsWithUri = res.value.records.map(
		(post) =>
			({ cid: post.cid, uri: post.uri, record: post.value as AppBskyFeedPost.Main }) as PostWithUri
	);
	addPosts(postsWithUri);

	// add to following buffer (not feed directly)
	let buffer = followingBuffer.get(userDid);
	if (!buffer) {
		buffer = new SvelteSet();
		followingBuffer.set(userDid, buffer);
	}
	for (const post of postsWithUri) buffer.add(post.uri);

	if (res.value.cursor) {
		let userCursors = followingCursors.get(userDid);
		if (!userCursors) {
			userCursors = new SvelteMap();
			followingCursors.set(userDid, userCursors);
		}
		userCursors.set(subject, res.value.cursor);
	}

	const cursorTimestamp = timestampFromCursor(res.value.cursor) ?? -1;
	const timestamp = Math.min(cursorTimestamp, threeDaysAgo);
	console.log(`${subject}: fetchForInteractions`, res.value.cursor, timestamp);
	await Promise.all([repostSource].map((s) => fetchLinksUntil(subject, client, s, timestamp)));
};

export const fetchFollowingTimeline = async (client: AtpClient, targetDid?: Did, limit: number = 10) => {
	// 1. Identify candidates (active follows + self)
	const userDid = targetDid ?? client.user?.did;
	if (!userDid) return;

	let buffer = followingBuffer.get(userDid);
	if (!buffer) {
		buffer = new SvelteSet();
		followingBuffer.set(userDid, buffer);
	}

	let userFeed = followingFeed.get(userDid);
	if (!userFeed) {
		userFeed = new SvelteSet();
		followingFeed.set(userDid, userFeed);
	}

	let userCursors = followingCursors.get(userDid);
	if (!userCursors) {
		userCursors = new SvelteMap();
		followingCursors.set(userDid, userCursors);
	}

	// 0. Drain buffer first
	if (buffer.size > 0) {
		const sorted = Array.from(buffer).sort((a, b) => {
			const postA = getPostFromUri(a);
			const postB = getPostFromUri(b);
			return (
				new Date(postB?.record.createdAt ?? 0).getTime() -
				new Date(postA?.record.createdAt ?? 0).getTime()
			);
		});

		const toAdd = sorted.slice(0, limit);
		for (const uri of toAdd) {
			userFeed.add(uri);
			buffer.delete(uri);
		}

		return;
	}

	const subjects = new Set(follows.get(userDid)?.keys());
	subjects.add(userDid);

	// 2. Find the "newest" cursor(s)
	let maxCursor: string | undefined = undefined;
	let candidates: Did[] = [];

	for (const subject of subjects) {
		const cursor = userCursors.get(subject);

		// null means exhausted
		if (cursor === null) continue;

		// if we haven't fetched this user yet (undefined cursor), they are a candidate (newest)
		if (cursor === undefined) {
			if (maxCursor !== undefined) {
				maxCursor = undefined;
				candidates = [subject];
			} else {
				candidates.push(subject);
			}
			continue;
		}

		// If maxCursor is undefined (meaning we have some 'now' candidates), skip checked cursors
		if (maxCursor === undefined && candidates.length > 0) continue;

		if (maxCursor === undefined || cursor > maxCursor) {
			maxCursor = cursor;
			candidates = [subject];
		} else if (cursor === maxCursor) {
			candidates.push(subject);
		}
	}

	if (candidates.length === 0) return; // Everyone exhausted?

	// 3. Fetch from candidates
	console.log('fetching following timeline from', candidates, maxCursor);
	const results = await Promise.all(
		candidates.map(async (did) => {
			const cursor = userCursors!.get(did) ?? undefined;
			// fetch limit is 4th argument, cursor is 3rd
			const res = await client.listRecords(did, 'app.bsky.feed.post', cursor, limit);
			if (!res.ok) {
				console.error(`fetchFollowingTimeline failed for ${did}:`, res.error);
				return null;
			}
			return { did, res: res.value };
		})
	);

	// 4. Update state
	const newPosts: ResourceUri[] = [];
	for (const result of results) {
		if (!result) continue;
		const { did, res } = result;

		// update cursor
		if (res.cursor) userCursors!.set(did, res.cursor);
		else userCursors!.set(did, null); // null = exhausted

		for (const record of res.records) newPosts.push(record.uri);
	}

	if (newPosts.length === 0) return;

	// fetch each post record
	const posts = await Promise.all(
		newPosts.map(async (uri) => {
			const result = await client.getRecordUri(AppBskyFeedPost.mainSchema, uri);
			if (!result.ok) return null;
			return { uri: result.value.uri, cid: result.value.cid, record: result.value.record };
		})
	);

	const validPosts = posts.filter((p): p is PostWithUri => p !== null);
	addPosts(validPosts);

	for (const post of validPosts) userFeed.add(post.uri);

	// check if any of the post authors block the user
	await fetchBlocksForPosts(
		client,
		validPosts.map((p) => p.uri)
	);
};

// if did is in set, we have fetched blocks for them already (against logged in users)
export const blockFlags = new SvelteMap<Did, SvelteSet<Did>>();

export const fetchBlocked = async (client: AtpClient, subject: Did, blocker: Did) => {
	const subjectUri = `at://${subject}` as ResourceUri;
	const res = await client.getBacklinks(subjectUri, blockSource, [blocker], 1);
	if (!res.ok) return false;
	if (res.value.total > 0) addBacklinks(subjectUri, blockSource, res.value.records);

	// mark as fetched
	let flags = blockFlags.get(subject);
	if (!flags) {
		flags = new SvelteSet();
		blockFlags.set(subject, flags);
	}
	flags.add(blocker);

	return res.value.total > 0;
};

export const fetchBlocksForPosts = async (client: AtpClient, postUris: Iterable<ResourceUri>) => {
	const userDid = client.user?.did;
	if (!userDid) return;

	// check if any of the post authors block the user
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	let distinctDids = new Set(Array.from(postUris).map((uri) => extractDidFromUri(uri)!));
	distinctDids.delete(userDid); // dont need to check if user blocks themselves
	const alreadyFetched = blockFlags.get(userDid);
	if (alreadyFetched) distinctDids = distinctDids.difference(alreadyFetched);
	if (distinctDids.size > 0)
		await Promise.all(distinctDids.values().map((did) => fetchBlocked(client, userDid, did)));
};

export const fetchBlocks = async (account: Account) => {
	const client = clients.get(account.did)!;
	const res = await client.listRecordsUntil(account.did, 'app.bsky.graph.block');
	if (!res.ok) return;
	for (const block of res.value.records) {
		const record = block.value as AppBskyGraphBlock.Main;
		const parsedUri = expect(parseCanonicalResourceUri(block.uri));
		addBacklinks(`at://${record.subject}`, blockSource, [
			{
				did: parsedUri.repo,
				collection: parsedUri.collection,
				rkey: parsedUri.rkey
			}
		]);
	}
};

export const createBlock = async (client: AtpClient, targetDid: Did) => {
	const userDid = client.user?.did;
	if (!userDid) return;

	const rkey = tidNow();
	const targetUri = `at://${targetDid}` as ResourceUri;

	addBacklinks(targetUri, blockSource, [
		{
			did: userDid,
			collection: 'app.bsky.graph.block',
			rkey
		}
	]);

	const record: AppBskyGraphBlock.Main = {
		$type: 'app.bsky.graph.block',
		subject: targetDid,
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		createdAt: new Date().toISOString()
	};

	await client.user?.atcute.post('com.atproto.repo.createRecord', {
		input: {
			repo: userDid,
			collection: 'app.bsky.graph.block',
			rkey,
			record
		}
	});
};

export const deleteBlock = async (client: AtpClient, targetDid: Did) => {
	const userDid = client.user?.did;
	if (!userDid) return;

	const targetUri = `at://${targetDid}` as ResourceUri;
	const links = findBacklinksBy(targetUri, blockSource, userDid);

	removeBacklinks(targetUri, blockSource, links);

	await Promise.allSettled(
		links.map((link) =>
			client.user?.atcute.post('com.atproto.repo.deleteRecord', {
				input: {
					repo: userDid,
					collection: 'app.bsky.graph.block',
					rkey: link.rkey
				}
			})
		)
	);
};

export const isBlockedByUser = (targetDid: Did, userDid: Did): boolean => {
	return isBlockedBy(targetDid, userDid);
};

export const isUserBlockedBy = (userDid: Did, targetDid: Did): boolean => {
	return isBlockedBy(userDid, targetDid);
};

export const hasBlockRelationship = (did1: Did, did2: Did): boolean => {
	return isBlockedBy(did1, did2) || isBlockedBy(did2, did1);
};

export const getBlockRelationship = (
	userDid: Did,
	targetDid: Did
): { userBlocked: boolean; blockedByTarget: boolean } => {
	return {
		userBlocked: isBlockedBy(targetDid, userDid),
		blockedByTarget: isBlockedBy(userDid, targetDid)
	};
};

export const allPosts = new SvelteMap<Did, SvelteMap<ResourceUri, PostWithUri>>();
export type DeletedPostInfo = { reply?: PostWithUri['record']['reply'] };
export const deletedPosts = new SvelteMap<ResourceUri, DeletedPostInfo>();
// did -> post uris that are replies to that did
export const replyIndex = new SvelteMap<Did, SvelteSet<ResourceUri>>();

export const getPost = (did: Did, rkey: RecordKey) =>
	allPosts.get(did)?.get(toCanonicalUri({ did, collection: 'app.bsky.feed.post', rkey }));

export const getPostFromUri = (uri: ResourceUri) => {
	const did = extractDidFromUri(uri);
	return did ? allPosts.get(did)?.get(uri) : undefined;
};

const hydrateCacheFn: Parameters<typeof hydratePosts>[3] = (did, rkey) => {
	const cached = getPost(did, rkey);
	return cached ? ok(cached) : undefined;
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
			const link = {
				did: parsedUri.repo,
				collection: parsedUri.collection,
				rkey: parsedUri.rkey
			};
			addBacklinks(post.record.reply.parent.uri, replySource, [link]);
			addBacklinks(post.record.reply.root.uri, replyRootSource, [link]);

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

export const deletePost = (uri: ResourceUri) => {
	const did = extractDidFromUri(uri)!;
	const post = allPosts.get(did)?.get(uri);
	if (!post) return;
	allPosts.get(did)?.delete(uri);
	// remove reply from index
	const subjectDid = extractDidFromUri(post.record.reply?.parent.uri ?? '');
	if (subjectDid) replyIndex.get(subjectDid)?.delete(uri);
	deletedPosts.set(uri, { reply: post.record.reply });
};

export const timelines = new SvelteMap<Did, SvelteSet<ResourceUri>>();
export const postCursors = new SvelteMap<Did, { value?: string; end: boolean }>();

// feed state: Did -> feedUri -> post URIs
export const feedTimelines = new SvelteMap<Did, SvelteMap<string, ResourceUri[]>>();
export const feedCursors = new SvelteMap<Did, SvelteMap<string, { value?: string; end: boolean }>>();

export const followingFeed = new SvelteMap<Did, SvelteSet<ResourceUri>>(); // merged timeline: UserDid -> Set<Uri>
export const followingBuffer = new SvelteMap<Did, SvelteSet<ResourceUri>>(); // buffer: UserDid -> Set<Uri>
export const followingCursors = new SvelteMap<Did, SvelteMap<Did, string | null>>(); // cursors: UserDid -> SubjectDid -> Cursor

export const fetchFeed = async (
	client: AtpClient,
	feedUri: string,
	feedServiceDid: string,
	limit: number = 10
) => {
	const userDid = client.user?.did;
	if (!userDid) return;

	let userFeedCursors = feedCursors.get(userDid);
	if (!userFeedCursors) {
		userFeedCursors = new SvelteMap();
		feedCursors.set(userDid, userFeedCursors);
	}

	const cursor = userFeedCursors.get(feedUri);
	if (cursor?.end) return;

	const skeleton = await import('./at/feeds').then((m) =>
		m.fetchFeedSkeleton(client, feedUri, feedServiceDid, cursor?.value, limit)
	);
	if (!skeleton) throw `failed to fetch feed skeleton for ${feedUri}`;

	const newCursor = { value: skeleton.cursor, end: skeleton.feed.length === 0 };
	userFeedCursors.set(feedUri, newCursor);

	const uris = skeleton.feed.slice(0, limit).map((item) => item.post as ResourceUri);

	let userFeedTimelines = feedTimelines.get(userDid);
	if (!userFeedTimelines) {
		userFeedTimelines = new SvelteMap();
		feedTimelines.set(userDid, userFeedTimelines);
	}

	const existing = userFeedTimelines.get(feedUri) ?? [];
	userFeedTimelines.set(feedUri, [...existing, ...uris]);

	// fetch each post record
	const posts = await Promise.all(
		uris.map(async (uri) => {
			const result = await client.getRecordUri(AppBskyFeedPost.mainSchema, uri);
			if (!result.ok) return null;
			return { uri: result.value.uri, cid: result.value.cid, record: result.value.record };
		})
	);

	const validPosts = posts.filter((p): p is PostWithUri => p !== null);
	addPosts(validPosts);

	// check if any of the post authors block the user
	await fetchBlocksForPosts(
		client,
		validPosts.map((p) => p.uri)
	);

	return newCursor;
};

export const checkForNewPosts = async (client: AtpClient, feedUri: string, feedServiceDid: string) => {
	const userDid = client.user?.did;
	if (!userDid) return false;

	const currentFeed = feedTimelines.get(userDid)?.get(feedUri);
	if (!currentFeed || currentFeed.length === 0) return false;

	const skeleton = await import('./at/feeds').then((m) =>
		m.fetchFeedSkeleton(client, feedUri, feedServiceDid, undefined, 1)
	);

	if (skeleton && skeleton.feed.length > 0) {
		const latestPost = skeleton.feed[0].post;
		return latestPost !== currentFeed[0];
	}

	return false;
};

export const resetFeed = (did: Did, feedUri: string) => {
	feedTimelines.get(did)?.delete(feedUri);
	feedCursors.get(did)?.delete(feedUri);
};


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
	client: AtpClient,
	subject: Did,
	limit: number = 6,
	withBacklinks: boolean = true,
	hydrateOptions?: Partial<HydrateOptions>
) => {
	const cursor = postCursors.get(subject);
	if (cursor && cursor.end) return;

	const accPosts = await fetchPosts(subject, client, cursor?.value, limit, withBacklinks);
	if (!accPosts.ok) throw `cant fetch posts ${subject}: ${accPosts.error}`;

	// if the cursor is undefined, we've reached the end of the timeline
	const newCursor = { value: accPosts.value.cursor, end: !accPosts.value.cursor };
	postCursors.set(subject, newCursor);
	const hydrated = await hydratePosts(
		client,
		subject,
		accPosts.value.posts,
		hydrateCacheFn,
		hydrateOptions
	);
	if (!hydrated.ok) throw `cant hydrate posts ${subject}: ${hydrated.error}`;

	addPosts(hydrated.value.values());
	addTimeline(subject, hydrated.value.keys());

	await fetchBlocksForPosts(client, hydrated.value.keys());

	console.log(`${subject}: fetchTimeline`, accPosts.value.cursor);
	return newCursor;
};

export const fetchInteractionsToTimelineEnd = async (
	client: AtpClient,
	interactor: Did,
	subject: Did
) => {
	const cursor = postCursors.get(subject);
	if (!cursor) return;
	const timestamp = timestampFromCursor(cursor.value);
	await Promise.all(
		[likeSource, repostSource].map((s) => fetchLinksUntil(interactor, client, s, timestamp))
	);
};

export const fetchInteractionsToFollowingTimelineEnd = async (
	client: AtpClient,
	userDid: Did
) => {
	const userCursors = followingCursors.get(userDid);
	if (!userCursors) return;

	const feed = followingFeed.get(userDid);
	if (!feed || feed.size === 0) return;

	let minTimestamp = Date.now();
	let found = false;

	for (const uri of feed) {
		const post = getPostFromUri(uri);
		if (post) {
			const ts = new Date(post.record.createdAt).getTime();
			if (ts < minTimestamp) minTimestamp = ts;
			found = true;
		}
	}

	if (!found) return;

	await Promise.all(
		[likeSource, repostSource].map((s) => fetchLinksUntil(userDid, client, s, minTimestamp))
	);
};

export const fetchInteractionsToFeedTimelineEnd = async (
	client: AtpClient,
	userDid: Did,
	feedUri: string
) => {
	const userFeedTimelines = feedTimelines.get(userDid);
	if (!userFeedTimelines) return;
	const posts = userFeedTimelines.get(feedUri);
	if (!posts || posts.length === 0) return;

	let minTimestamp = Date.now();
	let found = false;

	for (const uri of posts) {
		const post = getPostFromUri(uri);
		if (post) {
			const ts = new Date(post.record.createdAt).getTime();
			if (ts < minTimestamp) minTimestamp = ts;
			found = true;
		}
	}

	if (!found) return;

	await Promise.all(
		[likeSource, repostSource].map((s) => fetchLinksUntil(userDid, client, s, minTimestamp))
	);
};

export const initialDone = new SvelteSet<Did>();
export const fetchInitial = async (account: Account) => {
	const client = clients.get(account.did)!;
	await Promise.all([
		fetchBlocks(account),
		fetchForInteractions(client, account.did),
		fetchFollows(account).then((follows) =>
			Promise.all(follows.map((follow) => fetchForInteractions(client, follow.subject)) ?? [])
		)
	]);
	initialDone.add(account.did);
};

export const handleJetstreamEvent = async (event: JetstreamEvent) => {
	if (event.kind !== 'commit') return;

	const { did, commit } = event;
	const uri: ResourceUri = toCanonicalUri({ did, ...commit });
	if (commit.collection === 'app.bsky.feed.post') {
		if (commit.operation === 'create') {
			const record = commit.record as AppBskyFeedPost.Main;
			const posts = [
				{
					record,
					uri,
					cid: commit.cid
				}
			];
			await setRecordCache(uri, record);
			const client = clients.get(did) ?? viewClient;
			const hydrated = await hydratePosts(client, did, posts, hydrateCacheFn);
			if (!hydrated.ok) {
				console.error(`cant hydrate posts ${did}: ${hydrated.error}`);
				return;
			}
			addPosts(hydrated.value.values());
			addTimeline(did, hydrated.value.keys());

			if (record.reply) {
				const parentDid = extractDidFromUri(record.reply.parent.uri)!;
				addTimeline(parentDid, [uri]);
			}

			// Broadcast to following feeds of local accounts
			for (const account of get(accounts)) {
				// does this account follow the author?
				let isFollowing = account.did === did;
				if (!isFollowing) {
					const accountFollows = follows.get(account.did);
					if (accountFollows?.has(did)) isFollowing = true;
				}

				if (isFollowing) {
					const feed = followingFeed.get(account.did);
					if (feed) for (const uri of hydrated.value.keys()) feed.add(uri);
				}
			}
		} else if (commit.operation === 'delete') {
			deletePost(uri);
		}
	}
};

const handlePostNotification = async (event: NotificationsStreamEvent & { type: 'message' }) => {
	const parsedSubjectUri = expect(parseCanonicalResourceUri(event.data.link.subject));
	const did = parsedSubjectUri.repo as AtprotoDid;
	const client = clients.get(did);
	if (!client) {
		console.error(`${did}: cant handle post notification, client not found !?`);
		return;
	}
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
