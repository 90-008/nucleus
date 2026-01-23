<script lang="ts">
	import BskyPost from './BskyPost.svelte';
	import { type State as PostComposerState } from './PostComposer.svelte';
	import { AtpClient } from '$lib/at/client.svelte';
	import { estimatePostHeight } from '$lib/post-height';

	import { accounts } from '$lib/accounts';
	import type { Did, RecordKey } from '@atcute/lexicons/syntax';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';
	import {
		allPosts,
		viewClient,
		accountPreferences,
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
	let virtualList = $state<VirtualList | null>(null);
	let scrollToIndex = $state<number | undefined>(undefined);

	const viewKey = $derived(`${userDid ?? 'anon'}-${selectedFeed}`);

	$effect(() => {
		viewKey; // dependency
		feedServiceDid = null;
		newPostsAvailable = false;
		displayCount = 15;
		measuredHeights = [];
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
	let scheduledFetchInteractions = $state(false);

	export const clearFeed = () => {
		if (!userDid) return;
		scrollToIndex = 0;
		setTimeout(() => (scrollToIndex = undefined), 100);
		newPostsAvailable = false;
		displayCount = 15;
		measuredHeights = [];
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

	let measuredHeights: number[] = $state([]);
	const itemHeights = $derived.by(() => {
		const heights = measuredHeights.slice(0, feedPosts.length);
		while (heights.length < feedPosts.length) {
			heights.push(estimatePostHeight(feedPosts[heights.length]));
		}
		return heights;
	});

	const averageHeight = $derived.by(() => {
		if (measuredHeights.length === 0) return 150;
		const sum = measuredHeights.reduce((a, b) => a + b, 0);
		return sum / measuredHeights.length;
	});

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
						scheduledFetchInteractions = false;
						fetchingInteractions = true;
						await fetchInteractionsToFeedTimelineEnd(client, userDid, selectedFeed);
						fetchingInteractions = false;
					} else {
						scheduledFetchInteractions = true;
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
			<VirtualList
				bind:this={virtualList}
				height="100%"
				itemCount={feedPosts.length}
				itemSize={itemHeights}
				estimatedItemSize={averageHeight}
				scrollToIndex={feedPosts.length > 0 ? scrollToIndex : undefined}
			>
				{#snippet item({ index, style }: { index: number; style: string })}
					{@const { post, postDid, postRkey } = renderItem(index)}
					<div
						style="{style} height: auto;"
						bind:clientHeight={
							() => {
								// we need to return this so the bind works
								return measuredHeights[index] ?? estimatePostHeight(post);
							},
							(h) => {
								// update the height
								if (measuredHeights[index] !== h) measuredHeights[index] = h;
							}
						}
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
				{/snippet}

				{#snippet footer()}
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
				{/snippet}
			</VirtualList>
		{/key}
	{:else}
		<NotLoggedIn />
	{/if}
</div>
