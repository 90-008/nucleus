import {
	parseCanonicalResourceUri,
	type CanonicalResourceUri,
	type Cid,
	type ResourceUri
} from '@atcute/lexicons';
import { type AtpClient } from './client';
import { err, expect, ok, type Result } from '$lib/result';
import type { Backlinks } from './constellation';
import { AppBskyFeedPost } from '@atcute/bluesky';
import type { AtprotoDid } from '@atcute/lexicons/syntax';
import { replySource } from '$lib';

export type PostWithUri = { uri: ResourceUri; cid: Cid | undefined; record: AppBskyFeedPost.Main };
export type PostWithBacklinks = PostWithUri & {
	replies: Backlinks;
};
export type PostsWithReplyBacklinks = PostWithBacklinks[];

export const fetchPostsWithBacklinks = async (
	client: AtpClient,
	cursor?: string,
	limit?: number
): Promise<Result<{ posts: PostsWithReplyBacklinks; cursor?: string }, string>> => {
	const recordsList = await client.listRecords('app.bsky.feed.post', cursor, limit);
	if (!recordsList.ok) return err(`can't retrieve posts: ${recordsList.error}`);
	cursor = recordsList.value.cursor;
	const records = recordsList.value.records;

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
	data: PostsWithReplyBacklinks
): Promise<Result<Map<ResourceUri, PostWithUri>, string>> => {
	let posts: Map<ResourceUri, PostWithUri> = new Map();
	try {
		const allPosts = await Promise.all(
			data.map(async (post) => {
				const result: PostWithUri[] = [post];
				const replies = await Promise.all(
					post.replies.records.map(async (r) => {
						const reply = await client.getRecord(AppBskyFeedPost.mainSchema, r.did, r.rkey);
						if (!reply.ok) throw `cant fetch reply: ${reply.error}`;
						return reply.value;
					})
				);
				result.push(...replies);
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
			const p = await client.getRecordUri(AppBskyFeedPost.mainSchema, parentUri);
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
				if (posts.has(`at://${reply.did}/${reply.collection}/${reply.rkey}`)) continue;
				const record = await client.getRecord(AppBskyFeedPost.mainSchema, reply.did, reply.rkey);
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
