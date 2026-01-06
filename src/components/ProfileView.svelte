<script lang="ts">
	import { AtpClient, resolveDidDoc, resolveHandle } from '$lib/at/client.svelte';
	import {
		isHandle,
		type ActorIdentifier,
		type AtprotoDid,
		type Did,
		type Handle
	} from '@atcute/lexicons/syntax';
	import TimelineView from './TimelineView.svelte';
	import ProfileInfo from './ProfileInfo.svelte';
	import type { State as PostComposerState } from './PostComposer.svelte';
	import Icon from '@iconify/svelte';
	import { accounts, generateColorForDid } from '$lib/accounts';
	import { img } from '$lib/cdn';
	import { isBlob } from '@atcute/lexicons/interfaces';
	import type { AppBskyActorProfile } from '@atcute/bluesky';
	import {
		handles,
		profiles,
		getBlockRelationship,
		fetchBlocked,
		blockFlags
	} from '$lib/state.svelte';
	import BlockedUserIndicator from './BlockedUserIndicator.svelte';
	import ProfileActions from './ProfileActions.svelte';

	interface Props {
		client: AtpClient;
		actor: string;
		onBack: () => void;
		postComposerState: PostComposerState;
	}

	let { client, actor, onBack, postComposerState = $bindable() }: Props = $props();

	let profile = $state<AppBskyActorProfile.Main | null>(profiles.get(actor as Did) ?? null);
	const displayName = $derived(profile?.displayName ?? '');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let did = $state<AtprotoDid | null>(null);
	let handle = $state<Handle | null>(handles.get(actor as Did) ?? null);

	let userBlocked = $state(false);
	let blockedByTarget = $state(false);

	const loadProfile = async (identifier: ActorIdentifier) => {
		loading = true;
		error = null;
		profile = null;
		handle = isHandle(identifier) ? identifier : null;

		const resDid = await resolveHandle(identifier);
		if (resDid.ok) did = resDid.value;
		else {
			error = resDid.error;
			loading = false;
			return;
		}

		if (!handle) handle = handles.get(did) ?? null;

		if (!handle) {
			const resHandle = await resolveDidDoc(did);
			if (resHandle.ok) {
				handle = resHandle.value.handle;
				handles.set(did, resHandle.value.handle);
			}
		}

		// check block relationship
		if (client.user?.did) {
			let blockRel = getBlockRelationship(client.user.did, did);
			blockRel = blockFlags.get(client.user.did)?.has(did)
				? blockRel
				: {
						userBlocked: await fetchBlocked(client, did, client.user.did),
						blockedByTarget: await fetchBlocked(client, client.user.did, did)
					};
			userBlocked = blockRel.userBlocked;
			blockedByTarget = blockRel.blockedByTarget;
		}

		// don't load profile if blocked
		if (userBlocked || blockedByTarget) {
			loading = false;
			return;
		}

		const res = await client.getProfile(did);
		if (res.ok) {
			profile = res.value;
			profiles.set(did, res.value);
		} else error = res.error;

		loading = false;
	};

	$effect(() => {
		// if we have accounts, wait until we are logged in to load the profile
		if (!($accounts.length > 0 && !client.user?.did)) loadProfile(actor as ActorIdentifier);
	});

	const color = $derived(did ? generateColorForDid(did) : 'var(--nucleus-accent)');
	const bannerUrl = $derived(
		did && profile && isBlob(profile.banner)
			? img('feed_fullsize', did, profile.banner.ref.$link)
			: null
	);
</script>

<div class="flex min-h-dvh flex-col">
	<!-- header -->
	<div
		class="sticky top-0 z-20 flex items-center gap-4 border-b-2 bg-(--nucleus-bg)/80 p-2 backdrop-blur-md"
		style="border-color: {color};"
	>
		<button
			onclick={onBack}
			class="rounded-sm p-1 text-(--nucleus-fg) transition-all hover:bg-(--nucleus-fg)/10"
		>
			<Icon icon="heroicons:arrow-left-20-solid" width={24} />
		</button>
		<h2 class="text-xl font-bold">
			{displayName.length > 0
				? displayName
				: loading
					? 'loading...'
					: (handle ?? actor ?? 'profile')}
		</h2>
		<div class="grow"></div>
		{#if did && client.user && client.user.did !== did}
			<ProfileActions {client} targetDid={did} bind:userBlocked {blockedByTarget} />
		{/if}
	</div>

	{#if !loading}
		{#if error}
			<div class="p-8 text-center text-red-500">
				<p>failed to load profile: {error}</p>
			</div>
		{:else if userBlocked || blockedByTarget}
			<div class="p-8">
				<BlockedUserIndicator
					{client}
					did={did!}
					reason={userBlocked ? 'blocked' : 'blocks-you'}
					size="large"
				/>
			</div>
		{:else}
			<!-- banner -->
			<div class="relative h-32 w-full overflow-hidden bg-(--nucleus-fg)/5 md:h-48">
				{#if bannerUrl}
					<img src={bannerUrl} alt="banner" class="h-full w-full object-cover" />
				{/if}
				<div
					class="absolute inset-0 bg-linear-to-b from-transparent to-(--nucleus-bg)"
					style="opacity: 0.8;"
				></div>
			</div>

			{#if did}
				<div class="px-4 pb-4">
					<div class="relative z-10 -mt-12 mb-4">
						<ProfileInfo {client} {did} bind:profile />
					</div>

					<TimelineView
						showReplies={false}
						{client}
						targetDid={did}
						bind:postComposerState
						class="min-h-[50vh]"
					/>
				</div>
			{/if}
		{/if}
	{/if}
</div>
