<script lang="ts">
	import BskyPost from './BskyPost.svelte';
	import { type State as PostComposerState } from './PostComposer.svelte';
	import { AtpClient } from '$lib/at/client.svelte';
	import { type ResourceUri } from '@atcute/lexicons';
	import { SvelteSet } from 'svelte/reactivity';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
	import Icon from '@iconify/svelte';
	import { type ThreadPost, type Thread } from '$lib/thread';
	import NotLoggedIn from './NotLoggedIn.svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import EndOfList from './EndOfList.svelte';
	import LoadError from './LoadError.svelte';
	import LoadNewPosts from './LoadNewPosts.svelte';
	import { onMount } from 'svelte';
	import { initialDone } from '$lib/state.svelte';

	interface Props {
		client?: AtpClient | null;
		threads: Thread[];
		timelineId?: string;
		postComposerState: PostComposerState;
		class?: string;
		isLoggedIn?: boolean; // Controls rendering of the list vs NotLoggedIn
		canLoad?: boolean; // Controls whether we can actually load more data
		onLoadMore: () => Promise<void>;
		isComplete?: boolean;
	}

	let {
		client = null,
		threads,
		timelineId = undefined,
		postComposerState = $bindable(),
		class: className = '',
		isLoggedIn = false,
		canLoad = undefined,
		onLoadMore,
		isComplete = false
	}: Props = $props();

	const shouldLoad = $derived(canLoad ?? isLoggedIn);

	let reverseChronological = $state(true);
	const expandedThreads = new SvelteSet<ResourceUri>();

	let isAtTop = $state(true);
	let boundaryTime = $state<number | null>(null);

	const visibleThreads = $derived.by(() => {
		if (boundaryTime === null) return threads;
		return threads.filter((t) => t.newestTime <= boundaryTime!);
	});

	let displayCount = $state(15);
	$effect(() => {
		timelineId;
		displayCount = 15;
	});

	const renderedThreads = $derived(visibleThreads.slice(0, displayCount));

	$effect(() => {
		if (threads.length > 0) {
			if (isAtTop) boundaryTime = threads[0].newestTime;
			else if (boundaryTime === null) boundaryTime = threads[0].newestTime;
		}
	});

	const showNewPosts = () => {
		boundaryTime = threads[0]?.newestTime ?? null;
		window.scrollTo({ top: 0, behavior: 'instant' });
		isAtTop = true;
	};

	const onScroll = () => (isAtTop = window.scrollY < 300);

	const loaderState = new LoaderState();
	let loading = $state(false);
	let loadError = $state('');

	const loadMore = async () => {
		if (loading || !shouldLoad) return;

		loading = true;
		loaderState.status = 'LOADING';
		loadError = '';

		try {
			displayCount += 10;
			const bufferSize = visibleThreads.length - displayCount;

			if (bufferSize < 5 && !isComplete) await onLoadMore();

			loaderState.loaded();
			if (isComplete && displayCount >= visibleThreads.length) loaderState.complete();
		} catch (error) {
			loadError = `${error}`;
			loaderState.error();
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		const isEmpty = threads.length < 15;
		if (isEmpty && !loading && shouldLoad && !isComplete) loadMore();
	});

	$effect(() => {
		if (!initialDone.has(client?.user?.did ?? 'did:plc:invalid')) {
			loading = true;
			loaderState.status = 'LOADING';
		} else {
			loading = false;
			loaderState.loaded();
		}
	});
</script>

<svelte:window onscroll={onScroll} />

{#snippet replyPost(post: ThreadPost, reverse: boolean = reverseChronological)}
	<span
		class="mb-1.5 flex items-center gap-1.5 overflow-hidden text-nowrap wrap-break-word overflow-ellipsis"
	>
		<span class="text-sm text-nowrap opacity-60">{reverse ? '↱' : '↳'}</span>
		<BskyPost mini client={client!} {...post} />
	</span>
{/snippet}

{#snippet threadsView()}
	{#each renderedThreads as thread, i (thread.rootUri)}
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
		{#if i < renderedThreads.length - 1}
			<div
				class="mx-8 mt-3 mb-4 h-px bg-linear-to-r from-(--nucleus-accent)/30 to-(--nucleus-accent2)/30"
			></div>
		{/if}
	{/each}
{/snippet}

<div class="min-h-full p-2 [scrollbar-color:var(--nucleus-accent)_transparent] {className}">
	<LoadNewPosts
		visible={threads.length > 0 && boundaryTime !== null && threads[0].newestTime > boundaryTime}
		onclick={showNewPosts}
	/>
	{#if isLoggedIn}
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
