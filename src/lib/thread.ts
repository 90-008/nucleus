import { type Did, type ResourceUri } from '@atcute/lexicons';
import type { Account } from './accounts';
import type { PostWithUri } from './at/fetch';
import { getBlockRelationship, postsByRootUri } from './state.svelte';
import { timestampFromCursor } from '$lib';

export type ThreadPost = {
	data: PostWithUri;
	account: Did;
	did: Did;
	rkey: string;
	parentUri: ResourceUri | null;
	depth: number;
	newestTime: number;
	blockRelationship?: { userBlocked: boolean; blockedByTarget: boolean };
	isMuted?: boolean;
};

export type Thread = {
	rootUri: ResourceUri;
	posts: ThreadPost[];
	newestTime: number;
	branchParentPost?: ThreadPost;
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

type ThreadGroup = {
	rootUri: ResourceUri;
	posts: ThreadPost[];
	newestTime: number;
	isReply: boolean;
	rootDid: Did | null;
};

export const buildThreadsFiltered = (
	account: Did,
	timeline: Set<ResourceUri>,
	posts: Map<ResourceUri, PostWithUri>,
	mutes: Set<Did>,
	accounts: Account[],
	opts: FilterOptions,
	limit?: number
): Thread[] => {
	const blockCache = new Map<Did, { userBlocked: boolean; blockedByTarget: boolean }>();
	const getBlockRel = (target: Did) => {
		let rel = blockCache.get(target);
		if (!rel) {
			rel = getBlockRelationship(account, target);
			blockCache.set(target, rel);
		}
		return rel;
	};

	// phase 1: find distinct root URIs from timeline and build groups using pre-computed index
	const rootUrisFromTimeline = new Set<ResourceUri>();
	for (const uri of timeline) {
		const did = extractDidFromUri(uri);
		if (!did) continue;
		const data = posts.get(uri);
		if (!data) continue;
		const rootUri = (data.record.reply?.root.uri as ResourceUri) || uri;
		rootUrisFromTimeline.add(rootUri);
	}

	const groups = new Map<ResourceUri, ThreadGroup>();
	for (const rootUri of rootUrisFromTimeline) {
		const postUris = postsByRootUri.get(rootUri);
		if (!postUris) continue;

		let group: ThreadGroup | undefined;

		for (const uri of postUris) {
			if (!timeline.has(uri)) continue;
			const did = extractDidFromUri(uri);
			if (!did) continue;
			const parts = uri.split('/');
			if (parts.length < 5) continue;
			const rkey = parts[4];

			const data = posts.get(uri);
			if (!data) continue;

			const parentUri = (data.record.reply?.parent.uri as ResourceUri) || null;
			const isReply = !!data.record.reply;

			const cursorTime = timestampFromCursor(rkey);
			const postTime = cursorTime ? cursorTime / 1000 : new Date(data.record.createdAt).getTime();

			if (!group) {
				group = {
					rootUri,
					posts: [],
					newestTime: postTime,
					isReply,
					rootDid: extractDidFromUri(rootUri)
				};
				groups.set(rootUri, group);
			}

			const blockRel = getBlockRel(did);
			group.posts.push({
				data,
				account,
				did,
				rkey,
				parentUri,
				depth: 0,
				newestTime: postTime,
				blockRelationship: blockRel,
				isMuted: mutes.has(did)
			});

			if (postTime > group.newestTime) group.newestTime = postTime;
		}
	}

	// phase 2: sort groups by newest time descending
	const sortedGroups = Array.from(groups.values()).sort((a, b) => b.newestTime - a.newestTime);

	// phase 3: process groups with pre-filtering and early exit
	const threads: Thread[] = [];

	const shouldIncludeGroup = (group: ThreadGroup): boolean => {
		if (opts.filterReplies && group.isReply) return false;

		if (opts.filterRootsToDids) {
			if (
				group.rootDid &&
				!opts.filterRootsToDids.has(group.rootDid) &&
				!accounts.some((a) => a.did === group.rootDid)
			) {
				return false;
			}
		}

		return true;
	};

	const processGroup = (group: ThreadGroup): Thread[] => {
		const groupPosts = group.posts;
		const uriToPost = new Map(groupPosts.map((p) => [p.data.uri, p]));
		const childrenMap = new Map<ResourceUri | null, ThreadPost[]>();

		for (const post of groupPosts) {
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

		childrenMap.values().forEach((children) => children.sort((a, b) => b.newestTime - a.newestTime));

		const createThread = (
			posts: ThreadPost[],
			rootUri: ResourceUri,
			branchParentUri?: ResourceUri
		): Thread => ({
			rootUri,
			posts,
			newestTime: Math.max(...posts.map((p) => p.newestTime)),
			branchParentPost: branchParentUri ? uriToPost.get(branchParentUri) : undefined
		});

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

		const branchingPoints = Array.from(childrenMap.entries())
			.filter(([, children]) => children.length > 1)
			.map(([uri]) => uri);

		const result: Thread[] = [];

		if (branchingPoints.length === 0) {
			const roots = childrenMap.get(null) || [];
			const allPosts = roots.flatMap((root) => collectSubtree(root));
			result.push(createThread(allPosts, group.rootUri));
		} else {
			for (const branchParentUri of branchingPoints) {
				const branches = childrenMap.get(branchParentUri) || [];
				const sortedBranches = [...branches].sort((a, b) => a.newestTime - b.newestTime);

				sortedBranches.forEach((branchRoot, index) => {
					const isOldestBranch = index === 0;
					const branchPosts: ThreadPost[] = [];

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

					result.push(
						createThread(
							branchPosts,
							branchRoot.data.uri,
							isOldestBranch ? undefined : (branchParentUri ?? undefined)
						)
					);
				});
			}
		}

		return result;
	};

	const passesPostFilter = (thread: Thread): boolean => {
		if (thread.posts.length === 0) return false;
		if (!opts.viewOwnPosts && hasNonOwnPost(thread.posts, accounts)) return false;
		return true;
	};

	for (const group of sortedGroups) {
		if (!shouldIncludeGroup(group)) continue;

		const groupThreads = processGroup(group);

		for (const thread of groupThreads) {
			if (!passesPostFilter(thread)) continue;
			threads.push(thread);
			if (limit && threads.length >= limit) return threads;
		}
	}

	return threads;
};

const extractDidFromUri = (uri: ResourceUri): Did | null => {
	const match = uri.match(/^at:\/\/(did:plc:[a-z0-9]+)/);
	return match ? (match[1] as Did) : null;
};

