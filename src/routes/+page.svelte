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
	import { onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		clients,
		postCursors,
		fetchForInteractions,
		fetchFollows,
		follows,
		notificationStream,
		allPosts,
		viewClient,
		jetstream,
		handleJetstreamEvent,
		handleNotification
	} from '$lib/state.svelte';
	import { get } from 'svelte/store';
	import Icon from '@iconify/svelte';
	import { sessions } from '$lib/at/oauth';
	import type { AtprotoDid, Did } from '@atcute/lexicons/syntax';
	import type { PageProps } from './+page';
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
		postCursors.delete(did);
		handleAccountSelected(newAccounts[0]?.did);
	};

	type View = 'timeline' | 'notifications' | 'following' | 'settings' | 'profile';
	let currentView = $state<View>('timeline');
	let animClass = $state('animate-fade-in-scale');
	let scrollPositions = new SvelteMap<View, number>();
	let viewingProfileDid = $state<AtprotoDid | null>(null);
	let previousView = $state<View>('timeline');

	const viewOrder: Record<View, number> = {
		timeline: 0,
		following: 1,
		notifications: 2,
		settings: 3,
		profile: 4
	};

	const switchView = async (newView: View) => {
		if (currentView === newView) return;
		scrollPositions.set(currentView, window.scrollY);

		const direction = viewOrder[newView] > viewOrder[currentView] ? 'right' : 'left';
		// Profile always slides in from right unless going back
		if (newView === 'profile') animClass = 'animate-slide-in-right';
		else if (currentView === 'profile') animClass = 'animate-slide-in-left';
		else animClass = direction === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left';
		// Don't overwrite previousView if we're just going to profile
		if (newView !== 'profile' && currentView !== 'profile') previousView = currentView;
		else if (newView === 'profile' && currentView !== 'profile') previousView = currentView;
		currentView = newView;

		await tick();

		window.scrollTo({ top: scrollPositions.get(newView) || 0, behavior: 'instant' });
	};

	const goToProfile = (did: AtprotoDid) => {
		viewingProfileDid = did;
		switchView('profile');
	};

	let postComposerState = $state<PostComposerState>({ type: 'null' });
	let showScrollToTop = $state(false);
	const handleScroll = () => {
		if (currentView === 'timeline') showScrollToTop = window.scrollY > 300;
	};
	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
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
					'app.bsky.feed.post:embed.record.uri',
					'app.bsky.feed.repost:subject.uri'
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
		<TimelineView
			class={currentView === 'timeline' ? `${animClass}` : 'hidden'}
			client={selectedClient}
			bind:postComposerState
		/>

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
				<FollowingView
					selectedClient={selectedClient!}
					selectedDid={selectedDid!}
					onProfileClick={goToProfile}
				/>
			</div>
		{/if}
		{#if currentView === 'profile' && viewingProfileDid}
			<div class={animClass}>
				<ProfileView
					client={selectedClient!}
					did={viewingProfileDid}
					onBack={() => switchView(previousView)}
					bind:postComposerState
				/>
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
			{currentView === 'timeline' || currentView === 'following' || currentView === 'profile'
				? ''
				: 'hidden'}
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
								onPostSent={(post) => allPosts.get(selectedDid!)?.set(post.uri, post)}
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
