<script lang="ts">
	import type { AtpClient } from '$lib/at/client';
	import { ok, err, type Result, expect } from '$lib/result';
	import type { AppBskyFeedPost } from '@atcute/bluesky';
	import { generateColorForDid } from '$lib/accounts';
	import type { PostWithUri } from '$lib/at/fetch';
	import BskyPost from './BskyPost.svelte';
	import { parseCanonicalResourceUri } from '@atcute/lexicons';
	import type { ComAtprotoRepoStrongRef } from '@atcute/atproto';
	import { parseToRichText } from '$lib/richtext';
	import { tokenize } from '$lib/richtext/parser';
	import Icon from '@iconify/svelte';

	export type FocusState = 'null' | 'focused';
	export type State = {
		focus: FocusState;
		text: string;
		quoting?: PostWithUri;
		replying?: PostWithUri;
	};

	interface Props {
		client: AtpClient;
		onPostSent: (post: PostWithUri) => void;
		_state: State;
	}

	let { client, onPostSent, _state = $bindable({ focus: 'null', text: '' }) }: Props = $props();

	const isFocused = $derived(_state.focus === 'focused');

	const color = $derived(
		client.user?.did ? generateColorForDid(client.user?.did) : 'var(--nucleus-accent2)'
	);

	const post = async (text: string): Promise<Result<PostWithUri, string>> => {
		const strongRef = (p: PostWithUri): ComAtprotoRepoStrongRef.Main => ({
			$type: 'com.atproto.repo.strongRef',
			cid: p.cid!,
			uri: p.uri
		});

		// Parse rich text (mentions, links, tags)
		const rt = await parseToRichText(text);

		const record: AppBskyFeedPost.Main = {
			$type: 'app.bsky.feed.post',
			text: rt.text,
			facets: rt.facets,
			reply:
				_state.focus === 'focused' && _state.replying
					? {
							root: _state.replying.record.reply?.root ?? strongRef(_state.replying),
							parent: strongRef(_state.replying)
						}
					: undefined,
			embed:
				_state.focus === 'focused' && _state.quoting
					? {
							$type: 'app.bsky.embed.record',
							record: strongRef(_state.quoting)
						}
					: undefined,
			createdAt: new Date().toISOString()
		};

		const res = await client.atcute?.post('com.atproto.repo.createRecord', {
			input: {
				collection: 'app.bsky.feed.post',
				repo: client.user!.did,
				record
			}
		});

		if (!res) return err('failed to post: not logged in');

		if (!res.ok)
			return err(`failed to post: ${res.data.error}: ${res.data.message ?? 'no details'}`);

		return ok({
			uri: res.data.uri,
			cid: res.data.cid,
			record
		});
	};

	let info = $state('');
	let textareaEl: HTMLTextAreaElement | undefined = $state();

	const unfocus = () => (_state.focus = 'null');

	const doPost = () => {
		if (_state.text.length === 0 || _state.text.length > 300) return;

		post(_state.text).then((res) => {
			if (res.ok) {
				onPostSent(res.value);
				_state.text = '';
				info = 'posted!';
				unfocus();
				setTimeout(() => (info = ''), 800);
			} else {
				info = res.error;
				setTimeout(() => (info = ''), 3000);
			}
		});
	};

	$effect(() => {
		if (!client.atcute) info = 'not logged in';
		document.documentElement.style.setProperty('--acc-color', color);
		if (isFocused && textareaEl) textareaEl.focus();
	});
</script>

{#snippet attachedPost(post: PostWithUri, type: 'quoting' | 'replying')}
	{@const parsedUri = expect(parseCanonicalResourceUri(post.uri))}
	<BskyPost {client} did={parsedUri.repo} rkey={parsedUri.rkey} data={post} isOnPostComposer={true}>
		{#snippet cornerFragment()}
			<button
				class="transition-transform hover:scale-150"
				onclick={() => {
					if (_state.focus === 'focused') _state[type] = undefined;
				}}><Icon width={24} icon="heroicons:x-mark-16-solid" /></button
			>
		{/snippet}
	</BskyPost>
{/snippet}

{#snippet highlighter(text: string)}
	{#each tokenize(text) as token, idx (idx)}
		{@const highlighted =
			token.type === 'mention' ||
			token.type === 'topic' ||
			token.type === 'link' ||
			token.type === 'autolink'}
		<span class={highlighted ? 'text-(--nucleus-accent2)' : ''}>{token.raw}</span>
	{/each}
	{#if text.endsWith('\n')}
		<br />
	{/if}
{/snippet}

{#snippet composer(replying?: PostWithUri, quoting?: PostWithUri)}
	<div class="flex items-center gap-2">
		<div class="grow"></div>
		<span
			class="text-sm font-medium"
			style="color: color-mix(in srgb, {_state.text.length > 300
				? '#ef4444'
				: 'var(--nucleus-fg)'} 53%, transparent);"
		>
			{_state.text.length} / 300
		</span>
		<button
			onmousedown={(e) => {
				e.preventDefault();
				doPost();
			}}
			disabled={_state.text.length === 0 || _state.text.length > 300}
			class="action-button border-none px-5 text-(--nucleus-fg)/94 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
			style="background: color-mix(in srgb, {color} 87%, transparent);"
		>
			post
		</button>
	</div>
	{#if replying}
		{@render attachedPost(replying, 'replying')}
	{/if}
	<div class="composer space-y-2">
		<div class="relative grid">
			<!-- todo: replace this with a proper rich text editor -->
			<div
				class="pointer-events-none col-start-1 row-start-1 min-h-[5lh] w-full bg-transparent text-wrap break-all whitespace-pre-wrap text-(--nucleus-fg)"
				aria-hidden="true"
			>
				{@render highlighter(_state.text)}
			</div>

			<textarea
				bind:this={textareaEl}
				bind:value={_state.text}
				onfocus={() => (_state.focus = 'focused')}
				onblur={unfocus}
				onkeydown={(event) => {
					if (event.key === 'Escape') unfocus();
					if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) doPost();
				}}
				placeholder="what's on your mind?"
				rows="4"
				class="col-start-1 row-start-1 field-sizing-content min-h-[5lh] w-full resize-none overflow-hidden bg-transparent text-wrap break-all whitespace-pre-wrap text-transparent caret-(--nucleus-fg) placeholder:text-(--nucleus-fg)/45"
			></textarea>
		</div>
		{#if quoting}
			{@render attachedPost(quoting, 'quoting')}
		{/if}
	</div>
{/snippet}

<div class="relative min-h-13">
	<!-- Spacer to maintain layout when focused -->
	{#if isFocused}
		<div class="min-h-13"></div>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onmousedown={(e) => {
			if (isFocused) e.preventDefault();
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
					{#if _state.focus === 'focused'}
						{@render composer(_state.replying, _state.quoting)}
					{:else}
						<input
							bind:value={_state.text}
							onfocus={() => (_state.focus = 'focused')}
							type="text"
							placeholder="what's on your mind?"
							class="flex-1"
						/>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	@reference "../app.css";

	input,
	.composer {
		@apply single-line-input bg-(--nucleus-bg)/35;
		border-color: color-mix(in srgb, var(--acc-color) 30%, transparent);
	}

	.composer {
		@apply p-2;
	}

	textarea {
		@apply w-full p-0;
	}

	input {
		@apply p-1 px-2;
	}

	.composer {
		@apply focus:scale-100;
	}

	input::placeholder {
		color: color-mix(in srgb, var(--acc-color) 45%, var(--nucleus-bg));
	}

	textarea:focus {
		@apply border-none! [box-shadow:none]! outline-none!;
	}
</style>
