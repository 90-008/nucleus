<script lang="ts">
	import { generateColorForDid } from '$lib/accounts';
	import type { AtpClient } from '$lib/at/client.svelte';
	import { isBlob } from '@atcute/lexicons/interfaces';
	import PfpPlaceholder from './PfpPlaceholder.svelte';
	import { img } from '$lib/cdn';
	import type { Did } from '@atcute/lexicons';
	import { profiles } from '$lib/state.svelte';

	interface Props {
		client: AtpClient;
		did: Did;
		size: number;
	}

	let { client, did, size }: Props = $props();

	const avatarBlob = $derived(profiles.get(did)?.avatar);
	const avatarUrl: string | null = $derived(
		isBlob(avatarBlob) ? img('avatar_thumbnail', did, avatarBlob.ref.$link) : null
	);

	const loadProfile = async (targetDid: Did) => {
		if (avatarBlob) return;

		const profile = await client.getProfile(targetDid);
		if (profile.ok) profiles.set(did, profile.value);
		else console.error(`${targetDid}: failed to load pfp: ${profile.error}`);
	};

	$effect(() => {
		if (!client.user) return;
		loadProfile(did);
	});

	const color = $derived(generateColorForDid(did));
</script>

{#if avatarUrl}
	<img
		class="rounded-sm bg-(--nucleus-accent)/10"
		loading="lazy"
		style="width: calc(var(--spacing) * {size}); height: calc(var(--spacing) * {size});"
		alt="avatar for {did}"
		src={avatarUrl}
	/>
{:else}
	<PfpPlaceholder {color} {size} />
{/if}
