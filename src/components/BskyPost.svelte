<script lang="ts">
	import { resolveDidDoc, type AtpClient } from '$lib/at/client.svelte';
	import { AppBskyEmbedRecord, AppBskyFeedPost } from '@atcute/bluesky';
	import {
		parseCanonicalResourceUri,
		type Did,
		type Handle,
		type RecordKey,
		type ResourceUri
	} from '@atcute/lexicons';
	import { err, expect, ok, type Result } from '$lib/result';
	import { accounts, generateColorForDid } from '$lib/accounts';
	import ProfilePicture from './ProfilePicture.svelte';
	import BskyPost from './BskyPost.svelte';
	import Icon from '@iconify/svelte';
	import {
		allPosts,
		pulsingPostId,
		currentTime,
		deletePostBacklink,
		createPostBacklink,
		router,
		profiles,
		handles,
		hasBacklink,
		getBlockRelationship,
		clients
	} from '$lib/state.svelte';
	import type { PostWithUri } from '$lib/at/fetch';
	import { onMount, type Snippet } from 'svelte';
	import { derived } from 'svelte/store';
	import Dropdown from './Dropdown.svelte';
	import { settings } from '$lib/settings';
	import RichText from './RichText.svelte';
	import { getRelativeTime } from '$lib/date';
	import { likeSource, repostSource, toCanonicalUri } from '$lib';
	import ProfileInfo from './ProfileInfo.svelte';
	import EmbedBadge from './EmbedBadge.svelte';
	import EmbedMedia from './EmbedMedia.svelte';

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
		cornerFragment?: Snippet;
		blockRelationship?: { userBlocked: boolean; blockedByTarget: boolean };
		isMuted?: boolean;
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
		isOnPostComposer = false /* replyBacklinks */,
		cornerFragment,
		blockRelationship = undefined,
		isMuted = false
	}: Props = $props();

	const user = $derived(client.user);
	const isLoggedInUser = $derived($accounts.some((acc) => acc.did === did));

	const aturi = $derived(toCanonicalUri({ did, collection: 'app.bsky.feed.post', rkey }));
	const color = $derived(generateColorForDid(did));

	let expandDisallowed = $state(false);
	const blockRel = $derived(
		user && !isOnPostComposer
			? (blockRelationship ?? getBlockRelationship(user.did, did))
			: { userBlocked: false, blockedByTarget: false }
	);
	const showAsBlocked = $derived(
		(blockRel.userBlocked || blockRel.blockedByTarget) && !expandDisallowed
	);
	const showAsMuted = $derived(isMuted && !expandDisallowed);

	const handle = $derived(handles.get(did) ?? 'handle.invalid');
	$effect(() => {
		resolveDidDoc(did).then((res) => {
			if (res.ok) handles.set(did, res.value.handle);
		});
	});
	const profile = $derived(profiles.get(did));
	$effect(() => {
		client.getProfile(did).then((res) => {
			if (!res.ok) return;
			profiles.set(did, res.value);
		});
	});

	// svelte-ignore state_referenced_locally
	let post: Result<PostWithUri, string> = $state(data ? ok(data) : err("post couldn't be loaded"));
	$effect(() => {
		client.getRecord(AppBskyFeedPost.mainSchema, did, rkey).then((res) => {
			if (!res.ok) return;
			post = res;
		});
	});

	const postId = $derived(
		`timeline-post-${did.replace(/[^a-zA-Z0-9]/g, '_')}-${rkey}-${quoteDepth}`
	);
	const isPulsing = derived(pulsingPostId, (pulsingPostId) => pulsingPostId === postId);

	const scrollToAndPulse = (targetUri: ResourceUri) => {
		const targetId = `timeline-post-${targetUri}-0`;
		const element = document.getElementById(targetId);
		if (!element) return;

		element.scrollIntoView({ behavior: 'smooth', block: 'center' });

		setTimeout(() => {
			document.documentElement.style.setProperty(
				'--nucleus-selected-post',
				generateColorForDid(expect(parseCanonicalResourceUri(targetUri)).repo)
			);
			pulsingPostId.set(targetId);
			setTimeout(() => pulsingPostId.set(null), 1200);
		}, 400);
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

		clients
			.get(did)
			?.user?.atcute.post('com.atproto.repo.deleteRecord', {
				input: {
					collection: 'app.bsky.feed.post',
					repo: did,
					rkey
				}
			})
			.then((result) => {
				if (!result.ok) return;
				allPosts.delete(aturi);
				deleteState = 'deleted';
			});
		actionsOpen = false;
	};

	let profileOpen = $state(false);
</script>

{#snippet profileInline()}
	<button
		class="
		flex min-w-0 items-center gap-2 font-bold {isOnPostComposer ? 'contrast-125' : ''}
		rounded-sm pr-1 transition-colors duration-100 ease-in-out hover:bg-white/10
		"
		style="color: {color};"
		onclick={() => ((profileOpen = false), router.navigate(`/profile/${did}`))}
	>
		<ProfilePicture {client} {did} size={8} />

		{#if profile}
			<span class="w-min max-w-sm min-w-0 overflow-hidden text-nowrap overflow-ellipsis"
				>{profile.displayName?.length === 0 ? handle : profile.displayName}</span
			><span class="shrink-0 text-sm text-nowrap opacity-70">(@{handle})</span>
		{:else}
			{handle}
		{/if}
	</button>
{/snippet}

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
				{#if showAsBlocked || showAsMuted}
					<button
						onclick={() => (expandDisallowed = true)}
						class="text-left hover:cursor-pointer hover:underline"
					>
						<span style="color: {color};">post from {showAsBlocked ? 'blocked' : 'muted'} user</span
						> (click to show)
					</button>
				{:else}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						onclick={() => scrollToAndPulse(post.value.uri)}
						class="hover:cursor-pointer hover:underline"
					>
						<span style="color: {color};">@{handle}</span>:
						{#if record.embed}
							<EmbedBadge embed={record.embed} />
						{/if}
						<span title={record.text}>{record.text}</span>
					</div>
				{/if}
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
			{#if showAsBlocked || showAsMuted}
				<button
					onclick={() => (expandDisallowed = true)}
					class="
				group w-full rounded-sm border-2 p-3 text-left shadow-lg
				backdrop-blur-sm transition-all hover:border-(--nucleus-accent)
				"
					style="background: {color}18; border-color: {color}66;"
				>
					<div class="flex items-center gap-2">
						<span class="opacity-80">post from {showAsBlocked ? 'blocked' : 'muted'} user</span>
						<span class="text-sm opacity-60">(click to show)</span>
					</div>
				</button>
			{:else}
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
					<div class="mb-3 flex max-w-full items-center justify-between">
						<div class="flex items-center gap-1 rounded-sm pr-1" style="background: {color}33;">
							{@render profilePopout()}
							<span>·</span>
							<span
								title={new Date(record.createdAt).toLocaleString()}
								class="pl-0.5 text-nowrap text-(--nucleus-fg)/67"
							>
								{getRelativeTime(new Date(record.createdAt), currentTime)}
							</span>
						</div>
						{@render cornerFragment?.()}
					</div>

					<p class="leading-normal text-wrap wrap-break-word">
						<RichText text={record.text} facets={record.facets ?? []} />
						{#if isOnPostComposer && record.embed}
							<EmbedBadge embed={record.embed} {color} />
						{/if}
					</p>
					{#if !isOnPostComposer && record.embed}
						{@const embed = record.embed}
						<div class="mt-2">
							{#if embed.$type === 'app.bsky.embed.images' || embed.$type === 'app.bsky.embed.video'}
								<EmbedMedia {did} {embed} />
							{:else if embed.$type === 'app.bsky.embed.record'}
								{@render embedPost(embed.record.uri)}
							{:else if embed.$type === 'app.bsky.embed.recordWithMedia'}
								<div class="space-y-1.5">
									<EmbedMedia {did} embed={embed.media} />
									{@render embedPost(embed.record.record.uri)}
								</div>
							{/if}
						</div>
					{/if}
					{#if !isOnPostComposer}
						{@render postControls(post.value)}
					{/if}
				</div>
			{/if}
		{:else}
			<div class="error-disclaimer">
				<p class="text-sm font-medium">error: {post.error}</p>
			</div>
		{/if}
	{/await}
{/if}

{#snippet embedPost(uri: ResourceUri)}
	{#if quoteDepth < 2}
		{@const parsedUri = expect(parseCanonicalResourceUri(uri))}
		{@const embedBlockRel =
			user?.did && !isOnPostComposer
				? getBlockRelationship(user.did, parsedUri.repo)
				: { userBlocked: false, blockedByTarget: false }}
		{@const embedIsBlocked = embedBlockRel.userBlocked || embedBlockRel.blockedByTarget}

		<!-- reject recursive quotes -->
		{#if !(did === parsedUri.repo && rkey === parsedUri.rkey)}
			{#if embedIsBlocked}
				<div
					class="rounded-sm border-2 p-2 text-sm opacity-70"
					style="background: {generateColorForDid(
						parsedUri.repo
					)}11; border-color: {generateColorForDid(parsedUri.repo)}44;"
				>
					quoted post from blocked user
				</div>
			{:else}
				<BskyPost
					{client}
					quoteDepth={quoteDepth + 1}
					did={parsedUri.repo}
					rkey={parsedUri.rkey}
					{isOnPostComposer}
					{onQuote}
					{onReply}
				/>
			{/if}
		{:else}
			<span>you think you're funny with that recursive quote but i'm onto you</span>
		{/if}
	{:else}
		<EmbedBadge embed={{ $type: 'app.bsky.embed.record' } as AppBskyEmbedRecord.Main} />
	{/if}
{/snippet}

{#snippet postControls(post: PostWithUri)}
	{@const myRepost = user ? hasBacklink(post.uri, repostSource, user.did) : false}
	{@const myLike = user ? hasBacklink(post.uri, likeSource, user.did) : false}
	{#snippet control({
		name,
		icon,
		onClick,
		isFull,
		hasSolid,
		canBeDisabled = true,
		iconColor = color
	}: {
		name: string;
		icon: string;
		onClick: (e: MouseEvent) => void;
		isFull?: boolean;
		hasSolid?: boolean;
		canBeDisabled?: boolean;
		iconColor?: string;
	})}
		<button
			class="
			px-1.75 py-1.5 text-(--nucleus-fg)/90 transition-all
			duration-100 not-disabled:hover:[backdrop-filter:brightness(120%)]
			disabled:cursor-not-allowed!
			"
			onclick={(e) => onClick(e)}
			style="color: {isFull ? iconColor : 'color-mix(in srgb, var(--nucleus-fg) 90%, transparent)'}"
			title={name}
			disabled={canBeDisabled ? user?.did === undefined : false}
		>
			<Icon icon={hasSolid && isFull ? `${icon}-solid` : icon} width={20} />
		</button>
	{/snippet}
	<div class="mt-3 flex w-full items-center justify-between">
		<div class="flex w-fit items-center rounded-sm" style="background: {color}1f;">
			{@render control({
				name: 'reply',
				icon: 'heroicons:chat-bubble-left',
				hasSolid: true,
				onClick: () => onReply?.(post)
			})}
			{@render control({
				name: 'repost',
				icon: 'heroicons:arrow-path-rounded-square-20-solid',
				onClick: () => {
					if (!user?.did) return;
					if (myRepost) deletePostBacklink(client, post, repostSource);
					else createPostBacklink(client, post, repostSource);
				},
				isFull: myRepost
			})}
			{@render control({
				name: 'quote',
				icon: 'heroicons:paper-clip-20-solid',
				onClick: () => onQuote?.(post)
			})}
			{@render control({
				name: 'like',
				icon: 'heroicons:star',
				onClick: () => {
					if (!user?.did) return;
					if (myLike) deletePostBacklink(client, post, likeSource);
					else createPostBacklink(client, post, likeSource);
				},
				isFull: myLike,
				hasSolid: true
			})}
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
			{@render dropdownItem(undefined, 'copy at uri', () =>
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
				{@render control({
					name: 'actions',
					icon: 'heroicons:ellipsis-horizontal-16-solid',
					onClick: (e: MouseEvent) => {
						e.stopPropagation();
						actionsOpen = !actionsOpen;
						actionsPos = { x: 0, y: 0 };
					},
					canBeDisabled: false,
					isFull: true,
					iconColor: 'color-mix(in srgb, var(--nucleus-fg) 70%, transparent)'
				})}
			{/snippet}
		</Dropdown>
	</div>
{/snippet}

{#snippet dropdownItem(
	icon: string | undefined,
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
		<span class="font-semibold opacity-85">{label}</span>
		{#if icon}
			<Icon class="h-6 w-6" {icon} />
		{/if}
	</button>
{/snippet}
