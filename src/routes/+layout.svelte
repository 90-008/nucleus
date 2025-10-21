<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div
	class="grain min-h-screen bg-(--nucleus-bg) text-(--nucleus-fg) transition-colors duration-300"
>
	{@render children?.()}
</div>
