<script context="module" lang="ts">
	export interface GalleryItem {
		src: string;
		thumbnail?: {
			src: string;
			width: number;
			height: number;
		};
		width: number;
		height: number;
		cropped?: boolean;
		alt?: string;
	}
	export type GalleryData = Array<GalleryItem>;
</script>

<script lang="ts">
	import 'photoswipe/photoswipe.css';
	import PhotoSwipeLightbox from 'photoswipe/lightbox';
	import PhotoSwipe, { type ElementProvider, type PreparedPhotoSwipeOptions } from 'photoswipe';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	export let images: GalleryData;
	let element: HTMLDivElement;

	const options = writable<Partial<PreparedPhotoSwipeOptions> | undefined>(undefined);
	$: {
		if (!element) break $;
		const opts: Partial<PreparedPhotoSwipeOptions> = {
			pswpModule: PhotoSwipe,
			children: element.childNodes as ElementProvider,
			gallery: element,
			hideAnimationDuration: 0,
			showAnimationDuration: 0,
			zoomAnimationDuration: 200,
			zoomSVG:
				'<svg class="gallery--icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><path fill="currentColor" d="M6.25 8.75v-1h-1a.75.75 0 0 1 0-1.5h1v-1a.75.75 0 0 1 1.5 0v1h1a.75.75 0 0 1 0 1.5h-1v1a.75.75 0 0 1-1.5 0"/><path fill="currentColor" fill-rule="evenodd" d="M7 12c1.11 0 2.136-.362 2.965-.974l2.755 2.754a.75.75 0 1 0 1.06-1.06l-2.754-2.755A5 5 0 1 0 7 12m0-1.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7" clip-rule="evenodd"/></svg>',
			closeSVG:
				'<svg class="gallery--icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><path fill="currentColor" d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94z"/></svg>',
			arrowPrevSVG:
				'<svg class="gallery--icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="currentColor" fill-rule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0" clip-rule="evenodd"/></svg>',
			arrowNextSVG:
				'<svg class="gallery--icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="currentColor" fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8L6.22 5.28a.75.75 0 0 1 0-1.06" clip-rule="evenodd"/></svg>'
		};
		$options = opts;
	}

	onMount(() => {
		let lightbox: PhotoSwipeLightbox | undefined;
		const unsub = options.subscribe((opts) => {
			lightbox?.destroy?.();
			if (opts === undefined) return;
			lightbox = new PhotoSwipeLightbox(opts);
			lightbox.init();
		});
		return () => {
			unsub();
			lightbox?.destroy?.();
		};
	});
</script>

<div class="gallery styling-twitter" data-total={images.length} bind:this={element}>
	{#each images as img, i (img.src)}
		{@const thumb = img.thumbnail ?? img}
		{@const isHidden = i > 3}
		{@const isOverlay = i === 3 && images.length > 4}

		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={img.src}
			data-pswp-width={img.width}
			data-pswp-height={img.height}
			target="_blank"
			class:hidden-in-grid={isHidden}
			class:overlay-container={isOverlay}
		>
			<img src={thumb.src} alt={img.alt ?? ''} width={thumb.width} height={thumb.height} />

			{#if isOverlay}
				<div class="more-overlay">
					+{images.length - 4}
				</div>
			{/if}
		</a>
	{/each}
</div>

<style>
	:global(.gallery--icon) {
		--drop-color: color-mix(in srgb, var(--color-gray-900) 70%, transparent);
		color: var(--nucleus-fg);
		filter: drop-shadow(2px 2px 1px var(--drop-color)) drop-shadow(-2px -2px 1px var(--drop-color))
			drop-shadow(-2px 2px 1px var(--drop-color)) drop-shadow(2px -2px 1px var(--drop-color));
	}

	/* --- Default Grid (for 2+ images) --- */
	.gallery.styling-twitter {
		display: grid;
		gap: 2px;
		border-radius: 4px;
		overflow: hidden;
		width: fit-content;
	}

	.gallery.styling-twitter > a {
		width: 100%;
		height: 100%;
		display: block;
		position: relative;
		overflow: hidden;
	}

	.gallery.styling-twitter > a > img {
		@apply transition-opacity duration-200 hover:opacity-80;
		width: 100%;
		height: 100%;
		object-fit: cover; /* Standard tile crop */
	}

	/* --- SINGLE IMAGE OVERRIDES --- */
	/* This configuration allows the image to determine the width/height
       naturally based on aspect ratio, up to a max-height limit.
    */
	.gallery.styling-twitter[data-total='1'] {
		display: block; /* Remove grid constraints */
		height: auto;
		width: fit-content;
		aspect-ratio: auto; /* Remove 16:9 ratio */
		border-radius: 0;
	}

	.gallery.styling-twitter[data-total='1'] > a {
		/* fit-content is key: the container shrinks to fit the image width */
		width: fit-content;
		height: auto;
		display: block;
		border-radius: 4px;
		overflow: hidden;
		max-width: 100%; /* Prevent overflowing the parent */
	}

	.gallery.styling-twitter[data-total='1'] > a > img {
		/* Let dimensions flow naturally */
		width: auto;
		height: auto;

		/* Constraints: */
		max-width: 100%; /* Never wider than container */
		max-height: 60vh; /* Never taller than 60% of viewport (adjust if needed) */

		object-fit: contain; /* Never crop the single image */
	}

	/* --- Grid Layouts (2+ Images) --- */
	/* These retain the standard grid look */

	/* 2 Images: Split vertically */
	.gallery.styling-twitter[data-total='2'] {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr;
		aspect-ratio: 16/9;
	}

	/* 3 Images: 1 Big (left), 2 Small (stacked right) */
	.gallery.styling-twitter[data-total='3'] {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		aspect-ratio: 16/9;
	}
	.gallery.styling-twitter[data-total='3'] > a:first-child {
		grid-row: span 2;
	}

	/* 4+ Images: 2x2 Grid */
	.gallery.styling-twitter[data-total='4'],
	.gallery.styling-twitter[data-total^='5'],
	.gallery.styling-twitter:not([data-total='1']):not([data-total='2']):not([data-total='3']) {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		aspect-ratio: 16/9;
	}

	.gallery.styling-twitter .hidden-in-grid {
		display: none;
	}

	.more-overlay {
		position: absolute;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.5);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		font-weight: bold;
		pointer-events: none;
	}
</style>
