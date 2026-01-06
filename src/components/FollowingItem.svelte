<script lang="ts" module>
	const profileCache = new SvelteMap<string, { displayName?: string; handle: string }>();
</script>

<script lang="ts">
	import ProfilePicture from './ProfilePicture.svelte';
	import BlockedUserIndicator from './BlockedUserIndicator.svelte';
	import { getRelativeTime } from '$lib/date';
	import { generateColorForDid } from '$lib/accounts';
	import type { Did } from '@atcute/lexicons';
	import type { calculateFollowedUserStats, Sort } from '$lib/following';
	import { resolveDidDoc, type AtpClient } from '$lib/at/client.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { router, getBlockRelationship } from '$lib/state.svelte';
	import { map } from '$lib/result';

	interface Props {
		style: string;
		did: Did;
		stats: NonNullable<ReturnType<typeof calculateFollowedUserStats>>;
		client: AtpClient;
		sort: Sort;
		currentTime: Date;
	}

	let { style, did, stats, client, sort, currentTime }: Props = $props();

	const userDid = $derived(client.user?.did);
	const blockRel = $derived(
		userDid ? getBlockRelationship(userDid, did) : { userBlocked: false, blockedByTarget: false }
	);
	const isBlocked = $derived(blockRel.userBlocked || blockRel.blockedByTarget);

	const cached = $derived(profileCache.get(did));
	const displayName = $derived(cached?.displayName);
	const handle = $derived(cached?.handle ?? 'handle.invalid');

	let error = $state('');

	const loadProfile = async (targetDid: Did) => {
		if (profileCache.has(targetDid)) return;

		try {
			const [profileRes, handleRes] = await Promise.all([
				client.getProfile(targetDid),
				resolveDidDoc(targetDid).then((r) => map(r, (doc) => doc.handle))
			]);
			if (did !== targetDid) return;

			profileCache.set(targetDid, {
				handle: handleRes.ok ? handleRes.value : handle,
				displayName: profileRes.ok ? profileRes.value.displayName : displayName
			});
		} catch (e) {
			if (did !== targetDid) return;
			console.error(`failed to load profile for ${targetDid}`, e);
			error = String(e);
		}
	};

	$effect(() => {
		loadProfile(did);
	});

	const lastPostAt = $derived(stats?.lastPostAt ?? new Date(0));
	const relTime = $derived(getRelativeTime(lastPostAt, currentTime));
	const color = $derived(generateColorForDid(did));

	const goToProfile = () => router.navigate(`/profile/${did}`);
</script>

<div {style} class="box-border w-full pb-2">
	{#if isBlocked}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onclick={goToProfile} class="cursor-pointer">
			<BlockedUserIndicator
				{client}
				{did}
				reason={blockRel.userBlocked ? 'blocked' : 'blocks-you'}
				size="small"
			/>
		</div>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onclick={goToProfile}
			class="group flex cursor-pointer items-center gap-2 rounded-sm bg-(--nucleus-accent)/7 p-3 transition-colors hover:bg-(--post-color)/20"
			style={`--post-color: ${color};`}
		>
			<ProfilePicture {client} {did} size={10} />
			<div class="min-w-0 flex-1 space-y-1">
				{#if error.length === 0}
					<div
						class="flex items-baseline gap-2 truncate font-bold transition-colors group-hover:text-(--post-color)"
						style={`--post-color: ${color};`}
					>
						<span class="truncate">{displayName || handle}</span>
						<span class="truncate text-sm opacity-60">@{handle}</span>
					</div>
				{:else}
					<div class="flex items-baseline truncate text-sm text-red-500">
						error: {error}
					</div>
				{/if}
				<div class="flex gap-2 text-xs opacity-70">
					<span
						class={Date.now() - lastPostAt.getTime() < 1000 * 60 * 60 * 2
							? 'text-(--nucleus-accent)'
							: ''}
					>
						posted {relTime}
						{relTime !== 'now' ? 'ago' : ''}
					</span>
					{#if stats?.recentPostCount && stats.recentPostCount > 0}
						<span class="text-(--nucleus-accent2)">
							{stats.recentPostCount} posts / 6h
						</span>
					{/if}
					{#if sort === 'conversational' && stats?.conversationalScore && stats.conversationalScore > 0}
						<span class="ml-auto font-bold text-(--nucleus-accent)">
							★ {stats.conversationalScore.toFixed(1)}
						</span>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
