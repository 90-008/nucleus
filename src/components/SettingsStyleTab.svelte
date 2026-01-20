<script lang="ts">
	import ColorPicker from 'svelte-awesome-color-picker';
	import type { Settings } from '$lib/settings';

	interface Props {
		localSettings: Settings;
	}

	let { localSettings = $bindable() }: Props = $props();
</script>

{#snippet color(name: string, desc: string)}
	<div>
		<label for={name} class="settings-desc block">
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

<div class="space-y-5 p-4">
	<div>
		<h3 class="settings-header">colors</h3>
		<div class="settings-box">
			{@render color('fg', 'foreground color')}
			{@render color('bg', 'background color')}
			{@render color('accent', 'accent color')}
			{@render color('accent2', 'secondary accent color')}
		</div>
	</div>
</div>
