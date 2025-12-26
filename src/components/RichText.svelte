<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { parseToRichText } from '$lib/richtext';
	import { settings } from '$lib/settings';
	import type { BakedRichtext } from '@atcute/bluesky-richtext-builder';
	import { segmentize, type Facet, type RichtextSegment } from '@atcute/bluesky-richtext-segmenter';

	interface Props {
		text: string;
		facets?: Facet[];
		client: AtpClient;
	}

	const { text, facets, client }: Props = $props();

	const richtext: Promise<BakedRichtext> = $derived(
		facets ? Promise.resolve({ text, facets }) : parseToRichText(client, text)
	);
</script>

{#snippet plainText(text: string)}
	{#each text.split(/(\s)/) as line, idx (idx)}
		{#if line === '\n'}
			<br />
		{:else}
			{line}
		{/if}
	{/each}
{/snippet}

{#snippet segments(segments: RichtextSegment[])}
	{#each segments as segment, idx ([segment, idx])}
		{@const { text, features: _features } = segment}
		{@const features = _features ?? []}
		{#if features.length > 0}
			{#each features as feature, idx ([feature, idx])}
				{#if feature.$type === 'app.bsky.richtext.facet#mention'}
					<a
						class="text-(--nucleus-accent2)"
						href={`${$settings.socialAppUrl}/profile/${feature.did}`}>{@render plainText(text)}</a
					>
				{:else if feature.$type === 'app.bsky.richtext.facet#link'}
					{@const uri = new URL(feature.uri)}
					<a
						class="text-(--nucleus-accent2)"
						href={uri.href}
						target="_blank"
						rel="noopener noreferrer"
						>{@render plainText(uri.href.replace(`${uri.protocol}//`, ''))}</a
					>
				{:else if feature.$type === 'app.bsky.richtext.facet#tag'}
					<a
						class="text-(--nucleus-accent2)"
						href={`${$settings.socialAppUrl}/search?q=${encodeURIComponent('#' + feature.tag)}`}
						>{@render plainText(text)}</a
					>
				{:else}
					<span>{@render plainText(text)}</span>
				{/if}
			{/each}
		{:else}
			<span>{@render plainText(text)}</span>
		{/if}
	{/each}
{/snippet}

{#await richtext}
	{@render plainText(text)}
{:then richtext}
	{@render segments(segmentize(richtext.text, richtext.facets))}
{/await}
