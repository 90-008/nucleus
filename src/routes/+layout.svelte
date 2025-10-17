<script lang="ts">
	import '../app.css';
	import { theme } from '$lib/theme.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div
	class="grain min-h-screen transition-colors duration-300"
	style="background: {theme.bg}; color: {theme.fg};"
>
	{@render children?.()}
</div>
