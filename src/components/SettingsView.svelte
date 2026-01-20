<script lang="ts">
	import { defaultSettings, needsReload, settings } from '$lib/settings';
	import { get } from 'svelte/store';
	import ColorPicker from 'svelte-awesome-color-picker';
	import Tabs from './Tabs.svelte';
	import { portal } from 'svelte-portal';
	import { cache } from '$lib/cache';
	import {
		router,
		clients,
		accountPreferences,
		setAccountPreferences,
		syncAccountPreferences,
		loadAccountPreferences
	} from '$lib/state.svelte';
	import { accounts as accountsStore, generateColorForDid } from '$lib/accounts';
	import AccountSelector from './AccountSelector.svelte';
	import Dropdown from './Dropdown.svelte';
	import MutedAccountItem from './MutedAccountItem.svelte';
	import VirtualList from '@tutorlatin/svelte-tiny-virtual-list';
	import type { Did } from '@atcute/lexicons';
	import type { AtprotoDid } from '@atcute/lexicons/syntax';
	import Icon from '@iconify/svelte';

	interface Props {
		tab: string;
	}

	let { tab }: Props = $props();

	let localSettings = $state(get(settings));
	let hasReloadChanges = $derived(needsReload($settings, localSettings));

	$effect(() => {
		$settings.theme = localSettings.theme;
	});

	const handleSave = () => {
		settings.set(localSettings);
		window.location.reload();
	};

	const handleReset = () => {
		const confirmed = confirm('reset all settings to defaults?');
		if (!confirmed) return;
		settings.reset();
		window.location.reload();
	};

	const handleClearCache = () => {
		cache.clear();
		alert('cache cleared!');
	};

	const onTabChange = (tab: string) => router.replace(`/settings/${tab}`);

	let selectedAccount: AtprotoDid | null = $state(null);
	let newMuteInput = $state('');
	let syncStatus = $state<'syncing' | 'synced' | null>(null);
	let isAccountDropdownOpen = $state(false);

	const accounts = $derived($accountsStore.filter((a) => clients.has(a.did)));
	const selectedAccountData = $derived(accounts.find((a) => a.did === selectedAccount));
	const currentPrefs = $derived(selectedAccount ? accountPreferences.get(selectedAccount) : null);
	const mutes = $derived(currentPrefs?.mutes ?? []);

	$effect(() => {
		if (accounts.length > 0 && !selectedAccount) {
			selectedAccount = accounts[0].did;
		}
	});

	let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	const SYNC_DEBOUNCE_MS = 1000;

	const scheduleSyncFor = (did: AtprotoDid) => {
		if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
		syncDebounceTimer = setTimeout(async () => {
			syncStatus = 'syncing';
			await syncAccountPreferences(did);
			syncStatus = 'synced';
			setTimeout(() => (syncStatus = null), 2000);
		}, SYNC_DEBOUNCE_MS);
	};

	const handleAddMute = () => {
		if (!selectedAccount || !newMuteInput.trim()) return;
		const did = newMuteInput.trim() as Did;
		setAccountPreferences(selectedAccount, { mutes: [...mutes, did] });
		scheduleSyncFor(selectedAccount);
		newMuteInput = '';
	};

	const handleRemoveMute = (did: Did) => {
		if (!selectedAccount) return;
		setAccountPreferences(selectedAccount, { mutes: mutes.filter((m) => m !== did) });
		scheduleSyncFor(selectedAccount);
	};

	const handleReload = async () => {
		if (!selectedAccount) return;
		syncStatus = 'syncing';
		await loadAccountPreferences({ did: selectedAccount, handle: null });
		syncStatus = 'synced';
		setTimeout(() => (syncStatus = null), 2000);
	};
</script>

{#snippet advancedTab()}
	<div class="space-y-3 p-4">
		<div>
			<h3 class="header">api endpoints</h3>
			<div class="borders space-y-4">
				{#snippet _input(name: string, desc: string)}
					<div>
						<label for={name} class="header-desc block">
							{desc}
						</label>
						<input
							id={name}
							type="url"
							bind:value={localSettings.endpoints[name]}
							placeholder={defaultSettings.endpoints[name]}
							class="single-line-input"
						/>
					</div>
				{/snippet}
				{@render _input('slingshot', 'slingshot url (for fetching records & resolving identity)')}
				{@render _input('spacedust', 'spacedust url (for notifications)')}
				{@render _input('constellation', 'constellation url (for backlinks)')}
				{@render _input('jetstream', 'jetstream url (for real-time updates)')}
			</div>
		</div>

		<div class="borders">
			<label for="social-app-url" class="mb-2 block text-sm font-semibold text-(--nucleus-fg)/80">
				social-app url (for when copying links to posts / profiles)
			</label>
			<input
				id="social-app-url"
				type="url"
				bind:value={localSettings.socialAppUrl}
				placeholder={defaultSettings.socialAppUrl}
				class="single-line-input"
			/>
		</div>

		<h3 class="header">cache management</h3>
		<div class="borders">
			<p class="header-desc">clears cached data (records, DID documents, handles, etc.)</p>
			<button onclick={handleClearCache} class="action-button"> clear cache </button>
		</div>

		<h3 class="header">reset settings</h3>
		<div class="borders">
			<p class="header-desc">resets all settings to their default values</p>
			<button
				onclick={handleReset}
				class="action-button border-red-600 text-red-600 hover:bg-red-600/20"
			>
				reset to defaults
			</button>
		</div>
	</div>
{/snippet}

{#snippet styleTab()}
	<div class="space-y-5 p-4">
		<div>
			<h3 class="header">colors</h3>
			<div class="borders">
				{#snippet color(name: string, desc: string)}
					<div>
						<label for={name} class="header-desc block">
							{desc}
						</label>
						<div class="color-picker">
							<ColorPicker
								bind:hex={localSettings.theme[name]}
								isAlpha={false}
								position="responsive"
								label={localSettings.theme[name]}
							/>
						</div>
					</div>
				{/snippet}
				{@render color('fg', 'foreground color')}
				{@render color('bg', 'background color')}
				{@render color('accent', 'accent color')}
				{@render color('accent2', 'secondary accent color')}
			</div>
		</div>
	</div>
{/snippet}

<div class="flex flex-col">
	<div class="mb-6 flex items-center justify-between p-4 pb-0">
		<div>
			<h2 class="text-3xl font-bold">settings</h2>
			<div class="mt-2 flex gap-2">
				<div class="h-1 w-8 rounded-full bg-(--nucleus-accent)"></div>
				<div class="h-1 w-9.5 rounded-full bg-(--nucleus-accent2)"></div>
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if tab === 'moderation'}
				{#if syncStatus}
					<span class="text-xs opacity-70">{syncStatus}</span>
				{/if}
				<Dropdown
					class="min-w-48 rounded-sm border-2 border-(--nucleus-accent) bg-(--nucleus-bg) shadow-2xl"
					bind:isOpen={isAccountDropdownOpen}
					placement="bottom-end"
				>
					{#snippet trigger()}
						<button
							onclick={() => (isAccountDropdownOpen = !isAccountDropdownOpen)}
							class="flex action-button items-center gap-1.5 text-sm"
							style="color: {selectedAccountData
								? generateColorForDid(selectedAccountData.did)
								: 'inherit'}"
						>
							<span>@{selectedAccountData?.handle ?? selectedAccount?.slice(0, 12)}</span>
							<span class="opacity-50">▾</span>
						</button>
					{/snippet}
					<AccountSelector
						{accounts}
						selectedDid={selectedAccount}
						onSelect={(did) => {
							selectedAccount = did;
							isAccountDropdownOpen = false;
						}}
					/>
				</Dropdown>
				<button onclick={handleReload} class="action-button p-2" title="reload from pocket">
					<Icon
						class={syncStatus === 'syncing' ? 'animate-spin' : ''}
						icon="heroicons:arrow-path-16-solid"
						width="20"
					/>
				</button>
			{:else if hasReloadChanges}
				<button onclick={handleSave} class="action-button animate-pulse shadow-lg">
					save &amp; reload
				</button>
			{/if}
		</div>
	</div>

	<div class="flex-1">
		{#if tab === 'advanced'}
			{@render advancedTab()}
		{:else if tab === 'moderation'}
			<div class="space-y-4 p-4">
				<div>
					<h3 class="header">muted accounts</h3>
					<div class="borders space-y-2">
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
											onRemove={() => handleRemoveMute(mutes[index])}
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
		{:else if tab === 'style'}
			{@render styleTab()}
		{/if}
	</div>

	<div
		use:portal={'#footer-portal'}
		class="
		z-20 w-full max-w-2xl bg-(--nucleus-bg) p-4 pt-2 pb-1 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.1)]
		"
	>
		<Tabs tabs={['moderation', 'style', 'advanced']} activeTab={tab} {onTabChange} />
	</div>
</div>

<style>
	@reference "../app.css";
	.borders {
		@apply rounded-sm border-2 border-dashed border-(--nucleus-fg)/10 p-4;
	}
	.header-desc {
		@apply mb-2 text-sm text-(--nucleus-fg)/80;
	}
	.header {
		@apply mb-2 text-lg font-bold;
	}
</style>
