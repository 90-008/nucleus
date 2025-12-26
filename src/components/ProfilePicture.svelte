<script lang="ts">
	import { generateColorForDid } from '$lib/accounts';
	import type { AtpClient } from '$lib/at/client';
	import { isBlob } from '@atcute/lexicons/interfaces';
	import PfpPlaceholder from './PfpPlaceholder.svelte';
	import { img } from '$lib/cdn';
	import type { Did } from '@atcute/lexicons';

	interface Props {
		client: AtpClient;
		did: Did;
		size: number;
	}

	let { client, did, size }: Props = $props();

	let color = $derived(generateColorForDid(did));
</script>

{#snippet missingPfp()}
	<PfpPlaceholder {color} {size} />
{/snippet}

{#await client.getProfile(did)}
	{@render missingPfp()}
{:then profile}
	{#if profile.ok}
		{@const record = profile.value}
		{#if isBlob(record.avatar)}
			<img
				class="rounded-sm"
				loading="lazy"
				style="width: calc(var(--spacing) * {size}); height: calc(var(--spacing) * {size});"
				alt="avatar for {did}"
				src={img('avatar_thumbnail', did, record.avatar.ref.$link)}
			/>
		{:else}
			{@render missingPfp()}
		{/if}
	{:else}
		{@render missingPfp()}
	{/if}
{/await}
