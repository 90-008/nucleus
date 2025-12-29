import type { ActorIdentifier, Did, ResourceUri } from '@atcute/lexicons';
import type { PostWithUri } from './at/fetch';
import type { PostActions } from './thread';

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
	user: Did,
	posts: Map<Did, Map<ResourceUri, PostWithUri>>,
	interactionScores: Map<ActorIdentifier, number> | null,
	now: number
) => {
	const postsMap = posts.get(user);
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
		conversationalScore = interactionScores.get(user) || 0;

	return {
		did: user,
		lastPostAt: new Date(lastPostAtTime),
		activeScore,
		conversationalScore,
		recentPostCount
	};
};

export const calculateInteractionScores = (
	user: Did,
	posts: Map<Did, Map<ResourceUri, PostWithUri>>,
	postActions: Map<`${Did}:${ResourceUri}`, PostActions>,
	now: number
) => {
	const scores = new Map<ActorIdentifier, number>();

	// Interactions are full weight for the first 3 days, then start decreasing linearly
	// until 2 weeks, after which they decrease exponentially.
	// Keep the same overall exponential timescale as before (half-life ~30 days).
	const oneDay = 24 * 60 * 60 * 1000;
	const halfLifeMs = 30 * oneDay;
	const decayLambda = 0.693 / halfLifeMs;
	const threeDays = 3 * oneDay;
	const twoWeeks = 14 * oneDay;

	const decay = (time: number) => {
		const age = Math.max(0, now - time);

		// Full weight for recent interactions within 3 days
		if (age <= threeDays) return 1;

		// Between 3 days and 2 weeks, linearly interpolate down to the value
		// that the exponential would have at 2 weeks to keep continuity.
		if (age <= twoWeeks) {
			const expAtTwoWeeks = Math.exp(-decayLambda * twoWeeks);
			const t = (age - threeDays) / (twoWeeks - threeDays); // 0..1
			// linear ramp from 1 -> expAtTwoWeeks
			return 1 - t * (1 - expAtTwoWeeks);
		}

		// After 2 weeks, exponential decay based on the chosen lambda
		return Math.exp(-decayLambda * age);
	};

	const replyWeight = 4;
	const repostWeight = 2;
	const likeWeight = 1;

	const myPosts = posts.get(user);
	if (myPosts) {
		for (const post of myPosts.values()) {
			if (post.record.reply) {
				const parentUri = post.record.reply.parent.uri;
				// only try to extract the DID
				const match = parentUri.match(/^at:\/\/([^/]+)/);
				if (match) {
					const targetDid = match[1] as Did;
					if (targetDid === user) continue;
					const s = scores.get(targetDid) || 0;
					scores.set(targetDid, s + replyWeight * decay(new Date(post.record.createdAt).getTime()));
				}
			}
		}
	}

	// interactions with others
	for (const [key, actions] of postActions) {
		const sepIndex = key.indexOf(':');
		if (sepIndex === -1) continue;
		const did = key.slice(0, sepIndex) as Did;
		const uri = key.slice(sepIndex + 1) as ResourceUri;

		// only try to extract the DID
		const match = uri.match(/^at:\/\/([^/]+)/);
		if (!match) continue;
		const targetDid = match[1] as Did;

		if (did === targetDid) continue;

		let add = 0;
		if (actions.like) add += likeWeight;
		if (actions.repost) add += repostWeight;

		if (add > 0) {
			const targetPosts = posts.get(targetDid);
			const post = targetPosts?.get(uri);
			if (post) {
				const time = new Date(post.record.createdAt).getTime();
				add *= decay(time);
			}
			scores.set(targetDid, (scores.get(targetDid) || 0) + add);
		}
	}

	return scores;
};
