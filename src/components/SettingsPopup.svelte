<script lang="ts">
	import { defaultSettings, needsReload, settings } from '$lib/settings';
	import { handleCache, didDocCache, recordCache } from '$lib/at/client';
	import { get } from 'svelte/store';
	import ColorPicker from 'svelte-awesome-color-picker';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen = $bindable(false), onClose }: Props = $props();

	type Tab = 'advanced' | 'moderation' | 'style';
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
		// reload to update api endpoints
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

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') handleClose();
	};
</script>

{#snippet divider()}
	<div class="h-px bg-gradient-to-r from-(--nucleus-accent) to-(--nucleus-accent2)"></div>
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
						<!-- todo: add validation for url -->
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

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-(--nucleus-bg)/80 p-8 backdrop-blur-sm"
		onclick={handleClose}
		onkeydown={handleKeydown}
		role="button"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="flex h-[600px] w-full max-w-2xl animate-fade-in-scale flex-col rounded-sm border-2 border-(--nucleus-accent) bg-(--nucleus-bg) shadow-2xl transition-all"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
		>
			<div class="flex items-center gap-4 border-b-2 border-(--nucleus-accent)/20 p-4">
				<div>
					<h2 class="text-2xl font-bold">settings</h2>
					<div class="mt-2 flex gap-2">
						<div class="h-1 w-8 rounded-full bg-(--nucleus-accent)"></div>
						<div class="h-1 w-9.5 rounded-full bg-(--nucleus-accent2)"></div>
					</div>
				</div>
				{#if hasReloadChanges}
					<button onclick={handleSave} class="shrink-0 action-button px-6"> save & reload </button>
				{/if}
				<div class="grow"></div>
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					onclick={handleClose}
					class="rounded-xl p-2 text-(--nucleus-fg)/40 transition-all hover:scale-110"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<div class="flex-1 overflow-y-auto p-4">
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
			</div>

			<div>
				<div class="flex">
					{#snippet tabButton(name: Tab)}
						{@const isActive = activeTab === name}
						<button
							onclick={() => (activeTab = name)}
							class="flex-1 border-t-3 px-4 py-3 font-semibold transition-colors hover:cursor-pointer {isActive
								? 'border-(--nucleus-accent) bg-(--nucleus-accent)/20 text-(--nucleus-accent)'
								: 'border-(--nucleus-accent)/20 bg-transparent text-(--nucleus-fg)/60 hover:bg-(--nucleus-accent)/10'}"
						>
							{name}
						</button>
					{/snippet}
					{#each ['style', 'moderation', 'advanced'] as Tab[] as tabName (tabName)}
						{@render tabButton(tabName)}
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}
