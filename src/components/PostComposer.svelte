<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { ok, err, type Result } from '$lib/result';
	import type { AppBskyFeedPost } from '@atcute/bluesky';
	import type { ResourceUri } from '@atcute/lexicons';
	import { theme } from '$lib/theme.svelte';

	interface Props {
		client: AtpClient;
		onPostSent: (uri: ResourceUri, post: AppBskyFeedPost.Main) => void;
	}

	const { client, onPostSent }: Props = $props();

	const post = async (
		text: string
	): Promise<Result<{ uri: ResourceUri; record: AppBskyFeedPost.Main }, string>> => {
		const record: AppBskyFeedPost.Main = {
			$type: 'app.bsky.feed.post',
			text,
			createdAt: new Date().toISOString()
		};

		const res = await client.atcute?.post('com.atproto.repo.createRecord', {
			input: {
				collection: 'app.bsky.feed.post',
				repo: client.didDoc!.did,
				record
			}
		});

		if (!res) {
			return err('failed to post: not logged in');
		}

		if (!res.ok) {
			return err(`failed to post: ${res.data.error}: ${res.data.message ?? 'no details'}`);
		}

		return ok({
			uri: res.data.uri,
			record
		});
	};

	let postText = $state('');
	let info = $state('');

	const doPost = () => {
		post(postText).then((res) => {
			if (res.ok) {
				onPostSent(res.value.uri, res.value.record);
				postText = '';
				info = 'posted!';
				setTimeout(() => (info = ''), 1000 * 3);
			} else {
				info = res.error;
			}
		});
	};
</script>

<div
	class="flex min-h-16 max-w-full items-center rounded-sm border-2 px-1 shadow-lg backdrop-blur-sm"
	style="background: {theme.accent}18; border-color: {theme.accent}66;"
>
	<div class="w-full p-1">
		{#if info.length > 0}
			<div
				class="rounded-sm px-3 py-1.5 text-center font-medium text-nowrap overflow-ellipsis"
				style="background: {theme.accent}22; color: {theme.accent};"
			>
				{info}
			</div>
		{:else}
			<div class="flex gap-2">
				<input
					bind:value={postText}
					onkeydown={(event) => {
						if (event.key === 'Enter') doPost();
					}}
					type="text"
					placeholder="what's on your mind?"
					class="placeholder-opacity-50 flex-1 rounded-sm border-2 px-3 py-2 text-sm font-medium transition-all focus:scale-[1.01] focus:shadow-lg focus:outline-none"
					style="background: {theme.bg}66; border-color: {theme.accent}44; color: {theme.fg};"
				/>
				<button
					onclick={doPost}
					class="rounded-sm border-none px-5 py-2 text-sm font-bold transition-all hover:scale-105 hover:shadow-xl"
					style="background: linear-gradient(120deg, {theme.accent}c0, {theme.accent2}c0); color: {theme.fg}f0;"
				>
					post
				</button>
			</div>
		{/if}
	</div>
</div>
