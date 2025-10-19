import type { ActorIdentifier, CanonicalResourceUri } from '@atcute/lexicons';
import type { AtpClient } from './client';
import { err, map, ok, type Result } from '$lib/result';
import type { Backlinks } from './constellation';
import { AppBskyFeedPost } from '@atcute/bluesky';

export type PostWithUri = { uri: CanonicalResourceUri; record: AppBskyFeedPost.Main };
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
		records.map((r) =>
			client
				.getBacklinksUri(r.uri as CanonicalResourceUri, 'app.bsky.feed.post:reply.parent.uri')
				.then(
					(res): PostWithBacklinks => ({
						uri: r.uri as CanonicalResourceUri,
						record: r.value as AppBskyFeedPost.Main,
						replies: res
					})
				)
		)
	);

	return ok({ posts: allBacklinks, cursor });
};

export const hydratePosts = async (
	client: AtpClient,
	data: PostsWithReplyBacklinks
): Promise<Map<CanonicalResourceUri, AppBskyFeedPost.Main>> => {
	const allPosts = await Promise.all(
		data.map(async (post) => {
			const result: Result<PostWithUri, string>[] = [ok({ uri: post.uri, record: post.record })];
			if (post.replies.ok) {
				const replies = await Promise.all(
					post.replies.value.records.map((r) =>
						client.getRecord(AppBskyFeedPost.mainSchema, r.did, r.rkey).then((res) =>
							map(
								res,
								(d): PostWithUri => ({
									uri: `at://${r.did}/app.bsky.feed.post/${r.rkey}` as CanonicalResourceUri,
									record: d
								})
							)
						)
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
			.map((post) => [post.uri, post.record])
	);

	// hydrate posts
	const missingPosts = await Promise.all(
		Array.from(posts).map(async ([uri, record]) => {
			let result: PostWithUri[] = [{ uri, record }];
			let parent = record.reply?.parent;
			while (parent) {
				if (posts.has(parent.uri as CanonicalResourceUri)) {
					return result;
				}
				const p = await client.getRecordUri(AppBskyFeedPost.mainSchema, parent.uri);
				if (p.ok) {
					result = [{ uri: parent.uri as CanonicalResourceUri, record: p.value }, ...result];
					parent = p.value.reply?.parent;
					continue;
				}
				parent = undefined;
			}
			return result;
		})
	);
	for (const post of missingPosts.flat()) {
		posts.set(post.uri, post.record);
	}

	return posts;
};
