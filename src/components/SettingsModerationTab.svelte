<script lang="ts">
	import MutedAccountItem from './MutedAccountItem.svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
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

	let mutesParentRef = $state<HTMLDivElement | null>(null);
	const mutesVirtualizer = createVirtualizer({
		count: 0,
		getScrollElement: () => mutesParentRef,
		estimateSize: () => 44,
		overscan: 5
	});

	$effect(() => {
		$mutesVirtualizer.setOptions({
			count: mutes.length,
			getScrollElement: () => mutesParentRef,
			estimateSize: () => 44,
			overscan: 5
		});
	});

	let blocksParentRef = $state<HTMLDivElement | null>(null);
	const blocksVirtualizer = createVirtualizer({
		count: 0,
		getScrollElement: () => blocksParentRef,
		estimateSize: () => 44,
		overscan: 5
	});

	$effect(() => {
		$blocksVirtualizer.setOptions({
			count: blocks.length,
			getScrollElement: () => blocksParentRef,
			estimateSize: () => 44,
			overscan: 5
		});
	});
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
					<div
						bind:this={mutesParentRef}
						style="height: {Math.min(mutes.length, 6) *
							44}px; overflow-y: auto; overflow-x: hidden; position: relative;"
					>
						<div
							style="height: {$mutesVirtualizer.getTotalSize()}px; width: 100%; position: relative;"
						>
							{#each $mutesVirtualizer.getVirtualItems() as virtualItem (virtualItem.key)}
								<MutedAccountItem
									style="position: absolute; top: 0; left: 0; width: 100%; height: {virtualItem.size}px; transform: translateY({virtualItem.start}px);"
									did={mutes[virtualItem.index]}
									onRemove={() => onRemoveMute(mutes[virtualItem.index])}
								/>
							{/each}
						</div>
					</div>
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
					<div
						bind:this={blocksParentRef}
						style="height: {Math.min(blocks.length, 6) *
							44}px; overflow-y: auto; overflow-x: hidden; position: relative;"
					>
						<div
							style="height: {$blocksVirtualizer.getTotalSize()}px; width: 100%; position: relative;"
						>
							{#each $blocksVirtualizer.getVirtualItems() as virtualItem (virtualItem.key)}
								<MutedAccountItem
									style="position: absolute; top: 0; left: 0; width: 100%; height: {virtualItem.size}px; transform: translateY({virtualItem.start}px);"
									did={blocks[virtualItem.index]}
									onRemove={() => handleRemoveBlock(blocks[virtualItem.index])}
								/>
							{/each}
						</div>
					</div>
				</div>
			{:else}
				<p class="py-2 text-center text-sm opacity-50">no blocked accounts</p>
			{/if}
		</div>
	</div>
</div>
