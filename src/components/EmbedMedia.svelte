<script lang="ts">
	import { AppBskyEmbedExternal, AppBskyEmbedImages, AppBskyEmbedVideo } from '@atcute/bluesky';
	import { isBlob } from '@atcute/lexicons/interfaces';
	import PhotoSwipeGallery, { type GalleryItem } from './PhotoSwipeGallery.svelte';
	import { blob, img } from '$lib/cdn';
	import { type Did } from '@atcute/lexicons';
	import { resolveDidDoc } from '$lib/at/client';

	interface Props {
		did: Did;
		embed: AppBskyEmbedImages.Main | AppBskyEmbedVideo.Main | AppBskyEmbedExternal.Main;
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
			const sizeFactor = 200;
			const size = {
				width: (i.aspectRatio?.width ?? 4) * sizeFactor,
				height: (i.aspectRatio?.height ?? 3) * sizeFactor
			};
			const cid = i.image.ref.$link;
			const isPreview = cid.startsWith('blob:');
			return {
				...size,
				src: isPreview ? cid : img('feed_fullsize', did, cid),
				thumbnail: {
					src: isPreview ? cid : img('feed_thumbnail', did, cid),
					...size
				}
			};
		})}
		<PhotoSwipeGallery {images} />
	{:else if embed.$type === 'app.bsky.embed.video'}
		{#if isBlob(embed.video)}
			{@const cid = embed.video.ref.$link}
			{@const isPreview = cid.startsWith('blob:')}
			{#if isPreview}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video class="rounded-sm" src={cid} controls></video>
			{:else}
				{#await resolveDidDoc(did) then didDoc}
					{#if didDoc.ok}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video class="rounded-sm" src={blob(didDoc.value.pds, did, cid)} controls></video>
					{/if}
				{/await}
			{/if}
		{/if}
	{/if}
</div>
