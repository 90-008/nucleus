<script lang="ts">
	import Icon from '@iconify/svelte';

	interface Props {
		error: string;
		onRetry: () => void;
	}

	let { error, onRetry }: Props = $props();
</script>

<div class="flex flex-col gap-4 py-4">
	<p class="text-xl opacity-80">
		<span class="text-4xl">x_x</span> <br />
		{error}
	</p>
	<div>
		<button class="flex action-button items-center gap-2" onclick={onRetry}>
			<Icon class="h-6 w-6" icon="heroicons:arrow-path-16-solid" /> try again
		</button>
	</div>
</div>
