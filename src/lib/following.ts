import { type ActorIdentifier, type Did, type ResourceUri } from '@atcute/lexicons';
import type { PostWithUri } from './at/fetch';
import type { BacklinksSource } from './at/constellation';
import { extractDidFromUri, repostSource } from '$lib';
import type { AppBskyGraphFollow } from '@atcute/bluesky';

export type Sort = 'recent' | 'active' | 'conversational';

export const sortFollowedUser = (
	sort: Sort,
	statsA: NonNullable<ReturnType<typeof calculateFollowedUserStats>>,
	statsB: NonNullable<ReturnType<typeof calculateFollowedUserStats>>
) => {
	if (sort === 'conversational') {
		if (Math.abs(statsB.conversationalScore! - statsA.conversationalScore!) > 0.1)
			return statsB.conversationalScore! - statsA.conversationalScore!;
	} else {
		if (sort === 'active')
			if (Math.abs(statsB.activeScore! - statsA.activeScore!) > 0.0001)
				return statsB.activeScore! - statsA.activeScore!;
	}
	return statsB.lastPostAt!.getTime() - statsA.lastPostAt!.getTime();
};

const userStatsCache = new Map<
	Did,
	{ timestamp: number; stats: ReturnType<typeof _calculateStats> }
>();
const STATS_CACHE_TTL = 60 * 1000;

export const calculateFollowedUserStats = (
	sort: Sort,
	did: Did,
	posts: Map<Did, Map<ResourceUri, PostWithUri>>,
	interactionScores: Map<ActorIdentifier, number> | null,
	now: number
) => {
	if (sort === 'active') {
		const cached = userStatsCache.get(did);
		if (cached && now - cached.timestamp < STATS_CACHE_TTL) {
			const postsMap = posts.get(did);
			if (postsMap && postsMap.size > 0) return { ...cached.stats, did };
		}
	}

	const stats = _calculateStats(sort, did, posts, interactionScores, now);

	if (stats && sort === 'active') userStatsCache.set(did, { timestamp: now, stats });

	return stats;
};

const _calculateStats = (
	sort: Sort,
	did: Did,
	posts: Map<Did, Map<ResourceUri, PostWithUri>>,
	interactionScores: Map<ActorIdentifier, number> | null,
	now: number
) => {
	const postsMap = posts.get(did);
	if (!postsMap || postsMap.size === 0) return null;

	let lastPostAtTime = 0;
	let activeScore = 0;
	let recentPostCount = 0;
	const quarterPosts = 6 * 60 * 60 * 1000;
	const gravity = 2.0;

	for (const post of postsMap.values()) {
		const t = new Date(post.record.createdAt).getTime();
		if (t > lastPostAtTime) lastPostAtTime = t;
		const ageMs = Math.max(0, now - t);
		if (ageMs < quarterPosts) recentPostCount++;
		if (sort === 'active') {
			const ageHours = ageMs / (1000 * 60 * 60);
			activeScore += 1 / Math.pow(ageHours + 1, gravity);
		}
	}

	let conversationalScore = 0;
	if (sort === 'conversational' && interactionScores)
		conversationalScore = interactionScores.get(did) || 0;

	return {
		did,
		lastPostAt: new Date(lastPostAtTime),
		activeScore,
		conversationalScore,
		recentPostCount
	};
};

const quoteWeight = 4;
const replyWeight = 6;
const repostWeight = 2;

const oneDay = 24 * 60 * 60 * 1000;
const halfLifeMs = 3 * oneDay;
const decayLambda = 0.693 / halfLifeMs;

const rateBaseline = 1;
const ratePower = 0.5;
const windowSize = 7 * oneDay;

const rateCache = new Map<Did, { rate: number; calculatedAt: number; postCount: number }>();

const getPostRate = (did: Did, posts: Map<ResourceUri, PostWithUri>, now: number): number => {
	const cached = rateCache.get(did);
	if (cached && cached.postCount === posts.size && now - cached.calculatedAt < 5 * 60 * 1000)
		return cached.rate;

	let volume = 0;
	let minTime = now;
	let maxTime = 0;
	let hasRecentPosts = false;

	for (const [, post] of posts) {
		const t = new Date(post.record.createdAt).getTime();
		if (now - t < windowSize) {
			volume += 1;
			if (t < minTime) minTime = t;
			if (t > maxTime) maxTime = t;
			hasRecentPosts = true;
		}
	}

	let rate = 0;
	if (hasRecentPosts) {
		const days = Math.max((maxTime - minTime) / oneDay, 1);
		rate = volume / days;
	}

	rateCache.set(did, { rate, calculatedAt: now, postCount: posts.size });
	return rate;
};

export const calculateInteractionScores = (
	user: Did,
	followsMap: Map<ResourceUri, AppBskyGraphFollow.Main>,
	allPosts: Map<Did, Map<ResourceUri, PostWithUri>>,
	allBacklinks: Map<BacklinksSource, Map<ResourceUri, Map<Did, Set<string>>>>,
	replyIndex: Map<Did, Set<ResourceUri>>,
	now: number
) => {
	const scores = new Map<Did, number>();

	const decay = (time: number) => {
		const age = Math.max(0, now - time);
		return Math.exp(-decayLambda * age);
	};

	const addScore = (did: Did, weight: number, time: number) => {
		const current = scores.get(did) ?? 0;
		scores.set(did, current + weight * decay(time));
	};

	// 1. process my posts (me -> others)
	const myPosts = allPosts.get(user);
	if (myPosts) {
		const seenRoots = new Set<ResourceUri>();
		for (const post of myPosts.values()) {
			const t = new Date(post.record.createdAt).getTime();

			if (post.record.reply) {
				const parentUri = post.record.reply.parent.uri;
				const rootUri = post.record.reply.root.uri;

				const targetDid = extractDidFromUri(parentUri);
				if (targetDid && targetDid !== user) addScore(targetDid, replyWeight, t);

				if (parentUri !== rootUri && !seenRoots.has(rootUri)) {
					const rootDid = extractDidFromUri(rootUri);
					if (rootDid && rootDid !== user) addScore(rootDid, replyWeight, t);
					seenRoots.add(rootUri);
				}
			}

			if (post.record.embed?.$type === 'app.bsky.embed.record') {
				const targetDid = extractDidFromUri(post.record.embed.record.uri);
				if (targetDid && targetDid !== user) addScore(targetDid, quoteWeight, t);
			}
		}
	}

	// 2. process others -> me (using reply index)
	const repliesToMe = replyIndex.get(user);
	if (repliesToMe) {
		for (const uri of repliesToMe) {
			const authorDid = extractDidFromUri(uri);
			if (!authorDid || authorDid === user) continue;

			const postsMap = allPosts.get(authorDid);
			const post = postsMap?.get(uri);
			if (!post) continue;

			const t = new Date(post.record.createdAt).getTime();
			addScore(authorDid, replyWeight, t);
		}
	}

	// 3. process reposts on my posts
	const repostBacklinks = allBacklinks.get(repostSource);
	if (repostBacklinks && myPosts) {
		for (const [uri, myPost] of myPosts) {
			const didMap = repostBacklinks.get(uri);
			if (!didMap) continue;

			const t = new Date(myPost.record.createdAt).getTime();
			const adds = new Map<Did, { score: number; repostCount: number }>();

			for (const [did, rkeys] of didMap) {
				if (did === user) continue;

				let add = adds.get(did) ?? { score: 0, repostCount: 0 };
				const diminishFactor = 9;

				// each rkey is a separate repost record, apply diminishing returns
				for (let i = 0; i < rkeys.size; i++) {
					const weight = repostWeight * (diminishFactor / (add.repostCount + diminishFactor));
					add = {
						score: add.score + weight,
						repostCount: add.repostCount + 1
					};
				}
				adds.set(did, add);
			}

			for (const [did, add] of adds.entries()) addScore(did, add.score, t);
		}
	}

	// normalize by posting rate
	for (const [did, score] of scores) {
		const posts = allPosts.get(did);
		const rate = posts ? getPostRate(did, posts, now) : 0;
		scores.set(did, score / Math.pow(rate + rateBaseline, ratePower));
	}

	return scores;
};
