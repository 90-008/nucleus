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
		size: number;
		did: Did | null;
	}

	let { client, did, size }: Props = $props();

	const avatarBlob = $derived(did ? profiles.get(did)?.avatar : null);
	const avatarUrl = $derived(
		did && isBlob(avatarBlob) ? img('avatar_thumbnail', did, avatarBlob.ref.$link) : null
	);

	const loadProfile = async (client: AtpClient, did: Did) => {
		if (avatarBlob) return;

		const profile = await client.getProfile(did);
		if (profile.ok) profiles.set(did, profile.value);
		else console.error(`${did}: failed to load pfp: ${profile.error}`);
	};

	$effect(() => {
		if (!did) return;
		loadProfile(client, did);
	});

	const color = $derived(did ? generateColorForDid(did) : 'var(--nucleus-accent)');
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
