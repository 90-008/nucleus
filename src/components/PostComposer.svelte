<script lang="ts">
	import type { AtpClient } from '$lib/at/client.svelte';
	import { ok, err, type Result, expect } from '$lib/result';
	import type { AppBskyEmbedRecordWithMedia, AppBskyFeedPost } from '@atcute/bluesky';
	import { generateColorForDid } from '$lib/accounts';
	import type { PostWithUri } from '$lib/at/fetch';
	import BskyPost from './BskyPost.svelte';
	import { parseCanonicalResourceUri, type Blob as AtpBlob } from '@atcute/lexicons';
	import type { ComAtprotoRepoStrongRef } from '@atcute/atproto';
	import { parseToRichText } from '$lib/richtext';
	import { tokenize } from '$lib/richtext/parser';
	import Icon from '@iconify/svelte';
	import ProfilePicture from './ProfilePicture.svelte';
	import type { AppBskyEmbedMedia } from '$lib/at/types';
	import { SvelteMap } from 'svelte/reactivity';
	import { handles } from '$lib/state.svelte';

	type UploadState =
		| { state: 'uploading'; progress: number }
		| { state: 'uploaded'; blob: AtpBlob<string> }
		| { state: 'error'; message: string };
	export type FocusState = 'null' | 'focused';
	export type State = {
		focus: FocusState;
		text: string;
		quoting?: PostWithUri;
		replying?: PostWithUri;
		attachedMedia?: AppBskyEmbedMedia;
		blobsState: SvelteMap<string, UploadState>;
	};

	interface Props {
		client: AtpClient;
		onPostSent: (post: PostWithUri) => void;
		_state: State;
	}

	let { client, onPostSent, _state = $bindable() }: Props = $props();

	const isFocused = $derived(_state.focus === 'focused');

	const color = $derived(
		client.user?.did ? generateColorForDid(client.user?.did) : 'var(--nucleus-accent2)'
	);

	const getVideoDimensions = (
		blobUrl: string
	): Promise<Result<{ width: number; height: number }, string>> =>
		new Promise((resolve) => {
			const video = document.createElement('video');
			video.onloadedmetadata = () => {
				resolve(ok({ width: video.videoWidth, height: video.videoHeight }));
			};
			video.onerror = (e) => resolve(err(String(e)));
			video.src = blobUrl;
		});

	const uploadVideo = async (blobUrl: string, mimeType: string) => {
		const file = await (await fetch(blobUrl)).blob();
		return await client.uploadVideo(file, mimeType, (status) => {
			if (status.stage === 'uploading' && status.progress !== undefined) {
				_state.blobsState.set(blobUrl, { state: 'uploading', progress: status.progress * 0.5 });
			} else if (status.stage === 'processing' && status.progress !== undefined) {
				_state.blobsState.set(blobUrl, {
					state: 'uploading',
					progress: 0.5 + status.progress * 0.5
				});
			}
		});
	};

	const getImageDimensions = (
		blobUrl: string
	): Promise<Result<{ width: number; height: number }, string>> =>
		new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve(ok({ width: img.width, height: img.height }));
			img.onerror = (e) => resolve(err(String(e)));
			img.src = blobUrl;
		});

	const uploadImage = async (blobUrl: string) => {
		const file = await (await fetch(blobUrl)).blob();
		return await client.uploadBlob(file, (progress) => {
			_state.blobsState.set(blobUrl, { state: 'uploading', progress });
		});
	};

	const post = async (text: string): Promise<Result<PostWithUri, string>> => {
		const strongRef = (p: PostWithUri): ComAtprotoRepoStrongRef.Main => ({
			$type: 'com.atproto.repo.strongRef',
			cid: p.cid!,
			uri: p.uri
		});

		const rt = await parseToRichText(text);

		let media: AppBskyEmbedMedia | undefined = _state.attachedMedia;
		if (_state.attachedMedia?.$type === 'app.bsky.embed.images') {
			const images = _state.attachedMedia.images;
			let uploadedImages: typeof images = [];
			for (const image of images) {
				const blobUrl = (image.image as AtpBlob<string>).ref.$link;
				const upload = _state.blobsState.get(blobUrl);
				if (!upload || upload.state !== 'uploaded') continue;
				const size = await getImageDimensions(blobUrl);
				if (size.ok) image.aspectRatio = size.value;
				uploadedImages.push({
					...image,
					image: upload.blob
				});
			}
			if (uploadedImages.length > 0)
				media = {
					..._state.attachedMedia,
					$type: 'app.bsky.embed.images',
					images: uploadedImages
				};
		} else if (_state.attachedMedia?.$type === 'app.bsky.embed.video') {
			const blobUrl = (_state.attachedMedia.video as AtpBlob<string>).ref.$link;
			const upload = _state.blobsState.get(blobUrl);
			if (upload && upload.state === 'uploaded') {
				const size = await getVideoDimensions(blobUrl);
				if (size.ok) _state.attachedMedia.aspectRatio = size.value;
				media = {
					..._state.attachedMedia,
					$type: 'app.bsky.embed.video',
					video: upload.blob
				};
			}
		}
		// console.log('media', media);

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
					? media
						? {
								$type: 'app.bsky.embed.recordWithMedia',
								record: { record: strongRef(_state.quoting) },
								media: media as AppBskyEmbedRecordWithMedia.Main['media']
							}
						: {
								$type: 'app.bsky.embed.record',
								record: strongRef(_state.quoting)
							}
					: (media as AppBskyFeedPost.Main['embed']),
			createdAt: new Date().toISOString()
		};

		const res = await client.user?.atcute.post('com.atproto.repo.createRecord', {
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

	let posting = $state(false);
	let postError = $state('');
	let textareaEl: HTMLTextAreaElement | undefined = $state();
	let fileInputEl: HTMLInputElement | undefined = $state();
	let selectingFile = $state(false);

	const canUpload = $derived(
		!(
			_state.attachedMedia?.$type === 'app.bsky.embed.video' ||
			(_state.attachedMedia?.$type === 'app.bsky.embed.images' &&
				_state.attachedMedia.images.length >= 4)
		)
	);

	const unfocus = () => (_state.focus = 'null');

	const handleFiles = (files: File[]) => {
		if (!canUpload || !files || files.length === 0) return;

		const existingImages =
			_state.attachedMedia?.$type === 'app.bsky.embed.images' ? _state.attachedMedia.images : [];

		let newImages = [...existingImages];
		let hasVideo = false;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const isVideo = file.type.startsWith('video/');
			const isImage = file.type.startsWith('image/');

			if (!isVideo && !isImage) {
				postError = 'unsupported file type';
				continue;
			}

			if (isVideo) {
				if (existingImages.length > 0 || newImages.length > 0) {
					postError = 'cannot mix images and video';
					continue;
				}
				const blobUrl = URL.createObjectURL(file);
				_state.attachedMedia = {
					$type: 'app.bsky.embed.video',
					video: {
						$type: 'blob',
						ref: { $link: blobUrl },
						mimeType: file.type,
						size: file.size
					}
				};
				hasVideo = true;
				break;
			} else if (isImage) {
				if (newImages.length >= 4) {
					postError = 'max 4 images allowed';
					break;
				}
				const blobUrl = URL.createObjectURL(file);
				newImages.push({
					image: {
						$type: 'blob',
						ref: { $link: blobUrl },
						mimeType: file.type,
						size: file.size
					},
					alt: '',
					aspectRatio: undefined
				});
			}
		}

		if (!hasVideo && newImages.length > 0) {
			_state.attachedMedia = {
				$type: 'app.bsky.embed.images',
				images: newImages
			};
		}

		const handleUpload = (blobUrl: string, res: Result<AtpBlob<string>, string>) => {
			if (res.ok) _state.blobsState.set(blobUrl, { state: 'uploaded', blob: res.value });
			else _state.blobsState.set(blobUrl, { state: 'error', message: res.error });
		};

		const media = _state.attachedMedia;
		if (media?.$type == 'app.bsky.embed.images') {
			for (const image of media.images) {
				const blobUrl = (image.image as AtpBlob<string>).ref.$link;
				uploadImage(blobUrl).then((r) => handleUpload(blobUrl, r));
			}
		} else if (media?.$type === 'app.bsky.embed.video') {
			const blobUrl = (media.video as AtpBlob<string>).ref.$link;
			uploadVideo(blobUrl, media.video.mimeType).then((r) => handleUpload(blobUrl, r));
		}
	};

	const handlePaste = (e: ClipboardEvent) => {
		const files = Array.from(e.clipboardData?.items ?? [])
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null);

		if (files.length > 0) {
			e.preventDefault();
			handleFiles(files);
		}
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length > 0) handleFiles(files);
	};

	const handleFileSelect = (e: Event) => {
		e.preventDefault();
		selectingFile = false;

		const input = e.target as HTMLInputElement;
		if (input.files) handleFiles(Array.from(input.files));

		input.value = '';
	};

	const removeMedia = () => {
		if (_state.attachedMedia?.$type === 'app.bsky.embed.video') {
			const blobUrl = (_state.attachedMedia.video as AtpBlob<string>).ref.$link;
			_state.blobsState.delete(blobUrl);
			queueMicrotask(() => URL.revokeObjectURL(blobUrl));
		}
		_state.attachedMedia = undefined;
	};

	const removeMediaAtIndex = (index: number) => {
		if (_state.attachedMedia?.$type !== 'app.bsky.embed.images') return;
		const imageToRemove = _state.attachedMedia.images[index];
		const blobUrl = (imageToRemove.image as AtpBlob<string>).ref.$link;
		_state.blobsState.delete(blobUrl);
		queueMicrotask(() => URL.revokeObjectURL(blobUrl));

		const images = _state.attachedMedia.images.filter((_, i) => i !== index);
		_state.attachedMedia = images.length > 0 ? { ..._state.attachedMedia, images } : undefined;
	};

	const doPost = () => {
		postError = '';
		posting = true;
		post(_state.text)
			.then((res) => {
				if (res.ok) {
					onPostSent(res.value);
					_state.text = '';
					_state.quoting = undefined;
					_state.replying = undefined;
					if (_state.attachedMedia?.$type === 'app.bsky.embed.video')
						URL.revokeObjectURL((_state.attachedMedia.video as AtpBlob<string>).ref.$link);
					else if (_state.attachedMedia?.$type === 'app.bsky.embed.images')
						_state.attachedMedia.images.forEach((image) =>
							URL.revokeObjectURL((image.image as AtpBlob<string>).ref.$link)
						);
					_state.attachedMedia = undefined;
					_state.blobsState.clear();
					unfocus();
				} else {
					postError = res.error;
				}
			})
			.finally(() => {
				posting = false;
			});
	};

	$effect(() => {
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
					_state[type] = undefined;
				}}><Icon width={24} icon="heroicons:x-mark-16-solid" /></button
			>
		{/snippet}
	</BskyPost>
{/snippet}

{#snippet attachmentIndicator(post: PostWithUri, type: 'quoting' | 'replying')}
	{@const parsedUri = expect(parseCanonicalResourceUri(post.uri))}
	{@const color = generateColorForDid(parsedUri.repo)}
	{@const id = handles.get(parsedUri.repo) ?? parsedUri.repo}
	<div
		class="flex shrink-0 items-center gap-1.5 rounded-sm border py-0.5 pr-0.5 pl-1 text-xs font-bold transition-all"
		style="
			background: color-mix(in srgb, {color} 10%, transparent);
			border-color: {color};
			color: {color};
		"
		title={type === 'replying' ? `replying to ${id}` : `quoting ${id}`}
	>
		<span class="truncate text-sm font-normal opacity-90">
			{type === 'replying' ? 'replying to' : 'quoting'}
		</span>
		<div class="shrink-0">
			<ProfilePicture {client} did={parsedUri.repo} size={5} />
		</div>
	</div>
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

{#snippet uploadControls(blobUrl: string, remove: () => void)}
	{@const upload = _state.blobsState.get(blobUrl)}
	{#if upload !== undefined && upload.state === 'uploading'}
		<div
			class="absolute top-2 right-2 z-10 flex items-center gap-2 rounded-sm bg-black/70 p-1.5 text-sm backdrop-blur-sm"
		>
			<div class="flex justify-center">
				<div
					class="h-5 w-5 animate-spin rounded-full border-4 border-t-transparent"
					style="border-color: var(--nucleus-accent) var(--nucleus-accent) var(--nucleus-accent) transparent;"
				></div>
			</div>
			<span class="font-medium">{Math.round(upload.progress * 100)}%</span>
		</div>
	{:else}
		<div class="absolute top-2 right-2 z-10 flex items-center gap-1">
			{#if upload !== undefined && upload.state === 'error'}
				<span
					class="rounded-sm bg-black/70 p-1.5 px-1 text-sm font-bold text-red-500 backdrop-blur-sm"
					>{upload.message}</span
				>
			{/if}
			<button
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					remove();
				}}
				onmousedown={(e) => e.preventDefault()}
				class="rounded-sm bg-black/70 p-1.5 backdrop-blur-sm {upload?.state !== 'error'
					? 'opacity-0 transition-opacity group-hover:opacity-100'
					: ''}"
			>
				{#if upload?.state === 'error'}
					<Icon
						class="text-red-500 group-hover:hidden"
						icon="heroicons:exclamation-circle-16-solid"
						width={20}
					/>
				{/if}
				<Icon
					class={upload?.state === 'error' ? 'hidden group-hover:block' : ''}
					icon="heroicons:x-mark-16-solid"
					width={20}
				/>
			</button>
		</div>
	{/if}
{/snippet}

{#snippet mediaPreview(embed: AppBskyEmbedMedia)}
	{#if embed.$type === 'app.bsky.embed.images'}
		<div class="image-preview-grid" data-total={embed.images.length}>
			{#each embed.images as image, idx (idx)}
				{@const blobUrl = (image.image as AtpBlob<string>).ref.$link}
				<div class="image-preview-item group">
					<img src={blobUrl} alt="" />
					{@render uploadControls(blobUrl, () => removeMediaAtIndex(idx))}
				</div>
			{/each}
		</div>
	{:else if embed.$type === 'app.bsky.embed.video'}
		{@const blobUrl = (embed.video as AtpBlob<string>).ref.$link}
		<div
			class="group relative max-h-[30vh] overflow-hidden rounded-sm"
			style="aspect-ratio: 16/10;"
		>
			<!-- svelte-ignore a11y_media_has_caption -->
			<video src={blobUrl} controls class="h-full w-full"></video>
			{@render uploadControls(blobUrl, removeMedia)}
		</div>
	{/if}
{/snippet}

{#snippet composer(replying?: PostWithUri, quoting?: PostWithUri)}
	{@const hasIncompleteUpload = _state.blobsState
		.values()
		.some((s) => s.state === 'uploading' || s.state === 'error')}
	<div class="flex items-center gap-2">
		<input
			bind:this={fileInputEl}
			type="file"
			accept="image/*,video/*"
			multiple
			onchange={handleFileSelect}
			oncancel={() => (selectingFile = false)}
			class="hidden"
		/>
		<button
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				selectingFile = true;
				fileInputEl?.click();
			}}
			onmousedown={(e) => e.preventDefault()}
			disabled={!canUpload}
			class="rounded-sm p-1.5 transition-all duration-150 enabled:hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
			style="background: color-mix(in srgb, {color} 15%, transparent); color: {color};"
			title="attach media"
		>
			<Icon icon="heroicons:photo-16-solid" width={20} />
		</button>
		{#if postError.length > 0}
			<div class="group flex items-center gap-2 truncate rounded-sm bg-red-500 p-1.5">
				<button onclick={() => (postError = '')}>
					<Icon
						class="group-hover:hidden"
						icon="heroicons:exclamation-circle-16-solid"
						width={20}
					/>
					<Icon class="hidden group-hover:block" icon="heroicons:x-mark-16-solid" width={20} />
				</button>
				<span title={postError} class="truncate text-sm font-bold">{postError}</span>
			</div>
		{/if}
		<div class="grow"></div>
		{#if posting}
			<div
				class="h-6 w-6 animate-spin rounded-full border-4 border-t-transparent"
				style="border-color: var(--nucleus-accent) var(--nucleus-accent) var(--nucleus-accent) transparent;"
			></div>
		{/if}
		<span
			class="text-sm font-medium text-nowrap"
			style="color: color-mix(in srgb, {_state.text.length > 300
				? '#ef4444'
				: 'var(--nucleus-fg)'} 53%, transparent);"
		>
			{_state.text.length} / 300
		</span>
		<button
			onmousedown={(e) => e.preventDefault()}
			onclick={doPost}
			disabled={(!_state.attachedMedia && _state.text.length === 0) ||
				_state.text.length > 300 ||
				hasIncompleteUpload}
			class="action-button border-none px-4 py-1.5 text-(--nucleus-fg)/94 disabled:cursor-not-allowed! disabled:opacity-50 disabled:hover:scale-100"
			style="background: color-mix(in srgb, {color} 87%, transparent);"
		>
			post
		</button>
	</div>
	{#if replying}
		{@render attachedPost(replying, 'replying')}
	{/if}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="composer space-y-2"
		onpaste={handlePaste}
		ondrop={handleDrop}
		ondragover={(e) => e.preventDefault()}
	>
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
				onblur={() => (!selectingFile ? unfocus() : null)}
				onkeydown={(event) => {
					if (event.key === 'Escape') unfocus();
					if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) doPost();
				}}
				placeholder="what's on your mind?"
				rows="4"
				class="col-start-1 row-start-1 field-sizing-content min-h-[5lh] w-full resize-none overflow-hidden bg-transparent text-wrap break-all whitespace-pre-wrap text-transparent caret-(--nucleus-fg) placeholder:text-(--nucleus-fg)/45"
			></textarea>
		</div>
		{#if _state.attachedMedia}
			{@render mediaPreview(_state.attachedMedia)}
		{/if}
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
		<div class="w-full p-1">
			{#if !client.user}
				<div
					class="rounded-sm px-3 py-1.5 text-center font-medium text-nowrap overflow-ellipsis"
					style="background: color-mix(in srgb, {color} 13%, transparent); color: {color};"
				>
					not logged in
				</div>
			{:else}
				<div class="flex flex-col gap-1">
					{#if _state.focus === 'focused'}
						{@render composer(_state.replying, _state.quoting)}
					{:else}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="composer relative flex cursor-text items-center gap-0 py-0! transition-all hover:brightness-110"
							style="--acc-color: {color};"
							onmousedown={(e) => {
								if (e.defaultPrevented) return;
								_state.focus = 'focused';
							}}
						>
							{#if _state.replying}
								{@render attachmentIndicator(_state.replying, 'replying')}
							{/if}
							<input
								bind:value={_state.text}
								onfocus={() => (_state.focus = 'focused')}
								type="text"
								placeholder="what's on your mind?"
								class="min-w-0 flex-1 border-none bg-transparent outline-none placeholder:text-(--nucleus-fg)/45 focus:ring-0"
								style="--acc-color: {color};"
							/>
							{#if _state.quoting}
								{@render attachmentIndicator(_state.quoting, 'quoting')}
							{/if}
						</div>
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
		@apply single-line-input rounded-xs bg-(--nucleus-bg)/35;
		border-color: color-mix(in srgb, var(--acc-color) 30%, transparent);
	}

	.composer {
		@apply p-1;
	}

	textarea {
		@apply w-full p-0;
	}

	input {
		@apply p-1.5;
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

	/* Image preview grid - based on PhotoSwipeGallery */
	.image-preview-grid {
		display: grid;
		gap: 2px;
		border-radius: 4px;
		overflow: hidden;
		width: 100%;
		max-height: 30vh;
	}

	.image-preview-item {
		width: 100%;
		height: 100%;
		display: block;
		position: relative;
		overflow: hidden;
		border-radius: 4px;
	}

	.image-preview-item > img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Single image: natural aspect ratio */
	.image-preview-grid[data-total='1'] {
		display: block;
		height: auto;
		width: 100%;
		border-radius: 0;
	}

	.image-preview-grid[data-total='1'] .image-preview-item {
		width: 100%;
		height: auto;
		display: block;
		border-radius: 4px;
	}

	.image-preview-grid[data-total='1'] .image-preview-item > img {
		width: 100%;
		height: auto;
		max-height: 60vh;
		object-fit: contain;
	}

	/* 2 Images: Split vertically */
	.image-preview-grid[data-total='2'] {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr;
		aspect-ratio: 16/9;
	}

	/* 3 Images: 1 Big (left), 2 Small (stacked right) */
	.image-preview-grid[data-total='3'] {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		aspect-ratio: 16/9;
	}
	.image-preview-grid[data-total='3'] .image-preview-item:first-child {
		grid-row: span 2;
	}

	/* 4 Images: 2x2 Grid */
	.image-preview-grid[data-total='4'] {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		aspect-ratio: 16/9;
	}
</style>
