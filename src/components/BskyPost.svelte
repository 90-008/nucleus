<script lang="ts">
	import { resolveDidDoc, type AtpClient } from '$lib/at/client';
	import {
		AppBskyActorProfile,
		AppBskyEmbedExternal,
		AppBskyEmbedImages,
		AppBskyEmbedVideo,
		AppBskyFeedPost
	} from '@atcute/bluesky';
	import {
		parseCanonicalResourceUri,
		type ActorIdentifier,
		type CanonicalResourceUri,
		type Did,
		type RecordKey,
		type ResourceUri
	} from '@atcute/lexicons';
	import { expect, ok } from '$lib/result';
	import { accounts, generateColorForDid } from '$lib/accounts';
	import ProfilePicture from './ProfilePicture.svelte';
	import { isBlob } from '@atcute/lexicons/interfaces';
	import { blob, img } from '$lib/cdn';
	import BskyPost from './BskyPost.svelte';
	import Icon from '@iconify/svelte';
	import {
		allPosts,
		pulsingPostId,
		currentTime,
		findBacklinksBy,
		deletePostBacklink,
		createPostBacklink
	} from '$lib/state.svelte';
	import type { PostWithUri } from '$lib/at/fetch';
	import { onMount } from 'svelte';
	import { derived } from 'svelte/store';
	import Device from 'svelte-device-info';
	import Dropdown from './Dropdown.svelte';
	import { type AppBskyEmbeds } from '$lib/at/types';
	import { settings } from '$lib/settings';
	import RichText from './RichText.svelte';
	import { getRelativeTime } from '$lib/date';
	import { likeSource, repostSource } from '$lib';
	import ProfileInfo from './ProfileInfo.svelte';

	interface Props {
		client: AtpClient;
		// post
		did: Did;
		rkey: RecordKey;
		// replyBacklinks?: Backlinks;
		quoteDepth?: number;
		data?: PostWithUri;
		mini?: boolean;
		isOnPostComposer?: boolean;
		onQuote?: (quote: PostWithUri) => void;
		onReply?: (reply: PostWithUri) => void;
	}

	const {
		client,
		did,
		rkey,
		quoteDepth = 0,
		data,
		mini,
		onQuote,
		onReply,
		isOnPostComposer = false /* replyBacklinks */
	}: Props = $props();

	const selectedDid = $derived(client.user?.did ?? null);
	const isLoggedInUser = $derived($accounts.some((acc) => acc.did === did));

	const aturi = $derived(`at://${did}/app.bsky.feed.post/${rkey}` as CanonicalResourceUri);
	const color = $derived(generateColorForDid(did));

	let handle: ActorIdentifier = $state('handle.invalid');
	const didDoc = resolveDidDoc(did).then((res) => {
		if (res.ok) handle = res.value.handle;
		return res;
	});
	const post = data
		? Promise.resolve(ok(data))
		: client.getRecord(AppBskyFeedPost.mainSchema, did, rkey);
	let profile: AppBskyActorProfile.Main | null = $state(null);
	onMount(async () => {
		const p = await client.getProfile(did);
		if (!p.ok) return;
		profile = p.value;
		// console.log(profile.description);
	});

	const postId = $derived(`timeline-post-${aturi}-${quoteDepth}`);
	const isPulsing = derived(pulsingPostId, (pulsingPostId) => pulsingPostId === postId);

	const scrollToAndPulse = (targetUri: ResourceUri) => {
		const targetId = `timeline-post-${targetUri}-0`;
		// console.log(`Scrolling to ${targetId}`);
		const element = document.getElementById(targetId);
		if (!element) return;

		element.scrollIntoView({ behavior: 'smooth', block: 'center' });

		setTimeout(() => {
			document.documentElement.style.setProperty(
				'--nucleus-selected-post',
				generateColorForDid(expect(parseCanonicalResourceUri(targetUri)).repo)
			);
			pulsingPostId.set(targetId);
			// Clear pulse after animation
			setTimeout(() => pulsingPostId.set(null), 1200);
		}, 400);
	};

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

	let actionsOpen = $state(false);
	let actionsPos = $state({ x: 0, y: 0 });

	const handleRightClick = (event: MouseEvent) => {
		actionsOpen = true;
		actionsPos = { x: event.clientX, y: event.clientY };
		event.preventDefault();
		event.stopPropagation();
	};

	let deleteState: 'waiting' | 'confirm' | 'deleted' = $state('waiting');
	$effect(() => {
		if (deleteState === 'confirm' && !actionsOpen) deleteState = 'waiting';
	});

	const deletePost = () => {
		if (deleteState === 'deleted') return;
		if (deleteState === 'waiting') {
			deleteState = 'confirm';
			return;
		}

		client?.atcute
			?.post('com.atproto.repo.deleteRecord', {
				input: {
					collection: 'app.bsky.feed.post',
					repo: did,
					rkey
				}
			})
			.then((result) => {
				if (!result.ok) return;
				allPosts.get(did)?.delete(aturi);
				deleteState = 'deleted';
			});
		actionsOpen = false;
	};

	let profileOpen = $state(false);
</script>

{#snippet embedBadge(embed: AppBskyEmbeds)}
	<span
		class="rounded-full px-2.5 py-0.5 text-xs font-medium"
		style="
		background: color-mix(in srgb, {mini ? 'var(--nucleus-fg)' : color} 10%, transparent);
		color: {mini ? 'var(--nucleus-fg)' : color};
		"
	>
		{getEmbedText(embed.$type!)}
	</span>
{/snippet}

{#snippet profileInline()}
	<button
		class="
		flex min-w-0 items-center gap-2 font-bold {isOnPostComposer ? 'contrast-200' : ''}
		rounded-sm pr-1 transition-colors duration-100 ease-in-out hover:bg-white/10
		"
		style="color: {color};"
		onclick={() => (profileOpen = !profileOpen)}
	>
		<ProfilePicture {client} {did} size={8} />

		{#if profile}
			<span class="w-min max-w-sm min-w-0 overflow-hidden text-nowrap overflow-ellipsis"
				>{profile.displayName}</span
			><span class="shrink-0 text-sm text-nowrap opacity-70">(@{handle})</span>
		{:else}
			{handle}
		{/if}
	</button>
{/snippet}

<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#snippet profilePopout()}
	<Dropdown
		class="post-dropdown max-w-xl gap-2! p-2.5! backdrop-blur-3xl! backdrop-brightness-25!"
		style="background: {color}36; border-color: {color}99;"
		bind:isOpen={profileOpen}
		trigger={profileInline}
		onMouseEnter={() => (profileOpen = true)}
		onMouseLeave={() => (profileOpen = false)}
	>
		<ProfileInfo {client} {did} {handle} {profile} />
	</Dropdown>
{/snippet}

{#if mini}
	<div class="text-sm opacity-60">
		{#await post}
			loading...
		{:then post}
			{#if post.ok}
				{@const record = post.value.record}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					onclick={() => scrollToAndPulse(post.value.uri)}
					class="select-none hover:cursor-pointer hover:underline"
				>
					<span style="color: {color};">@{handle}</span>:
					{#if record.embed}
						{@render embedBadge(record.embed)}
					{/if}
					<span title={record.text}>{record.text}</span>
				</div>
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
				class="
				inline-block h-6 w-6 animate-spin rounded-full
				border-3 border-(--nucleus-accent) border-l-transparent
				"
			></div>
			<p class="mt-3 text-sm font-medium opacity-60">loading post...</p>
		</div>
	{:then post}
		{#if post.ok}
			{@const record = post.value.record}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				id="timeline-post-{post.value.uri}-{quoteDepth}"
				oncontextmenu={handleRightClick}
				class="
				group rounded-sm border-2 p-2 shadow-lg backdrop-blur-sm transition-all
				{$isPulsing ? 'animate-pulse-highlight' : ''}
				{isOnPostComposer ? 'backdrop-brightness-20' : ''}
				"
				style="
				background: {color}{isOnPostComposer
					? '36'
					: Math.floor(24.0 * (quoteDepth * 0.5 + 1.0)).toString(16)};
				border-color: {color}{isOnPostComposer ? '99' : '66'};
				"
			>
				<div
					class="
					mb-3 flex w-fit max-w-full items-center gap-1 rounded-sm pr-1
					"
					style="background: {color}33;"
				>
					{@render profilePopout()}
					<span>·</span>
					<span
						title={new Date(record.createdAt).toLocaleString()}
						class="pl-0.5 text-nowrap text-(--nucleus-fg)/67"
					>
						{getRelativeTime(new Date(record.createdAt), currentTime)}
					</span>
				</div>
				<p class="leading-normal text-wrap wrap-break-word">
					<RichText text={record.text} facets={record.facets ?? []} />
					{#if isOnPostComposer && record.embed}
						{@render embedBadge(record.embed)}
					{/if}
				</p>
				{#if !isOnPostComposer && record.embed}
					{@const embed = record.embed}
					<div class="mt-2">
						{@render postEmbed(embed)}
					</div>
				{/if}
				{#if !isOnPostComposer}
					{@render postControls(post.value)}
				{/if}
			</div>
		{:else}
			<div class="error-disclaimer">
				<p class="text-sm font-medium">error: {post.error}</p>
			</div>
		{/if}
	{/await}
{/if}

{#snippet postEmbed(embed: AppBskyEmbeds)}
	{#snippet embedMedia(
		embed: AppBskyEmbedImages.Main | AppBskyEmbedVideo.Main | AppBskyEmbedExternal.Main
	)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div oncontextmenu={(e) => e.stopPropagation()}>
			{#if embed.$type === 'app.bsky.embed.images'}
				<!-- todo: improve how images are displayed, and pop out on click -->
				{#each embed.images as image (image.image)}
					{#if isBlob(image.image)}
						<img
							class="w-full rounded-sm"
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
			{/if}
		</div>
	{/snippet}
	{#snippet embedPost(uri: ResourceUri)}
		{#if quoteDepth < 2}
			{@const parsedUri = expect(parseCanonicalResourceUri(uri))}
			<!-- reject recursive quotes -->
			{#if !(did === parsedUri.repo && rkey === parsedUri.rkey)}
				<BskyPost
					{client}
					quoteDepth={quoteDepth + 1}
					did={parsedUri.repo}
					rkey={parsedUri.rkey}
					{isOnPostComposer}
					{onQuote}
					{onReply}
				/>
			{:else}
				<span>you think you're funny with that recursive quote but i'm onto you</span>
			{/if}
		{:else}
			{@render embedBadge(embed)}
		{/if}
	{/snippet}
	{#if embed.$type === 'app.bsky.embed.images' || embed.$type === 'app.bsky.embed.video'}
		{@render embedMedia(embed)}
	{:else if embed.$type === 'app.bsky.embed.record'}
		{@render embedPost(embed.record.uri)}
	{:else if embed.$type === 'app.bsky.embed.recordWithMedia'}
		<div class="space-y-1.5">
			{@render embedPost(embed.record.record.uri)}
			{@render embedMedia(embed.media)}
		</div>
	{/if}
	<!-- todo: implement external link embeds -->
{/snippet}

{#snippet postControls(post: PostWithUri)}
	{@const myRepost = findBacklinksBy(post.uri, repostSource, selectedDid!).length > 0}
	{@const myLike = findBacklinksBy(post.uri, likeSource, selectedDid!).length > 0}
	{#snippet control(
		name: string,
		icon: string,
		onClick: (e: MouseEvent) => void,
		isFull?: boolean,
		hasSolid?: boolean
	)}
		<button
			class="
			px-2 py-1.5 text-(--nucleus-fg)/90 transition-all
			duration-100 hover:[backdrop-filter:brightness(120%)]
			"
			onclick={(e) => onClick(e)}
			style="color: {isFull ? color : 'color-mix(in srgb, var(--nucleus-fg) 90%, transparent)'}"
			title={name}
		>
			<Icon icon={hasSolid && isFull ? `${icon}-solid` : icon} width={20} />
		</button>
	{/snippet}
	<div class="mt-3 flex w-full items-center justify-between">
		<div class="flex w-fit items-center rounded-sm" style="background: {color}1f;">
			{@render control('reply', 'heroicons:chat-bubble-left', () => onReply?.(post), false, true)}
			{@render control(
				'repost',
				'heroicons:arrow-path-rounded-square-20-solid',
				() => {
					if (!selectedDid) return;
					if (myRepost) deletePostBacklink(client, post, repostSource);
					else createPostBacklink(client, post, repostSource);
				},
				myRepost
			)}
			{@render control('quote', 'heroicons:paper-clip-20-solid', () => onQuote?.(post), false)}
			{@render control(
				'like',
				'heroicons:star',
				() => {
					if (!selectedDid) return;
					if (myLike) deletePostBacklink(client, post, likeSource);
					else createPostBacklink(client, post, likeSource);
				},
				myLike,
				true
			)}
		</div>
		<Dropdown
			class="post-dropdown"
			style="background: {color}36; border-color: {color}99;"
			bind:isOpen={actionsOpen}
			bind:position={actionsPos}
			placement="bottom-end"
		>
			{@render dropdownItem('heroicons:link-20-solid', 'copy link to post', () =>
				navigator.clipboard.writeText(`${$settings.socialAppUrl}/profile/${did}/post/${rkey}`)
			)}
			{@render dropdownItem('heroicons:link-20-solid', 'copy at uri', () =>
				navigator.clipboard.writeText(post.uri)
			)}
			{@render dropdownItem('heroicons:clipboard-20-solid', 'copy post text', () =>
				navigator.clipboard.writeText(post.record.text)
			)}
			{#if isLoggedInUser}
				<div class="my-0.75 h-px w-full opacity-60" style="background: {color};"></div>
				{@render dropdownItem(
					deleteState === 'confirm' ? 'heroicons:check-20-solid' : 'heroicons:trash-20-solid',
					deleteState === 'confirm' ? 'are you sure?' : 'delete post',
					deletePost,
					false,
					deleteState === 'confirm' ? 'text-red-500' : ''
				)}
			{/if}

			{#snippet trigger()}
				<div
					class="
          		    w-fit items-center rounded-sm transition-opacity
         			duration-100 ease-in-out group-hover:opacity-100
         			{!actionsOpen && !Device.isMobile ? 'opacity-0' : ''}
         			"
					style="background: {color}1f;"
				>
					{@render control('actions', 'heroicons:ellipsis-horizontal-16-solid', (e) => {
						e.stopPropagation();
						actionsOpen = !actionsOpen;
						actionsPos = { x: 0, y: 0 };
					})}
				</div>
			{/snippet}
		</Dropdown>
	</div>
{/snippet}

{#snippet dropdownItem(
	icon: string,
	label: string,
	onClick: () => void,
	autoClose: boolean = true,
	extraClass: string = ''
)}
	<button
		class="
		flex items-center justify-between rounded-sm px-2 py-1.5
		transition-all duration-100 hover:[backdrop-filter:brightness(120%)]
		{extraClass}
		"
		onclick={() => {
			onClick();
			if (autoClose) actionsOpen = false;
		}}
	>
		<span class="font-bold">{label}</span>
		<Icon class="h-6 w-6" {icon} />
	</button>
{/snippet}

<style>
	@reference "../app.css";

	:global(.post-dropdown) {
		@apply flex min-w-54 flex-col gap-1 rounded-sm border-2 p-1 shadow-2xl backdrop-blur-xl backdrop-brightness-60;
	}
</style>
