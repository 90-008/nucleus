<script lang="ts">
	import { follows, getClient, posts } from '$lib/state.svelte';
	import type { Did } from '@atcute/lexicons';
	import ProfilePicture from './ProfilePicture.svelte';
	import { type AtpClient, resolveDidDoc } from '$lib/at/client';
	import { getRelativeTime } from '$lib/date';
	import { generateColorForDid } from '$lib/accounts';
	import { type AtprotoDid } from '@atcute/lexicons/syntax';

	interface Props {
		selectedDid: Did;
		selectedClient: AtpClient;
	}

	const { selectedDid, selectedClient }: Props = $props();

	const burstTimeframeMs = 1000 * 60 * 60; // 1 hour

	type FollowedAccount = {
		did: Did;
		lastPostAt: Date;
		postsInBurst: number;
	};

	class FollowedUserStats {
		did: Did;
		constructor(did: Did) {
			this.did = did;
		}

		data = $derived.by(() => {
			const postsMap = posts.get(this.did);
			if (!postsMap || postsMap.size === 0) return null;

			let lastPostAtTime = 0;
			let postsInBurst = 0;
			const now = Date.now();
			const timeframe = now - burstTimeframeMs;

			for (const post of postsMap.values()) {
				const t = new Date(post.record.createdAt).getTime();
				if (t > lastPostAtTime) lastPostAtTime = t;
				if (t > timeframe) postsInBurst++;
			}

			return {
				did: this.did,
				lastPostAt: new Date(lastPostAtTime),
				postsInBurst
			};
		});
	}

	type Sort = 'recent' | 'active';
	let followingSort: Sort = $state('active' as Sort);

	const followsMap = $derived(follows.get(selectedDid));

	const userStatsList = $derived(
		followsMap ? Array.from(followsMap.values()).map((f) => new FollowedUserStats(f.subject)) : []
	);

	const following: FollowedAccount[] = $derived(
		userStatsList.map((u) => u.data).filter((d): d is FollowedAccount => d !== null)
	);

	const sortedFollowing = $derived(
		[...following].sort((a, b) => {
			if (followingSort === 'recent') {
				// Sort by last post time descending, then burst descending
				const timeA = a.lastPostAt.getTime();
				const timeB = b.lastPostAt.getTime();
				if (timeA !== timeB) return timeB - timeA;
				return b.postsInBurst - a.postsInBurst;
			} else {
				// Sort by burst descending, then last post time descending
				if (b.postsInBurst !== a.postsInBurst) return b.postsInBurst - a.postsInBurst;
				return b.lastPostAt.getTime() - a.lastPostAt.getTime();
			}
		})
	);

	let highlightedDid: Did | undefined = $state(undefined);
</script>

<div class="p-2">
	<div class="mb-4 flex items-center justify-between px-2">
		<div>
			<h2 class="text-3xl font-bold">following</h2>
			<div class="mt-2 flex gap-2">
				<div class="h-1 w-8 rounded-full bg-(--nucleus-accent)"></div>
				<div class="h-1 w-11 rounded-full bg-(--nucleus-accent2)"></div>
			</div>
		</div>
		<div class="flex gap-2 text-sm">
			{#each ['recent', 'active'] as Sort[] as type (type)}
				<button
					class="rounded-sm px-2 py-1 transition-colors {followingSort === type
						? 'bg-(--nucleus-accent) text-(--nucleus-bg)'
						: 'bg-(--nucleus-accent)/10 hover:bg-(--nucleus-accent)/20'}"
					onclick={() => (followingSort = type)}
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
			{#each sortedFollowing as user (user.did)}
				{@const lastPostAt = user.lastPostAt}
				{@const relTime = getRelativeTime(lastPostAt)}
				{@const color = generateColorForDid(user.did)}
				{@const isHighlighted = highlightedDid === user.did}
				{@const displayName = getClient(user.did as AtprotoDid)
					.then((client) => client.getProfile())
					.then((profile) => {
						if (profile.ok) return profile.value.displayName;
						return null;
					})}
				{@const handle = resolveDidDoc(user.did).then((doc) => {
					if (doc.ok) return doc.value.handle;
					return 'handle.invalid';
				})}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex items-center gap-2 rounded-sm bg-(--nucleus-accent)/7 p-3 transition-colors"
					style={`background-color: ${isHighlighted ? `color-mix(in srgb, ${color} 20%, transparent)` : 'color-mix(in srgb, var(--nucleus-accent) 7%, transparent)'};`}
					onmouseenter={() => (highlightedDid = user.did)}
					onmouseleave={() => (highlightedDid = undefined)}
				>
					<ProfilePicture client={selectedClient} did={user.did} size={10} />
					<div class="min-w-0 flex-1">
						<div
							class="flex items-baseline gap-2 font-bold transition-colors"
							style={`${isHighlighted ? `color: ${color};` : ''}`}
						>
							{#await Promise.all([displayName, handle]) then [displayName, handle]}
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
							{#if user.postsInBurst > 0}
								<span class="font-bold text-(--nucleus-accent2)">
									{user.postsInBurst} posts / 1h
								</span>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
