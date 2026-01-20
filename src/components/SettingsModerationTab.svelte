<script lang="ts">
	import MutedAccountItem from './MutedAccountItem.svelte';
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';
	import type { Did } from '@atcute/lexicons';
	import type { Preferences } from '$lib/at/pocket';

	interface Props {
		mutes: Did[];
		currentPrefs: Preferences | null;
		onAddMute: (did: Did) => void;
		onRemoveMute: (did: Did) => void;
	}

	let { mutes, currentPrefs, onAddMute, onRemoveMute }: Props = $props();

	let newMuteInput = $state('');

	const handleAddMute = () => {
		if (!newMuteInput.trim()) return;
		const did = newMuteInput.trim() as Did;
		onAddMute(did);
		newMuteInput = '';
	};
</script>

<div class="space-y-4 p-4">
	<div>
		<h3 class="settings-header">muted accounts</h3>
		<div class="settings-box space-y-2">
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={newMuteInput}
					placeholder="did:plc:..."
					class="single-line-input flex-1"
				/>
				<button onclick={handleAddMute} class="action-button">add</button>
			</div>
			{#if mutes.length > 0}
				<div class="h-fit">
					<VirtualList
						height={Math.min(mutes.length, 6) * 44}
						itemCount={mutes.length}
						itemSize={44}
					>
						{#snippet item({ index, style }: { index: number; style: string })}
							<MutedAccountItem
								{style}
								did={mutes[index]}
								onRemove={() => onRemoveMute(mutes[index])}
							/>
						{/snippet}
					</VirtualList>
				</div>
			{:else}
				<p class="py-2 text-center text-sm opacity-50">no muted accounts</p>
			{/if}
		</div>
	</div>
	{#if currentPrefs}
		<p class="text-xs opacity-50">
			last synced: {new Date(currentPrefs.updatedAt).toLocaleString()}
		</p>
	{/if}
</div>
