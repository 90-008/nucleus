<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { ok, err, type Result } from '$lib/result';
	import type { ComAtprotoRepoCreateRecord } from '@atcute/atproto';
	import type { AppBskyFeedPost } from '@atcute/bluesky';
	import type { InferOutput } from '@atcute/lexicons';

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

<div class="flex flex-col gap-0.5">
	{#if info.length > 0}
		<span class="text-sm text-gray-500">{info}</span>
	{/if}
	<div class="flex gap-2">
		<input bind:value={postText} type="text" placeholder="write your post here..." />
		<button
			onclick={() => {
				post(postText).then((res) => {
					if (res.ok) {
						postText = '';
						info = 'posted!';
						setTimeout(() => (info = ''), 1000 * 3);
					} else {
						info = res.error;
					}
				});
			}}>post</button
		>
	</div>
</div>
