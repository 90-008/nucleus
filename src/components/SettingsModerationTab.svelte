<script lang="ts">
	import MutedAccountItem from './MutedAccountItem.svelte';
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';
	import type { ActorIdentifier, Did } from '@atcute/lexicons';
	import { allBacklinks, createBlock, deleteBlock, clients } from '$lib/state.svelte';
	import { blockSource } from '$lib';
	import { isActorIdentifier } from '@atcute/lexicons/syntax';
	import { resolveHandle } from '$lib/at/client.svelte';

	interface Props {
		mutes: Did[];
		onAddMute: (did: Did) => void;
		onRemoveMute: (did: Did) => void;
		selectedAccount: Did | null;
	}

	let { mutes, onAddMute, onRemoveMute, selectedAccount }: Props = $props();

	let newMuteInput = $state('');
	let newBlockInput = $state('');

	const handleAddMute = async () => {
		if (!newMuteInput.trim()) return;
		const did = await resolveHandle(newMuteInput.trim() as ActorIdentifier);
		if (!did.ok) return;
		onAddMute(did.value);
		newMuteInput = '';
	};

	const blocks = $derived.by(() => {
		if (!selectedAccount) return [];
		const blockMap = allBacklinks.get(blockSource);
		if (!blockMap) return [];
		const blockedDids: Did[] = [];
		for (const [subjectUri, didMap] of blockMap) {
			if (didMap.has(selectedAccount)) {
				const did = subjectUri.replace('at://', '') as Did;
				blockedDids.push(did);
			}
		}
		return blockedDids;
	});

	const handleAddBlock = async () => {
		if (!newBlockInput.trim() || !selectedAccount) return;
		const client = clients.get(selectedAccount);
		if (!client) return;
		const did = await resolveHandle(newBlockInput.trim() as ActorIdentifier);
		if (!did.ok) return;
		await createBlock(client, did.value);
		newBlockInput = '';
	};

	const handleRemoveBlock = async (did: Did) => {
		if (!selectedAccount) return;
		const client = clients.get(selectedAccount);
		if (!client) return;
		await deleteBlock(client, did);
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
					placeholder="enter identifier"
					class="single-line-input flex-1"
				/>
				<button
					disabled={!isActorIdentifier(newMuteInput)}
					onclick={handleAddMute}
					class="action-button">add</button
				>
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

	<div>
		<h3 class="settings-header">blocked accounts</h3>
		<div class="settings-box space-y-2">
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={newBlockInput}
					placeholder="enter identifier"
					class="single-line-input flex-1"
				/>
				<button
					disabled={!isActorIdentifier(newBlockInput)}
					onclick={handleAddBlock}
					class="action-button">add</button
				>
			</div>
			{#if blocks.length > 0}
				<div class="h-fit">
					<VirtualList
						height={Math.min(blocks.length, 6) * 44}
						itemCount={blocks.length}
						itemSize={44}
					>
						{#snippet item({ index, style }: { index: number; style: string })}
							<MutedAccountItem
								{style}
								did={blocks[index]}
								onRemove={() => handleRemoveBlock(blocks[index])}
							/>
						{/snippet}
					</VirtualList>
				</div>
			{:else}
				<p class="py-2 text-center text-sm opacity-50">no blocked accounts</p>
			{/if}
		</div>
	</div>
</div>
