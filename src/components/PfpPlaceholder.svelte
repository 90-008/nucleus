<script lang="ts">
	interface Props {
		color: string;
		size: number;
	}

	let { color, size }: Props = $props();
</script>

<svg
	class="rounded-sm"
	style="background: {color}44; color: {color}; width: calc(var(--spacing) * {size}); height: calc(var(--spacing) * {size});"
	xmlns="http://www.w3.org/2000/svg"
	width="24px"
	height="24px"
	viewBox="0 0 16 16"
	><path
		fill="currentColor"
		d="M8 8a3 3 0 1 0 0-6a3 3 0 0 0 0 6m4.735 6c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139z"
	/></svg
>
