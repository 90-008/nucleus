<script lang="ts">
	import { type State as PostComposerState } from './PostComposer.svelte';
	import { AtpClient } from '$lib/at/client.svelte';
	import { accounts } from '$lib/accounts';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		fetchFollowingTimeline,
		allPosts,
		followingFeed,
		accountPreferences,
		fetchInteractionsToFollowingTimelineEnd,
		follows,
		followingCursors,
		initialDone
	} from '$lib/state.svelte';
	import { buildThreads, filterThreads } from '$lib/thread';
	import type { Did } from '@atcute/lexicons/syntax';
	import GenericTimelineView from './GenericTimelineView.svelte';

	interface Props {
		client?: AtpClient | null;
		postComposerState: PostComposerState;
		class?: string;
		targetDid?: Did;
	}

	let {
		client = null,
		postComposerState = $bindable(),
		class: className = '',
		targetDid = undefined
	}: Props = $props();

	let viewOwnPosts = $state(true);

	const userDid = $derived(targetDid ?? client?.user?.did);

	const currentPrefs = $derived(userDid ? accountPreferences.get(userDid) : null);
	const mutes = $derived(currentPrefs?.mutes ?? []);

	const followedDids = $derived.by(() => {
		if (!userDid) return new Set<Did>();
		const map = follows.get(userDid);
		if (!map) return new Set<Did>();
		return new Set(map.keys());
	});

	const threads = $derived(
		filterThreads(
			userDid
				? buildThreads(userDid, followingFeed.get(userDid) ?? new SvelteSet(), allPosts, mutes)
				: [],
			$accounts,
			{
				viewOwnPosts,
				filterReplies: true,
				filterRootsToDids: followedDids
			}
		)
	);

	const isComplete = $derived.by(() => {
		if (!userDid) return false;
		const cursors = followingCursors.get(userDid);
		const subjects = follows.get(userDid);

		// if no cursors yet, we haven't started
		if (!cursors) return false;

		// Check self
		if (cursors.get(userDid) !== null) return false;

		// Check follows
		if (subjects) {
			for (const subject of subjects.keys()) {
				// if checking logic in state.svelte.ts:
				// undefined means "not fetched", null means "exhausted"
				// if any cursor is undefined or string, it's not complete.
				if (cursors.get(subject) !== null) return false;
			}
		}

		return true;
	});

	let fetchingInteractions = $state(false);
	let scheduledFetchInteractions = $state(false);

	const loadMore = async () => {
		if (!client || !userDid) return;

		await fetchFollowingTimeline(client, userDid);

		if (client.user && userDid) {
			if (!fetchingInteractions) {
				scheduledFetchInteractions = false;
				fetchingInteractions = true;
				await fetchInteractionsToFollowingTimelineEnd(client, userDid);
				fetchingInteractions = false;
			} else {
				scheduledFetchInteractions = true;
			}
		}
	};

	$effect(() => {
		if (client && scheduledFetchInteractions && userDid) {
			if (!fetchingInteractions) {
				scheduledFetchInteractions = false;
				fetchingInteractions = true;
				fetchInteractionsToFollowingTimelineEnd(client, userDid).finally(
					() => (fetchingInteractions = false)
				);
			}
		}
	});
</script>

<GenericTimelineView
	{client}
	{threads}
	bind:postComposerState
	class={className}
	isLoggedIn={!!(userDid || $accounts.length > 0)}
	canLoad={!!(client && userDid && initialDone.has(userDid))}
	onLoadMore={loadMore}
	{isComplete}
/>
