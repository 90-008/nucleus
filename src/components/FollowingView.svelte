<script lang="ts">
	import { follows, getClient, allPosts, allBacklinks, currentTime } from '$lib/state.svelte';
	import type { Did } from '@atcute/lexicons';
	import ProfilePicture from './ProfilePicture.svelte';
	import { type AtpClient, resolveDidDoc } from '$lib/at/client';
	import { getRelativeTime } from '$lib/date';
	import { generateColorForDid } from '$lib/accounts';
	import { type AtprotoDid } from '@atcute/lexicons/syntax';
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';
	import {
		calculateFollowedUserStats,
		calculateInteractionScores,
		sortFollowedUser,
		type Sort
	} from '$lib/following';

	interface Props {
		selectedDid: Did;
		selectedClient: AtpClient;
	}

	const { selectedDid, selectedClient }: Props = $props();

	let followingSort: Sort = $state('active' as Sort);
	const followsMap = $derived(follows.get(selectedDid));

	const interactionScores = $derived.by(() => {
		if (followingSort !== 'conversational') return null;
		return calculateInteractionScores(
			selectedDid,
			followsMap ?? new Map(),
			allPosts,
			allBacklinks,
			currentTime.getTime()
		);
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

		data = $derived.by(() =>
			calculateFollowedUserStats(
				followingSort,
				this.did,
				allPosts,
				interactionScores,
				currentTime.getTime()
			)
		);
	}

	const userStatsList = $derived(
		followsMap ? Array.from(followsMap.values()).map((f) => new FollowedUserStats(f.subject)) : []
	);
	const following = $derived(userStatsList.filter((u) => u.data !== null));
	const sortedFollowing = $derived(
		[...following].sort((a, b) => sortFollowedUser(followingSort, a.data!, b.data!))
	);

	let listHeight = $state(0);
	let listContainer: HTMLDivElement | undefined = $state();

	const calcHeight = () => {
		if (!listContainer) return;
		const footer = document.getElementById('app-footer');
		const footerHeight = footer?.getBoundingClientRect().height || 0;
		const top = listContainer.getBoundingClientRect().top;
		// 24px is our bottom padding
		listHeight = Math.max(0, window.innerHeight - top - footerHeight - 24);
	};

	$effect(() => {
		if (listContainer) {
			calcHeight();
			const observer = new ResizeObserver(calcHeight);
			observer.observe(document.body);
			return () => observer.disconnect();
		}
	});
</script>

<div class="flex h-full flex-col p-2">
	<div class="mb-4 flex items-center justify-between gap-2 p-2 px-2 md:gap-4">
		<div>
			<h2 class="text-2xl font-bold md:text-3xl">following</h2>
			<div class="mt-2 flex gap-2">
				<div class="h-1 w-8 rounded-full bg-(--nucleus-accent)"></div>
				<div class="h-1 w-11 rounded-full bg-(--nucleus-accent2)"></div>
			</div>
		</div>
		<div class="flex gap-1 text-sm sm:gap-2">
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

	<div class="min-h-0 flex-1" bind:this={listContainer}>
		{#if sortedFollowing.length === 0}
			<div class="flex justify-center py-8">
				<div
					class="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
					style="border-color: var(--nucleus-accent) var(--nucleus-accent) var(--nucleus-accent) transparent;"
				></div>
			</div>
		{:else if listHeight > 0}
			<VirtualList height={listHeight} itemCount={sortedFollowing.length} itemSize={76}>
				{#snippet item({ index, style }: { index: number; style: string })}
					{@const user = sortedFollowing[index]}
					{@const stats = user.data!}
					{@const lastPostAt = stats.lastPostAt}
					{@const relTime = getRelativeTime(lastPostAt, currentTime)}
					{@const color = generateColorForDid(user.did)}
					<div {style} class="box-border w-full pb-2">
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
				{/snippet}
			</VirtualList>
		{/if}
	</div>
</div>
