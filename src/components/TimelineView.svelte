<script lang="ts">
	import { type State as PostComposerState } from './PostComposer.svelte';
	import { AtpClient } from '$lib/at/client.svelte';
	import type { Did } from '@atcute/lexicons/syntax';
	import FeedTimelineView from './FeedTimelineView.svelte';
	import ReplyTimelineView from './ReplyTimelineView.svelte';

	interface Props {
		client?: AtpClient | null;
		targetDid?: Did;
		postComposerState: PostComposerState;
		class?: string;
		showReplies?: boolean;
		selectedFeed?: string | null;
	}

	let {
		client = null,
		targetDid = undefined,
		showReplies = true,
		postComposerState = $bindable(),
		selectedFeed = $bindable(null),
		class: className = ''
	}: Props = $props();

	let feedView = $state<{ clearFeed: () => void }>();

	export const clearFeed = () => {
		feedView?.clearFeed();
	};
</script>

{#if selectedFeed}
	<FeedTimelineView
		{client}
		{selectedFeed}
		bind:postComposerState
		class={className}
		bind:this={feedView}
	/>
{:else}
	<ReplyTimelineView {client} {targetDid} {showReplies} bind:postComposerState class={className} />
{/if}
