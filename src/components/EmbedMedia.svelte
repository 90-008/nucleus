<script lang="ts">
	import { isBlob } from '@atcute/lexicons/interfaces';
	import PhotoSwipeGallery, { type GalleryItem } from './PhotoSwipeGallery.svelte';
	import { blob, img } from '$lib/cdn';
	import { type Did } from '@atcute/lexicons';
	import { resolveDidDoc } from '$lib/at/client.svelte';
	import type { AppBskyEmbedMedia } from '$lib/at/types';

	interface Props {
		did: Did;
		embed: AppBskyEmbedMedia;
	}

	let { did, embed }: Props = $props();

	let videoPds = $state<string | undefined>();

	$effect(() => {
		if (embed.$type === 'app.bsky.embed.video' && isBlob(embed.video)) {
			resolveDidDoc(did).then((didDoc) => {
				if (didDoc.ok) videoPds = didDoc.value.pds;
			});
		}
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div oncontextmenu={(e) => e.stopPropagation()}>
	{#if embed.$type === 'app.bsky.embed.images'}
		{@const _images = embed.images.flatMap((img) =>
			isBlob(img.image) ? [{ ...img, image: img.image }] : []
		)}
		{@const images = _images.map((i): GalleryItem => {
			const size = i.aspectRatio;
			const cid = i.image.ref.$link;
			return {
				...size,
				src: img('feed_fullsize', did, cid),
				thumbnail: {
					src: img('feed_thumbnail', did, cid),
					...size
				},
				alt: i.alt
			};
		})}
		{#if images.length > 0}
			<PhotoSwipeGallery {images} />
		{/if}
	{:else if embed.$type === 'app.bsky.embed.video'}
		{#if isBlob(embed.video)}
			{@const ratio = embed.aspectRatio}
			<div
				class="relative w-full overflow-hidden rounded-sm bg-black/5"
				style:aspect-ratio={ratio ? `${ratio.width} / ${ratio.height}` : '16 / 9'}
			>
				{#if videoPds}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						class="absolute inset-0 h-full w-full"
						src={blob(videoPds, did, embed.video.ref.$link)}
						controls
						playsinline
						loop
					></video>
				{/if}
			</div>
		{/if}
	{/if}
</div>
