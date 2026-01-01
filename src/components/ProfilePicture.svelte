<script lang="ts" module>
	// we have this to prevent avatars from "flickering"
	const avatarCache = new SvelteMap<string, string | null>();
</script>

<script lang="ts">
	import { generateColorForDid } from '$lib/accounts';
	import type { AtpClient } from '$lib/at/client';
	import { isBlob } from '@atcute/lexicons/interfaces';
	import PfpPlaceholder from './PfpPlaceholder.svelte';
	import { img } from '$lib/cdn';
	import type { Did } from '@atcute/lexicons';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		client: AtpClient;
		did: Did;
		size: number;
	}

	let { client, did, size }: Props = $props();

	// svelte-ignore state_referenced_locally
	let avatarUrl = $state<string | null>(avatarCache.get(did) ?? null);

	const loadProfile = async (targetDid: Did) => {
		avatarUrl = avatarCache.get(targetDid) ?? null;

		try {
			const profile = await client.getProfile(targetDid);

			if (did !== targetDid) return;

			if (profile.ok) {
				const record = profile.value;
				if (isBlob(record.avatar)) {
					const url = img('avatar_thumbnail', targetDid, record.avatar.ref.$link);
					avatarUrl = url;
					avatarCache.set(targetDid, url);
				} else {
					avatarUrl = null;
					avatarCache.set(targetDid, null);
				}
			} else {
				avatarUrl = null;
			}
		} catch (e) {
			if (did !== targetDid) return;
			console.error(`${targetDid}: failed to load pfp`, e);
			avatarUrl = null;
		}
	};

	$effect(() => {
		loadProfile(did);
	});

	let color = $derived(generateColorForDid(did));
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
