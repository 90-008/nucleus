import type {
	CanonicalResourceUri,
	Did,
	ParsedCanonicalResourceUri,
	ParsedResourceUri,
	ResourceUri
} from '@atcute/lexicons';
import type { Backlink, BacklinksSource } from './at/constellation';
import { parse as parseTid } from '@atcute/tid';

export const toResourceUri = (parsed: ParsedResourceUri): ResourceUri => {
	return `at://${parsed.repo}${parsed.collection ? `/${parsed.collection}${parsed.rkey ? `/${parsed.rkey}` : ''}` : ''}`;
};
export const toCanonicalUri = (
	parsed: ParsedCanonicalResourceUri | Backlink
): CanonicalResourceUri => {
	if ('did' in parsed) return `at://${parsed.did}/${parsed.collection}/${parsed.rkey}`;
	return `at://${parsed.repo}/${parsed.collection}/${parsed.rkey}${parsed.fragment ? `#${parsed.fragment}` : ''}`;
};

export const extractDidFromUri = (uri: string): Did | null => {
	if (!uri.startsWith('at://')) return null;
	const idx = uri.indexOf('/', 5);
	if (idx === -1) return uri.slice(5) as Did;
	return uri.slice(5, idx) as Did;
};

export const likeSource: BacklinksSource = 'app.bsky.feed.like:subject.uri';
export const repostSource: BacklinksSource = 'app.bsky.feed.repost:subject.uri';
export const replySource: BacklinksSource = 'app.bsky.feed.post:reply.parent.uri';

export const timestampFromCursor = (cursor: string | undefined) => {
	if (!cursor) return undefined;
	try {
		return parseTid(cursor).timestamp;
	} catch {
		return undefined;
	}
};
