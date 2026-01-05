<script lang="ts" module>
	const profileCache = new SvelteMap<string, { displayName?: string; handle: string }>();
</script>

<script lang="ts">
	import ProfilePicture from './ProfilePicture.svelte';
	import { getRelativeTime } from '$lib/date';
	import { generateColorForDid } from '$lib/accounts';
	import type { Did } from '@atcute/lexicons';
	import type { calculateFollowedUserStats, Sort } from '$lib/following';
	import { resolveDidDoc, type AtpClient } from '$lib/at/client';
	import { SvelteMap } from 'svelte/reactivity';
	import { router } from '$lib/state.svelte';
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

	// svelte-ignore state_referenced_locally
	const cached = profileCache.get(did);
	let displayName = $state<string | undefined>(cached?.displayName);
	let handle = $state<string>(cached?.handle ?? 'handle.invalid');

	const loadProfile = async (targetDid: Did) => {
		if (profileCache.has(targetDid)) {
			const c = profileCache.get(targetDid)!;
			displayName = c.displayName;
			handle = c.handle;
		}

		try {
			const [profileRes, handleRes] = await Promise.all([
				client.getProfile(),
				resolveDidDoc(targetDid).then((r) => map(r, (doc) => doc.handle))
			]);
			if (did !== targetDid) return;
			if (profileRes.ok) displayName = profileRes.value.displayName;
			if (handleRes.ok) handle = handleRes.value;

			profileCache.set(targetDid, {
				handle,
				displayName
			});
		} catch (e) {
			if (did !== targetDid) return;
			console.error(`failed to load profile for ${targetDid}`, e);
			handle = 'error';
		}
	};

	$effect(() => {
		loadProfile(did);
	});

	const lastPostAt = $derived(stats?.lastPostAt ?? new Date(0));
	const relTime = $derived(getRelativeTime(lastPostAt, currentTime));
	const color = $derived(generateColorForDid(did));

	const goToProfile = () => {
		router.navigate(`/profile/${did}`);
	};
</script>

<div {style} class="box-border w-full pb-2">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onclick={goToProfile}
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
