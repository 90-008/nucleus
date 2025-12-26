<script lang="ts">
	import BskyPost from '$components/BskyPost.svelte';
	import PostComposer, { type State as PostComposerState } from '$components/PostComposer.svelte';
	import AccountSelector from '$components/AccountSelector.svelte';
	import SettingsView from '$components/SettingsView.svelte';
	import NotificationsView from '$components/NotificationsView.svelte';
	import FollowingView from '$components/FollowingView.svelte';
	import { AtpClient, streamNotifications, type NotificationsStreamEvent } from '$lib/at/client';
	import { accounts, type Account } from '$lib/accounts';
	import { parseCanonicalResourceUri, type ResourceUri } from '@atcute/lexicons';
	import { onMount, tick } from 'svelte';
	import { hydratePosts } from '$lib/at/fetch';
	import { expect } from '$lib/result';
	import { AppBskyFeedPost } from '@atcute/bluesky';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
	import {
		addPosts,
		clients,
		cursors,
		fetchFollowPosts,
		fetchFollows,
		fetchTimeline,
		follows,
		getClient,
		notificationStream,
		posts,
		viewClient,
		jetstream,
		handleJetstreamEvent
	} from '$lib/state.svelte';
	import { get } from 'svelte/store';
	import Icon from '@iconify/svelte';
	import { sessions } from '$lib/at/oauth';
	import type { AtprotoDid, Did } from '@atcute/lexicons/syntax';
	import type { PageProps } from './+page';
	import { buildThreads, filterThreads, type ThreadPost } from '$lib/thread';
	import { JetstreamSubscription } from '@atcute/jetstream';
	import { settings } from '$lib/settings';

	const { data: loadData }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let errors = $state(loadData.client.ok ? [] : [loadData.client.error]);
	let errorsOpen = $state(false);
	let selectedDid = $state((localStorage.getItem('selectedDid') ?? null) as AtprotoDid | null);
	$effect(() => {
		if (selectedDid) localStorage.setItem('selectedDid', selectedDid);
		else localStorage.removeItem('selectedDid');
	});
	const selectedClient = $derived(selectedDid ? clients.get(selectedDid) : null);

	const loginAccount = async (account: Account) => {
		if (clients.has(account.did)) return;
		const client = new AtpClient();
		const result = await client.login(await sessions.get(account.did));
		if (!result.ok) {
			errors.push(`failed to login into @${account.handle ?? account.did}: ${result.error}`);
			return;
		}
		clients.set(account.did, client);
	};
	const handleAccountSelected = async (did: AtprotoDid) => {
		selectedDid = did;
		const account = $accounts.find((acc) => acc.did === did);
		if (account && (!clients.has(account.did) || !clients.get(account.did)?.atcute))
			await loginAccount(account);
	};

	const handleLogout = async (did: AtprotoDid) => {
		await sessions.remove(did);
		const newAccounts = $accounts.filter((acc) => acc.did !== did);
		$accounts = newAccounts;
		clients.delete(did);
		posts.delete(did);
		cursors.delete(did);
		handleAccountSelected(newAccounts[0]?.did);
	};

	type View = 'timeline' | 'notifications' | 'following' | 'settings';
	let currentView = $state<View>('timeline');
	let animClass = $state('animate-fade-in-scale');
	let scrollPositions = new SvelteMap<View, number>();

	const viewOrder: Record<View, number> = {
		timeline: 0,
		following: 1,
		notifications: 2,
		settings: 3
	};

	const switchView = async (newView: View) => {
		if (currentView === newView) return;
		scrollPositions.set(currentView, window.scrollY);

		const direction = viewOrder[newView] > viewOrder[currentView] ? 'right' : 'left';
		animClass = direction === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left';
		currentView = newView;

		await tick();

		window.scrollTo({ top: scrollPositions.get(newView) || 0, behavior: 'instant' });
	};
	let reverseChronological = $state(true);
	let viewOwnPosts = $state(true);

	const threads = $derived(
		filterThreads(
			buildThreads(
				$accounts.map((account) => account.did),
				posts
			),
			$accounts,
			{ viewOwnPosts }
		)
	);
	let postComposerState = $state<PostComposerState>({ type: 'null' });

	const expandedThreads = new SvelteSet<ResourceUri>();

	const fetchTimelines = (newAccounts: Account[]) =>
		Promise.all(newAccounts.map((acc) => fetchTimeline(acc.did)));

	const handleNotification = async (event: NotificationsStreamEvent) => {
		if (event.type === 'message') {
			const parsedSubjectUri = expect(parseCanonicalResourceUri(event.data.link.subject));
			const did = parsedSubjectUri.repo as AtprotoDid;
			const client = await getClient(did);
			const subjectPost = await client.getRecord(
				AppBskyFeedPost.mainSchema,
				did,
				parsedSubjectUri.rkey
			);
			if (!subjectPost.ok) return;

			const parsedSourceUri = expect(parseCanonicalResourceUri(event.data.link.source_record));
			const hydrated = await hydratePosts(client, did, [
				{
					record: subjectPost.value.record,
					uri: event.data.link.subject,
					cid: subjectPost.value.cid,
					replies: {
						cursor: null,
						total: 1,
						records: [
							{
								did: parsedSourceUri.repo,
								collection: parsedSourceUri.collection,
								rkey: parsedSourceUri.rkey
							}
						]
					}
				}
			]);
			if (!hydrated.ok) {
				errors.push(`cant hydrate posts ${did}: ${hydrated.error}`);
				return;
			}

			// console.log(hydrated);
			addPosts(did, hydrated.value);
		}
	};

	const loaderState = new LoaderState();
	let scrollContainer = $state<HTMLDivElement>();

	let loading = $state(false);
	let loadError = $state('');
	let showScrollToTop = $state(false);

	const handleScroll = () => {
		if (currentView === 'timeline') showScrollToTop = window.scrollY > 300;
	};
	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const loadMore = async () => {
		if (loading || $accounts.length === 0) return;

		loading = true;
		loaderState.status = 'LOADING';

		try {
			await fetchTimelines($accounts);
			loaderState.loaded();
		} catch (error) {
			loadError = `${error}`;
			loaderState.error();
			loading = false;
			return;
		}

		loading = false;
		if (cursors.values().every((cursor) => cursor.end)) loaderState.complete();
	};

	onMount(() => {
		window.addEventListener('scroll', handleScroll);

		accounts.subscribe((newAccounts) => {
			get(notificationStream)?.stop();
			// jetstream.set(null);
			if (newAccounts.length === 0) return;
			notificationStream.set(
				streamNotifications(
					newAccounts.map((account) => account.did),
					'app.bsky.feed.post:reply.parent.uri',
					'app.bsky.feed.post:embed.record.record.uri',
					'app.bsky.feed.post:embed.record.uri'
				)
			);
		});
		notificationStream.subscribe((stream) => {
			if (!stream) return;
			stream.listen(handleNotification);
		});

		console.log(`creating jetstream subscription to ${$settings.endpoints.jetstream}`);
		const jetstreamSub = new JetstreamSubscription({
			url: $settings.endpoints.jetstream,
			wantedCollections: ['app.bsky.feed.post'],
			wantedDids: ['did:web:guestbook.gaze.systems'] // initially contain sentinel
		});
		jetstream.set(jetstreamSub);

		(async () => {
			console.log('polling for jetstream...');
			for await (const event of jetstreamSub) handleJetstreamEvent(event);
		})();

		if ($accounts.length > 0) {
			loaderState.status = 'LOADING';
			if (loadData.client.ok && loadData.client.value) {
				const loggedInDid = loadData.client.value.user!.did as AtprotoDid;
				selectedDid = loggedInDid;
				clients.set(loggedInDid, loadData.client.value);
			}
			if (!$accounts.some((account) => account.did === selectedDid)) selectedDid = $accounts[0].did;
			// console.log('onMount selectedDid', selectedDid);
			Promise.all($accounts.map(loginAccount)).then(() => {
				$accounts.forEach((account) =>
					fetchFollows(account.did).then(() =>
						follows
							.get(account.did)
							?.forEach((follow) => fetchFollowPosts(follow.subject as AtprotoDid))
					)
				);
				loadMore();
			});
		} else {
			selectedDid = null;
		}

		return () => window.removeEventListener('scroll', handleScroll);
	});

	$effect(() => {
		const wantedDids: Did[] = ['did:web:guestbook.gaze.systems'];

		for (const followMap of follows.values())
			for (const follow of followMap.values()) wantedDids.push(follow.subject);
		for (const account of $accounts) wantedDids.push(account.did);

		console.log('updating jetstream options:', wantedDids);
		$jetstream?.updateOptions({ wantedDids });
	});
</script>

{#snippet appButton(
	onClick: () => void,
	icon: string,
	ariaLabel: string,
	isActive: boolean,
	iconHover?: string
)}
	<button
		onclick={onClick}
		class="group rounded-sm p-2 transition-all hover:scale-110 hover:shadow-lg
		{isActive
			? 'bg-(--nucleus-accent)/25 text-(--nucleus-accent)'
			: 'bg-(--nucleus-accent)/10 text-(--nucleus-accent) hover:bg-(--nucleus-accent)/15'}"
		aria-label={ariaLabel}
	>
		<Icon class="group-hover:hidden" {icon} width={28} />
		<Icon class="hidden group-hover:block" icon={iconHover ?? icon} width={28} />
	</button>
{/snippet}

<div class="mx-auto flex min-h-dvh max-w-2xl flex-col">
	<div class="flex-1">
		<!-- timeline -->
		<div
			id="app-thread-list"
			class="
			min-h-full p-2 [scrollbar-color:var(--nucleus-accent)_transparent]
			{currentView === 'timeline' ? `${animClass}` : 'hidden'}
			"
			bind:this={scrollContainer}
		>
			{#if $accounts.length > 0}
				{@render renderThreads()}
			{:else}
				<div class="flex justify-center py-4">
					<p class="text-xl opacity-80">
						<span class="text-4xl">x_x</span> <br /> no accounts are logged in!
					</p>
				</div>
			{/if}
		</div>
		{#if currentView === 'settings'}
			<div class={animClass}>
				<SettingsView />
			</div>
		{/if}
		{#if currentView === 'notifications'}
			<div class={animClass}>
				<NotificationsView />
			</div>
		{/if}
		{#if currentView === 'following'}
			<div class={animClass}>
				<FollowingView selectedClient={selectedClient!} selectedDid={selectedDid!} />
			</div>
		{/if}
	</div>

	<!-- header / footer -->
	<div id="app-footer" class="sticky bottom-0 z-10 mt-4">
		{#if errors.length > 0}
			<div class="relative m-3 mb-1 error-disclaimer">
				<div class="flex items-center gap-2 text-red-500">
					<Icon class="inline h-10 w-10" icon="heroicons:exclamation-triangle-16-solid" />
					there are ({errors.length}) errors
					<div class="grow"></div>
					<button onclick={() => (errorsOpen = !errorsOpen)} class="action-button p-1 px-1.5"
						>{errorsOpen ? 'hide details' : 'see details'}</button
					>
				</div>
				{#if errorsOpen}
					<div
						class="absolute right-0 bottom-full left-0 z-10 mb-2 flex animate-fade-in-scale-fast flex-col gap-1 error-disclaimer shadow-lg transition-all"
					>
						{#each errors as error, idx (idx)}
							<p>• {error}</p>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<div
			class="
			{currentView === 'timeline' || currentView === 'following' ? '' : 'hidden'}
			z-20 w-full max-w-2xl p-2.5 px-4 pb-1 transition-all
			"
		>
			<!-- composer and error disclaimer (above thread list, not scrollable) -->
			<div class="footer-border-bg rounded-sm px-0.5 py-0.5">
				<div class="footer-bg flex gap-2 rounded-sm p-1.5 shadow-2xl">
					<AccountSelector
						client={viewClient}
						accounts={$accounts}
						bind:selectedDid
						onAccountSelected={handleAccountSelected}
						onLogout={handleLogout}
					/>

					{#if selectedClient}
						<div class="flex-1">
							<PostComposer
								client={selectedClient}
								onPostSent={(post) => posts.get(selectedDid!)?.set(post.uri, post)}
								bind:_state={postComposerState}
							/>
						</div>
					{:else}
						<div
							class="flex flex-1 items-center justify-center rounded-sm border-2 border-(--nucleus-accent)/20 bg-(--nucleus-accent)/4 px-4 py-2.5 backdrop-blur-sm"
						>
							<p class="text-sm opacity-80">select or add an account to post</p>
						</div>
					{/if}

					{#if postComposerState.type === 'null' && showScrollToTop}
						{@render appButton(scrollToTop, 'heroicons:arrow-up-16-solid', 'scroll to top', false)}
					{/if}
				</div>
			</div>
		</div>

		<div id="footer-portal" class="contents"></div>

		<div class="footer-border-bg rounded-t-sm px-0.5 pt-0.5">
			<div class="footer-bg rounded-t-sm">
				<div class="flex items-center gap-1.5 px-2 py-1">
					<div class="mb-2">
						<h1 class="text-3xl font-bold tracking-tight">nucleus</h1>
						<div class="mt-1 flex gap-2">
							<div class="h-1 w-11 rounded-full bg-(--nucleus-accent)"></div>
							<div class="h-1 w-8 rounded-full bg-(--nucleus-accent2)"></div>
						</div>
					</div>
					<div class="grow"></div>
					{@render appButton(
						() => switchView('timeline'),
						'heroicons:home',
						'timeline',
						currentView === 'timeline',
						'heroicons:home-solid'
					)}
					{@render appButton(
						() => switchView('following'),
						'heroicons:users',
						'following',
						currentView === 'following',
						'heroicons:users-solid'
					)}
					{@render appButton(
						() => switchView('notifications'),
						'heroicons:bell',
						'notifications',
						currentView === 'notifications',
						'heroicons:bell-solid'
					)}
					{@render appButton(
						() => switchView('settings'),
						'heroicons:cog-6-tooth',
						'settings',
						currentView === 'settings',
						'heroicons:cog-6-tooth-solid'
					)}
				</div>
			</div>
		</div>
	</div>
</div>

{#snippet replyPost(post: ThreadPost, reverse: boolean = reverseChronological)}
	<span
		class="mb-1.5 flex items-center gap-1.5 overflow-hidden text-nowrap wrap-break-word overflow-ellipsis"
	>
		<span class="text-sm text-nowrap opacity-60">{reverse ? '↱' : '↳'}</span>
		<BskyPost mini client={selectedClient ?? viewClient} {...post} />
	</span>
{/snippet}

{#snippet threadsView()}
	{#each threads as thread (thread.rootUri)}
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
							client={selectedClient ?? viewClient}
							onQuote={(post) => (postComposerState = { type: 'focused', quoting: post })}
							onReply={(post) => (postComposerState = { type: 'focused', replying: post })}
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
		<div
			class="mx-8 mt-3 mb-4 h-px bg-linear-to-r from-(--nucleus-accent)/30 to-(--nucleus-accent2)/30"
		></div>
	{/each}
{/snippet}

{#snippet renderThreads()}
	<InfiniteLoader
		{loaderState}
		triggerLoad={loadMore}
		loopDetectionTimeout={0}
		intersectionOptions={{ root: scrollContainer }}
	>
		{@render threadsView()}
		{#snippet noData()}
			<div class="flex justify-center py-4">
				<p class="text-xl opacity-80">
					all posts seen! <span class="text-2xl">:o</span>
				</p>
			</div>
		{/snippet}
		{#snippet loading()}
			<div class="flex justify-center">
				<div
					class="h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
					style="border-color: var(--nucleus-accent) var(--nucleus-accent) var(--nucleus-accent) transparent;"
				></div>
			</div>
		{/snippet}
		{#snippet error()}
			<div class="flex flex-col gap-4 py-4">
				<p class="text-xl opacity-80">
					<span class="text-4xl">x_x</span> <br />
					{loadError}
				</p>
				<div>
					<button class="flex action-button items-center gap-2" onclick={loadMore}>
						<Icon class="h-6 w-6" icon="heroicons:arrow-path-16-solid" /> try again
					</button>
				</div>
			</div>
		{/snippet}
	</InfiniteLoader>
{/snippet}

<style>
	.footer-bg {
		background: linear-gradient(
			to right,
			color-mix(in srgb, var(--nucleus-accent) 18%, var(--nucleus-bg)),
			color-mix(in srgb, var(--nucleus-accent2) 13%, var(--nucleus-bg))
		);
	}

	.footer-border-bg {
		background: linear-gradient(to right, var(--nucleus-accent), var(--nucleus-accent2));
	}
</style>
