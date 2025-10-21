<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { ok, err, type Result } from '$lib/result';
	import type { AppBskyFeedPost } from '@atcute/bluesky';
	import type { ResourceUri } from '@atcute/lexicons';
	import { generateColorForDid } from '$lib/accounts';

	interface Props {
		client: AtpClient;
		onPostSent: (uri: ResourceUri, post: AppBskyFeedPost.Main) => void;
	}

	const { client, onPostSent }: Props = $props();

	let color = $derived(
		client.didDoc?.did ? generateColorForDid(client.didDoc?.did) : 'var(--nucleus-accent)'
	);

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
	let isFocused = $state(false);
	let textareaEl: HTMLTextAreaElement | undefined = $state();

	const doPost = () => {
		if (postText.length === 0 || postText.length > 300) return;

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

	$effect(() => {
		if (isFocused && textareaEl) textareaEl.focus();
	});
</script>

<div class="relative min-h-16">
	<!-- Spacer to maintain layout when focused -->
	{#if isFocused}
		<div class="min-h-16"></div>
	{/if}

	<div
		class="flex max-w-full rounded-sm border-2 shadow-lg transition-all duration-300"
		class:min-h-16={!isFocused}
		class:items-center={!isFocused}
		class:shadow-2xl={isFocused}
		class:absolute={isFocused}
		class:top-0={isFocused}
		class:left-0={isFocused}
		class:right-0={isFocused}
		class:z-50={isFocused}
		style="background: {isFocused
			? `color-mix(in srgb, var(--nucleus-bg) 80%, ${color} 20%)`
			: `color-mix(in srgb, ${color} 9%, transparent)`};
			border-color: color-mix(in srgb, {color} {isFocused ? '100' : '40'}%, transparent);"
	>
		<div class="w-full p-2" class:py-3={isFocused}>
			{#if info.length > 0}
				<div
					class="rounded-sm px-3 py-1.5 text-center font-medium text-nowrap overflow-ellipsis"
					style="background: color-mix(in srgb, {color} 13%, transparent); color: {color};"
				>
					{info}
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					{#if isFocused}
						<textarea
							bind:this={textareaEl}
							bind:value={postText}
							onfocus={() => (isFocused = true)}
							onblur={() => (isFocused = false)}
							onkeydown={(event) => {
								if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) doPost();
							}}
							placeholder="what's on your mind?"
							rows="4"
							class="[field-sizing:content] single-line-input resize-none bg-(--nucleus-bg)/40 focus:scale-100"
							style="border-color: color-mix(in srgb, {color} 27%, transparent);"
						></textarea>
						<div class="flex items-center gap-2">
							<div class="grow"></div>
							<span
								class="text-sm font-medium"
								style="color: color-mix(in srgb, {postText.length > 300
									? '#ef4444'
									: 'var(--nucleus-fg)'} 53%, transparent);"
							>
								{postText.length} / 300
							</span>
							<button
								onclick={doPost}
								disabled={postText.length === 0 || postText.length > 300}
								class="action-button border-none px-5 text-(--nucleus-fg)/94 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
								style="background: color-mix(in srgb, {color} 87%, transparent);"
							>
								post
							</button>
						</div>
					{:else}
						<input
							bind:value={postText}
							onfocus={() => (isFocused = true)}
							onkeydown={(event) => {
								if (event.key === 'Enter') doPost();
							}}
							type="text"
							placeholder="what's on your mind?"
							class="single-line-input flex-1 bg-(--nucleus-bg)/40"
							style="border-color: color-mix(in srgb, {color} 27%, transparent);"
						/>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
