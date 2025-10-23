import type { ActorIdentifier, CanonicalResourceUri, Cid, ResourceUri } from '@atcute/lexicons';
import { recordCache, type AtpClient } from './client';
import { err, ok, type Result } from '$lib/result';
import type { Backlinks } from './constellation';
import { AppBskyFeedPost } from '@atcute/bluesky';

export type PostWithUri = { uri: ResourceUri; cid: Cid | undefined; record: AppBskyFeedPost.Main };
export type PostWithBacklinks = PostWithUri & {
	replies: Result<Backlinks, string>;
};
export type PostsWithReplyBacklinks = PostWithBacklinks[];

export const fetchPostsWithBacklinks = async (
	client: AtpClient,
	repo: ActorIdentifier,
	cursor?: string,
	limit?: number
): Promise<Result<{ posts: PostsWithReplyBacklinks; cursor?: string }, string>> => {
	const recordsList = await client.listRecords('app.bsky.feed.post', repo, cursor, limit);
	if (!recordsList.ok) return err(`can't retrieve posts: ${recordsList.error}`);
	cursor = recordsList.value.cursor;
	const records = recordsList.value.records;

	const allBacklinks = await Promise.all(
		records.map(async (r) => {
			recordCache.set(r.uri, r);
			const res = await client.getBacklinksUri(
				r.uri as CanonicalResourceUri,
				'app.bsky.feed.post:reply.parent.uri'
			);
			return {
				uri: r.uri,
				cid: r.cid,
				record: r.value as AppBskyFeedPost.Main,
				replies: res
			};
		})
	);

	return ok({ posts: allBacklinks, cursor });
};

export const hydratePosts = async (
	client: AtpClient,
	data: PostsWithReplyBacklinks
): Promise<Map<ResourceUri, PostWithUri>> => {
	const allPosts = await Promise.all(
		data.map(async (post) => {
			const result: Result<PostWithUri, string>[] = [ok(post)];
			if (post.replies.ok) {
				const replies = await Promise.all(
					post.replies.value.records.map((r) =>
						client.getRecord(AppBskyFeedPost.mainSchema, r.did, r.rkey)
					)
				);
				result.push(...replies);
			}
			return result;
		})
	);
	const posts = new Map(
		allPosts
			.flat()
			.flatMap((res) => (res.ok ? [res.value] : []))
			.map((post) => [post.uri, post])
	);

	// hydrate posts
	const missingPosts = await Promise.all(
		Array.from(posts).map(async ([, post]) => {
			let result: PostWithUri[] = [post];
			let parent = post.record.reply?.parent;
			while (parent) {
				if (posts.has(parent.uri as CanonicalResourceUri)) {
					return result;
				}
				const p = await client.getRecordUri(AppBskyFeedPost.mainSchema, parent.uri);
				if (p.ok) {
					result = [p.value, ...result];
					parent = p.value.record.reply?.parent;
					continue;
				}
				parent = undefined;
			}
			return result;
		})
	);
	for (const post of missingPosts.flat()) {
		posts.set(post.uri, post);
	}

	return posts;
};
