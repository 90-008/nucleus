<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		isOpen: boolean;
		onClose?: () => void;
		title: string;
		width?: string;
		height?: string;
		padding?: string;
		showHeaderDivider?: boolean;
		headerActions?: Snippet;
		children: Snippet;
		footer?: Snippet;
	}

	let {
		isOpen = $bindable(false),
		onClose = () => (isOpen = false),
		title,
		width = 'w-full max-w-md',
		height = 'auto',
		padding = 'p-4',
		showHeaderDivider = false,
		headerActions,
		children,
		footer
	}: Props = $props();

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') onClose();
	};

	let popupElement: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!isOpen) return;

		const preventDefault = (e: Event) => {
			if (popupElement && popupElement.contains(e.target as Node)) return;
			e.preventDefault();
		};

		document.addEventListener('wheel', preventDefault, { passive: false });
		document.addEventListener('touchmove', preventDefault, { passive: false });

		return () => {
			document.removeEventListener('wheel', preventDefault);
			document.removeEventListener('touchmove', preventDefault);
		};
	});
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-(--nucleus-bg)/80 backdrop-blur-sm"
		onclick={onClose}
		onkeydown={handleKeydown}
		role="button"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			bind:this={popupElement}
			class="flex {height === 'auto'
				? ''
				: 'h-[' +
					height +
					']'} {width} shrink animate-fade-in-scale flex-col rounded-sm border-2 border-(--nucleus-accent) bg-(--nucleus-bg) shadow-2xl transition-all"
			style={height !== 'auto' ? `height: ${height}` : ''}
			onclick={(e) => e.stopPropagation()}
			role="dialog"
		>
			<!-- Header -->
			<div
				class="flex items-center gap-4 {showHeaderDivider
					? 'border-b-2 border-(--nucleus-accent)/20'
					: ''} {padding}"
			>
				<div>
					<h2 class="text-2xl font-bold">{title}</h2>
					<div class="mt-2 flex gap-2">
						<div class="h-1 w-8 rounded-full bg-(--nucleus-accent)"></div>
						<div class="h-1 w-9.5 rounded-full bg-(--nucleus-accent2)"></div>
					</div>
				</div>

				{#if headerActions}
					{@render headerActions()}
				{/if}

				<div class="grow"></div>

				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					onclick={onClose}
					class="rounded-xl p-2 text-(--nucleus-fg)/40 transition-all hover:scale-110 hover:text-(--nucleus-fg)"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="{height === 'auto' ? '' : 'flex-1 overflow-y-auto'} {padding}">
				{@render children()}
			</div>

			<!-- Footer -->
			{#if footer}
				{@render footer()}
			{/if}
		</div>
	</div>
{/if}
