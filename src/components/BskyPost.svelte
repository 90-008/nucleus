<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { AppBskyFeedPost } from '@atcute/bluesky';
	import {
		parseCanonicalResourceUri,
		type ActorIdentifier,
		type Did,
		type RecordKey,
		type ResourceUri
	} from '@atcute/lexicons';
	import { expect, ok } from '$lib/result';
	import { generateColorForDid } from '$lib/accounts';
	import ProfilePicture from './ProfilePicture.svelte';
	import { isBlob } from '@atcute/lexicons/interfaces';
	import { blob, img } from '$lib/cdn';
	import BskyPost from './BskyPost.svelte';

	interface Props {
		client: AtpClient;
		did: Did;
		rkey: RecordKey;
		// replyBacklinks?: Backlinks;
		record?: AppBskyFeedPost.Main;
		mini?: boolean;
	}

	const { client, did, rkey, record, mini /* replyBacklinks */ }: Props = $props();

	const color = generateColorForDid(did);

	let handle: ActorIdentifier = $state(did);
	const didDoc = client.resolveDidDoc(did).then((res) => {
		if (res.ok) handle = res.value.handle;
		return res;
	});
	const post = record
		? Promise.resolve(ok(record))
		: client.getRecord(AppBskyFeedPost.mainSchema, did, rkey);
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

		if (years > 0) return `${years}y`;
		if (months > 0) return `${months}m`;
		if (days > 0) return `${days}d`;
		if (hours > 0) return `${hours}h`;
		if (minutes > 0) return `${minutes}m`;
		if (seconds > 0) return `${seconds}s`;
		return 'just now';
	};
</script>

{#snippet embedBadge(record: AppBskyFeedPost.Main)}
	{#if record.embed}
		<span
			class="rounded-full px-2.5 py-0.5 text-xs font-medium"
			style="background: color-mix(in srgb, {mini
				? 'var(--nucleus-fg)'
				: color} 13%, transparent); color: {mini ? 'var(--nucleus-fg)' : color};"
		>
			{getEmbedText(record.embed.$type)}
		</span>
	{/if}
{/snippet}

{#if mini}
	<div class="overflow-hidden text-sm text-nowrap overflow-ellipsis opacity-60">
		{#await post}
			loading...
		{:then post}
			{#if post.ok}
				{@const record = post.value}
				<span style="color: {color};">@{handle}</span>: {@render embedBadge(record)}
				<span title={record.text}>{record.text}</span>
			{:else}
				{post.error}
			{/if}
		{/await}
	</div>
{:else}
	{#await post}
		<div
			class="rounded-sm border-2 p-2 text-center backdrop-blur-sm"
			style="background: {color}18; border-color: {color}66;"
		>
			<div
				class="inline-block h-6 w-6 animate-spin rounded-full border-3 border-(--nucleus-accent) [border-left-color:transparent]"
			></div>
			<p class="mt-3 text-sm font-medium opacity-60">loading post...</p>
		</div>
	{:then post}
		{#if post.ok}
			{@const record = post.value}
			<div
				class="rounded-sm border-2 p-2 shadow-lg backdrop-blur-sm transition-all"
				style="background: {color}18; border-color: {color}66;"
			>
				<div
					class="group mb-3 flex w-fit max-w-full items-center gap-1.5 rounded-sm pr-1"
					style="background: {color}33;"
				>
					<ProfilePicture {client} {did} size={8} />

					<span class="flex min-w-0 items-center gap-2 font-bold" style="color: {color};">
						{#await client.getProfile(did)}
							{handle}
						{:then profile}
							{#if profile.ok}
								{@const profileValue = profile.value}
								<span class="min-w-0 overflow-hidden text-nowrap overflow-ellipsis"
									>{profileValue.displayName}</span
								><span class="shrink-0 text-nowrap">(@{handle})</span>
							{:else}
								{handle}
							{/if}
						{/await}
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
					<span class="text-nowrap text-(--nucleus-fg)/67"
						>{getRelativeTime(new Date(record.createdAt))}</span
					>
				</div>
				<p class="leading-relaxed text-wrap">
					{record.text}
				</p>
				{#if record.embed}
					{@const embed = record.embed}
					<div class="mt-2">
						{#snippet embedPost(uri: ResourceUri)}
							{@const parsedUri = expect(parseCanonicalResourceUri(uri))}
							<!-- reject recursive quotes -->
							{#if !(did === parsedUri.repo && rkey === parsedUri.rkey)}
								<BskyPost {client} did={parsedUri.repo} rkey={parsedUri.rkey} />
							{:else}
								<span>you think you're funny with that recursive quote but i'm onto you</span>
							{/if}
						{/snippet}
						{#if embed.$type === 'app.bsky.embed.images'}
							<!-- todo: improve how images are displayed, and pop out on click -->
							{#each embed.images as image (image.image)}
								{#if isBlob(image.image)}
									<img
										class="rounded-sm"
										src={img('feed_thumbnail', did, image.image.ref.$link)}
										alt={image.alt}
									/>
								{/if}
							{/each}
						{:else if embed.$type === 'app.bsky.embed.video'}
							{#if isBlob(embed.video)}
								{#await didDoc then didDoc}
									{#if didDoc.ok}
										<!-- svelte-ignore a11y_media_has_caption -->
										<video
											class="rounded-sm"
											src={blob(didDoc.value.pds, did, embed.video.ref.$link)}
											controls
										></video>
									{/if}
								{/await}
							{/if}
						{:else if embed.$type === 'app.bsky.embed.record'}
							{@render embedPost(embed.record.uri)}
						{:else if embed.$type === 'app.bsky.embed.recordWithMedia'}
							{@render embedPost(embed.record.record.uri)}
						{/if}
						<!-- todo: implement external link embeds -->
					</div>
				{/if}
			</div>
		{:else}
			<div class="rounded-xl border-2 p-4" style="background: #ef444422; border-color: #ef4444;">
				<p class="text-sm font-medium" style="color: #fca5a5;">error: {post.error}</p>
			</div>
		{/if}
	{/await}
{/if}
