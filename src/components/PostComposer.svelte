<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { ok, err, type Result, expect } from '$lib/result';
	import type { AppBskyFeedPost } from '@atcute/bluesky';
	import { generateColorForDid } from '$lib/accounts';
	import type { PostWithUri } from '$lib/at/fetch';
	import BskyPost from './BskyPost.svelte';
	import { parseCanonicalResourceUri } from '@atcute/lexicons';
	import type { ComAtprotoRepoStrongRef } from '@atcute/atproto';

	interface Props {
		client: AtpClient;
		onPostSent: (post: PostWithUri) => void;
		quoting?: PostWithUri;
		replying?: PostWithUri;
	}

	let {
		client,
		onPostSent,
		quoting = $bindable(undefined),
		replying = $bindable(undefined)
	}: Props = $props();

	let color = $derived(
		client.didDoc?.did ? generateColorForDid(client.didDoc?.did) : 'var(--nucleus-accent2)'
	);

	const post = async (text: string): Promise<Result<PostWithUri, string>> => {
		const strongRef = (p: PostWithUri): ComAtprotoRepoStrongRef.Main => ({
			$type: 'com.atproto.repo.strongRef',
			cid: p.cid!,
			uri: p.uri
		});
		const record: AppBskyFeedPost.Main = {
			$type: 'app.bsky.feed.post',
			text,
			reply: replying
				? {
						root: replying.record.reply?.root ?? strongRef(replying),
						parent: strongRef(replying)
					}
				: undefined,
			embed: quoting
				? {
						$type: 'app.bsky.embed.record',
						record: strongRef(quoting)
					}
				: undefined,
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
			cid: res.data.cid,
			record
		});
	};

	let postText = $state('');
	let info = $state('');
	let isFocused = $state(false);
	let textareaEl: HTMLTextAreaElement | undefined = $state();

	const unfocus = () => {
		isFocused = false;
		quoting = undefined;
		replying = undefined;
	};

	const doPost = () => {
		if (postText.length === 0 || postText.length > 300) return;

		post(postText).then((res) => {
			if (res.ok) {
				onPostSent(res.value);
				postText = '';
				info = 'posted!';
				unfocus();
				setTimeout(() => (info = ''), 1000 * 0.8);
			} else {
				// todo: add a way to clear error
				info = res.error;
			}
		});
	};

	$effect(() => {
		if (isFocused && textareaEl) textareaEl.focus();
		if (quoting || replying) isFocused = true;
	});
</script>

{#snippet renderPost(post: PostWithUri)}
	{@const parsedUri = expect(parseCanonicalResourceUri(post.uri))}
	<BskyPost
		{client}
		did={parsedUri.repo}
		rkey={parsedUri.rkey}
		data={post}
		isOnPostComposer={true}
	/>
{/snippet}

{#snippet composer()}
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
			onmousedown={(e) => {
				e.preventDefault();
				doPost();
			}}
			disabled={postText.length === 0 || postText.length > 300}
			class="action-button border-none px-5 text-(--nucleus-fg)/94 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
			style="background: color-mix(in srgb, {color} 87%, transparent);"
		>
			post
		</button>
	</div>
	{#if replying}
		{@render renderPost(replying)}
	{/if}
	<textarea
		bind:this={textareaEl}
		bind:value={postText}
		onfocus={() => (isFocused = true)}
		onblur={unfocus}
		onkeydown={(event) => {
			if (event.key === 'Escape') unfocus();
			if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) doPost();
		}}
		placeholder="what's on your mind?"
		rows="4"
		class="field-sizing-content single-line-input resize-none bg-(--nucleus-bg)/40 focus:scale-100"
		style="border-color: color-mix(in srgb, {color} 27%, transparent);"
	></textarea>
	{#if quoting}
		{@render renderPost(quoting)}
	{/if}
{/snippet}

<div class="relative min-h-13">
	<!-- Spacer to maintain layout when focused -->
	{#if isFocused}
		<div class="min-h-13"></div>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onmousedown={(e) => {
			if (isFocused) {
				e.preventDefault();
			}
		}}
		class="flex max-w-full rounded-sm border-2 shadow-lg transition-all duration-300
			{!isFocused ? 'min-h-13 items-center' : ''}
			{isFocused ? 'absolute right-0 bottom-0 left-0 z-50 shadow-2xl' : ''}"
		style="background: {isFocused
			? `color-mix(in srgb, var(--nucleus-bg) 75%, ${color})`
			: `color-mix(in srgb, color-mix(in srgb, var(--nucleus-bg) 85%, ${color}) 70%, transparent)`};
			border-color: color-mix(in srgb, {color} {isFocused ? '100' : '40'}%, transparent);"
	>
		<div class="w-full p-1.5 px-2">
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
						{@render composer()}
					{:else}
						<input
							bind:value={postText}
							onfocus={() => (isFocused = true)}
							type="text"
							placeholder="what's on your mind?"
							class="single-line-input flex-1 bg-(--nucleus-bg)/40 p-1 px-2"
							style="border-color: color-mix(in srgb, {color} 27%, transparent);"
						/>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
