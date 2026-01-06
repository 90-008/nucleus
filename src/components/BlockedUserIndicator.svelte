<script lang="ts">
	import type { Did } from '@atcute/lexicons';
	import ProfilePicture from './ProfilePicture.svelte';
	import type { AtpClient } from '$lib/at/client.svelte';
	import { generateColorForDid } from '$lib/accounts';

	interface Props {
		client: AtpClient;
		did: Did;
		reason: 'blocked' | 'blocks-you';
		size?: 'small' | 'normal' | 'large';
	}

	let { client, did, reason, size = 'normal' }: Props = $props();

	const color = $derived(generateColorForDid(did));
	const text = $derived(reason === 'blocked' ? 'user blocked' : 'user blocks you');
	const pfpSize = $derived(size === 'small' ? 8 : size === 'large' ? 16 : 10);
</script>

<div
	class="flex items-center gap-2 rounded-sm border-2 p-2 {size === 'small' ? 'text-sm' : ''}"
	style="background: {color}11; border-color: {color}44;"
>
	<div class="blocked-pfp">
		<ProfilePicture {client} {did} size={pfpSize} />
	</div>
	<span class="opacity-80">{text}</span>
</div>

<style>
	.blocked-pfp {
		filter: blur(8px) grayscale(100%);
		opacity: 0.4;
	}
</style>
