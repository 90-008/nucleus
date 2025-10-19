<script lang="ts">
	import BskyPost from '$components/BskyPost.svelte';
	import PostComposer from '$components/PostComposer.svelte';
	import AccountSelector from '$components/AccountSelector.svelte';
	import { AtpClient } from '$lib/at/client';
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
	import { expect } from '$lib/result';
	import type { AppBskyFeedPost } from '@atcute/bluesky';
	import { SvelteMap } from 'svelte/reactivity';

	let selectedDid = $state<Did | null>(null);
	let clients = new SvelteMap<Did, AtpClient>();
	let selectedClient = $derived(selectedDid ? clients.get(selectedDid) : null);

	let viewClient = $state<AtpClient>(new AtpClient());

	onMount(async () => {
		if ($accounts.length > 0) {
			selectedDid = $accounts[0].did;
			Promise.all($accounts.map(loginAccount)).then(() => fetchTimelines($accounts));
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
		$accounts = $accounts.filter((acc) => acc.did !== did);
		clients.delete(did);
		posts.delete(did);
		selectedDid = $accounts[0]?.did;
	};

	const handleLoginSucceed = async (did: Did, handle: Handle, password: string) => {
		const newAccount: Account = { did, handle, password };
		addAccount(newAccount);
		selectedDid = did;
		loginAccount(newAccount).then(() => fetchTimeline(newAccount));
	};

	let posts = new SvelteMap<Did, SvelteMap<ResourceUri, AppBskyFeedPost.Main>>();
	const fetchTimeline = async (account: Account) => {
		const client = clients.get(account.did);
		if (!client) return;
		const accPosts = await fetchPostsWithBacklinks(client, account.did, undefined, 20);
		if (!accPosts.ok) {
			console.error(`failed to fetch posts for account ${account.handle}: ${accPosts.error}`);
			return;
		}
		const accTimeline = await hydratePosts(client, accPosts.value.posts);
		if (!posts.has(account.did)) {
			posts.set(account.did, new SvelteMap(accTimeline));
			return;
		}
		const map = posts.get(account.did)!;
		for (const [uri, record] of accTimeline) map.set(uri, record);
	};
	const fetchTimelines = (newAccounts: Account[]) => Promise.all(newAccounts.map(fetchTimeline));

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

				if (!threadMap.has(rootUri)) {
					threadMap.set(rootUri, []);
				}
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

				if (!childrenMap.has(post.parentUri)) {
					childrenMap.set(post.parentUri, []);
				}
				childrenMap.get(post.parentUri)!.push(post);
			}

			// Sort children by time (newest first)
			for (const children of childrenMap.values()) {
				children.sort((a, b) => b.newestTime - a.newestTime);
			}

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
					for (const child of children) {
						addWithChildren(child);
					}
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

		return threads;
	};

	// Filtering functions (now much simpler!)
	const isOwnPost = (post: ThreadPost, accounts: Account[]) =>
		accounts.some((account) => account.did === post.did);
	const hasNonOwnPost = (posts: ThreadPost[], accounts: Account[]) =>
		posts.some((post) => !isOwnPost(post, accounts));
	const filterThreads = (threads: Thread[], accounts: Account[]) =>
		threads.filter((thread) => {
			if (!viewOwnPosts) {
				return hasNonOwnPost(thread.posts, accounts);
			}
			return true;
		});

	// Usage
	let threads = $derived(filterThreads(buildThreads(posts), $accounts));
</script>

<div class="mx-auto max-w-2xl p-4">
	<div class="mb-6">
		<h1 class="text-3xl font-bold tracking-tight" style="color: {theme.fg};">nucleus</h1>
		<div class="mt-1 flex gap-2">
			<div class="h-1 w-11 rounded-full" style="background: {theme.accent};"></div>
			<div class="h-1 w-8 rounded-full" style="background: {theme.accent2};"></div>
		</div>
	</div>

	<div class="space-y-4">
		<div class="flex min-h-16 items-stretch gap-2">
			<AccountSelector
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

		<div class="flex flex-col">
			{#each threads as thread (thread.rootUri)}
				<div class="flex {reverseChronological ? 'flex-col' : 'flex-col-reverse'} mb-6.5">
					{#if thread.branchParentPost}
						{@const post = thread.branchParentPost}
						<div class="mb-1.5 flex items-center gap-1.5">
							<span class="text-sm opacity-60" style="color: {theme.fg};"
								>{reverseChronological ? '↱' : '↳'}</span
							>
							<BskyPost
								mini
								client={viewClient}
								identifier={post.did}
								rkey={post.rkey}
								record={post.record}
							/>
						</div>
					{/if}
					{#each thread.posts as post (post.uri)}
						<div class="mb-1.5">
							<BskyPost
								client={viewClient}
								identifier={post.did}
								rkey={post.rkey}
								record={post.record}
							/>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>
