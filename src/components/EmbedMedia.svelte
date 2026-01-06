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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div oncontextmenu={(e) => e.stopPropagation()}>
	{#if embed.$type === 'app.bsky.embed.images'}
		{@const _images = embed.images.flatMap((img) =>
			isBlob(img.image) ? [{ ...img, image: img.image }] : []
		)}
		{@const images = _images.map((i): GalleryItem => {
			const size = i.aspectRatio ?? { width: 400, height: 300 };
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
			{#await resolveDidDoc(did) then didDoc}
				{#if didDoc.ok}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						class="rounded-sm"
						src={blob(didDoc.value.pds, did, embed.video.ref.$link)}
						controls
					></video>
				{/if}
			{/await}
		{/if}
	{/if}
</div>
