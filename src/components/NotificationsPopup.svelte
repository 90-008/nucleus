<script lang="ts">
	import Popup from './Popup.svelte';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen = $bindable(false), onClose }: Props = $props();

	const handleClose = () => {
		onClose();
	};
</script>

<Popup
	bind:isOpen
	onClose={handleClose}
	title="notifications"
	width="w-[42vmax] max-w-2xl"
	height="60vh"
	showHeaderDivider={true}
>
	<div class="flex h-full items-center justify-center">
		<div class="text-center">
			<div class="mb-4 text-6xl opacity-50">🚧</div>
			<h3 class="text-xl font-bold opacity-80">todo</h3>
		</div>
	</div>
</Popup>
