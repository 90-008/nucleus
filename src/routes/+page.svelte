<script lang="ts">
	import BskyPost from '$components/BskyPost.svelte';
	import PostComposer from '$components/PostComposer.svelte';
	import AccountSelector from '$components/AccountSelector.svelte';
	import { AtpClient } from '$lib/at/client';
	import { accounts, addAccount, type Account } from '$lib/accounts';
	import { type Did, type Handle, parseCanonicalResourceUri } from '@atcute/lexicons';
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme.svelte';
	import { fetchPostsWithReplyBacklinks, fetchReplies } from '$lib/at/fetch';
	import { expect } from '$lib/result';
	import { writable } from 'svelte/store';
	import type { AppBskyFeedPost } from '@atcute/bluesky';

	let selectedDid = $state<Did | null>(null);
	let clients = writable<Map<Did, AtpClient>>(new Map());
	let selectedClient = $derived(selectedDid ? $clients.get(selectedDid) : null);

	let viewClient = $state<AtpClient>(new AtpClient());

	onMount(async () => {
		if ($accounts.length > 0) {
			selectedDid = $accounts[0].did;
			Promise.all($accounts.map(loginAccount)).then(() => fetchTimeline($accounts));
		}
	});

	const loginAccount = async (account: Account) => {
		const client = new AtpClient();
		const result = await client.login(account.handle, account.password);
		if (result.ok) {
			clients.update((map) => map.set(account.did, client));
		}
	};

	const handleAccountSelected = async (did: Did) => {
		selectedDid = did;
		const account = $accounts.find((acc) => acc.did === did);
		if (account && (!$clients.has(account.did) || !$clients.get(account.did)?.atcute))
			await loginAccount(account);
	};

	const handleLoginSucceed = (did: Did, handle: Handle, password: string) => {
		const newAccount: Account = { did, handle, password };
		addAccount(newAccount);
		selectedDid = did;
		loginAccount(newAccount);
	};

	let timeline = writable<Map<string, AppBskyFeedPost.Main>>(new Map());
	const fetchTimeline = async (newAccounts: Account[]) => {
		await Promise.all(
			newAccounts.map(async (account) => {
				const client = $clients.get(account.did);
				if (!client) return;
				const accPosts = await fetchPostsWithReplyBacklinks(client, account.did, undefined, 10);
				if (!accPosts.ok) {
					console.error(`failed to fetch posts for account ${account.handle}: ${accPosts.error}`);
					return;
				}
				const accTimeline = await fetchReplies(client, accPosts.value.posts);
				for (const reply of accTimeline) {
					if (!reply.ok) {
						console.error(`failed to fetch reply: ${reply.error}`);
						return;
					}
					timeline.update((map) => map.set(reply.value.uri, reply.value.record));
				}
			})
		);
	};
	accounts.subscribe(fetchTimeline);

	const getSortedTimeline = (_timeline: Map<string, AppBskyFeedPost.Main>) => {
		const sortedTimeline = Array.from(_timeline).sort(
			([_a, post], [_b, post2]) =>
				new Date(post2.createdAt).getTime() - new Date(post.createdAt).getTime()
		);
		return sortedTimeline;
	};
	let sortedTimeline = $derived(getSortedTimeline($timeline));
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
			/>

			{#if selectedClient}
				<div class="flex-1">
					<PostComposer client={selectedClient} />
				</div>
			{:else}
				<div
					class="flex flex-1 items-center justify-center rounded-xl border-2 px-4 py-2.5 backdrop-blur-sm"
					style="border-color: {theme.accent}33; background: {theme.accent}0a;"
				>
					<p class="text-sm opacity-80" style="color: {theme.fg};">
						select or add an account to post
					</p>
				</div>
			{/if}
		</div>

		<hr
			class="h-[3px] w-full rounded-full border-0"
			style="background: linear-gradient(to right, {theme.accent}, {theme.accent2});"
		/>

		<div class="flex flex-col gap-3">
			{#each sortedTimeline as [postUri, data] (postUri)}
				{@const parsedUri = expect(parseCanonicalResourceUri(postUri))}
				<BskyPost
					client={viewClient}
					identifier={parsedUri.repo}
					rkey={parsedUri.rkey}
					record={data}
				/>
			{/each}
		</div>
	</div>
</div>
