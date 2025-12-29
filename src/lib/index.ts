import type {
	CanonicalResourceUri,
	ParsedCanonicalResourceUri,
	ParsedResourceUri,
	ResourceUri
} from '@atcute/lexicons';
import type { BacklinksSource } from './at/constellation';
import { parse as parseTid } from '@atcute/tid';

export const toResourceUri = (parsed: ParsedResourceUri): ResourceUri => {
	return `at://${parsed.repo}${parsed.collection ? `/${parsed.collection}${parsed.rkey ? `/${parsed.rkey}` : ''}` : ''}`;
};
export const toCanonicalUri = (parsed: ParsedCanonicalResourceUri): CanonicalResourceUri => {
	return `at://${parsed.repo}/${parsed.collection}/${parsed.rkey}${parsed.fragment ? `#${parsed.fragment}` : ''}`;
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
