<script lang="ts">
	import { type FeedGenerator, fetchFeedGenerator } from '$lib/at/feeds';
	import type { SavedFeed } from '$lib/settings';
	import Icon from '@iconify/svelte';

	interface Props {
		style: string;
		data: SavedFeed;
		onRemove: () => void;
		onTogglePin: () => void;
	}

	let { style, data, onRemove, onTogglePin }: Props = $props();

	const feedData = $derived(data.feed);
	const uri = $derived(feedData.uri);
	const pinned = $derived(data.pinned);
</script>

<div {style} class="box-border w-full py-0.5">
	<div
		class="group flex items-center gap-2 rounded-sm bg-(--nucleus-fg)/5 px-2 py-1.5 transition-colors hover:bg-(--nucleus-fg)/10"
	>
		{#if feedData.avatar}
			<img src={feedData.avatar} alt="" class="h-6 w-6 shrink-0 rounded-sm object-cover" />
		{/if}
		{#if feedData}
			<span class="semibold flex-1 truncate text-sm">
				{feedData.displayName}
			</span>
		{:else}
			<span class="flex-1 truncate text-sm opacity-50">{uri.split('/').pop()}</span>
		{/if}
		<button
			onclick={onTogglePin}
			class="text-sm opacity-50 transition-opacity hover:opacity-100"
			title={pinned ? 'unpin' : 'pin'}
		>
			<Icon
				icon={pinned ? 'heroicons:star-solid' : 'heroicons:star'}
				width="20"
				class={pinned ? 'text-yellow-400' : ''}
			/>
		</button>
		<button
			onclick={onRemove}
			class="text-sm text-red-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
		>
			<Icon icon="heroicons:x-mark-16-solid" width="24" />
		</button>
	</div>
</div>
