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
		if (isFocused && textareaEl) {
			textareaEl.focus();
		}
	});
</script>

<div class="relative min-h-16">
	<!-- Spacer to maintain layout when focused -->
	{#if isFocused}
		<div class="min-h-16"></div>
	{/if}

	<div
		class="flex max-w-full rounded-sm border-2 shadow-lg backdrop-blur-lg transition-all duration-300"
		class:min-h-16={!isFocused}
		class:items-center={!isFocused}
		class:shadow-2xl={isFocused}
		class:absolute={isFocused}
		class:top-0={isFocused}
		class:left-0={isFocused}
		class:right-0={isFocused}
		class:z-50={isFocused}
		style="background: {isFocused
			? `${theme.bg}f0`
			: `${theme.accent}18`}; border-color: {theme.accent}{isFocused ? '' : '66'};"
	>
		<div class="w-full p-2" class:py-3={isFocused}>
			{#if info.length > 0}
				<div
					class="rounded-sm px-3 py-1.5 text-center font-medium text-nowrap overflow-ellipsis"
					style="background: {theme.accent}22; color: {theme.accent};"
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
							oninput={(e) => {
								const target = e.currentTarget;
								if (target.value.length > 300) {
									target.value = target.value.slice(0, 300);
									postText = target.value;
								}
							}}
							onkeydown={(event) => {
								if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
									doPost();
								}
							}}
							placeholder="what's on your mind?"
							rows="4"
							class="placeholder-opacity-50 w-full resize-none rounded-sm border-2 px-3 py-2 text-sm font-medium transition-all focus:outline-none"
							style="background: {theme.bg}66; border-color: {theme.accent}44; color: {theme.fg};"
						></textarea>
						<div class="flex items-center gap-2">
							<div class="grow"></div>
							<span
								class="text-sm font-medium"
								style="color: {postText.length > 300 ? '#ef4444' : theme.fg}88;"
							>
								{postText.length} / 300
							</span>
							<button
								onclick={doPost}
								disabled={postText.length === 0 || postText.length > 300}
								class="rounded-sm border-none px-5 py-2 text-sm font-bold transition-all hover:scale-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
								style="background: linear-gradient(120deg, {theme.accent}c0, {theme.accent2}c0); color: {theme.fg}f0;"
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
							class="placeholder-opacity-50 flex-1 rounded-sm border-2 px-3 py-2 text-sm font-medium transition-all focus:outline-none"
							style="background: {theme.bg}66; border-color: {theme.accent}44; color: {theme.fg};"
						/>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
