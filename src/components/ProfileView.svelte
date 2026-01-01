<script lang="ts">
	import { AtpClient, resolveDidDoc, resolveHandle } from '$lib/at/client';
	import {
		isHandle,
		type ActorIdentifier,
		type AtprotoDid,
		type Handle
	} from '@atcute/lexicons/syntax';
	import TimelineView from './TimelineView.svelte';
	import ProfileInfo from './ProfileInfo.svelte';
	import type { State as PostComposerState } from './PostComposer.svelte';
	import Icon from '@iconify/svelte';
	import { generateColorForDid } from '$lib/accounts';
	import { img } from '$lib/cdn';
	import { isBlob } from '@atcute/lexicons/interfaces';
	import type { AppBskyActorProfile } from '@atcute/bluesky';
	import { onMount } from 'svelte';

	interface Props {
		client: AtpClient;
		actor: string;
		onBack: () => void;
		postComposerState?: PostComposerState;
	}

	let { client, actor, onBack, postComposerState = $bindable({ type: 'null' }) }: Props = $props();

	let profile = $state<AppBskyActorProfile.Main | null>(null);
	const displayName = $derived(profile?.displayName ?? '');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let did = $state<AtprotoDid | null>(null);
	let handle = $state<Handle | null>(null);

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

		if (!handle) {
			const resHandle = await resolveDidDoc(did);
			if (resHandle.ok) handle = resHandle.value.handle;
		}

		const res = await client.getProfile(did);
		if (res.ok) profile = res.value;
		else error = res.error;

		loading = false;
	};

	onMount(async () => {
		await loadProfile(actor as ActorIdentifier);
	});

	const color = $derived(did ? generateColorForDid(did) : 'var(--nucleus-fg)');
	const bannerUrl = $derived(
		did && profile && isBlob(profile.banner)
			? img('feed_fullsize', did, profile.banner.ref.$link)
			: null
	);
</script>

<div class="flex min-h-dvh flex-col">
	<!-- Header -->
	<div
		class="sticky top-0 z-20 flex items-center gap-4 border-b-2 bg-(--nucleus-bg)/80 p-4 backdrop-blur-md"
		style="border-color: {color}40;"
	>
		<button
			onclick={onBack}
			class="rounded-full p-1 text-(--nucleus-fg) transition-all hover:bg-(--nucleus-fg)/10"
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
	</div>

	{#if error}
		<div class="p-8 text-center text-red-500">
			<p>failed to load profile: {error}</p>
		</div>
	{:else}
		<!-- Banner -->
		<div class="relative h-32 w-full overflow-hidden bg-(--nucleus-fg)/5 md:h-48">
			{#if bannerUrl}
				<img src={bannerUrl} alt="banner" class="h-full w-full object-cover" />
			{/if}
			<div
				class="absolute inset-0 bg-linear-to-b from-transparent to-(--nucleus-bg)"
				style="opacity: 0.8;"
			></div>
		</div>

		<div class="px-4 pb-4">
			<div class="relative z-10 -mt-12 mb-4">
				{#if did}
					<ProfileInfo {client} {did} bind:profile />
				{/if}
			</div>

			<div class="my-4 h-px bg-white/10"></div>

			{#if did}
				<TimelineView
					showReplies={false}
					{client}
					targetDid={did}
					bind:postComposerState
					class="min-h-[50vh]"
				/>
			{/if}
		</div>
	{/if}
</div>
