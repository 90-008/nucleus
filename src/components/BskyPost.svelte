<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { AppBskyFeedPost } from '@atcute/bluesky';
	import type { ActorIdentifier, RecordKey } from '@atcute/lexicons';

	interface Props {
		client: AtpClient;
		identifier: ActorIdentifier;
		rkey: RecordKey;
	}

	const { client, identifier, rkey }: Props = $props();

	const post = client.getRecord(AppBskyFeedPost.mainSchema, identifier, rkey);

	const getEmbedText = (embedType: string) => {
		switch (embedType) {
			case 'app.bsky.embed.external':
				return 'contains external link';
			case 'app.bsky.embed.record':
				return 'quotes post';
			case 'app.bsky.embed.images':
				return 'contains images';
			case 'app.bsky.embed.video':
				return 'contains video';
			case 'app.bsky.embed.recordWithMedia':
				return 'quotes post with media';
			default:
				return 'contains unknown embed';
		}
	};
</script>

{#await post}
	loading post...
{:then post}
	{#if post.ok}
		{@const record = post.value}
		{identifier} - [{record.embed ? getEmbedText(record.embed.$type) : null}]
		{record.text}
	{:else}
		error fetching post: {post.error}
	{/if}
{/await}
