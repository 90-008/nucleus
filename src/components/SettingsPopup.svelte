<script lang="ts">
	import { defaultSettings, needsReload, settings } from '$lib/settings';
	import { handleCache, didDocCache, recordCache } from '$lib/at/client';
	import { get } from 'svelte/store';
	import ColorPicker from 'svelte-awesome-color-picker';
	import Popup from './Popup.svelte';
	import Tabs from './Tabs.svelte';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen = $bindable(false), onClose }: Props = $props();

	type Tab = 'style' | 'moderation' | 'advanced';
	let activeTab = $state<Tab>('advanced');

	let localSettings = $state(get(settings));
	let hasReloadChanges = $derived(needsReload($settings, localSettings));

	$effect(() => {
		$settings.theme = localSettings.theme;
	});

	const resetSettingsToSaved = () => {
		localSettings = $settings;
	};

	const handleClose = () => {
		resetSettingsToSaved();
		onClose();
	};

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
		handleCache.clear();
		didDocCache.clear();
		recordCache.clear();
		alert('cache cleared!');
	};
</script>

{#snippet divider()}
	<div class="h-px bg-linear-to-r from-(--nucleus-accent) to-(--nucleus-accent2)"></div>
{/snippet}

{#snippet settingHeader(name: string, desc: string)}
	<h3 class="mb-3 text-lg font-bold">{name}</h3>
	<p class="mb-4 text-sm opacity-80">{desc}</p>
{/snippet}

{#snippet advancedTab()}
	<div class="space-y-5">
		<div>
			<h3 class="mb-3 text-lg font-bold">api endpoints</h3>
			<div class="space-y-4">
				{#snippet _input(name: string, desc: string)}
					<div>
						<label for={name} class="mb-2 block text-sm font-semibold text-(--nucleus-fg)/80">
							{desc}
						</label>
						<input
							id={name}
							type="url"
							bind:value={localSettings.endpoints[name]}
							placeholder={defaultSettings.endpoints[name]}
							class="single-line-input border-(--nucleus-accent)/40 bg-(--nucleus-accent)/3"
						/>
					</div>
				{/snippet}
				{@render _input('slingshot', 'slingshot url (for fetching records & resolving identity)')}
				{@render _input('spacedust', 'spacedust url (for notifications)')}
				{@render _input('constellation', 'constellation url (for backlinks)')}
			</div>
		</div>

		{@render divider()}

		<div>
			{@render settingHeader(
				'cache management',
				'clears cached data (records, DID documents, handles, etc.)'
			)}
			<button onclick={handleClearCache} class="action-button"> clear cache </button>
		</div>

		{@render divider()}

		<div>
			{@render settingHeader('reset settings', 'resets all settings to their default values')}
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
	<div class="space-y-5">
		<div>
			<h3 class="mb-3 text-lg font-bold">colors</h3>
			<div class="space-y-4">
				{#snippet color(name: string, desc: string)}
					<div>
						<label for={name} class="mb-2 block text-sm font-semibold text-(--nucleus-fg)/80">
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

<Popup
	bind:isOpen
	onClose={handleClose}
	title="settings"
	width="w-[42vmax] max-w-2xl"
	height="60vh"
	showHeaderDivider={true}
>
	{#snippet headerActions()}
		{#if hasReloadChanges}
			<button onclick={handleSave} class="shrink-0 action-button"> save & reload </button>
		{/if}
	{/snippet}

	{#if activeTab === 'advanced'}
		{@render advancedTab()}
	{:else if activeTab === 'moderation'}
		<div class="flex h-full items-center justify-center">
			<div class="text-center">
				<div class="mb-4 text-6xl opacity-50">🚧</div>
				<h3 class="text-xl font-bold opacity-80">todo</h3>
			</div>
		</div>
	{:else if activeTab === 'style'}
		{@render styleTab()}
	{/if}

	{#snippet footer()}
		<Tabs
			tabs={['style', 'moderation', 'advanced']}
			bind:activeTab
			onTabChange={(tab) => (activeTab = tab)}
		/>
	{/snippet}
</Popup>
