<script lang="ts">
	import type { AtpClient } from '$lib/at/client.svelte';
	import { parseCanonicalResourceUri, type Did } from '@atcute/lexicons';
	import Dropdown from './Dropdown.svelte';
	import Icon from '@iconify/svelte';
	import {
		accountPreferences,
		createBlock,
		deleteBlock,
		follows,
		updateAccountPreferences
	} from '$lib/state.svelte';
	import { generateColorForDid } from '$lib/accounts';
	import { now as tidNow } from '@atcute/tid';
	import type { AppBskyGraphFollow } from '@atcute/bluesky';
	import { toCanonicalUri } from '$lib';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		client: AtpClient;
		targetDid: Did;
		userBlocked: boolean;
		blockedByTarget: boolean;
	}

	let { client, targetDid, userBlocked = $bindable(), blockedByTarget }: Props = $props();

	const userDid = $derived(client.user?.did);
	const color = $derived(generateColorForDid(targetDid));

	let actionsOpen = $state(false);
	let actionsPos = $state({ x: 0, y: 0 });

	const followsMap = $derived(userDid ? follows.get(userDid) : undefined);
	const follow = $derived(followsMap ? followsMap.get(targetDid) : undefined);

	const currentPrefs = $derived(userDid ? accountPreferences.get(userDid) : null);
	const mutes = $derived(currentPrefs?.mutes ?? []);
	const muted = $derived(mutes.includes(targetDid));

	const handleMute = async () => {
		if (!userDid || !client.user) return;

		if (muted)
			await updateAccountPreferences(userDid, { mutes: mutes.filter((m) => m !== targetDid) });
		else await updateAccountPreferences(userDid, { mutes: [...mutes, targetDid] });
	};

	const handleFollow = async () => {
		if (!userDid || !client.user) return;

		if (follow) {
			const { uri } = follow;
			followsMap?.delete(targetDid);

			// extract rkey from uri
			const parsedUri = parseCanonicalResourceUri(uri);
			if (!parsedUri.ok) return;
			const rkey = parsedUri.value.rkey;

			await client.user.atcute.post('com.atproto.repo.deleteRecord', {
				input: {
					repo: userDid,
					collection: 'app.bsky.graph.follow',
					rkey
				}
			});
		} else {
			// follow
			const rkey = tidNow();
			const record: AppBskyGraphFollow.Main = {
				$type: 'app.bsky.graph.follow',
				subject: targetDid,
				createdAt: new Date().toISOString()
			};

			const uri = toCanonicalUri({
				did: userDid,
				collection: 'app.bsky.graph.follow',
				rkey
			});

			if (!followsMap) follows.set(userDid, new SvelteMap([[targetDid, { uri, record }]]));
			else followsMap.set(targetDid, { uri, record });

			await client.user.atcute.post('com.atproto.repo.createRecord', {
				input: {
					repo: userDid,
					collection: 'app.bsky.graph.follow',
					rkey,
					record
				}
			});
		}

		actionsOpen = false;
	};

	const handleBlock = async () => {
		if (!userDid) return;

		if (userBlocked) {
			await deleteBlock(client, targetDid);
			userBlocked = false;
		} else {
			await createBlock(client, targetDid);
			userBlocked = true;
		}

		actionsOpen = false;
	};
</script>

{#snippet dropdownItem(icon: string, label: string, onClick: () => void, disabled: boolean = false)}
	<button
		class="flex items-center justify-between rounded-sm px-2 py-1.5 transition-all duration-100
		{disabled ? 'cursor-not-allowed opacity-50' : 'hover:[backdrop-filter:brightness(120%)]'}"
		onclick={onClick}
		{disabled}
	>
		<span class="font-semibold opacity-85">{label}</span>
		<Icon class="h-6 w-6" {icon} />
	</button>
{/snippet}

<Dropdown
	class="post-dropdown"
	style="background: {color}36; border-color: {color}99;"
	bind:isOpen={actionsOpen}
	bind:position={actionsPos}
	placement="bottom-end"
>
	{#if !blockedByTarget && !userBlocked}
		{@render dropdownItem(
			follow ? 'heroicons:user-minus-20-solid' : 'heroicons:user-plus-20-solid',
			follow ? 'unfollow' : 'follow',
			handleFollow
		)}
	{/if}
	{@render dropdownItem(
		userBlocked ? 'heroicons:eye-20-solid' : 'heroicons:eye-slash-20-solid',
		userBlocked ? 'unblock' : 'block',
		handleBlock
	)}
	{@render dropdownItem(
		muted ? 'heroicons:speaker-wave-20-solid' : 'heroicons:speaker-x-mark-20-solid',
		muted ? 'unmute' : 'mute',
		handleMute
	)}

	{#snippet trigger()}
		<button
			class="rounded-sm p-1.5 transition-all hover:bg-white/10"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				actionsOpen = !actionsOpen;
				actionsPos = { x: 0, y: 0 };
			}}
			title="profile actions"
		>
			<Icon icon="heroicons:ellipsis-horizontal-16-solid" width={24} />
		</button>
	{/snippet}
</Dropdown>
