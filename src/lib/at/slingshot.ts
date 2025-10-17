import * as v from '@atcute/lexicons/validations';

export const MiniDocQuery = v.query('com.bad-example.identity.resolveMiniDoc', {
	params: v.object({
		identifier: v.actorIdentifierString()
	}),
	output: {
		type: 'lex',
		schema: v.object({
			did: v.didString(),
			handle: v.handleString(),
			pds: v.genericUriString(),
			signing_key: v.string()
		})
	}
});
export type MiniDoc = v.InferOutput<typeof MiniDocQuery.output.schema>;
