import { err, map, ok, type Result } from '$lib/result';
import { ComAtprotoIdentityResolveIdentity, ComAtprotoRepoGetRecord } from '@atcute/atproto';
import { Client as AtcuteClient, CredentialManager } from '@atcute/client';
import { safeParse, type Handle, type InferOutput } from '@atcute/lexicons';
import type { ActorIdentifier, AtprotoDid, Nsid, RecordKey } from '@atcute/lexicons/syntax';
import type {
	InferXRPCBodyOutput,
	ObjectSchema,
	RecordKeySchema,
	RecordSchema,
	XRPCQueryMetadata
} from '@atcute/lexicons/validations';
import * as v from '@atcute/lexicons/validations';
import { LRUCache } from 'lru-cache';

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
export type MiniDoc = InferOutput<typeof MiniDocQuery.output.schema>;

const cacheTtl = 1000 * 60 * 60 * 24;
const handleCache = new LRUCache<Handle, AtprotoDid>({
	max: 1000,
	ttl: cacheTtl
});
const didDocCache = new LRUCache<ActorIdentifier, MiniDoc>({
	max: 1000,
	ttl: cacheTtl
});
const recordCache = new LRUCache<
	string,
	InferOutput<typeof ComAtprotoRepoGetRecord.mainSchema.output.schema>
>({
	max: 5000,
	ttl: cacheTtl
});

export class AtpClient {
	public atcute: AtcuteClient | null = null;
	public didDoc: MiniDoc | null = null;

	private slingshotUrl: URL = new URL('https://slingshot.microcosm.blue');
	private spacedustUrl: URL = new URL('https://spacedust.microcosm.blue');

	async login(handle: Handle, password: string): Promise<Result<null, string>> {
		const didDoc = await this.resolveDidDoc(handle);
		if (!didDoc.ok) return err(didDoc.error);
		this.didDoc = didDoc.value;

		try {
			const handler = new CredentialManager({ service: didDoc.value.pds });
			const rpc = new AtcuteClient({ handler });
			await handler.login({ identifier: didDoc.value.did, password });

			this.atcute = rpc;
		} catch (error) {
			return err(`failed to login: ${error}`);
		}

		return ok(null);
	}

	async getRecord<
		Collection extends Nsid,
		TObject extends ObjectSchema & { shape: { $type: v.LiteralSchema<Collection> } },
		TKey extends RecordKeySchema,
		Schema extends RecordSchema<TObject, TKey>,
		Output extends InferOutput<Schema>
	>(schema: Schema, repo: ActorIdentifier, rkey: RecordKey): Promise<Result<Output, string>> {
		const collection = schema.object.shape.$type.expected;
		const cacheKey = `${repo}:${collection}:${rkey}`;

		const cached = recordCache.get(cacheKey);
		if (cached) return ok(cached.value as Output);

		const result = await fetchMicrocosm(this.slingshotUrl, ComAtprotoRepoGetRecord.mainSchema, {
			repo,
			collection,
			rkey
		});

		if (!result.ok) return result;
		// console.info(`fetched record:`, result.value);

		const parsed = safeParse(schema, result.value.value);
		if (!parsed.ok) return err(parsed.message);

		recordCache.set(cacheKey, result.value);

		return ok(parsed.value as Output);
	}

	async resolveHandle(handle: Handle): Promise<Result<AtprotoDid, string>> {
		const cached = handleCache.get(handle);
		if (cached) return ok(cached);

		const res = await fetchMicrocosm(
			this.slingshotUrl,
			ComAtprotoIdentityResolveIdentity.mainSchema,
			{
				handle: handle
			}
		);

		const mapped = map(res, (data) => data.did as AtprotoDid);

		if (mapped.ok) {
			handleCache.set(handle, mapped.value);
		}

		return mapped;
	}

	async resolveDidDoc(handleOrDid: ActorIdentifier): Promise<Result<MiniDoc, string>> {
		const cached = didDocCache.get(handleOrDid);
		if (cached) return ok(cached);

		const result = await fetchMicrocosm(this.slingshotUrl, MiniDocQuery, {
			identifier: handleOrDid
		});

		if (result.ok) {
			didDocCache.set(handleOrDid, result.value);
		}

		return result;
	}
}

const fetchMicrocosm = async <
	Schema extends XRPCQueryMetadata,
	Output extends InferXRPCBodyOutput<Schema['output']>
>(
	api: URL,
	schema: Schema,
	params?: URLSearchParams | Record<string, string>,
	init?: RequestInit
): Promise<Result<Output, string>> => {
	if (!schema.output || schema.output.type === 'blob') return err('schema must be blob');
	if (params && !(params instanceof URLSearchParams)) params = new URLSearchParams(params);
	if (params?.size === 0) params = undefined;
	try {
		api.pathname = `/xrpc/${schema.nsid}`;
		api.search = params ? `?${params}` : '';
		// console.info(`fetching:`, api.href);
		const response = await fetch(api, init);
		const body = await response.json();
		if (response.status === 400) return err(`${body.error}: ${body.message}`);
		if (response.status !== 200) return err(`UnexpectedStatusCode: ${response.status}`);
		const parsed = safeParse(schema.output.schema, body);
		if (!parsed.ok) return err(parsed.message);
		return ok(parsed.value as Output);
	} catch (error) {
		return err(`FetchError: ${error}`);
	}
};
