<script lang="ts">
	import {
		computePosition,
		autoUpdate,
		offset,
		flip,
		shift,
		type Placement
	} from '@floating-ui/dom';
	import { onMount } from 'svelte';
	import { portal } from 'svelte-portal';
	import type { ClassValue } from 'svelte/elements';

	interface Props {
		class?: ClassValue;
		style?: string;
		isOpen?: boolean;
		trigger?: import('svelte').Snippet;
		children?: import('svelte').Snippet;
		placement?: Placement;
		offsetDistance?: number;
		position?: { x: number; y: number };
	}

	let {
		isOpen = $bindable(false),
		trigger,
		children,
		placement = 'bottom-start',
		offsetDistance = 2,
		position = $bindable(),
		...restProps
	}: Props = $props();

	let triggerRef: HTMLElement | undefined = $state();
	let contentRef: HTMLElement | undefined = $state();
	let cleanup: (() => void) | null = null;

	const updatePosition = async () => {
		const { x, y } = await computePosition(triggerRef!, contentRef!, {
			placement,
			middleware: [offset(offsetDistance), flip(), shift({ padding: 8 })],
			strategy: 'fixed'
		});

		Object.assign(contentRef!.style, {
			left: `${x}px`,
			top: `${y}px`
		});
	};

	const handleClose = () => (isOpen = false);

	const isEventInElement = (event: MouseEvent, element: HTMLElement) => {
		let rect = element.getBoundingClientRect();
		let x = event.clientX;
		let y = event.clientY;
		return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
	};

	const handleClickOutside = (event: MouseEvent) => {
		if (!isOpen) return;
		if (!isEventInElement(event, triggerRef!) && !isEventInElement(event, contentRef!))
			handleClose();
	};

	const handleEscape = (event: KeyboardEvent) => {
		if (event.key === 'Escape') handleClose();
	};

	const handleScroll = handleClose;

	$effect(() => {
		if (isOpen) {
			cleanup = autoUpdate(triggerRef!, contentRef!, updatePosition);
		} else if (cleanup) {
			cleanup();
			cleanup = null;
		}
	});

	onMount(() => {
		return () => {
			if (cleanup) cleanup();
		};
	});
</script>

<svelte:window onkeydown={handleEscape} onmousedown={handleClickOutside} onscroll={handleScroll} />

<div role="button" tabindex="0" bind:this={triggerRef}>
	{@render trigger?.()}
</div>

{#if isOpen}
	<div
		use:portal={'#app-root'}
		bind:this={contentRef}
		class="fixed z-9999 animate-fade-in-scale-fast overflow-hidden {restProps.class ?? ''}"
		style={restProps.style}
		role="menu"
		tabindex="-1"
	>
		{@render children?.()}
	</div>
{/if}
