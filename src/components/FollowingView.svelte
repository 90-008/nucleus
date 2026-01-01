<script lang="ts">
	import { follows, allPosts, allBacklinks, currentTime, replyIndex } from '$lib/state.svelte';
	import type { Did } from '@atcute/lexicons';
	import { type AtpClient } from '$lib/at/client';
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';
	import {
		calculateFollowedUserStats,
		calculateInteractionScores,
		sortFollowedUser,
		type Sort
	} from '$lib/following';
	import FollowingItem from './FollowingItem.svelte';
	import NotLoggedIn from './NotLoggedIn.svelte';

	interface Props {
		client: AtpClient | undefined;
		followingSort: Sort;
	}

	let { client, followingSort = $bindable('active') }: Props = $props();

	const selectedDid = $derived(client?.user?.did);
	const followsMap = $derived(selectedDid ? follows.get(selectedDid) : undefined);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let sortedFollowing = $state<{ did: Did; data: any }[]>([]);

	let isLongCalculation = $state(false);
	let calculationTimer: ReturnType<typeof setTimeout> | undefined;

	// we could update the "now" every second but its pretty unnecessary
	// so we only do it when we receive new data or sort mode changes
	let staticNow = $state(Date.now());

	const updateList = async () => {
		// Reset timer and loading state at start
		if (calculationTimer) clearTimeout(calculationTimer);
		isLongCalculation = false;

		if (!followsMap || !selectedDid) {
			sortedFollowing = [];
			return;
		}

		// schedule spinner to appear only if calculation takes > 200ms
		calculationTimer = setTimeout(() => (isLongCalculation = true), 200);
		// yield to main thread to allow UI to show spinner/update
		await new Promise((resolve) => setTimeout(resolve, 0));

		const interactionScores =
			followingSort === 'conversational'
				? calculateInteractionScores(
						selectedDid,
						followsMap,
						allPosts,
						allBacklinks,
						replyIndex,
						staticNow
					)
				: null;

		const userStatsList = followsMap.values().map((f) => ({
			did: f.subject,
			data: calculateFollowedUserStats(
				followingSort,
				f.subject,
				allPosts,
				interactionScores,
				staticNow
			)
		}));

		const following = userStatsList.filter((u) => u.data !== null);
		const sorted = [...following].sort((a, b) => sortFollowedUser(followingSort, a.data!, b.data!));

		sortedFollowing = sorted;

		// Clear timer and remove loading state immediately after done
		if (calculationTimer) clearTimeout(calculationTimer);
		isLongCalculation = false;
	};

	// todo: there is a bug where
	$effect(() => {
		// Dependencies that trigger a re-sort
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const _s = followingSort;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const _f = followsMap?.size;
		// Update time when sort changes
		staticNow = Date.now();

		updateList();
	});

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
		{#if !client}
			<NotLoggedIn />
		{:else if sortedFollowing.length === 0 || isLongCalculation}
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
					<FollowingItem
						{style}
						did={user.did}
						stats={user.data!}
						{client}
						sort={followingSort}
						{currentTime}
					/>
				{/snippet}
			</VirtualList>
		{/if}
	</div>
</div>
