<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { ok, err, type Result } from '$lib/result';
	import type { ComAtprotoRepoCreateRecord } from '@atcute/atproto';
	import type { AppBskyFeedPost } from '@atcute/bluesky';
	import type { InferOutput } from '@atcute/lexicons';
	import { theme } from '$lib/theme.svelte';

	interface Props {
		client: AtpClient;
	}

	const { client }: Props = $props();

	const post = async (
		text: string
	): Promise<
		Result<InferOutput<(typeof ComAtprotoRepoCreateRecord.mainSchema)['output']['schema']>, string>
	> => {
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

		return ok(res.data);
	};

	let postText = $state('');
	let info = $state('');
</script>

<div
	class="flex min-h-16 max-w-full items-center rounded-xl border-2 px-1 shadow-lg backdrop-blur-sm"
	style="background: {theme.accent}18; border-color: {theme.accent}66;"
>
	<div class="w-full p-1">
		{#if info.length > 0}
			<div
				class="rounded-lg px-3 py-1.5 text-center font-medium text-nowrap overflow-ellipsis"
				style="background: {theme.accent}22; color: {theme.accent};"
			>
				{info}
			</div>
		{:else}
			<div class="flex gap-2">
				<input
					bind:value={postText}
					type="text"
					placeholder="what's on your mind?"
					class="placeholder-opacity-50 flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all focus:scale-[1.01] focus:shadow-lg focus:outline-none"
					style="background: {theme.bg}66; border-color: {theme.accent}44; color: {theme.fg};"
				/>
				<button
					onclick={() => {
						post(postText).then((res) => {
							if (res.ok) {
								postText = '';
								info = 'posted! aaaaaaaaaasdf asdlfkasl;df kjasdfjalsdkfjaskd fajksdhf';
								setTimeout(() => (info = ''), 1000 * 3);
							} else {
								info = res.error;
							}
						});
					}}
					class="rounded-lg border-none px-5 py-2 text-sm font-bold transition-all hover:scale-105 hover:shadow-xl"
					style="background: linear-gradient(120deg, {theme.accent}c0, {theme.accent2}c0); color: {theme.fg}f0;"
				>
					post
				</button>
			</div>
		{/if}
	</div>
</div>
