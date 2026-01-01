<script lang="ts">
	import PostComposer, { type State as PostComposerState } from '$components/PostComposer.svelte';
	import AccountSelector from '$components/AccountSelector.svelte';
	import SettingsView from '$components/SettingsView.svelte';
	import NotificationsView from '$components/NotificationsView.svelte';
	import FollowingView from '$components/FollowingView.svelte';
	import TimelineView from '$components/TimelineView.svelte';
	import ProfileView from '$components/ProfileView.svelte';
	import { AtpClient, streamNotifications } from '$lib/at/client';
	import { accounts, type Account } from '$lib/accounts';
	import { onMount } from 'svelte';
	import {
		clients,
		postCursors,
		fetchForInteractions,
		fetchFollows,
		follows,
		notificationStream,
		viewClient,
		jetstream,
		handleJetstreamEvent,
		handleNotification,
		addPosts,
		addTimeline,
		router
	} from '$lib/state.svelte';
	import { get } from 'svelte/store';
	import Icon from '@iconify/svelte';
	import { sessions } from '$lib/at/oauth';
	import type { AtprotoDid, Did } from '@atcute/lexicons/syntax';
	import type { PageProps } from './+page';
	import { JetstreamSubscription } from '@atcute/jetstream';
	import { settings } from '$lib/settings';
	import type { Sort } from '$lib/following';

	const { data: loadData }: PageProps = $props();

	const currentRoute = $derived(router.current);

	// svelte-ignore state_referenced_locally
	let errors = $state(loadData.client.ok ? [] : [loadData.client.error]);
	let errorsOpen = $state(false);

	let selectedDid = $state((localStorage.getItem('selectedDid') ?? null) as AtprotoDid | null);
	$effect(() => {
		if (selectedDid) localStorage.setItem('selectedDid', selectedDid);
		else localStorage.removeItem('selectedDid');
	});
	const selectedClient = $derived(selectedDid ? clients.get(selectedDid) : undefined);

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
		postCursors.delete(did);
		handleAccountSelected(newAccounts[0]?.did);
	};

	let followingSort = $state('active' as Sort);

	// Animation logic derived from router direction
	let animClass = $state('animate-fade-in-scale');
	$effect(() => {
		if (router.direction === 'right') animClass = 'animate-slide-in-right';
		else if (router.direction === 'left') animClass = 'animate-slide-in-left';
		else animClass = 'animate-fade-in-scale';
	});

	let postComposerState = $state<PostComposerState>({ focus: 'null', text: '' });
	let showScrollToTop = $state(false);
	const handleScroll = () => {
		if (currentRoute.path === '/' || currentRoute.path === '/profile/:actor')
			showScrollToTop = window.scrollY > 300;
	};
	const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

	onMount(() => {
		router.init();

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
					'app.bsky.feed.post:embed.record.uri',
					'app.bsky.feed.repost:subject.uri',
					'app.bsky.feed.like:subject.uri',
					'app.bsky.graph.follow:subject'
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
			// this is here because if wantedDids is zero jetstream will send all events
			wantedDids: ['did:web:guestbook.gaze.systems']
		});
		jetstream.set(jetstreamSub);

		(async () => {
			console.log('polling for jetstream...');
			for await (const event of jetstreamSub) handleJetstreamEvent(event);
		})();

		if ($accounts.length > 0) {
			if (loadData.client.ok && loadData.client.value) {
				const loggedInDid = loadData.client.value.user!.did as AtprotoDid;
				selectedDid = loggedInDid;
				clients.set(loggedInDid, loadData.client.value);
			}
			if (!$accounts.some((account) => account.did === selectedDid)) selectedDid = $accounts[0].did;
			// console.log('onMount selectedDid', selectedDid);
			Promise.all($accounts.map(loginAccount)).then(() => {
				$accounts.forEach((account) => {
					fetchFollows(account.did).then(() =>
						follows
							.get(account.did)
							?.forEach((follow) => fetchForInteractions(follow.subject as AtprotoDid))
					);
					fetchForInteractions(account.did);
				});
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

		// console.log('updating jetstream options:', wantedDids);
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

{#snippet routeButton({
	route,
	path = route,
	icon,
	iconHover = `${icon}-solid`,
	ariaLabel = path.split('/').pop() ?? path
}: {
	route: (typeof currentRoute)['path'];
	path?: string;
	icon: string;
	ariaLabel?: string;
	iconHover?: string;
})}
	{@render appButton(
		() => router.navigate(path),
		icon,
		ariaLabel,
		currentRoute.path === route,
		iconHover
	)}
{/snippet}

<div class="mx-auto flex min-h-dvh max-w-2xl flex-col">
	<div class="flex-1">
		<!-- timeline -->
		<TimelineView
			class={currentRoute.path === '/' ? `${animClass}` : 'hidden'}
			client={selectedClient}
			showReplies={true}
			bind:postComposerState
		/>

		{#if currentRoute.path === '/settings/:tab'}
			<div class={animClass}>
				<SettingsView tab={currentRoute.params.tab} />
			</div>
		{:else if currentRoute.path === '/notifications'}
			<div class={animClass}>
				<NotificationsView />
			</div>
		{:else if currentRoute.path === '/following'}
			<div class={animClass}>
				<FollowingView client={selectedClient} bind:followingSort />
			</div>
		{:else if currentRoute.path === '/profile/:actor'}
			{#key currentRoute.params.actor}
				<div class={animClass}>
					<ProfileView
						client={selectedClient ?? viewClient}
						onBack={() => router.back()}
						actor={currentRoute.params.actor}
						bind:postComposerState
					/>
				</div>
			{/key}
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
			{['/', '/following', '/profile/:actor'].includes(router.current.path) ? '' : 'hidden'}
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
								onPostSent={(post) => {
									addPosts([post]);
									addTimeline(selectedDid!, [post.uri]);
								}}
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

					{#if postComposerState.focus === 'null' && showScrollToTop}
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
					{@render routeButton({ route: '/', icon: 'heroicons:home' })}
					{@render routeButton({ route: '/following', icon: 'heroicons:users' })}
					{@render routeButton({ route: '/notifications', icon: 'heroicons:bell' })}
					{@render routeButton({
						path: '/settings/advanced',
						route: '/settings/:tab',
						icon: 'heroicons:cog-6-tooth'
					})}
				</div>
			</div>
		</div>
	</div>
</div>

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
