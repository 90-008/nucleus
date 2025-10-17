import type { ActorIdentifier, CanonicalResourceUri } from '@atcute/lexicons';
import type { AtpClient } from './client';
import { err, map, ok, type Result } from '$lib/result';
import type { Backlinks } from './constellation';
import { AppBskyFeedPost } from '@atcute/bluesky';

export type PostWithBacklinks = {
	post: AppBskyFeedPost.Main;
	replies: Backlinks | string;
};
export type PostsWithReplyBacklinks = Map<CanonicalResourceUri, PostWithBacklinks>;

export const fetchPostsWithReplyBacklinks = async (
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
				.then((res) => ({
					key: r.uri as CanonicalResourceUri,
					value: {
						post: r.value as AppBskyFeedPost.Main,
						replies: res.ok ? res.value : res.error
					}
				}))
		)
	);

	return ok({ posts: new Map(allBacklinks.map((b) => [b.key, b.value])), cursor });
};

export const fetchReplies = async (client: AtpClient, data: PostsWithReplyBacklinks) => {
	const allReplies = await Promise.all(
		Array.from(data.values()).map(async (d) => {
			if (typeof d.replies === 'string') return [];
			const replies = await Promise.all(
				d.replies.records.map((r) =>
					client
						.getRecord(AppBskyFeedPost.mainSchema, r.did, r.rkey)
						.then((res) =>
							map(res, (d) => ({ uri: `at://${r.did}/app.bsky.feed.post/${r.rkey}`, record: d }))
						)
				)
			);
			return replies;
		})
	);

	return allReplies.flat();
};
