<script lang="ts" module>
	// Cache for synchronous access during component recycling
	const profileCache = new SvelteMap<string, { displayName?: string; handle: string }>();
</script>

<script lang="ts">
	import ProfilePicture from './ProfilePicture.svelte';
	import { getRelativeTime } from '$lib/date';
	import { generateColorForDid } from '$lib/accounts';
	import type { Did } from '@atcute/lexicons';
	import type { AtprotoDid } from '@atcute/lexicons/syntax';
	import type { calculateFollowedUserStats, Sort } from '$lib/following';
	import type { AtpClient } from '$lib/at/client';
	import { SvelteMap } from 'svelte/reactivity';
	import { clients, getClient } from '$lib/state.svelte';

	interface Props {
		style: string;
		did: Did;
		stats: NonNullable<ReturnType<typeof calculateFollowedUserStats>>;
		client: AtpClient;
		sort: Sort;
		currentTime: Date;
		onClick?: (did: AtprotoDid) => void;
	}

	let { style, did, stats, client, sort, currentTime, onClick }: Props = $props();

	// svelte-ignore state_referenced_locally
	const cached = profileCache.get(did);
	let displayName = $state<string | undefined>(cached?.displayName);
	let handle = $state<string>(cached?.handle ?? 'handle.invalid');

	const loadProfile = async (targetDid: Did) => {
		if (profileCache.has(targetDid)) {
			const c = profileCache.get(targetDid)!;
			displayName = c.displayName;
			handle = c.handle;
		} else {
			const existingClient = clients.get(targetDid as AtprotoDid);
			if (existingClient?.user?.handle) {
				handle = existingClient.user.handle;
			} else {
				handle = 'handle.invalid';
				displayName = undefined;
			}
		}

		try {
			// Optimization: Check clients map first to avoid async overhead if possible
			// but we need to ensure we have the profile data, not just client existence.
			const userClient = await getClient(targetDid as AtprotoDid);

			// Check if the component has been recycled for a different user while we were awaiting
			if (did !== targetDid) return;

			let newHandle = handle;
			let newDisplayName = displayName;

			if (userClient.user?.handle) {
				newHandle = userClient.user.handle;
				handle = newHandle;
			} else {
				newHandle = targetDid;
				handle = newHandle;
			}

			const profileRes = await userClient.getProfile();

			if (did !== targetDid) return;

			if (profileRes.ok) {
				newDisplayName = profileRes.value.displayName;
				displayName = newDisplayName;
			}

			// Update cache
			profileCache.set(targetDid, {
				handle: newHandle,
				displayName: newDisplayName
			});
		} catch (e) {
			if (did !== targetDid) return;
			console.error(`failed to load profile for ${targetDid}`, e);
			handle = 'error';
		}
	};

	// Re-run whenever `did` changes
	$effect(() => {
		loadProfile(did);
	});

	const lastPostAt = $derived(stats?.lastPostAt ?? new Date(0));
	const relTime = $derived(getRelativeTime(lastPostAt, currentTime));
	const color = $derived(generateColorForDid(did));
</script>

<div {style} class="box-border w-full pb-2">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onclick={() => onClick?.(did as AtprotoDid)}
		class="group flex cursor-pointer items-center gap-2 rounded-sm bg-(--nucleus-accent)/7 p-3 transition-colors hover:bg-(--post-color)/20"
		style={`--post-color: ${color};`}
	>
		<ProfilePicture {client} {did} size={10} />
		<div class="min-w-0 flex-1 space-y-1">
			<div
				class="flex items-baseline gap-2 font-bold transition-colors group-hover:text-(--post-color)"
				style={`--post-color: ${color};`}
			>
				<span class="truncate">{displayName || handle}</span>
				<span class="truncate text-sm opacity-60">@{handle}</span>
			</div>
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
</div>
