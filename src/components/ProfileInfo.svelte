<script lang="ts">
	import { AtpClient, resolveDidDoc } from '$lib/at/client';
	import type { Did, Handle } from '@atcute/lexicons/syntax';
	import type { AppBskyActorProfile } from '@atcute/bluesky';
	import ProfilePicture from './ProfilePicture.svelte';
	import RichText from './RichText.svelte';
	import { onMount } from 'svelte';
	import { handles, profiles } from '$lib/state.svelte';

	interface Props {
		client: AtpClient;
		did: Did;
		handle?: Handle;
		profile?: AppBskyActorProfile.Main | null;
	}

	let {
		client,
		did,
		handle = handles.get(did),
		profile = $bindable(profiles.get(did) ?? null)
	}: Props = $props();

	onMount(async () => {
		await Promise.all([
			(async () => {
				if (profile) return;
				const res = await client.getProfile(did);
				if (!res.ok) return;
				profile = res.value;
				profiles.set(did, res.value);
			})(),
			(async () => {
				if (handle) return;
				const res = await resolveDidDoc(did);
				if (!res.ok) return;
				handle = res.value.handle;
				handles.set(did, res.value.handle);
			})()
		]);
	});

	let displayHandle = $derived(handle ?? 'handle.invalid');
	let profileDesc = $derived(profile?.description?.trim() ?? '');
	let profileDisplayName = $derived(profile?.displayName ?? '');
	let showDid = $state(false);
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-center gap-2">
		<ProfilePicture {client} {did} size={20} />

		<div class="flex min-w-0 flex-col items-start overflow-hidden overflow-ellipsis">
			<span class="mb-1.5 min-w-0 overflow-hidden text-2xl text-nowrap overflow-ellipsis">
				{profileDisplayName.length > 0 ? profileDisplayName : displayHandle}
				{#if profile?.pronouns}
					<span class="shrink-0 text-sm text-nowrap opacity-60">({profile.pronouns})</span>
				{/if}
			</span>
			<button
				oncontextmenu={(e) => {
					e.stopPropagation();
					const node = e.target as Node;
					const selection = window.getSelection() ?? new Selection();
					const range = document.createRange();
					range.selectNodeContents(node);
					selection.removeAllRanges();
					selection.addRange(range);
				}}
				onmousedown={(e) => {
					// disable double clicks to disable "double click to select text"
					// since it doesnt work with us toggling did vs handle
					if (e.detail > 1) e.preventDefault();
				}}
				onclick={() => (showDid = !showDid)}
				class="mb-0.5 text-nowrap opacity-85 select-text hover:underline"
			>
				{showDid ? did : `@${displayHandle}`}
			</button>
			{#if profile?.website}
				<a
					target="_blank"
					rel="noopener noreferrer"
					href={profile.website}
					class="text-sm text-nowrap opacity-60 hover:underline">{profile.website}</a
				>
			{/if}
		</div>
	</div>

	{#if profileDesc.length > 0}
		<div class="rounded-sm bg-black/25 p-1.5 text-wrap wrap-break-word">
			<RichText text={profileDesc} />
		</div>
	{/if}
</div>
