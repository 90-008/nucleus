<script lang="ts">
	import BskyPost from '$components/BskyPost.svelte';
	import PostComposer from '$components/PostComposer.svelte';
	import AccountSelector from '$components/AccountSelector.svelte';
	import SettingsPopup from '$components/SettingsPopup.svelte';
	import { AtpClient, type NotificationsStreamEvent } from '$lib/at/client';
	import { accounts, type Account } from '$lib/accounts';
	import { type Did, parseCanonicalResourceUri, type ResourceUri } from '@atcute/lexicons';
	import { onMount } from 'svelte';
	import { fetchPostsWithBacklinks, hydratePosts, type PostWithUri } from '$lib/at/fetch';
	import { expect } from '$lib/result';
	import { AppBskyFeedPost } from '@atcute/bluesky';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
	import { notificationStream } from '$lib/state.svelte';
	import { get } from 'svelte/store';
	import Icon from '@iconify/svelte';
	import { sessions } from '$lib/at/oauth';
	import type { AtprotoDid } from '@atcute/lexicons/syntax';
	import type { PageProps } from './+page';
	import { buildThreads, filterThreads, type ThreadPost } from '$lib/thread';

	const { data: loadData }: PageProps = $props();

	let errors = $state(loadData.client.ok ? [] : [loadData.client.error]);
	let errorsOpen = $state(false);

	let selectedDid = $state((localStorage.getItem('selectedDid') ?? null) as AtprotoDid | null);
	$effect(() => {
		if (selectedDid) {
			localStorage.setItem('selectedDid', selectedDid);
		} else {
			localStorage.removeItem('selectedDid');
		}
	});

	const clients = new SvelteMap<AtprotoDid, AtpClient>();
	const selectedClient = $derived(selectedDid ? clients.get(selectedDid) : null);

	const loginAccount = async (account: Account) => {
		if (clients.has(account.did)) return;
		const client = new AtpClient();
		const result = await client.login(account.did, await sessions.get(account.did));
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

	const viewClient = new AtpClient();

	const posts = new SvelteMap<Did, SvelteMap<ResourceUri, PostWithUri>>();
	const cursors = new SvelteMap<Did, { value?: string; end: boolean }>();

	let isSettingsOpen = $state(false);
	let reverseChronological = $state(true);
	let viewOwnPosts = $state(true);

	const threads = $derived(filterThreads(buildThreads(posts), $accounts, { viewOwnPosts }));

	let quoting = $state<PostWithUri | undefined>(undefined);
	let replying = $state<PostWithUri | undefined>(undefined);

	const expandedThreads = new SvelteSet<ResourceUri>();

	const addPosts = (did: Did, accTimeline: Map<ResourceUri, PostWithUri>) => {
		if (!posts.has(did)) {
			posts.set(did, new SvelteMap(accTimeline));
			return;
		}
		const map = posts.get(did)!;
		for (const [uri, record] of accTimeline) map.set(uri, record);
	};

	const fetchTimeline = async (account: Account) => {
		const client = clients.get(account.did);
		if (!client) return;

		const cursor = cursors.get(account.did);
		if (cursor && cursor.end) return;

		const accPosts = await fetchPostsWithBacklinks(client, account.did, cursor?.value, 6);
		if (!accPosts.ok) throw `cant fetch posts @${account.handle}: ${accPosts.error}`;

		// if the cursor is undefined, we've reached the end of the timeline
		if (!accPosts.value.cursor) {
			cursors.set(account.did, { ...cursor, end: true });
			return;
		}

		cursors.set(account.did, { value: accPosts.value.cursor, end: false });
		const hydrated = await hydratePosts(client, account.did, accPosts.value.posts);
		if (!hydrated.ok) throw `cant hydrate posts @${account.handle}: ${hydrated.error}`;

		addPosts(account.did, hydrated.value);
	};

	const fetchTimelines = (newAccounts: Account[]) => Promise.all(newAccounts.map(fetchTimeline));

	const handleNotification = async (event: NotificationsStreamEvent) => {
		if (event.type === 'message') {
			// console.log(event.data);
			const parsedSubjectUri = expect(parseCanonicalResourceUri(event.data.link.subject));
			const subjectPost = await viewClient.getRecord(
				AppBskyFeedPost.mainSchema,
				parsedSubjectUri.repo,
				parsedSubjectUri.rkey
			);
			if (!subjectPost.ok) return;

			const parsedSourceUri = expect(parseCanonicalResourceUri(event.data.link.source_record));
			const hydrated = await hydratePosts(viewClient, parsedSubjectUri.repo as AtprotoDid, [
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
				errors.push(`cant hydrate posts @${parsedSubjectUri.repo}: ${hydrated.error}`);
				return;
			}

			// console.log(hydrated);
			addPosts(parsedSubjectUri.repo, hydrated.value);
		}
	};

	// const handleJetstream = async (subscription: JetstreamSubscription) => {
	// 	for await (const event of subscription) {
	// 		if (event.kind !== 'commit') continue;
	// 		const commit = event.commit;
	// 		if (commit.operation === 'delete') {
	// 			continue;
	// 		}
	// 		const record = commit.record as AppBskyFeedPost.Main;
	// 		addPosts(
	// 			event.did,
	// 			new Map([[`at://${event.did}/${commit.collection}/${commit.rkey}` as ResourceUri, record]])
	// 		);
	// 	}
	// };

	const loaderState = new LoaderState();
	let scrollContainer = $state<HTMLDivElement>();

	let loading = $state(false);
	let loadError = $state('');
	let showScrollToTop = $state(false);

	const handleScroll = () => {
		showScrollToTop = window.scrollY > 300;
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
				viewClient.streamNotifications(
					newAccounts.map((account) => account.did),
					'app.bsky.feed.post:reply.parent.uri'
				)
			);
			// jetstream.set(
			// 	viewClient.streamJetstream(
			// 		newAccounts.map((account) => account.did),
			// 		'app.bsky.feed.post'
			// 	)
			// );
		});
		notificationStream.subscribe((stream) => {
			if (!stream) return;
			stream.listen(handleNotification);
		});
		// jetstream.subscribe((stream) => {
		// 	if (!stream) return;
		// 	handleJetstream(stream);
		// });
		if ($accounts.length > 0) {
			loaderState.status = 'LOADING';
			if (loadData.client.ok && loadData.client.value) {
				const loggedInDid = loadData.client.value.didDoc!.did as AtprotoDid;
				selectedDid = loggedInDid;
				clients.set(loggedInDid, loadData.client.value);
			}
			if (!$accounts.some((account) => account.did === selectedDid)) selectedDid = $accounts[0].did;
			console.log('onMount selectedDid', selectedDid);
			Promise.all($accounts.map(loginAccount)).then(() => {
				loadMore();
			});
		} else {
			selectedDid = null;
		}

		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	});
</script>

<div class="mx-auto max-w-2xl">
	<!-- thread list (page scrolls as a whole) -->
	<div
		class="mb-4 min-h-screen p-2 [scrollbar-color:var(--nucleus-accent)_transparent]"
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
	<!-- header -->
	<div class="sticky bottom-0 z-10">
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
			class="rounded-t-sm px-0.5 pt-0.5"
			style="background: linear-gradient(to right, var(--nucleus-accent), var(--nucleus-accent2));"
		>
			<div
				class="rounded-t-sm"
				style="
    			    background: linear-gradient(to right, color-mix(in srgb, var(--nucleus-accent) 16%, var(--nucleus-bg)), color-mix(in srgb, var(--nucleus-accent2) 10%, var(--nucleus-bg)));
    			"
			>
				<!-- composer and error disclaimer (above thread list, not scrollable) -->
				<div class="flex gap-2 px-2 pt-2 pb-1">
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
								bind:quoting
								bind:replying
							/>
						</div>
					{:else}
						<div
							class="flex flex-1 items-center justify-center rounded-sm border-2 border-(--nucleus-accent)/20 bg-(--nucleus-accent)/4 px-4 py-2.5 backdrop-blur-sm"
						>
							<p class="text-sm opacity-80">select or add an account to post</p>
						</div>
					{/if}

					{#if showScrollToTop}
						<button
							onclick={scrollToTop}
							class="group shrink-0 rounded-sm bg-(--nucleus-accent)/15 p-2 text-(--nucleus-accent) transition-all hover:scale-110 hover:shadow-lg"
							aria-label="scroll to top"
							title="scroll to top"
						>
							<Icon
								class="transition-transform group-hover:-translate-y-0.5"
								icon="heroicons:arrow-up-16-solid"
								width={28}
							/>
						</button>
					{/if}
				</div>

				<div
					class="opacity- mt-1 h-px w-full rounded-full border-0 opacity-70"
					style="background: linear-gradient(to right, var(--nucleus-accent), var(--nucleus-accent2));"
				></div>

				<div class="flex items-center justify-between px-2 py-1">
					<div class="mb-2">
						<h1 class="text-3xl font-bold tracking-tight">nucleus</h1>
						<div class="mt-1 flex gap-2">
							<div class="h-1 w-11 rounded-full bg-(--nucleus-accent)"></div>
							<div class="h-1 w-8 rounded-full bg-(--nucleus-accent2)"></div>
						</div>
					</div>
					<button
						onclick={() => (isSettingsOpen = true)}
						class="group rounded-sm bg-(--nucleus-accent)/15 p-2 text-(--nucleus-accent) transition-all hover:scale-110 hover:shadow-lg"
						aria-label="settings"
					>
						<Icon class="group-hover:hidden" icon="heroicons:cog-6-tooth" width={28} />
						<Icon class="hidden group-hover:block" icon="heroicons:cog-6-tooth-solid" width={28} />
					</button>
				</div>

				<!-- <hr
    			class="h-[4px] w-full rounded-full border-0"
    			style="background: linear-gradient(to right, var(--nucleus-accent), var(--nucleus-accent2));"
    		/> -->
			</div>
		</div>
	</div>
</div>

<SettingsPopup bind:isOpen={isSettingsOpen} onClose={() => (isSettingsOpen = false)} />

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
							onQuote={(post) => (quoting = post)}
							onReply={(post) => (replying = post)}
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
