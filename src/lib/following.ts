import { type ActorIdentifier, type Did, type ResourceUri } from '@atcute/lexicons';
import type { PostWithUri } from './at/fetch';
import type { Backlink, BacklinksSource } from './at/constellation';
import { repostSource } from '$lib';
import type { AppBskyGraphFollow } from '@atcute/bluesky';

export type Sort = 'recent' | 'active' | 'conversational';

export const sortFollowedUser = (
	sort: Sort,
	statsA: NonNullable<ReturnType<typeof calculateFollowedUserStats>>,
	statsB: NonNullable<ReturnType<typeof calculateFollowedUserStats>>
) => {
	if (sort === 'conversational') {
		if (Math.abs(statsB.conversationalScore - statsA.conversationalScore) > 0.1)
			// sort based on conversational score
			return statsB.conversationalScore - statsA.conversationalScore;
	} else {
		if (sort === 'active')
			if (Math.abs(statsB.activeScore - statsA.activeScore) > 0.0001)
				// sort based on activity
				return statsB.activeScore - statsA.activeScore;
	}
	// use recent if scores are similar / we are using recent mode
	return statsB.lastPostAt.getTime() - statsA.lastPostAt.getTime();
};

export const calculateFollowedUserStats = (
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
			// score = 1 / t^G
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

// weights
const quoteWeight = 4;
const replyWeight = 6;
const repostWeight = 2;

// interactions decay over time to prioritize recent conversations.
// half-life of 3 days ensures that inactivity (>1 days) results in a noticeable score drop.
const oneDay = 24 * 60 * 60 * 1000;
const halfLifeMs = 3 * oneDay;
const decayLambda = 0.693 / halfLifeMs;

// normalization constants
const rateBaseline = 1;
const ratePower = 0.5;
// consider the last 7 days for rate calculation
const windowSize = 7 * oneDay;

export const calculateInteractionScores = (
	user: Did,
	followsMap: Map<ResourceUri, AppBskyGraphFollow.Main>,
	allPosts: Map<Did, Map<ResourceUri, PostWithUri>>,
	backlinks_: Map<ResourceUri, Map<BacklinksSource, Set<Backlink>>>,
	now: number
) => {
	const scores = new Map<Did, number>();

	const decay = (time: number) => {
		const age = Math.max(0, now - time);
		return Math.exp(-decayLambda * age);
	};

	const postRates = new Map<Did, number>();

	const processPosts = (did: Did, posts: Map<ResourceUri, PostWithUri>) => {
		let volume = 0;
		let minTime = now;
		let maxTime = 0;
		let hasRecentPosts = false;

		const seenRoots = new Set<ResourceUri>();

		for (const [, post] of posts) {
			const t = new Date(post.record.createdAt).getTime();
			const dec = decay(t);

			// Calculate rate based on raw volume over time frame
			// We only care about posts within the relevant window to determine "current" activity rate
			if (now - t < windowSize) {
				volume += 1;
				if (t < minTime) minTime = t;
				if (t > maxTime) maxTime = t;
				hasRecentPosts = true;
			}

			const processPostUri = (uri: ResourceUri, weight: number) => {
				// only try to extract the DID
				const match = uri.match(/^at:\/\/([^/]+)/);
				if (!match) return;
				const targetDid = match[1] as Did;
				let subjectDid = targetDid;
				// if we are processing posts of the user
				if (did === user) {
					// then only process posts where the user is replying to others
					if (targetDid === user) return;
				} else {
					// otherwise only process posts that are replies to the user
					if (targetDid !== user) return;
					subjectDid = did;
				}
				// console.log(`${subjectDid} -> ${targetDid}`);
				const s = scores.get(subjectDid) ?? 0;
				scores.set(subjectDid, s + weight * dec);
			};
			if (post.record.reply) {
				const parentUri = post.record.reply.parent.uri;
				const rootUri = post.record.reply.root.uri;
				processPostUri(parentUri, replyWeight);
				// prevent duplicates
				if (parentUri !== rootUri && !seenRoots.has(rootUri)) {
					processPostUri(rootUri, replyWeight);
					seenRoots.add(rootUri);
				}
			}
			if (post.record.embed?.$type === 'app.bsky.embed.record')
				processPostUri(post.record.embed.record.uri, quoteWeight);
			if (post.record.embed?.$type === 'app.bsky.embed.recordWithMedia')
				processPostUri(post.record.embed.record.record.uri, quoteWeight);
		}

		let rate = 0;
		if (hasRecentPosts) {
			// Rate = Posts / Days
			// Use at least 1 day to avoid skewing bursts of <24h too high
			const days = Math.max((maxTime - minTime) / oneDay, 1);
			rate = volume / days;
		}
		postRates.set(did, rate);
	};

	// process self
	const myPosts = allPosts.get(user);
	if (myPosts) processPosts(user, myPosts);
	// process following
	for (const follow of followsMap.values()) {
		const posts = allPosts.get(follow.subject);
		if (!posts) continue;
		processPosts(follow.subject, posts);
	}

	const followsSet = new Set(followsMap.values().map((follow) => follow.subject));
	// interactions with others
	for (const [uri, backlinks] of backlinks_) {
		const match = uri.match(/^at:\/\/([^/]+)/);
		if (!match) continue;
		const targetDid = match[1] as Did;
		// only process backlinks that target the user
		const isSelf = targetDid === user;
		// and are from users the user follows
		const isFollowing = followsSet.has(targetDid);
		if (!isSelf && !isFollowing) continue;
		// check if the post exists
		const post = allPosts.get(targetDid)?.get(uri);
		if (!post) continue;
		const reposts = backlinks.get(repostSource) ?? new Set();
		const adds = new Map<Did, { score: number; repostCount: number }>();
		for (const repost of reposts) {
			// we dont count "self interactions"
			if (isSelf && repost.did === user) continue;
			// we dont count interactions that arent the user's
			if (isFollowing && repost.did !== user) continue;
			// use targetDid for following (because it will be the following did)
			// use repost.did for self interactions (because it will be the following did)
			const did = isFollowing ? targetDid : repost.did;
			const add = adds.get(did) ?? { score: 0, repostCount: 0 };
			// diminish the weight as the number of reposts increases
			const diminishFactor = 9;
			const weight = repostWeight * (diminishFactor / (add.repostCount + diminishFactor));
			adds.set(did, {
				score: add.score + weight,
				repostCount: add.repostCount + 1
			});
		}
		for (const [did, add] of adds.entries()) {
			if (add.score === 0) continue;
			const time = new Date(post.record.createdAt).getTime();
			scores.set(did, (scores.get(did) ?? 0) + add.score * decay(time));
		}
	}

	// Apply normalization
	for (const [did, score] of scores) {
		const rate = postRates.get(did) ?? 0;
		// NormalizedScore = DecayScore / (PostRate + Baseline)^alpha
		// This penalizes spammers (high rate) and inactivity (score decay vs constant rate)
		scores.set(did, score / Math.pow(rate + rateBaseline, ratePower));
	}

	return scores;
};
