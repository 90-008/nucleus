<script lang="ts">
	import { generateColorForDid } from '$lib/accounts';
	import { resolveDidDoc } from '$lib/at/client.svelte';
	import { handles, router } from '$lib/state.svelte';
	import { map } from '$lib/result';
	import type { Did } from '@atcute/lexicons';
	import Icon from '@iconify/svelte';

	interface Props {
		style: string;
		did: Did;
		onRemove: () => void;
	}

	let { style, did, onRemove }: Props = $props();

	const handle = $derived(handles.get(did));
	const color = $derived(generateColorForDid(did));

	$effect(() => {
		if (!handles.has(did)) {
			resolveDidDoc(did).then((r) => {
				if (r.ok) handles.set(did, r.value.handle);
				else handles.set(did, 'handle.invalid');
			});
		}
	});

	const goToProfile = () => router.navigate(`/profile/${did}`);
</script>

<div {style} class="box-border w-full py-0.5">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group flex cursor-pointer items-center gap-2 rounded-sm bg-(--nucleus-fg)/5 px-2 py-1.5 transition-colors hover:bg-(--post-color)/15"
		style={`--post-color: ${color};`}
	>
		<span
			onclick={goToProfile}
			class="semibold flex-1 truncate text-sm transition-colors group-hover:text-(--post-color)"
			style="color: {color}"
		>
			{handle ? `@${handle}` : did}
		</span>
		<button
			onclick={onRemove}
			class="text-sm text-red-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
		>
			<Icon icon="heroicons:x-mark-16-solid" width="24" />
		</button>
	</div>
</div>
