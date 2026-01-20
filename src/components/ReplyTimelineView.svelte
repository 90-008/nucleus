<script lang="ts">
	import BskyPost from './BskyPost.svelte';
	import { type State as PostComposerState } from './PostComposer.svelte';
	import { AtpClient } from '$lib/at/client.svelte';
	import { accounts } from '$lib/accounts';
	import { type ResourceUri } from '@atcute/lexicons';
	import { SvelteSet } from 'svelte/reactivity';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
	import {
		postCursors,
		fetchTimeline,
		allPosts,
		timelines,
		fetchInteractionsToTimelineEnd,
		accountPreferences
	} from '$lib/state.svelte';
	import Icon from '@iconify/svelte';
	import { buildThreads, filterThreads, type ThreadPost } from '$lib/thread';
	import type { Did } from '@atcute/lexicons/syntax';
	import NotLoggedIn from './NotLoggedIn.svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import EndOfList from './EndOfList.svelte';
	import LoadError from './LoadError.svelte';

	interface Props {
		client?: AtpClient | null;
		targetDid?: Did;
		postComposerState: PostComposerState;
		class?: string;
		showReplies?: boolean;
	}

	let {
		client = null,
		targetDid = undefined,
		showReplies = true,
		postComposerState = $bindable(),
		class: className = ''
	}: Props = $props();

	let reverseChronological = $state(true);
	let viewOwnPosts = $state(true);
	const expandedThreads = new SvelteSet<ResourceUri>();

	const userDid = $derived(client?.user?.did);
	const did = $derived(targetDid ?? userDid);

	const currentPrefs = $derived(userDid ? accountPreferences.get(userDid) : null);
	const mutes = $derived(currentPrefs?.mutes ?? []);

	const threads = $derived(
		filterThreads(
			did && timelines.has(did) ? buildThreads(did, timelines.get(did)!, allPosts, mutes) : [],
			$accounts,
			{ viewOwnPosts }
		)
	);

	const loaderState = new LoaderState();
	let scrollContainer = $state<HTMLDivElement>();
	let loading = $state(false);
	let loadError = $state('');

	let fetchingInteractions = $state(false);
	let scheduledFetchInteractions = $state(false);

	const loadMore = async () => {
		if (loading || !client || !userDid || !did) return;

		loading = true;
		loaderState.status = 'LOADING';

		try {
			await fetchTimeline(client, did, 7, showReplies, {
				downwards: userDid === did ? 'sameAuthor' : 'none'
			});
			if (client.user && userDid) {
				if (!fetchingInteractions) {
					scheduledFetchInteractions = false;
					fetchingInteractions = true;
					await fetchInteractionsToTimelineEnd(client, userDid, did);
					fetchingInteractions = false;
				} else {
					scheduledFetchInteractions = true;
				}
			}
			loaderState.loaded();
			const cursor = postCursors.get(did);
			if (cursor?.end) loaderState.complete();
		} catch (error) {
			loadError = `${error}`;
			loaderState.error();
			loading = false;
			return;
		}

		loading = false;
	};

	$effect(() => {
		const isEmpty = threads.length === 0;
		if (isEmpty && !loading && userDid && did) {
			const cursor = postCursors.get(did);
			if (!cursor?.end) loadMore();
		}
	});

	$effect(() => {
		did;
		loaderState.reset();
	});

	// we want to load interactions when changing logged in user
	// only on timelines that arent logged in users, because those are already
	// loaded by loadMore
	$effect(() => {
		if (client && scheduledFetchInteractions && userDid && did && did !== userDid) {
			if (!fetchingInteractions) {
				scheduledFetchInteractions = false;
				fetchingInteractions = true;
				fetchInteractionsToTimelineEnd(client, userDid, did).finally(
					() => (fetchingInteractions = false)
				);
			} else {
				scheduledFetchInteractions = true;
			}
		}
	});
</script>

{#snippet replyPost(post: ThreadPost, reverse: boolean = reverseChronological)}
	<span
		class="mb-1.5 flex items-center gap-1.5 overflow-hidden text-nowrap wrap-break-word overflow-ellipsis"
	>
		<span class="text-sm text-nowrap opacity-60">{reverse ? '↱' : '↳'}</span>
		<BskyPost mini client={client!} {...post} />
	</span>
{/snippet}

{#snippet threadsView()}
	{#each threads as thread, i (thread.rootUri)}
		<div class="flex w-full shrink-0 {reverseChronological ? 'flex-col' : 'flex-col-reverse'}">
			{#if thread.branchParentPost}
				{@render replyPost(thread.branchParentPost)}
			{/if}
			{#each thread.posts as post, idx (post.data.uri)}
				{@const mini =
					!expandedThreads.has(thread.rootUri) &&
					thread.posts.length > 4 &&
					idx > 0 &&
					idx < thread.posts.length - 2}
				{#if !mini}
					<div class="mb-1.5">
						<BskyPost
							client={client!}
							onQuote={(post) => {
								postComposerState.focus = 'focused';
								postComposerState.quoting = post;
							}}
							onReply={(post) => {
								postComposerState.focus = 'focused';
								postComposerState.replying = post;
							}}
							{...post}
						/>
					</div>
				{:else if mini}
					{#if idx === 1}
						{@render replyPost(post, !reverseChronological)}
						<button
							class="mx-1.5 mt-1.5 mb-2.5 flex items-center gap-1.5 text-[color-mix(in_srgb,var(--nucleus-fg)_50%,var(--nucleus-accent))]/70 transition-colors hover:text-(--nucleus-accent)"
							onclick={() => expandedThreads.add(thread.rootUri)}
						>
							<div class="mr-1 h-px w-20 rounded border-y-2 border-dashed opacity-50"></div>
							<Icon
								class="shrink-0"
								icon={reverseChronological
									? 'heroicons:bars-arrow-up-solid'
									: 'heroicons:bars-arrow-down-solid'}
								width={32}
							/><span class="shrink-0 pb-1">view full chain</span>
							<div class="ml-1 h-px w-full rounded border-y-2 border-dashed opacity-50"></div>
						</button>
					{:else if idx === thread.posts.length - 3}
						{@render replyPost(post)}
					{/if}
				{/if}
			{/each}
		</div>
		{#if i < threads.length - 1}
			<div
				class="mx-8 mt-3 mb-4 h-px bg-linear-to-r from-(--nucleus-accent)/30 to-(--nucleus-accent2)/30"
			></div>
		{/if}
	{/each}
{/snippet}

<div
	class="min-h-full p-2 [scrollbar-color:var(--nucleus-accent)_transparent] {className}"
	bind:this={scrollContainer}
>
	{#if did || $accounts.length > 0}
		<InfiniteLoader {loaderState} triggerLoad={loadMore} loopDetectionTimeout={0}>
			{@render threadsView()}
			{#snippet noData()}
				<EndOfList />
			{/snippet}
			{#snippet loading()}
				<LoadingSpinner />
			{/snippet}
			{#snippet error()}
				<LoadError error={loadError} onRetry={loadMore} />
			{/snippet}
		</InfiniteLoader>
	{:else}
		<NotLoggedIn />
	{/if}
</div>
