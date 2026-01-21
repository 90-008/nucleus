<script lang="ts">
	import Icon from '@iconify/svelte';

	interface Props {
		visible: boolean;
		onclick: () => void;
	}

	let { visible, onclick }: Props = $props();
</script>

{#if visible}
	<div class="sticky top-2 z-20 mb-4 flex w-full justify-center">
		<button
			class="flex action-button items-center gap-2 bg-(--nucleus-bg) hover:scale-115! enabled:hover:bg-(--nucleus-bg)!"
			{onclick}
		>
			<Icon icon="heroicons:arrow-up-16-solid" width="20" />
			load new posts
		</button>
	</div>
{/if}
