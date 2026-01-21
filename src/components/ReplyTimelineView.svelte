<script lang="ts">
	import { type State as PostComposerState } from './PostComposer.svelte';
	import { AtpClient } from '$lib/at/client.svelte';
	import { accounts } from '$lib/accounts';
	import {
		postCursors,
		fetchTimeline,
		allPosts,
		timelines,
		fetchInteractionsToTimelineEnd,
		accountPreferences
	} from '$lib/state.svelte';
	import { buildThreads, filterThreads } from '$lib/thread';
	import type { Did } from '@atcute/lexicons/syntax';
	import GenericTimelineView from './GenericTimelineView.svelte';

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

	let viewOwnPosts = $state(true);

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

	let fetchingInteractions = $state(false);
	let scheduledFetchInteractions = $state(false);

	const loadMore = async () => {
		if (!client || !userDid || !did) return;

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
	};

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

<GenericTimelineView
	{client}
	{threads}
	bind:postComposerState
	class={className}
	isLoggedIn={!!(did || $accounts.length > 0)}
	canLoad={!!(client && userDid && did)}
	onLoadMore={loadMore}
	isComplete={did ? postCursors.get(did)?.end : false}
/>
