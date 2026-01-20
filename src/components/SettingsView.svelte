<script lang="ts">
	import { needsReload, settings } from '$lib/settings';
	import { get } from 'svelte/store';
	import Tabs from './Tabs.svelte';
	import { portal } from 'svelte-portal';
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
	import SettingsAdvancedTab from './SettingsAdvancedTab.svelte';
	import SettingsStyleTab from './SettingsStyleTab.svelte';
	import SettingsModerationTab from './SettingsModerationTab.svelte';
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

	const onTabChange = (tab: string) => router.replace(`/settings/${tab}`);

	let selectedAccount: AtprotoDid | null = $state(null);
	let syncStatus = $state<'syncing' | 'synced' | null>(null);
	let isAccountDropdownOpen = $state(false);

	const accounts = $derived($accountsStore.filter((a) => clients.has(a.did)));
	const selectedAccountData = $derived(accounts.find((a) => a.did === selectedAccount));
	const currentPrefs = $derived(
		selectedAccount ? (accountPreferences.get(selectedAccount) ?? null) : null
	);
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

	const handleAddMute = (did: Did) => {
		if (!selectedAccount) return;
		setAccountPreferences(selectedAccount, { mutes: [...mutes, did] });
		scheduleSyncFor(selectedAccount);
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
			<SettingsAdvancedTab bind:localSettings onReset={handleReset} />
		{:else if tab === 'moderation'}
			<SettingsModerationTab
				{mutes}
				onAddMute={handleAddMute}
				onRemoveMute={handleRemoveMute}
				{selectedAccount}
			/>
		{:else if tab === 'style'}
			<SettingsStyleTab bind:localSettings />
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
