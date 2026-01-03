import type {
	AppBskyEmbedExternal,
	AppBskyEmbedImages,
	AppBskyEmbedRecord,
	AppBskyEmbedRecordWithMedia,
	AppBskyEmbedVideo
} from '@atcute/bluesky';

export type AppBskyEmbeds =
	| AppBskyEmbedExternal.Main
	| AppBskyEmbedImages.Main
	| AppBskyEmbedRecord.Main
	| AppBskyEmbedRecordWithMedia.Main
	| AppBskyEmbedVideo.Main;

export type AppBskyEmbedMedia =
	| AppBskyEmbedImages.Main
	| AppBskyEmbedVideo.Main
	| AppBskyEmbedExternal.Main;
