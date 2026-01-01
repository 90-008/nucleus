import {
	parseCanonicalResourceUri,
	type CanonicalResourceUri,
	type Cid,
	type ResourceUri
} from '@atcute/lexicons';
import { type AtpClient } from './client';
import { err, expect, ok, type Ok, type Result } from '$lib/result';
import type { Backlinks } from './constellation';
import { AppBskyFeedPost } from '@atcute/bluesky';
import type { AtprotoDid, Did, RecordKey } from '@atcute/lexicons/syntax';
import { replySource, toCanonicalUri } from '$lib';

export type PostWithUri = { uri: ResourceUri; cid: Cid | undefined; record: AppBskyFeedPost.Main };
export type PostWithBacklinks = PostWithUri & {
	replies?: Backlinks;
};

export const fetchPosts = async (
	client: AtpClient,
	cursor?: string,
	limit?: number,
	withBacklinks: boolean = true
): Promise<Result<{ posts: PostWithBacklinks[]; cursor?: string }, string>> => {
	const recordsList = await client.listRecords('app.bsky.feed.post', cursor, limit);
	if (!recordsList.ok) return err(`can't retrieve posts: ${recordsList.error}`);
	cursor = recordsList.value.cursor;
	const records = recordsList.value.records;

	if (!withBacklinks) {
		return ok({
			posts: records.map((r) => ({
				uri: r.uri,
				cid: r.cid,
				record: r.value as AppBskyFeedPost.Main
			})),
			cursor
		});
	}

	try {
		const allBacklinks = await Promise.all(
			records.map(async (r): Promise<PostWithBacklinks> => {
				const result = await client.getBacklinksUri(r.uri, replySource);
				if (!result.ok) throw `cant fetch replies: ${result.error}`;
				const replies = result.value;
				return {
					uri: r.uri,
					cid: r.cid,
					record: r.value as AppBskyFeedPost.Main,
					replies
				};
			})
		);
		return ok({ posts: allBacklinks, cursor });
	} catch (error) {
		return err(`cant fetch posts backlinks: ${error}`);
	}
};

export const hydratePosts = async (
	client: AtpClient,
	repo: AtprotoDid,
	data: PostWithBacklinks[],
	cacheFn: (did: Did, rkey: RecordKey) => Ok<PostWithUri> | undefined
): Promise<Result<Map<ResourceUri, PostWithUri>, string>> => {
	let posts: Map<ResourceUri, PostWithUri> = new Map();
	try {
		const allPosts = await Promise.all(
			data.map(async (post) => {
				const result: PostWithUri[] = [post];
				if (post.replies) {
					const replies = await Promise.all(
						post.replies.records.map(async (r) => {
							const reply =
								cacheFn(r.did, r.rkey) ??
								(await client.getRecord(AppBskyFeedPost.mainSchema, r.did, r.rkey));
							if (!reply.ok) throw `cant fetch reply: ${reply.error}`;
							return reply.value;
						})
					);
					result.push(...replies);
				}
				return result;
			})
		);
		posts = new Map(allPosts.flat().map((post) => [post.uri, post]));
	} catch (error) {
		return err(`cant hydrate immediate replies: ${error}`);
	}

	const fetchUpwardsChain = async (post: PostWithUri) => {
		let parent = post.record.reply?.parent;
		while (parent) {
			const parentUri = parent.uri as CanonicalResourceUri;
			// if we already have this parent, then we already fetched this chain / are fetching it
			if (posts.has(parentUri)) return;
			const parsedParentUri = expect(parseCanonicalResourceUri(parentUri));
			const p =
				cacheFn(parsedParentUri.repo, parsedParentUri.rkey) ??
				(await client.getRecord(
					AppBskyFeedPost.mainSchema,
					parsedParentUri.repo,
					parsedParentUri.rkey
				));
			if (p.ok) {
				posts.set(p.value.uri, p.value);
				parent = p.value.record.reply?.parent;
				continue;
			}
			// TODO: handle deleted parent posts
			parent = undefined;
		}
	};
	await Promise.all(posts.values().map(fetchUpwardsChain));

	try {
		const fetchDownwardsChain = async (post: PostWithUri) => {
			const { repo: postRepo } = expect(parseCanonicalResourceUri(post.uri));
			if (repo === postRepo) return;

			// get chains that are the same author until we exhaust them
			const backlinks = await client.getBacklinksUri(post.uri, replySource);
			if (!backlinks.ok) return;

			const promises = [];
			for (const reply of backlinks.value.records) {
				if (reply.did !== postRepo) continue;
				// if we already have this reply, then we already fetched this chain / are fetching it
				if (posts.has(toCanonicalUri(reply))) continue;
				const record =
					cacheFn(reply.did, reply.rkey) ??
					(await client.getRecord(AppBskyFeedPost.mainSchema, reply.did, reply.rkey));
				if (!record.ok) break; // TODO: this doesnt handle deleted posts in between
				posts.set(record.value.uri, record.value);
				promises.push(fetchDownwardsChain(record.value));
			}

			await Promise.all(promises);
		};
		await Promise.all(posts.values().map(fetchDownwardsChain));
	} catch (error) {
		return err(`cant fetch post reply chain: ${error}`);
	}

	return ok(posts);
};
