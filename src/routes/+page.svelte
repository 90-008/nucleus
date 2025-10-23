<script lang="ts">
	import BskyPost from '$components/BskyPost.svelte';
	import PostComposer from '$components/PostComposer.svelte';
	import AccountSelector from '$components/AccountSelector.svelte';
	import SettingsPopup from '$components/SettingsPopup.svelte';
	import { AtpClient, type NotificationsStreamEvent } from '$lib/at/client';
	import { accounts, addAccount, type Account } from '$lib/accounts';
	import {
		type Did,
		type Handle,
		parseCanonicalResourceUri,
		type ResourceUri
	} from '@atcute/lexicons';
	import { onMount } from 'svelte';
	import { fetchPostsWithBacklinks, hydratePosts, type PostWithUri } from '$lib/at/fetch';
	import { expect, ok } from '$lib/result';
	import { AppBskyFeedPost } from '@atcute/bluesky';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
	import { notificationStream, selectedDid } from '$lib';
	import { get } from 'svelte/store';
	import Icon from '@iconify/svelte';

	let loaderState = new LoaderState();
	let scrollContainer = $state<HTMLDivElement>();

	let clients = new SvelteMap<Did, AtpClient>();
	let selectedClient = $derived($selectedDid ? clients.get($selectedDid) : null);

	let viewClient = $state<AtpClient>(new AtpClient());

	let posts = new SvelteMap<Did, SvelteMap<ResourceUri, PostWithUri>>();
	let cursors = new SvelteMap<Did, { value?: string; end: boolean }>();

	let isSettingsOpen = $state(false);
	let reverseChronological = $state(true);
	let viewOwnPosts = $state(true);

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
		if (!accPosts.ok)
			throw `failed to fetch posts for account ${account.handle}: ${accPosts.error}`;

		// if the cursor is undefined, we've reached the end of the timeline
		if (!accPosts.value.cursor) {
			cursors.set(account.did, { ...cursor, end: true });
			return;
		}

		cursors.set(account.did, { value: accPosts.value.cursor, end: false });
		addPosts(account.did, await hydratePosts(client, accPosts.value.posts));
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
			const hydrated = await hydratePosts(viewClient, [
				{
					record: subjectPost.value.record,
					uri: event.data.link.subject,
					cid: subjectPost.value.cid,
					replies: ok({
						cursor: null,
						total: 1,
						records: [
							{
								did: parsedSourceUri.repo,
								collection: parsedSourceUri.collection,
								rkey: parsedSourceUri.rkey
							}
						]
					})
				}
			]);

			// console.log(hydrated);
			addPosts(parsedSubjectUri.repo, hydrated);
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

	onMount(async () => {
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
			$selectedDid = $accounts[0].did;
			Promise.all($accounts.map(loginAccount)).then(() => {
				loadMore();
			});
		}
	});

	const loginAccount = async (account: Account) => {
		const client = new AtpClient();
		const result = await client.login(account.handle, account.password);
		if (result.ok) clients.set(account.did, client);
	};

	const handleAccountSelected = async (did: Did) => {
		$selectedDid = did;
		const account = $accounts.find((acc) => acc.did === did);
		if (account && (!clients.has(account.did) || !clients.get(account.did)?.atcute))
			await loginAccount(account);
	};

	const handleLogout = async (did: Did) => {
		const newAccounts = $accounts.filter((acc) => acc.did !== did);
		$accounts = newAccounts;
		clients.delete(did);
		posts.delete(did);
		cursors.delete(did);
		handleAccountSelected(newAccounts[0]?.did);
	};

	const handleLoginSucceed = async (did: Did, handle: Handle, password: string) => {
		const newAccount: Account = { did, handle, password };
		addAccount(newAccount);
		$selectedDid = did;
		loginAccount(newAccount).then(() => fetchTimeline(newAccount));
	};

	let loading = $state(false);
	let loadError = $state('');
	const loadMore = async () => {
		if (loading || $accounts.length === 0) return;

		loading = true;
		try {
			await fetchTimelines($accounts);
			loaderState.loaded();
		} catch (error) {
			loadError = `${error}`;
			loaderState.error();
		} finally {
			loading = false;
			if (cursors.values().every((cursor) => cursor.end)) loaderState.complete();
		}
	};

	type ThreadPost = {
		data: PostWithUri;
		did: Did;
		rkey: string;
		parentUri: ResourceUri | null;
		depth: number;
		newestTime: number;
	};

	type Thread = {
		rootUri: ResourceUri;
		posts: ThreadPost[];
		newestTime: number;
		branchParentPost?: ThreadPost;
	};

	const buildThreads = (timelines: Map<Did, Map<ResourceUri, PostWithUri>>): Thread[] => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const threadMap = new Map<ResourceUri, ThreadPost[]>();

		// group posts by root uri into "thread" chains
		for (const [, timeline] of timelines) {
			for (const [uri, data] of timeline) {
				const parsedUri = expect(parseCanonicalResourceUri(uri));
				const rootUri = (data.record.reply?.root.uri as ResourceUri) || uri;
				const parentUri = (data.record.reply?.parent.uri as ResourceUri) || null;

				const post: ThreadPost = {
					data,
					did: parsedUri.repo,
					rkey: parsedUri.rkey,
					parentUri,
					depth: 0,
					newestTime: new Date(data.record.createdAt).getTime()
				};

				if (!threadMap.has(rootUri)) threadMap.set(rootUri, []);

				threadMap.get(rootUri)!.push(post);
			}
		}

		const threads: Thread[] = [];

		for (const [rootUri, posts] of threadMap) {
			const uriToPost = new Map(posts.map((p) => [p.data.uri, p]));
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const childrenMap = new Map<ResourceUri | null, ThreadPost[]>();

			// calculate depths
			for (const post of posts) {
				let depth = 0;
				let currentUri = post.parentUri;

				while (currentUri && uriToPost.has(currentUri)) {
					depth++;
					currentUri = uriToPost.get(currentUri)!.parentUri;
				}

				post.depth = depth;

				if (!childrenMap.has(post.parentUri)) childrenMap.set(post.parentUri, []);
				childrenMap.get(post.parentUri)!.push(post);
			}

			childrenMap
				.values()
				.forEach((children) => children.sort((a, b) => b.newestTime - a.newestTime));

			const createThread = (
				posts: ThreadPost[],
				rootUri: ResourceUri,
				branchParentUri?: ResourceUri
			): Thread => {
				return {
					rootUri,
					posts,
					newestTime: Math.max(...posts.map((p) => p.newestTime)),
					branchParentPost: branchParentUri ? uriToPost.get(branchParentUri) : undefined
				};
			};

			const collectSubtree = (startPost: ThreadPost): ThreadPost[] => {
				const result: ThreadPost[] = [];
				const addWithChildren = (post: ThreadPost) => {
					result.push(post);
					const children = childrenMap.get(post.data.uri) || [];
					children.forEach(addWithChildren);
				};
				addWithChildren(startPost);
				return result;
			};

			// find posts with >2 children to split them into separate chains
			const branchingPoints = Array.from(childrenMap.entries())
				.filter(([, children]) => children.length > 1)
				.map(([uri]) => uri);

			if (branchingPoints.length === 0) {
				const roots = childrenMap.get(null) || [];
				const allPosts = roots.flatMap((root) => collectSubtree(root));
				threads.push(createThread(allPosts, rootUri));
			} else {
				for (const branchParentUri of branchingPoints) {
					const branches = childrenMap.get(branchParentUri) || [];

					const sortedBranches = [...branches].sort((a, b) => a.newestTime - b.newestTime);

					sortedBranches.forEach((branchRoot, index) => {
						const isOldestBranch = index === 0;
						const branchPosts: ThreadPost[] = [];

						// the oldest branch has the full context
						// todo: consider letting the user decide this..?
						if (isOldestBranch && branchParentUri !== null) {
							const parentChain: ThreadPost[] = [];
							let currentUri: ResourceUri | null = branchParentUri;
							while (currentUri && uriToPost.has(currentUri)) {
								parentChain.unshift(uriToPost.get(currentUri)!);
								currentUri = uriToPost.get(currentUri)!.parentUri;
							}
							branchPosts.push(...parentChain);
						}

						branchPosts.push(...collectSubtree(branchRoot));

						const minDepth = Math.min(...branchPosts.map((p) => p.depth));
						branchPosts.forEach((p) => (p.depth = p.depth - minDepth));

						threads.push(
							createThread(
								branchPosts,
								branchRoot.data.uri,
								isOldestBranch ? undefined : (branchParentUri ?? undefined)
							)
						);
					});
				}
			}
		}

		threads.sort((a, b) => b.newestTime - a.newestTime);

		// console.log(threads);

		return threads;
	};

	// todo: add more filtering options
	const isOwnPost = (post: ThreadPost, accounts: Account[]) =>
		accounts.some((account) => account.did === post.did);
	const hasNonOwnPost = (posts: ThreadPost[], accounts: Account[]) =>
		posts.some((post) => !isOwnPost(post, accounts));
	const filterThreads = (threads: Thread[], accounts: Account[]) =>
		threads.filter((thread) => {
			if (!viewOwnPosts) return hasNonOwnPost(thread.posts, accounts);
			return true;
		});

	let threads = $derived(filterThreads(buildThreads(posts), $accounts));

	let quoting = $state<PostWithUri | undefined>(undefined);
	let replying = $state<PostWithUri | undefined>(undefined);

	let expandedThreads = new SvelteSet<ResourceUri>();
</script>

<div class="mx-auto flex h-screen max-w-2xl flex-col p-4">
	<div class="mb-6 flex flex-shrink-0 items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">nucleus</h1>
			<div class="mt-1 flex gap-2">
				<div class="h-1 w-11 rounded-full bg-(--nucleus-accent)"></div>
				<div class="h-1 w-8 rounded-full bg-(--nucleus-accent2)"></div>
			</div>
		</div>
		<button
			onclick={() => (isSettingsOpen = true)}
			class="group rounded-sm bg-(--nucleus-accent)/7 p-2 text-(--nucleus-accent) transition-all hover:scale-110 hover:shadow-lg"
			aria-label="settings"
		>
			<Icon class="group-hover:hidden" icon="heroicons:cog-6-tooth" width={28} />
			<Icon class="hidden group-hover:block" icon="heroicons:cog-6-tooth-solid" width={28} />
		</button>
	</div>

	<div class="flex-shrink-0 space-y-4">
		<div class="flex min-h-16 items-stretch gap-2">
			<AccountSelector
				client={viewClient}
				accounts={$accounts}
				bind:selectedDid={$selectedDid}
				onAccountSelected={handleAccountSelected}
				onLoginSucceed={handleLoginSucceed}
				onLogout={handleLogout}
			/>

			{#if selectedClient}
				<div class="flex-1">
					<PostComposer
						client={selectedClient}
						{selectedDid}
						onPostSent={(post) => posts.get($selectedDid!)?.set(post.uri, post)}
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
		</div>

		<!-- <hr
			class="h-[4px] w-full rounded-full border-0"
			style="background: linear-gradient(to right, var(--nucleus-accent), var(--nucleus-accent2));"
		/> -->
	</div>

	<div
		class="mt-4 overflow-y-scroll [scrollbar-color:var(--nucleus-accent)_transparent]"
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
</div>

<SettingsPopup bind:isOpen={isSettingsOpen} onClose={() => (isSettingsOpen = false)} />

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
			<div class="flex justify-center py-4">
				<p class="text-xl opacity-80">
					<span class="text-4xl">:(</span> <br /> an error occurred while loading posts: {loadError}
				</p>
			</div>
		{/snippet}
	</InfiniteLoader>
{/snippet}

{#snippet replyPost(post: ThreadPost, reverse: boolean = reverseChronological)}
	<span
		class="mb-1.5 flex items-center gap-1.5 overflow-hidden text-nowrap break-words overflow-ellipsis"
	>
		<span class="text-sm text-nowrap opacity-60">{reverse ? '↱' : '↳'}</span>
		<BskyPost mini {selectedDid} client={selectedClient ?? viewClient} {...post} />
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
							{selectedDid}
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
							class="mx-1.5 mt-1.5 mb-2.5 flex items-center gap-1.5 text-[color-mix(in_srgb,_var(--nucleus-fg)_50%,_var(--nucleus-accent))]/70 transition-colors hover:text-(--nucleus-accent)"
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
			class="mx-8 mt-3 mb-4 h-px bg-gradient-to-r from-(--nucleus-accent)/30 to-(--nucleus-accent2)/30"
		></div>
	{/each}
{/snippet}
