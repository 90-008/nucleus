<script lang="ts">
	import type { AppBskyEmbeds } from '$lib/at/types';

	interface Props {
		embed: AppBskyEmbeds;
		color?: string;
	}

	let { embed, color = 'var(--nucleus-fg)' }: Props = $props();

	const embedText = $derived.by(() => {
		switch (embed.$type) {
			case 'app.bsky.embed.external':
				return '🔗 has external link';
			case 'app.bsky.embed.record':
				return '💬 has quote';
			case 'app.bsky.embed.images':
				return '🖼️ has images';
			case 'app.bsky.embed.video':
				return '🎥 has video';
			case 'app.bsky.embed.recordWithMedia':
				return '📎 has quote with media';
			default:
				return '❓ has unknown embed';
		}
	});
</script>

<span
	class="rounded-full px-2.5 py-0.5 text-xs font-medium"
	style="
		background: color-mix(in srgb, {color} 10%, transparent);
		color: {color};
		"
>
	{embedText}
</span>
