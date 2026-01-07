<script lang="ts">
	import { AtpClient, resolveDidDoc } from '$lib/at/client.svelte';
	import { isDid, isHandle, type ActorIdentifier, type Did } from '@atcute/lexicons/syntax';
	import TimelineView from './TimelineView.svelte';
	import ProfileInfo from './ProfileInfo.svelte';
	import type { State as PostComposerState } from './PostComposer.svelte';
	import Icon from '@iconify/svelte';
	import { accounts, generateColorForDid } from '$lib/accounts';
	import { img } from '$lib/cdn';
	import { isBlob } from '@atcute/lexicons/interfaces';
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

	const profile = $derived(profiles.get(actor as Did));
	const displayName = $derived(profile?.displayName ?? '');
	const handle = $derived(isHandle(actor) ? actor : handles.get(actor as Did));
	let loading = $state(true);
	let error = $state<string | null>(null);
	let did = $state(isDid(actor) ? actor : null);

	let userBlocked = $state(false);
	let blockedByTarget = $state(false);

	const loadProfile = async (identifier: ActorIdentifier) => {
		loading = true;
		error = null;

		const docRes = await resolveDidDoc(identifier);
		if (docRes.ok) {
			did = docRes.value.did;
			handles.set(did, docRes.value.handle);
		} else {
			error = docRes.error;
			return;
		}

		// check block relationship
		if (client.user?.did) {
			let blockRel = getBlockRelationship(client.user.did, did);
			blockRel = blockFlags.get(client.user.did)?.has(did)
				? blockRel
				: await (async () => {
						const [userBlocked, blockedByTarget] = await Promise.all([
							await fetchBlocked(client, did, client.user!.did),
							await fetchBlocked(client, client.user!.did, did)
						]);
						return { userBlocked, blockedByTarget };
					})();
			userBlocked = blockRel.userBlocked;
			blockedByTarget = blockRel.blockedByTarget;
		}

		// don't load profile if blocked
		if (userBlocked || blockedByTarget) {
			loading = false;
			return;
		}

		const res = await client.getProfile(did, true);
		if (res.ok) profiles.set(did, res.value);
		else error = res.error;

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
			{displayName.length > 0 ? displayName : loading ? 'loading...' : (handle ?? 'handle.invalid')}
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
			{#if bannerUrl}
				<div class="relative h-32 w-full overflow-hidden bg-(--nucleus-fg)/5 md:h-48">
					<img src={bannerUrl} alt="banner" class="h-full w-full object-cover" />
					<div
						class="absolute inset-0 bg-linear-to-b from-transparent to-(--nucleus-bg)"
						style="opacity: 0.8;"
					></div>
				</div>
			{/if}

			{#if did}
				<div class="px-4 pb-4">
					<div class="relative z-10 {bannerUrl ? '-mt-12' : 'mt-4'} mb-4">
						<ProfileInfo {client} {did} {profile} />
					</div>

					<TimelineView
						hydrateOptions={{ downwards: 'none' }}
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
