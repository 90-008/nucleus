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
		openDelay?: number;
		position?: { x: number; y: number };
		onMouseEnter?: () => void;
		onMouseLeave?: () => void;
	}

	let {
		isOpen = $bindable(false),
		trigger,
		children,
		placement = 'bottom-start',
		offsetDistance = 2,
		openDelay = 400,
		position = $bindable(),
		onMouseEnter,
		onMouseLeave,
		...restProps
	}: Props = $props();

	let triggerRef: HTMLElement | undefined = $state();
	let contentRef: HTMLElement | undefined = $state();
	let cleanup: (() => void) | null = null;

	let isTriggerHovered = false;
	let isContentHovered = false;
	let closeTimer: ReturnType<typeof setTimeout>;
	let openTimer: ReturnType<typeof setTimeout>;

	const updatePosition = async () => {
		if (!triggerRef || !contentRef) return;
		const { x, y } = await computePosition(triggerRef, contentRef, {
			placement,
			middleware: [offset(offsetDistance), flip(), shift({ padding: 8 })],
			strategy: 'fixed'
		});

		Object.assign(contentRef.style, {
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

	// The central check: "Should we close now?"
	const scheduleCloseCheck = () => {
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			// Only close if we are NOT on the trigger AND NOT on the content
			if (!isTriggerHovered && !isContentHovered) if (isOpen && onMouseLeave) onMouseLeave();
		}, 30); // Small buffer to handle the physical gap between elements
	};

	const handleTriggerEnter = () => {
		isTriggerHovered = true;
		clearTimeout(closeTimer);

		if (!isOpen) {
			clearTimeout(openTimer);
			openTimer = setTimeout(() => {
				if (onMouseEnter) onMouseEnter();
			}, openDelay);
		}
	};

	const handleTriggerLeave = () => {
		isTriggerHovered = false;
		clearTimeout(openTimer);
		scheduleCloseCheck(); // We left the trigger, check if we should close
	};

	const handleContentEnter = () => {
		isContentHovered = true;
		clearTimeout(closeTimer); // We made it to the content, cancel close
	};

	const handleContentLeave = () => {
		isContentHovered = false;
		scheduleCloseCheck(); // We left the content, check if we should close
	};

	// Reset state if the menu is closed externally
	$effect(() => {
		if (!isOpen) {
			isContentHovered = false;
			clearTimeout(closeTimer);
			clearTimeout(openTimer); // Ensure open timer is cleared on external close
		}
	});

	$effect(() => {
		if (isOpen && triggerRef && contentRef) {
			cleanup = autoUpdate(triggerRef, contentRef, updatePosition);
		} else if (cleanup) {
			cleanup();
			cleanup = null;
		}
	});

	onMount(() => () => {
		if (cleanup) cleanup();
		clearTimeout(closeTimer);
		clearTimeout(openTimer); // Cleanup open timer on unmount
	});
</script>

<svelte:window onkeydown={handleEscape} onmousedown={handleClickOutside} onscroll={handleScroll} />

<div
	role="button"
	tabindex="0"
	bind:this={triggerRef}
	onmouseenter={handleTriggerEnter}
	onmouseleave={handleTriggerLeave}
>
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
		onmouseenter={handleContentEnter}
		onmouseleave={handleContentLeave}
	>
		{@render children?.()}
	</div>
{/if}
