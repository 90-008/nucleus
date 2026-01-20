<script lang="ts">
	import { settings, type SavedFeed } from '$lib/settings';
	import { fetchFeedGenerator, type FeedGenerator } from '$lib/at/feeds';
	import { router, viewClient } from '$lib/state.svelte';
	import Dropdown from './Dropdown.svelte';
	import Icon from '@iconify/svelte';

	interface Props {
		selectedFeed: string | null;
		onSelect: (feedUri: string | null) => void;
	}

	let { selectedFeed = $bindable(), onSelect }: Props = $props();

	let isOpen = $state(false);

	const savedFeeds = $derived($settings.feeds);
	const sortedFeeds = $derived(
		[...savedFeeds].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
	);

	let feedMeta = $state<Map<string, FeedGenerator>>(new Map());

	$effect(() => {
		for (const savedFeed of savedFeeds) {
			if (!feedMeta.has(savedFeed.feed.uri)) {
				fetchFeedGenerator(viewClient, savedFeed.feed.uri).then((meta) => {
					if (meta) feedMeta.set(savedFeed.feed.uri, meta);
				});
			}
		}
	});

	const getDisplayName = (uri: string) => {
		const meta = feedMeta.get(uri);
		return meta?.displayName ?? uri.split('/').pop() ?? 'Feed';
	};

	const selectedName = $derived(selectedFeed === null ? 'replies' : getDisplayName(selectedFeed));
</script>

<Dropdown
	class="min-w-48 rounded-sm border-2 border-(--nucleus-accent) bg-(--nucleus-bg) shadow-2xl"
	bind:isOpen
	placement="bottom-start"
>
	{#snippet trigger()}
		<button
			onclick={() => (isOpen = !isOpen)}
			class="flex action-button items-center gap-1.5 text-sm hover:scale-102!"
		>
			<Icon icon="heroicons:list-bullet" width="20" />
			<span>{selectedName}</span>
			<span class="opacity-50">▾</span>
		</button>
	{/snippet}
	<div class="flex flex-col p-1">
		<button
			onclick={() => {
				onSelect(null);
				isOpen = false;
			}}
			class="my-0.5 flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-(--nucleus-fg)/10 {selectedFeed ===
			null
				? 'bg-(--nucleus-accent)/20'
				: ''}"
		>
			<Icon icon="heroicons:chat-bubble-left-ellipsis-16-solid" width="20" />
			<span>replies</span>
		</button>
		<button
			onclick={() => {
				onSelect('following');
				isOpen = false;
			}}
			class="my-0.5 flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-(--nucleus-fg)/10 {selectedFeed ===
			'following'
				? 'bg-(--nucleus-accent)/20'
				: ''}"
		>
			<Icon icon="heroicons:users-solid" width="20" />
			<span>following</span>
		</button>
		{#each sortedFeeds as savedFeed (savedFeed.feed.uri)}
			<button
				onclick={() => {
					onSelect(savedFeed.feed.uri);
					isOpen = false;
				}}
				class="my-0.5 flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-(--nucleus-fg)/10 {selectedFeed ===
				savedFeed.feed.uri
					? 'bg-(--nucleus-accent)/20'
					: ''}"
			>
				{#if savedFeed.feed.avatar}
					<img
						src={savedFeed.feed.avatar}
						alt=""
						class="h-5 w-5 shrink-0 rounded-sm object-cover"
					/>
				{:else if savedFeed.pinned}
					<Icon icon="heroicons:star-solid" width="20" class="text-yellow-400" />
				{:else}
					<Icon icon="heroicons:rss" width="20" />
				{/if}
				<span class="truncate">{savedFeed.feed.displayName}</span>
			</button>
		{/each}
		{#if sortedFeeds.length === 0}
			<a
				href="/settings/feeds"
				onclick={(e) => (e.preventDefault(), (isOpen = false), router.navigate('/settings/feeds'))}
				class="px-3 py-2 text-sm opacity-70">add feeds in settings</a
			>
		{/if}
	</div>
</Dropdown>
