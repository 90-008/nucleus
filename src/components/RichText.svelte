<script lang="ts">
	import { parseToRichText } from '$lib/richtext';
	import { settings } from '$lib/settings';
	import { router } from '$lib/state.svelte';
	import type { BakedRichtext } from '@atcute/bluesky-richtext-builder';
	import { segmentize, type Facet, type RichtextSegment } from '@atcute/bluesky-richtext-segmenter';

	interface Props {
		text: string;
		facets?: Facet[];
	}

	const { text, facets }: Props = $props();

	const richtext: Promise<BakedRichtext> = $derived(
		facets ? Promise.resolve({ text, facets }) : parseToRichText(text)
	);

	const handleProfileClick = (e: MouseEvent, did: string) => {
		e.preventDefault();
		router.navigate(`/profile/${did}`);
	};
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
	{#each segments as segment, idx (idx)}
		{@const { text, features: _features } = segment}
		{@const features = _features ?? []}
		{#if features.length > 0}
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			{#each features as feature, idx (idx)}
				{#if feature.$type === 'app.bsky.richtext.facet#mention'}
					<a
						class="text-(--nucleus-accent2) hover:cursor-pointer hover:underline"
						href={`/profile/${feature.did}`}
						onclick={(e) => handleProfileClick(e, feature.did)}>{@render plainText(text)}</a
					>
				{:else if feature.$type === 'app.bsky.richtext.facet#link'}
					{@const uri = new URL(feature.uri)}
					{@const text = `${!uri.protocol.startsWith('http') ? `${uri.protocol}//` : ''}${uri.host}${uri.hash.length === 0 && uri.search.length === 0 && uri.pathname === '/' ? '' : uri.pathname}${uri.search}${uri.hash}`}
					<a
						class="text-(--nucleus-accent2)"
						href={uri.href}
						target="_blank"
						rel="noopener noreferrer"
						>{@render plainText(`${text.substring(0, 40)}${text.length > 40 ? '...' : ''}`)}</a
					>
				{:else if feature.$type === 'app.bsky.richtext.facet#tag'}
					<a
						class="text-(--nucleus-accent2)"
						href={`${$settings.socialAppUrl}/search?q=${encodeURIComponent('#' + feature.tag)}`}
						target="_blank"
						rel="noopener noreferrer">{@render plainText(text)}</a
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
