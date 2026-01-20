<script lang="ts">
	import FeedItem from './FeedItem.svelte';
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';
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
					<VirtualList
						height={Math.min(sortedFeeds.length, 7) * 44}
						itemCount={sortedFeeds.length}
						itemSize={44}
					>
						{#snippet item({ index, style }: { index: number; style: string })}
							<FeedItem
								{style}
								data={sortedFeeds[index]}
								onRemove={() => onRemoveFeed(sortedFeeds[index].feed.uri)}
								onTogglePin={() => onTogglePin(sortedFeeds[index].feed.uri)}
							/>
						{/snippet}
					</VirtualList>
				</div>
			{:else}
				<p class="py-2 text-center text-sm opacity-50">no saved feeds</p>
			{/if}
		</div>
	</div>
</div>
