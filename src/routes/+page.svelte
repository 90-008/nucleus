<script lang="ts">
	import BskyPost from '$components/BskyPost.svelte';
	import PostComposer from '$components/PostComposer.svelte';
	import AccountSelector from '$components/AccountSelector.svelte';
	import { AtpClient, type NotificationsStreamEvent } from '$lib/at/client';
	import { accounts, addAccount, type Account } from '$lib/accounts';
	import {
		type Did,
		type Handle,
		parseCanonicalResourceUri,
		type ResourceUri
	} from '@atcute/lexicons';
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme.svelte';
	import { fetchPostsWithBacklinks, hydratePosts } from '$lib/at/fetch';
	import { expect, ok } from '$lib/result';
	import { AppBskyFeedPost } from '@atcute/bluesky';
	import { SvelteMap } from 'svelte/reactivity';
	import { InfiniteLoader, LoaderState } from 'svelte-infinite';
	import { notificationStream } from '$lib';
	import { get } from 'svelte/store';

	let loaderState = new LoaderState();
	let scrollContainer = $state<HTMLDivElement>();

	let selectedDid = $state<Did | null>(null);
	let clients = new SvelteMap<Did, AtpClient>();
	let selectedClient = $derived(selectedDid ? clients.get(selectedDid) : null);

	let viewClient = $state<AtpClient>(new AtpClient());

	let posts = new SvelteMap<Did, SvelteMap<ResourceUri, AppBskyFeedPost.Main>>();
	let cursors = new SvelteMap<Did, { value?: string; end: boolean }>();

	const addPosts = (did: Did, accTimeline: Map<ResourceUri, AppBskyFeedPost.Main>) => {
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

		const accPosts = await fetchPostsWithBacklinks(client, account.did, cursor?.value, 12);
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
					record: subjectPost.value,
					uri: event.data.link.subject,
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
			selectedDid = $accounts[0].did;
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
		selectedDid = did;
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
		selectedDid = did;
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

	let reverseChronological = $state(true);
	let viewOwnPosts = $state(true);

	type ThreadPost = {
		uri: ResourceUri;
		did: Did;
		rkey: string;
		record: AppBskyFeedPost.Main;
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

	const buildThreads = (timelines: Map<Did, Map<ResourceUri, AppBskyFeedPost.Main>>): Thread[] => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const threadMap = new Map<ResourceUri, ThreadPost[]>();

		// Single pass: create posts and group by thread
		for (const [, timeline] of timelines) {
			for (const [uri, record] of timeline) {
				const parsedUri = expect(parseCanonicalResourceUri(uri));
				const rootUri = (record.reply?.root.uri as ResourceUri) || uri;
				const parentUri = (record.reply?.parent.uri as ResourceUri) || null;

				const post: ThreadPost = {
					uri,
					did: parsedUri.repo,
					rkey: parsedUri.rkey,
					record,
					parentUri,
					depth: 0,
					newestTime: new Date(record.createdAt).getTime()
				};

				if (!threadMap.has(rootUri)) threadMap.set(rootUri, []);

				threadMap.get(rootUri)!.push(post);
			}
		}

		const threads: Thread[] = [];

		for (const [rootUri, posts] of threadMap) {
			const uriToPost = new Map(posts.map((p) => [p.uri, p]));
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const childrenMap = new Map<ResourceUri | null, ThreadPost[]>();

			// Calculate depth and group by parent
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

			// Sort children by time (newest first)
			childrenMap
				.values()
				.forEach((children) => children.sort((a, b) => b.newestTime - a.newestTime));

			// Helper to create a thread from posts
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

			// Helper to collect all posts in a subtree
			const collectSubtree = (startPost: ThreadPost): ThreadPost[] => {
				const result: ThreadPost[] = [];
				const addWithChildren = (post: ThreadPost) => {
					result.push(post);
					const children = childrenMap.get(post.uri) || [];
					children.forEach(addWithChildren);
				};
				addWithChildren(startPost);
				return result;
			};

			// Find branching points (posts with 2+ children)
			const branchingPoints = Array.from(childrenMap.entries())
				.filter(([, children]) => children.length > 1)
				.map(([uri]) => uri);

			if (branchingPoints.length === 0) {
				// No branches - single thread
				const roots = childrenMap.get(null) || [];
				const allPosts = roots.flatMap((root) => collectSubtree(root));
				threads.push(createThread(allPosts, rootUri));
			} else {
				// Has branches - split into separate threads
				for (const branchParentUri of branchingPoints) {
					const branches = childrenMap.get(branchParentUri) || [];

					// Sort branches oldest to newest for processing
					const sortedBranches = [...branches].sort((a, b) => a.newestTime - b.newestTime);

					sortedBranches.forEach((branchRoot, index) => {
						const isOldestBranch = index === 0;
						const branchPosts: ThreadPost[] = [];

						// If oldest branch, include parent chain
						if (isOldestBranch && branchParentUri !== null) {
							const parentChain: ThreadPost[] = [];
							let currentUri: ResourceUri | null = branchParentUri;
							while (currentUri && uriToPost.has(currentUri)) {
								parentChain.unshift(uriToPost.get(currentUri)!);
								currentUri = uriToPost.get(currentUri)!.parentUri;
							}
							branchPosts.push(...parentChain);
						}

						// Add branch posts
						branchPosts.push(...collectSubtree(branchRoot));

						// Recalculate depths for display
						const minDepth = Math.min(...branchPosts.map((p) => p.depth));
						branchPosts.forEach((p) => (p.depth = p.depth - minDepth));

						threads.push(
							createThread(
								branchPosts,
								branchRoot.uri,
								isOldestBranch ? undefined : (branchParentUri ?? undefined)
							)
						);
					});
				}
			}
		}

		// Sort threads by newest time (descending) so older branches appear first
		threads.sort((a, b) => b.newestTime - a.newestTime);

		// console.log(threads);

		return threads;
	};

	// Filtering functions
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
</script>

<div class="mx-auto flex h-screen max-w-2xl flex-col p-4">
	<div class="mb-6 flex-shrink-0">
		<h1 class="text-3xl font-bold tracking-tight" style="color: {theme.fg};">nucleus</h1>
		<div class="mt-1 flex gap-2">
			<div class="h-1 w-11 rounded-full" style="background: {theme.accent};"></div>
			<div class="h-1 w-8 rounded-full" style="background: {theme.accent2};"></div>
		</div>
	</div>

	<div class="flex-shrink-0 space-y-4">
		<div class="flex min-h-16 items-stretch gap-2">
			<AccountSelector
				client={viewClient}
				accounts={$accounts}
				bind:selectedDid
				onAccountSelected={handleAccountSelected}
				onLoginSucceed={handleLoginSucceed}
				onLogout={handleLogout}
			/>

			{#if selectedClient}
				<div class="flex-1">
					<PostComposer
						client={selectedClient}
						onPostSent={(uri, record) => posts.get(selectedDid!)?.set(uri, record)}
					/>
				</div>
			{:else}
				<div
					class="flex flex-1 items-center justify-center rounded-sm border-2 px-4 py-2.5 backdrop-blur-sm"
					style="border-color: {theme.accent}33; background: {theme.accent}0a;"
				>
					<p class="text-sm opacity-80" style="color: {theme.fg};">
						select or add an account to post
					</p>
				</div>
			{/if}
		</div>

		<hr
			class="h-[4px] w-full rounded-full border-0"
			style="background: linear-gradient(to right, {theme.accent}, {theme.accent2});"
		/>
	</div>

	<div class="mt-4 overflow-y-scroll [scrollbar-width:none]" bind:this={scrollContainer}>
		{#if $accounts.length > 0}
			{@render renderThreads()}
		{:else}
			<div class="flex justify-center py-4">
				<p class="text-xl opacity-80" style="color: {theme.fg};">
					<span class="text-4xl">x_x</span> <br /> no accounts are logged in!
				</p>
			</div>
		{/if}
	</div>
</div>

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
				<p class="text-xl opacity-80" style="color: {theme.fg};">
					all posts seen! <span class="text-2xl">:o</span>
				</p>
			</div>
		{/snippet}
		{#snippet loading()}
			<div class="flex justify-center">
				<div
					class="h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
					style="border-color: {theme.accent} {theme.accent} {theme.accent} transparent;"
				></div>
			</div>
		{/snippet}
		{#snippet error()}
			<div class="flex justify-center py-4">
				<p class="text-xl opacity-80" style="color: {theme.fg};">
					<span class="text-4xl">:(</span> <br /> an error occurred while loading posts: {loadError}
				</p>
			</div>
		{/snippet}
	</InfiniteLoader>
{/snippet}

{#snippet threadsView()}
	{#each threads as thread ([thread.rootUri, thread.branchParentPost, ...thread.posts.map((post) => post.uri)])}
		<div class="flex {reverseChronological ? 'flex-col' : 'flex-col-reverse'} mb-6.5">
			{#if thread.branchParentPost}
				{@const post = thread.branchParentPost}
				<div class="mb-1.5 flex items-center gap-1.5">
					<span class="text-sm text-nowrap opacity-60" style="color: {theme.fg};"
						>{reverseChronological ? '↱' : '↳'}</span
					>
					<BskyPost mini client={viewClient} {...post} />
				</div>
			{/if}
			{#each thread.posts as post (post.uri)}
				<div class="mb-1.5">
					<BskyPost client={viewClient} {...post} />
				</div>
			{/each}
		</div>
	{/each}
{/snippet}
