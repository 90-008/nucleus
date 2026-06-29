<script lang="ts">
	import FeedItem from './FeedItem.svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import type { FeedGenerator } from '$lib/at/feeds';
	import { fetchFeedGenerator, parseFeedUri } from '$lib/at/feeds';
	import type { SavedFeed } from '$lib/settings';
	import { viewClient } from '$lib/state.svelte';

	interface Props {
		feeds: SavedFeed[];
		onAddFeed: (feed: FeedGenerator) => void;
		onRemoveFeed: (uri: string) => void;
		onTogglePin: (uri: string) => void;
	}

	let { feeds, onAddFeed, onRemoveFeed, onTogglePin }: Props = $props();

	let newFeedInput = $state('');

	const handleAddFeed = async () => {
		const uri = newFeedInput.trim();
		if (!uri) return;
		if (!parseFeedUri(uri)) return;
		if (feeds.some((f) => f.feed.uri === uri)) return;
		const feed = await fetchFeedGenerator(viewClient, uri);
		if (!feed) return;
		onAddFeed(feed);
		newFeedInput = '';
	};

	const sortedFeeds = $derived([...feeds].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
	const isValidUri = $derived(parseFeedUri(newFeedInput.trim()) !== null);

	let parentRef = $state<HTMLDivElement | null>(null);
	const virtualizer = createVirtualizer({
		count: 0,
		getScrollElement: () => parentRef,
		estimateSize: () => 44,
		overscan: 5
	});

	$effect(() => {
		$virtualizer.setOptions({
			count: sortedFeeds.length,
			getScrollElement: () => parentRef,
			estimateSize: () => 44,
			overscan: 5
		});
	});
</script>

<div class="space-y-4 p-4">
	<div>
		<h3 class="settings-header">saved feeds</h3>
		<div class="settings-box space-y-2">
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={newFeedInput}
					placeholder="https://bsky.app/profile/bsky.app/feed/whats-hot"
					class="single-line-input flex-1"
				/>
				<button disabled={!isValidUri} onclick={handleAddFeed} class="action-button">add</button>
			</div>
			{#if sortedFeeds.length > 0}
				<div class="h-fit">
					<div
						bind:this={parentRef}
						style="height: {Math.min(sortedFeeds.length, 7) *
							44}px; overflow-y: auto; overflow-x: hidden; position: relative;"
					>
						<div style="height: {$virtualizer.getTotalSize()}px; width: 100%; position: relative;">
							{#each $virtualizer.getVirtualItems() as virtualItem (virtualItem.key)}
								<FeedItem
									style="position: absolute; top: 0; left: 0; width: 100%; height: {virtualItem.size}px; transform: translateY({virtualItem.start}px);"
									data={sortedFeeds[virtualItem.index]}
									onRemove={() => onRemoveFeed(sortedFeeds[virtualItem.index].feed.uri)}
									onTogglePin={() => onTogglePin(sortedFeeds[virtualItem.index].feed.uri)}
								/>
							{/each}
						</div>
					</div>
				</div>
			{:else}
				<p class="py-2 text-center text-sm opacity-50">no saved feeds</p>
			{/if}
		</div>
	</div>
</div>
