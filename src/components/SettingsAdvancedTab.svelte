<script lang="ts">
	import { defaultSettings, type Settings } from '$lib/settings';
	import { cache } from '$lib/cache';

	interface Props {
		localSettings: Settings;
		onReset: () => void;
	}

	let { localSettings = $bindable(), onReset }: Props = $props();

	const handleClearCache = () => {
		cache.clear();
		alert('cache cleared!');
	};
</script>

{#snippet _input(name: string, desc: string)}
	<div>
		<label for={name} class="settings-desc block">
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

<div class="space-y-3 p-4">
	<div>
		<h3 class="settings-header">api endpoints</h3>
		<div class="settings-box space-y-4">
			{@render _input('slingshot', 'slingshot url (for fetching records & resolving identity)')}
			{@render _input('spacedust', 'spacedust url (for notifications)')}
			{@render _input('constellation', 'constellation url (for backlinks)')}
			{@render _input('jetstream', 'jetstream url (for real-time updates)')}
			{@render _input('pocket', 'pocket url (for preferences)')}
			{@render _input('cdn', 'cdn url (for media)')}
		</div>
	</div>

	<div class="settings-box">
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

	<h3 class="settings-header">cache management</h3>
	<div class="settings-box">
		<p class="settings-desc">clears cached data (records, DID documents, handles, etc.)</p>
		<button onclick={handleClearCache} class="action-button"> clear cache </button>
	</div>

	<h3 class="settings-header">reset settings</h3>
	<div class="settings-box">
		<p class="settings-desc">resets all settings to their default values</p>
		<button onclick={onReset} class="action-button border-red-600 text-red-600 hover:bg-red-600/20">
			reset to defaults
		</button>
	</div>
</div>
