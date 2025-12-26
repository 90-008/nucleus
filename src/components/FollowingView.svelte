<script lang="ts">
	import { follows, getClient, posts, postActions, currentTime } from '$lib/state.svelte';
	import type { ActorIdentifier, Did, ResourceUri } from '@atcute/lexicons';
	import ProfilePicture from './ProfilePicture.svelte';
	import { type AtpClient, resolveDidDoc } from '$lib/at/client';
	import { getRelativeTime } from '$lib/date';
	import { generateColorForDid } from '$lib/accounts';
	import { type AtprotoDid } from '@atcute/lexicons/syntax';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		selectedDid: Did;
		selectedClient: AtpClient;
	}

	const { selectedDid, selectedClient }: Props = $props();

	type Sort = 'recent' | 'active' | 'conversational';
	let followingSort: Sort = $state('active' as Sort);

	const interactionScores = $derived.by(() => {
		if (followingSort !== 'conversational') return null;

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const scores = new Map<ActorIdentifier, number>();
		const now = currentTime.getTime();

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

		const myPosts = posts.get(selectedDid);
		if (myPosts) {
			for (const post of myPosts.values()) {
				if (post.record.reply) {
					const parentUri = post.record.reply.parent.uri;
					// only try to extract the DID
					const match = parentUri.match(/^at:\/\/([^/]+)/);
					if (match) {
						const targetDid = match[1] as Did;
						if (targetDid === selectedDid) continue;
						const s = scores.get(targetDid) || 0;
						scores.set(
							targetDid,
							s + replyWeight * decay(new Date(post.record.createdAt).getTime())
						);
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
	});

	class FollowedUserStats {
		did: Did;
		profile: Promise<string | null | undefined>;
		handle: Promise<string>;

		constructor(did: Did) {
			this.did = did;
			this.profile = getClient(did as AtprotoDid)
				.then((client) => client.getProfile())
				.then((profile) => {
					if (profile.ok) return profile.value.displayName;
					return null;
				});
			this.handle = resolveDidDoc(did).then((doc) => {
				if (doc.ok) return doc.value.handle;
				return 'handle.invalid';
			});
		}

		data = $derived.by(() => {
			const postsMap = posts.get(this.did);
			if (!postsMap || postsMap.size === 0) return null;

			let lastPostAtTime = 0;
			let activeScore = 0;
			let recentPostCount = 0;
			const now = currentTime.getTime();
			const quarterPosts = 6 * 60 * 60 * 1000;
			const gravity = 2.0;

			for (const post of postsMap.values()) {
				const t = new Date(post.record.createdAt).getTime();
				if (t > lastPostAtTime) lastPostAtTime = t;
				const ageMs = Math.max(0, now - t);
				if (ageMs < quarterPosts) recentPostCount++;
				if (followingSort === 'active') {
					const ageHours = ageMs / (1000 * 60 * 60);
					// score = 1 / t^G
					activeScore += 1 / Math.pow(ageHours + 1, gravity);
				}
			}

			let conversationalScore = 0;
			if (followingSort === 'conversational' && interactionScores)
				conversationalScore = interactionScores.get(this.did) || 0;

			return {
				did: this.did,
				lastPostAt: new Date(lastPostAtTime),
				activeScore,
				conversationalScore,
				recentPostCount
			};
		});
	}

	const followsMap = $derived(follows.get(selectedDid));

	const userStatsList = $derived(
		followsMap ? Array.from(followsMap.values()).map((f) => new FollowedUserStats(f.subject)) : []
	);

	const following = $derived(userStatsList.filter((u) => u.data !== null));

	const sortedFollowing = $derived(
		[...following].sort((a, b) => {
			const statsA = a.data!;
			const statsB = b.data!;
			if (followingSort === 'conversational') {
				if (Math.abs(statsB.conversationalScore - statsA.conversationalScore) > 0.1)
					// sort based on conversational score
					return statsB.conversationalScore - statsA.conversationalScore;
			} else {
				if (followingSort === 'active')
					if (Math.abs(statsB.activeScore - statsA.activeScore) > 0.0001)
						// sort based on activity
						return statsB.activeScore - statsA.activeScore;
			}
			// use recent if scores are similar / we are using recent mode
			return statsB.lastPostAt.getTime() - statsA.lastPostAt.getTime();
		})
	);
</script>

{#snippet followingItems()}
	{#each sortedFollowing as user (user.did)}
		{@const stats = user.data!}
		{@const lastPostAt = stats.lastPostAt}
		{@const relTime = getRelativeTime(lastPostAt, currentTime)}
		{@const color = generateColorForDid(user.did)}
		<div animate:flip={{ duration: 350, easing: cubicOut }}>
			<div
				class="group flex items-center gap-2 rounded-sm bg-(--nucleus-accent)/7 p-3 transition-colors hover:bg-(--post-color)/20"
				style={`--post-color: ${color};`}
			>
				<ProfilePicture client={selectedClient} did={user.did} size={10} />
				<div class="min-w-0 flex-1 space-y-1">
					<div
						class="flex items-baseline gap-2 font-bold transition-colors group-hover:text-(--post-color)"
						style={`--post-color: ${color};`}
					>
						{#await Promise.all([user.profile, user.handle]) then [displayName, handle]}
							<span class="truncate">{displayName || handle}</span>
							<span class="truncate text-sm opacity-60">@{handle}</span>
						{/await}
					</div>
					<div class="flex gap-2 text-xs opacity-70">
						<span
							class={Date.now() - lastPostAt.getTime() < 1000 * 60 * 60 * 2
								? 'text-(--nucleus-accent)'
								: ''}
						>
							posted {relTime}
							{relTime !== 'now' ? 'ago' : ''}
						</span>
						{#if stats.recentPostCount > 0}
							<span class="text-(--nucleus-accent2)">
								{stats.recentPostCount} posts / 6h
							</span>
						{/if}
						{#if followingSort === 'conversational' && stats.conversationalScore > 0}
							<span class="ml-auto font-bold text-(--nucleus-accent)">
								★ {stats.conversationalScore.toFixed(1)}
							</span>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/each}
{/snippet}

<div class="p-2">
	<div class="mb-4 flex flex-col justify-between gap-4 px-2 sm:flex-row sm:items-center">
		<div>
			<h2 class="text-3xl font-bold">following</h2>
			<div class="mt-2 flex gap-2">
				<div class="h-1 w-8 rounded-full bg-(--nucleus-accent)"></div>
				<div class="h-1 w-11 rounded-full bg-(--nucleus-accent2)"></div>
			</div>
		</div>
		<div class="flex flex-wrap gap-2 text-sm">
			{#each ['recent', 'active', 'conversational'] as type (type)}
				<button
					class="rounded-sm px-2 py-1 transition-colors {followingSort === type
						? 'bg-(--nucleus-accent) text-(--nucleus-bg)'
						: 'bg-(--nucleus-accent)/10 hover:bg-(--nucleus-accent)/20'}"
					onclick={() => (followingSort = type as Sort)}
				>
					{type}
				</button>
			{/each}
		</div>
	</div>

	<div class="flex flex-col gap-2">
		{#if sortedFollowing.length === 0}
			<div class="flex justify-center py-8">
				<div
					class="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
					style="border-color: var(--nucleus-accent) var(--nucleus-accent) var(--nucleus-accent) transparent;"
				></div>
			</div>
		{:else}
			{@render followingItems()}
		{/if}
	</div>
</div>
