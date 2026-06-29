<script lang="ts">
	import BskyPost from './BskyPost.svelte';
	import { type State as PostComposerState } from './PostComposer.svelte';
	import { AtpClient } from '$lib/at/client.svelte';
	import { estimatePostHeight } from '$lib/post-height';

	import { accounts } from '$lib/accounts';
	import type { Did, RecordKey } from '@atcute/lexicons/syntax';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import {
		allPosts,
		viewClient,
		feedTimelines,
		feedCursors,
		fetchFeed,
		resetFeed,
		checkForNewPosts,
		fetchInteractionsToFeedTimelineEnd
	} from '$lib/state.svelte';
	import NotLoggedIn from './NotLoggedIn.svelte';
	import { fetchFeedGenerator } from '$lib/at/feeds';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import EndOfList from './EndOfList.svelte';
	import LoadError from './LoadError.svelte';
	import LoadNewPosts from './LoadNewPosts.svelte';

	interface Props {
		client?: AtpClient | null;
		postComposerState: PostComposerState;
		class?: string;
		selectedFeed: string;
	}

	let {
		client = null,
		postComposerState = $bindable(),
		selectedFeed,
		class: className = ''
	}: Props = $props();

	const userDid = $derived(client?.user?.did);

	let feedServiceDid = $state<string | null>(null);
	let newPostsAvailable = $state(false);
	let scrollToIndex = $state<number | undefined>(undefined);

	const viewKey = $derived(`${userDid ?? 'anon'}-${selectedFeed}`);

	$effect(() => {
		void viewKey; // dependency
		feedServiceDid = null;
		newPostsAvailable = false;
		displayCount = 15;
		loaderState.reset();
		scrollToIndex = undefined;

		fetchFeedGenerator(client ?? viewClient, selectedFeed).then((meta) => {
			feedServiceDid = meta?.did ?? null;
		});
	});

	$effect(() => {
		if (!client || !feedServiceDid) return;

		const check = async () => {
			if (!client || !feedServiceDid) return;
			newPostsAvailable = await checkForNewPosts(client, selectedFeed, feedServiceDid);
		};

		check();
		const interval = setInterval(check, 15000);

		return () => clearInterval(interval);
	});

	const loaderState = new LoaderState();
	let loading = $state(false);
	let loadError = $state('');

	let fetchingInteractions = $state(false);

	export const clearFeed = () => {
		if (!userDid) return;
		scrollToIndex = 0;
		setTimeout(() => (scrollToIndex = undefined), 100);
		newPostsAvailable = false;
		displayCount = 15;
		resetFeed(userDid, selectedFeed);
		loaderState.reset();
		loadMore();
	};

	let displayCount = $state(15);

	const feedPosts = $derived.by(() => {
		if (!userDid) return [];
		const uris = feedTimelines.get(userDid)?.get(selectedFeed) ?? [];
		return uris
			.map((uri) => allPosts.get(uri))
			.filter((p): p is NonNullable<typeof p> => p !== undefined);
	});

	let parentRef = $state<HTMLDivElement | null>(null);
	const virtualizer = createVirtualizer({
		count: 0,
		getScrollElement: () => parentRef,
		estimateSize: (index) => estimatePostHeight(feedPosts[index]),
		overscan: 5,
		getItemKey: (index) => feedPosts[index]?.uri ?? index
	});

	$effect(() => {
		$virtualizer.setOptions({
			count: feedPosts.length,
			getScrollElement: () => parentRef,
			estimateSize: (index) => estimatePostHeight(feedPosts[index]),
			overscan: 5,
			getItemKey: (index) => feedPosts[index]?.uri ?? index
		});
	});

	$effect(() => {
		if (scrollToIndex !== undefined) {
			$virtualizer.scrollToIndex(scrollToIndex);
		}
	});

	const measureElement = (node: HTMLElement) => {
		$virtualizer.measureElement(node);
	};

	const loadMore = async () => {
		if (loading || !client || !userDid || !feedServiceDid) return;

		loading = true;
		loaderState.status = 'LOADING';

		try {
			displayCount += 10;
			const bufferSize = feedPosts.length - displayCount;
			const cursor = feedCursors.get(userDid)?.get(selectedFeed);

			if (bufferSize < 5 && !cursor?.end) {
				const result = await fetchFeed(client, selectedFeed, feedServiceDid);
				if (client.user && userDid) {
					if (!fetchingInteractions) {
						fetchingInteractions = true;
						await fetchInteractionsToFeedTimelineEnd(client, userDid, selectedFeed);
						fetchingInteractions = false;
					}
				}
				console.log('feed loaded', result?.end);
				if (result?.end) loaderState.complete();
			} else {
				if (cursor?.end && displayCount >= feedPosts.length) loaderState.complete();
			}
			loaderState.loaded();
		} catch (error) {
			loadError = `${error}`;
			loaderState.error();
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		const isEmpty = feedPosts.length === 0;
		if (isEmpty && !loading && userDid && feedServiceDid) {
			const cursor = feedCursors.get(userDid)?.get(selectedFeed);
			if (!cursor?.end) loadMore();
		}
	});

	const renderItem = (index: number) => {
		const post = feedPosts[index];
		if (!post) return { post: null, postDid: null, postRkey: null };
		const uriParts = post.uri.split('/');
		const postDid = uriParts[2] as Did;
		const postRkey = uriParts[4] as RecordKey;
		return { post, postDid, postRkey };
	};
</script>

<div class="h-full [scrollbar-color:var(--nucleus-accent)_transparent] {className}">
	<LoadNewPosts visible={newPostsAvailable} onclick={clearFeed} />
	{#if userDid || $accounts.length > 0}
		{#key viewKey}
			<div
				bind:this={parentRef}
				class="h-full overflow-x-hidden overflow-y-auto"
				style="position: relative;"
			>
				<div style="height: {$virtualizer.getTotalSize()}px; width: 100%; position: relative;">
					{#each $virtualizer.getVirtualItems() as virtualItem (virtualItem.key)}
						{@const { post, postDid, postRkey } = renderItem(virtualItem.index)}
						<div
							data-index={virtualItem.index}
							use:measureElement
							style="position: absolute; top: 0; left: 0; width: 100%; transform: translateY({virtualItem.start}px);"
						>
							<div
								class="mx-2 mb-1.5 border-b border-dashed border-[color-mix(in_srgb,var(--nucleus-accent)_30%,transparent)] pb-3 last:border-0"
							>
								{#if post && postDid && postRkey}
									<BskyPost
										client={client!}
										did={postDid}
										rkey={postRkey}
										data={post}
										onQuote={(p) => {
											postComposerState.focus = 'focused';
											postComposerState.quoting = p;
										}}
										onReply={(p) => {
											postComposerState.focus = 'focused';
											postComposerState.replying = p;
										}}
									/>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<div class="pb-20">
					<InfiniteLoader {loaderState} triggerLoad={loadMore} loopDetectionTimeout={0}>
						<div class="h-px w-px opacity-0"></div>
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
				</div>
			</div>
		{/key}
	{:else}
		<NotLoggedIn />
	{/if}
</div>
