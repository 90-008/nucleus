<script lang="ts">
	import BskyPost from './BskyPost.svelte';
	import { type State as PostComposerState } from './PostComposer.svelte';
	import { AtpClient } from '$lib/at/client.svelte';
	import { accounts } from '$lib/accounts';
	import type { Did, RecordKey } from '@atcute/lexicons/syntax';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
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
	import Icon from '@iconify/svelte';
	import NotLoggedIn from './NotLoggedIn.svelte';
	import { fetchFeedGenerator } from '$lib/at/feeds';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import EndOfList from './EndOfList.svelte';
	import LoadError from './LoadError.svelte';

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

	$effect(() => {
		selectedFeed;
		feedServiceDid = null;
		newPostsAvailable = false;
		loaderState.reset();
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
	let scrollContainer = $state<HTMLDivElement>();
	let loading = $state(false);
	let loadError = $state('');

	let fetchingInteractions = $state(false);
	let scheduledFetchInteractions = $state(false);

	export const clearFeed = () => {
		if (!userDid) return;
		scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
		newPostsAvailable = false;
		resetFeed(userDid, selectedFeed);
		loaderState.reset();
		loadMore();
	};

	const feedPosts = $derived.by(() => {
		if (!userDid) return [];
		const uris = feedTimelines.get(userDid)?.get(selectedFeed) ?? [];
		return uris
			.map((uri) => {
				const did = uri.split('/')[2] as Did;
				return allPosts.get(did)?.get(uri);
			})
			.filter((p): p is NonNullable<typeof p> => p !== undefined);
	});

	const loadMore = async () => {
		if (loading || !client || !userDid || !feedServiceDid) return;

		loading = true;
		loaderState.status = 'LOADING';

		try {
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

			loaderState.loaded();
			if (result?.end) loaderState.complete();
		} catch (error) {
			loadError = `${error}`;
			loaderState.error();
			loading = false;
			return;
		}

		loading = false;
	};

	$effect(() => {
		const isEmpty = feedPosts.length === 0;
		if (isEmpty && !loading && userDid && feedServiceDid) {
			const cursor = feedCursors.get(userDid)?.get(selectedFeed);
			if (!cursor?.end) loadMore();
		}
	});
</script>

{#snippet feedPostsView()}
	{#each feedPosts as post, i (post.uri)}
		{@const uriParts = post.uri.split('/')}
		{@const postDid = uriParts[2] as Did}
		{@const postRkey = uriParts[4] as RecordKey}
		<div class="mb-1.5">
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
		</div>
		{#if i < feedPosts.length - 1}
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
	{#if newPostsAvailable}
		<div class="sticky top-2 z-20 mb-4 flex w-full justify-center">
			<button
				class="flex action-button items-center gap-2 bg-(--nucleus-bg) hover:scale-115! enabled:hover:bg-(--nucleus-bg)!"
				onclick={clearFeed}
			>
				<Icon icon="heroicons:arrow-up-16-solid" width="20" />
				load new posts
			</button>
		</div>
	{/if}
	{#if userDid || $accounts.length > 0}
		<InfiniteLoader {loaderState} triggerLoad={loadMore} loopDetectionTimeout={0}>
			{@render feedPostsView()}
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
