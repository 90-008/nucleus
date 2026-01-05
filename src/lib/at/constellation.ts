import type { Nsid } from '@atcute/lexicons';
import * as v from '@atcute/lexicons/validations';

export type BacklinksSource = `${Nsid}:${string}`;
export const BacklinkSchema = v.object({
	did: v.didString(),
	collection: v.nsidString(),
	rkey: v.recordKeyString()
});
export const BacklinksQuery = v.query('blue.microcosm.links.getBacklinks', {
	params: v.object({
		subject: v.string(),
		source: v.string(),
		did: v.optional(v.array(v.didString())),
		limit: v.optional(v.integer())
	}),
	output: {
		type: 'lex',
		schema: v.object({
			total: v.integer(),
			records: v.array(BacklinkSchema),
			cursor: v.nullable(v.string())
		})
	}
});
export type Backlink = v.InferOutput<typeof BacklinkSchema>;
export type Backlinks = v.InferOutput<typeof BacklinksQuery.output.schema>;
