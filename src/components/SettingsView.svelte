<script lang="ts">
	import { defaultSettings, needsReload, settings } from '$lib/settings';
	import { handleCache, didDocCache, recordCache } from '$lib/at/client';
	import { get } from 'svelte/store';
	import ColorPicker from 'svelte-awesome-color-picker';
	import Tabs from './Tabs.svelte';
	import { portal } from 'svelte-portal';

	type Tab = 'style' | 'moderation' | 'advanced';
	let activeTab = $state<Tab>('advanced');

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
		handleCache.clear();
		didDocCache.clear();
		recordCache.clear();
		alert('cache cleared!');
	};
</script>

{#snippet divider()}
	<div class="h-px bg-linear-to-r from-(--nucleus-accent) to-(--nucleus-accent2)"></div>
{/snippet}

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
		{#if hasReloadChanges}
			<button onclick={handleSave} class="action-button animate-pulse shadow-lg">
				save & reload
			</button>
		{/if}
	</div>

	<div class="flex-1">
		{#if activeTab === 'advanced'}
			{@render advancedTab()}
		{:else if activeTab === 'moderation'}
			<div class="p-4">
				<div class="flex h-64 items-center justify-center">
					<div class="text-center">
						<div class="mb-4 text-6xl opacity-50">🚧</div>
						<h3 class="text-xl font-bold opacity-80">todo</h3>
					</div>
				</div>
			</div>
		{:else if activeTab === 'style'}
			{@render styleTab()}
		{/if}
	</div>

	<div
		use:portal={'#app-footer'}
		class="fixed bottom-[5dvh] z-20 w-full max-w-2xl p-4 pt-2 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.1)]"
	>
		<Tabs
			tabs={['style', 'moderation', 'advanced']}
			bind:activeTab
			onTabChange={(tab) => (activeTab = tab)}
		/>
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
