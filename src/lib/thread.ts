// updated src/lib/thread.ts

import { parseCanonicalResourceUri, type Did, type ResourceUri } from '@atcute/lexicons';
import type { Account } from './accounts';
import { expect } from './result';
import type { PostWithUri } from './at/fetch';
import { isBlockedBy } from './state.svelte';
import { timestampFromCursor } from '$lib';

export type ThreadPost = {
	data: PostWithUri;
	account: Did;
	did: Did;
	rkey: string;
	parentUri: ResourceUri | null;
	depth: number;
	newestTime: number;
	isBlocked?: boolean;
	isMuted?: boolean;
};

export type Thread = {
	rootUri: ResourceUri;
	posts: ThreadPost[];
	newestTime: number;
	branchParentPost?: ThreadPost;
};

export const buildThreads = (
	account: Did,
	timeline: Set<ResourceUri>,
	posts: Map<Did, Map<ResourceUri, PostWithUri>>,
	mutes: Did[],
): Thread[] => {
	const threadMap = new Map<ResourceUri, ThreadPost[]>();

	// group posts by root uri into "thread" chains
	for (const uri of timeline) {
		const parsedUri = expect(parseCanonicalResourceUri(uri));
		const data = posts.get(parsedUri.repo)?.get(uri);
		if (!data) continue;

		const rootUri = (data.record.reply?.root.uri as ResourceUri) || uri;
		const parentUri = (data.record.reply?.parent.uri as ResourceUri) || null;

		const cursorTime = timestampFromCursor(parsedUri.rkey);
		const post: ThreadPost = {
			data,
			account,
			did: parsedUri.repo,
			rkey: parsedUri.rkey,
			parentUri,
			depth: 0,
			newestTime: cursorTime ? cursorTime / 1000 : new Date(data.record.createdAt).getTime(),
			isBlocked: isBlockedBy(parsedUri.repo, account),
			isMuted: mutes.includes(parsedUri.repo),
		};

		if (!threadMap.has(rootUri)) threadMap.set(rootUri, []);

		threadMap.get(rootUri)!.push(post);
	}

	const threads: Thread[] = [];

	for (const [rootUri, posts] of threadMap) {
		const uriToPost = new Map(posts.map((p) => [p.data.uri, p]));
		const childrenMap = new Map<ResourceUri | null, ThreadPost[]>();

		// calculate depths
		for (const post of posts) {
			let depth = 0;
			let currentUri = post.parentUri;

			while (currentUri && uriToPost.has(currentUri)) {
				depth++;
				currentUri = uriToPost.get(currentUri)!.parentUri;
			}

			post.depth = depth;

			if (!childrenMap.has(post.parentUri)) childrenMap.set(post.parentUri, []);
			childrenMap.get(post.parentUri)!.push(post);
		}

		childrenMap
			.values()
			.forEach((children) => children.sort((a, b) => b.newestTime - a.newestTime));

		const createThread = (
			posts: ThreadPost[],
			rootUri: ResourceUri,
			branchParentUri?: ResourceUri
		): Thread => {
			return {
				rootUri,
				posts,
				newestTime: Math.max(...posts.map((p) => p.newestTime)),
				branchParentPost: branchParentUri ? uriToPost.get(branchParentUri) : undefined
			};
		};

		const collectSubtree = (startPost: ThreadPost): ThreadPost[] => {
			const result: ThreadPost[] = [];
			const addWithChildren = (post: ThreadPost) => {
				result.push(post);
				const children = childrenMap.get(post.data.uri) || [];
				children.forEach(addWithChildren);
			};
			addWithChildren(startPost);
			return result;
		};

		// find posts with >2 children to split them into separate chains
		const branchingPoints = Array.from(childrenMap.entries())
			.filter(([, children]) => children.length > 1)
			.map(([uri]) => uri);

		if (branchingPoints.length === 0) {
			const roots = childrenMap.get(null) || [];
			const allPosts = roots.flatMap((root) => collectSubtree(root));
			threads.push(createThread(allPosts, rootUri));
		} else {
			for (const branchParentUri of branchingPoints) {
				const branches = childrenMap.get(branchParentUri) || [];

				const sortedBranches = [...branches].sort((a, b) => a.newestTime - b.newestTime);

				sortedBranches.forEach((branchRoot, index) => {
					const isOldestBranch = index === 0;
					const branchPosts: ThreadPost[] = [];

					// the oldest branch has the full context
					// todo: consider letting the user decide this..?
					if (isOldestBranch && branchParentUri !== null) {
						const parentChain: ThreadPost[] = [];
						let currentUri: ResourceUri | null = branchParentUri;
						while (currentUri && uriToPost.has(currentUri)) {
							parentChain.unshift(uriToPost.get(currentUri)!);
							currentUri = uriToPost.get(currentUri)!.parentUri;
						}
						branchPosts.push(...parentChain);
					}

					branchPosts.push(...collectSubtree(branchRoot));

					const minDepth = Math.min(...branchPosts.map((p) => p.depth));
					branchPosts.forEach((p) => (p.depth = p.depth - minDepth));

					threads.push(
						createThread(
							branchPosts,
							branchRoot.data.uri,
							isOldestBranch ? undefined : (branchParentUri ?? undefined)
						)
					);
				});
			}
		}
	}

	threads.sort((a, b) => b.newestTime - a.newestTime);

	return threads;
};

export const isOwnPost = (post: ThreadPost, accounts: Account[]) =>
	accounts.some((account) => account.did === post.did);
export const hasNonOwnPost = (posts: ThreadPost[], accounts: Account[]) =>
	posts.some((post) => !isOwnPost(post, accounts));

export type FilterOptions = {
	viewOwnPosts: boolean;
	filterReplies?: boolean;
	filterRootsToDids?: Set<Did>;
};

export const filterThreads = (threads: Thread[], accounts: Account[], opts: FilterOptions) =>
	threads.filter((thread) => {
		if (thread.posts.length === 0) return false;
		if (opts.filterReplies && thread.posts[0].data.record.reply) return false;

		if (!opts.viewOwnPosts) if (hasNonOwnPost(thread.posts, accounts)) return false;

		if (opts.filterRootsToDids) {
			const rootDid = extractDidFromUri(thread.rootUri);
			if (
				rootDid &&
				!opts.filterRootsToDids.has(rootDid) &&
				!accounts.some((a) => a.did === rootDid)
			) {
				return false;
			}
		}

		return true;
	});

// Helper to extract DID from URI if not already imported from elsewhere
const extractDidFromUri = (uri: ResourceUri): Did | null => {
	const match = uri.match(/^at:\/\/(did:plc:[a-z0-9]+)/);
	return match ? (match[1] as Did) : null;
};
