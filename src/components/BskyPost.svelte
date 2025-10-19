<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { AppBskyFeedPost } from '@atcute/bluesky';
	import type { ActorIdentifier, RecordKey } from '@atcute/lexicons';
	import { theme } from '$lib/theme.svelte';
	import { map, ok } from '$lib/result';
	import { generateColorForDid } from '$lib/accounts';

	interface Props {
		client: AtpClient;
		identifier: ActorIdentifier;
		rkey: RecordKey;
		// replyBacklinks?: Backlinks;
		record?: AppBskyFeedPost.Main;
		mini?: boolean;
	}

	const { client, identifier, rkey, record, mini /* replyBacklinks */ }: Props = $props();

	const color = generateColorForDid(identifier) ?? theme.accent2;

	let handle = $state(identifier);
	client
		.resolveDidDoc(identifier)
		.then((res) => map(res, (data) => data.handle))
		.then((res) => {
			if (res.ok) handle = res.value;
		});
	const post = record
		? Promise.resolve(ok(record))
		: client.getRecord(AppBskyFeedPost.mainSchema, identifier, rkey);
	// const replies = replyBacklinks
	// 	? Promise.resolve(ok(replyBacklinks))
	// 	: client.getBacklinks(
	// 			identifier,
	// 			'app.bsky.feed.post',
	// 			rkey,
	// 			'app.bsky.feed.post:reply.parent.uri'
	// 		);

	const getEmbedText = (embedType: string) => {
		switch (embedType) {
			case 'app.bsky.embed.external':
				return '🔗 has external link';
			case 'app.bsky.embed.record':
				return '💬 has quote';
			case 'app.bsky.embed.images':
				return '🖼️ has images';
			case 'app.bsky.embed.video':
				return '🎥 has video';
			case 'app.bsky.embed.recordWithMedia':
				return '📎 has quote with media';
			default:
				return '❓ has unknown embed';
		}
	};

	const getRelativeTime = (date: Date) => {
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		const months = Math.floor(days / 30);
		const years = Math.floor(months / 12);

		if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
		if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
		if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
		if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
		if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
		if (seconds > 0) return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
		return 'just now';
	};
</script>

{#snippet embedBadge(record: AppBskyFeedPost.Main)}
	{#if record.embed}
		<span
			class="rounded-full px-2.5 py-0.5 text-xs font-medium"
			style="background: {mini ? theme.fg : color}22; color: {mini ? theme.fg : color};"
		>
			{getEmbedText(record.embed.$type)}
		</span>
	{/if}
{/snippet}

{#if mini}
	<div
		class="overflow-hidden text-sm text-nowrap overflow-ellipsis opacity-60"
		style="color: {theme.fg};"
	>
		{#await post}
			loading...
		{:then post}
			{#if post.ok}
				{@const record = post.value}
				<span style="color: {color};">@{handle}</span>: {@render embedBadge(record)}
				{record.text}
			{:else}
				{post.error}
			{/if}
		{/await}
	</div>
{:else}
	{#await post}
		<div
			class="rounded-sm border-2 p-3 text-center backdrop-blur-sm"
			style="background: {color}18; border-color: {color}66;"
		>
			<div
				class="inline-block h-6 w-6 animate-spin rounded-full border-3"
				style="border-color: {theme.accent}; border-left-color: transparent;"
			></div>
			<p class="mt-3 text-sm font-medium opacity-60" style="color: {theme.fg};">loading post...</p>
		</div>
	{:then post}
		{#if post.ok}
			{@const record = post.value}
			<div
				class="rounded-sm border-2 p-3 shadow-lg backdrop-blur-sm transition-all"
				style="background: {color}18; border-color: {color}66;"
			>
				<div class="mb-3 flex items-center gap-1.5">
					<span class="font-bold" style="color: {color};">
						@{handle}
					</span>
					<!-- <span>·</span>
				{#await replies}
					<span style="color: {theme.fg}aa;">… replies</span>
				{:then replies}
					{#if replies.ok}
						{@const repliesValue = replies.value}
						<span style="color: {theme.fg}aa;">
							{#if repliesValue.total > 0}
								{repliesValue.total}
								{repliesValue.total > 1 ? 'replies' : 'reply'}
							{:else}
								no replies
							{/if}
						</span>
					{:else}
						<span
							title={`${replies.error}`}
							class="max-w-[32ch] overflow-hidden text-nowrap"
							style="color: {theme.fg}aa;">{replies.error}</span
						>
					{/if}
				{/await} -->
					<span>·</span>
					<span style="color: {theme.fg}aa;">{getRelativeTime(new Date(record.createdAt))}</span>
				</div>
				<p class="leading-relaxed text-wrap" style="color: {theme.fg};">
					{record.text}
					{@render embedBadge(record)}
				</p>
			</div>
		{:else}
			<div class="rounded-xl border-2 p-4" style="background: #ef444422; border-color: #ef4444;">
				<p class="text-sm font-medium" style="color: #fca5a5;">error: {post.error}</p>
			</div>
		{/if}
	{/await}
{/if}
