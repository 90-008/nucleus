<script lang="ts">
	import { type AtpClient } from '$lib/at/client';
	import { AppBskyFeedPost } from '@atcute/bluesky';
	import {
		parseCanonicalResourceUri,
		type ActorIdentifier,
		type CanonicalResourceUri,
		type Did,
		type Nsid,
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
	import { type Backlink, type BacklinksSource } from '$lib/at/constellation';
	import { postActions, pulsingPostId, type PostActions } from '$lib/state.svelte';
	import * as TID from '@atcute/tid';
	import type { PostWithUri } from '$lib/at/fetch';
	import { onMount } from 'svelte';
	import type { AtprotoDid } from '@atcute/lexicons/syntax';
	import { derived } from 'svelte/store';

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

	const selectedDid = $derived(client.didDoc?.did ?? null);

	const aturi: CanonicalResourceUri = `at://${did}/app.bsky.feed.post/${rkey}`;
	const color = generateColorForDid(did);

	let handle: ActorIdentifier = $state(did);
	const didDoc = client.resolveDidDoc(did).then((res) => {
		if (res.ok) handle = res.value.handle;
		return res;
	});
	const post = data
		? Promise.resolve(ok(data))
		: client.getRecord(AppBskyFeedPost.mainSchema, did, rkey);
	// const replies = replyBacklinks
	// 	? Promise.resolve(ok(replyBacklinks))
	// 	: client.getBacklinks(
	// 			identifier,
	// 			'app.bsky.feed.post',
	// 			rkey,
	// 			'app.bsky.feed.post:reply.parent.uri'
	// 		);

	const postId = `timeline-post-${aturi}-${quoteDepth}`;
	const isPulsing = derived(pulsingPostId, (pulsingPostId) => pulsingPostId === postId);

	const scrollToAndPulse = (targetUri: ResourceUri) => {
		const targetId = `timeline-post-${targetUri}-0`;
		console.log(`Scrolling to ${targetId}`);
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
		return 'now';
	};

	const findBacklink = $derived(async (toDid: AtprotoDid, source: BacklinksSource) => {
		const backlinks = await client.getBacklinks(did, 'app.bsky.feed.post', rkey, source);
		if (!backlinks.ok) return null;
		return backlinks.value.records.find((r) => r.did === toDid) ?? null;
	});

	let findAllBacklinks = async (did: AtprotoDid | null) => {
		if (!did) return;
		if (postActions.has(`${did}:${aturi}`)) return;
		const backlinks = await Promise.all([
			findBacklink(did, 'app.bsky.feed.like:subject.uri'),
			findBacklink(did, 'app.bsky.feed.repost:subject.uri')
			// findBacklink('app.bsky.feed.post:reply.parent.uri'),
			// findBacklink('app.bsky.feed.post:embed.record.uri')
		]);
		const actions: PostActions = {
			like: backlinks[0],
			repost: backlinks[1]
			// reply: backlinks[2],
			// quote: backlinks[3]
		};
		console.log('findAllBacklinks', did, aturi, actions);
		postActions.set(`${did}:${aturi}`, actions);
	};
	onMount(() => {
		// findAllBacklinks($selectedDid);
		accounts.subscribe((accs) => {
			accs.map((acc) => acc.did).forEach((did) => findAllBacklinks(did));
		});
	});

	const toggleLink = async (link: Backlink | null, collection: Nsid): Promise<Backlink | null> => {
		// console.log('toggleLink', selectedDid, link, collection);
		if (!selectedDid) return null;
		const _post = await post;
		if (!_post.ok) return null;
		if (!link) {
			if (_post.value.cid) {
				const record = {
					$type: collection,
					subject: {
						cid: _post.value.cid,
						uri: aturi
					},
					createdAt: new Date().toISOString()
				};
				const rkey = TID.now();
				// todo: handle errors
				client.atcute?.post('com.atproto.repo.createRecord', {
					input: {
						repo: selectedDid,
						collection,
						record,
						rkey
					}
				});
				return {
					collection,
					did: selectedDid,
					rkey
				};
			}
		} else {
			// todo: handle errors
			client.atcute?.post('com.atproto.repo.deleteRecord', {
				input: {
					repo: link.did,
					collection: link.collection,
					rkey: link.rkey
				}
			});
			return null;
		}
		return link;
	};
</script>

{#snippet embedBadge(record: AppBskyFeedPost.Main)}
	{#if record.embed}
		<span
			class="rounded-full px-2.5 py-0.5 text-xs font-medium"
			style="background: color-mix(in srgb, {mini
				? 'var(--nucleus-fg)'
				: color} 10%, transparent); color: {mini ? 'var(--nucleus-fg)' : color};"
		>
			{getEmbedText(record.embed.$type)}
		</span>
	{/if}
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
					<span style="color: {color};">@{handle}</span>: {@render embedBadge(record)}
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
				class="inline-block h-6 w-6 animate-spin rounded-full border-3 border-(--nucleus-accent) border-l-transparent"
			></div>
			<p class="mt-3 text-sm font-medium opacity-60">loading post...</p>
		</div>
	{:then post}
		{#if post.ok}
			{@const record = post.value.record}
			<div
				id="timeline-post-{post.value.uri}-{quoteDepth}"
				class="rounded-sm border-2 p-2 shadow-lg backdrop-blur-sm transition-all {$isPulsing
					? 'animate-pulse-highlight'
					: ''}"
				style="background: {color}{isOnPostComposer
					? '36'
					: '18'}; border-color: {color}{isOnPostComposer ? '99' : '66'};"
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
								><span class="shrink-0 text-nowrap opacity-70">(@{handle})</span>
							{:else}
								{handle}
							{/if}
						{/await}
					</span>
					<span>·</span>
					<span class="text-nowrap text-(--nucleus-fg)/67"
						>{getRelativeTime(new Date(record.createdAt))}</span
					>
				</div>
				<p class="leading-relaxed text-wrap wrap-break-word">
					{record.text}
					{#if isOnPostComposer}
						{@render embedBadge(record)}
					{/if}
				</p>
				{#if !isOnPostComposer && record.embed}
					{@const embed = record.embed}
					<div class="mt-2">
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
								{@render embedBadge(record)}
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
				{#if !isOnPostComposer}
					{@const backlinks = postActions.get(`${selectedDid!}:${post.value.uri}`)}
					{@render postControls(post.value, backlinks)}
				{/if}
			</div>
		{:else}
			<div class="error-disclaimer">
				<p class="text-sm font-medium">error: {post.error}</p>
			</div>
		{/if}
	{/await}
{/if}

{#snippet postControls(post: PostWithUri, backlinks?: PostActions)}
	<div
		class="group mt-3 flex w-fit max-w-full items-center rounded-sm"
		style="background: {color}1f;"
	>
		{#snippet label(
			name: string,
			icon: string,
			onClick: (link: Backlink | null | undefined) => void,
			backlink?: Backlink | null,
			hasSolid?: boolean
		)}
			<button
				class="px-2 py-1.5 text-(--nucleus-fg)/90 hover:[backdrop-filter:brightness(120%)]"
				onclick={() => onClick(backlink)}
				style="color: {backlink ? color : 'color-mix(in srgb, var(--nucleus-fg) 90%, transparent)'}"
				title={name}
			>
				<Icon icon={hasSolid && backlink ? `${icon}-solid` : icon} width={20} />
			</button>
		{/snippet}
		{@render label('reply', 'heroicons:chat-bubble-left', () => {
			onReply?.(post);
		})}
		{@render label(
			'repost',
			'heroicons:arrow-path-rounded-square-20-solid',
			async (link) => {
				if (link === undefined) return;
				postActions.set(`${selectedDid!}:${aturi}`, {
					...backlinks!,
					repost: await toggleLink(link, 'app.bsky.feed.repost')
				});
			},
			backlinks?.repost
		)}
		{@render label('quote', 'heroicons:paper-clip-20-solid', () => {
			onQuote?.(post);
		})}
		{@render label(
			'like',
			'heroicons:star',
			async (link) => {
				if (link === undefined) return;
				postActions.set(`${selectedDid!}:${aturi}`, {
					...backlinks!,
					like: await toggleLink(link, 'app.bsky.feed.like')
				});
			},
			backlinks?.like,
			true
		)}
	</div>
{/snippet}
