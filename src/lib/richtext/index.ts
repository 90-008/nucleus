import RichtextBuilder, { type BakedRichtext } from '@atcute/bluesky-richtext-builder';
import { tokenize, type Token } from '$lib/richtext/parser';
import type { Did, GenericUri, Handle } from '@atcute/lexicons';
import { resolveHandle } from '$lib/at/client.svelte';

export const parseToRichText = (text: string): ReturnType<typeof processTokens> =>
	processTokens(tokenize(text));

const processTokens = async (tokens: Token[]): Promise<BakedRichtext> => {
	const rt = new RichtextBuilder();

	for (const token of tokens) {
		switch (token.type) {
			case 'text':
				rt.addText(token.content);
				break;
			case 'mention': {
				let did: Did | undefined = token.did as Did | undefined;
				if (!did) {
					const handle = token.handle as Handle;
					const result = await resolveHandle(handle);
					if (result.ok) did = result.value;
				}
				if (did) rt.addMention(token.raw, did);
				else rt.addText(token.raw);
				break;
			}
			case 'topic':
				rt.addTag(token.name);
				break;
			case 'autolink':
				rt.addLink(token.url, token.url as GenericUri);
				break;
			case 'link': {
				// flatten children to text
				const text = flattenToText(token.children);
				rt.addLink(text, token.url as GenericUri);
				break;
			}
			case 'escape':
				rt.addText(token.escaped);
				break;
			// formatting tokens (strong, emphasis, etc.) don't map to facets
			// so just extract their text content
			case 'strong':
			case 'emphasis':
			case 'underline':
			case 'delete':
				rt.addText(flattenToText(token.children));
				break;
			case 'code':
				rt.addText(token.content);
				break;
			case 'emote':
				// handle emotes as needed
				rt.addText(token.raw);
				break;
		}
	}

	return rt.build();
};

const flattenToText = (tokens: Token[]): string => {
	return tokens
		.map((t) => {
			if ('content' in t) return t.content;
			if ('children' in t) return flattenToText(t.children);
			return t.raw;
		})
		.join('');
};
