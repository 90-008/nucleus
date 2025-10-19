import { err, expect, map, ok, type Result } from '$lib/result';
import {
	ComAtprotoIdentityResolveHandle,
	ComAtprotoRepoGetRecord,
	ComAtprotoRepoListRecords
} from '@atcute/atproto';
import { Client as AtcuteClient, CredentialManager } from '@atcute/client';
import { safeParse, type Handle, type InferOutput } from '@atcute/lexicons';
import {
	isHandle,
	parseCanonicalResourceUri,
	parseResourceUri,
	type ActorIdentifier,
	type AtprotoDid,
	type CanonicalResourceUri,
	type Nsid,
	type RecordKey,
	type ResourceUri
} from '@atcute/lexicons/syntax';
import type {
	InferInput,
	InferXRPCBodyOutput,
	ObjectSchema,
	RecordKeySchema,
	RecordSchema,
	XRPCQueryMetadata
} from '@atcute/lexicons/validations';
import * as v from '@atcute/lexicons/validations';
import { MiniDocQuery, type MiniDoc } from './slingshot';
import { BacklinksQuery, type Backlinks, type BacklinksSource } from './constellation';
import type { Records } from '@atcute/lexicons/ambient';
import { PersistedLRU } from '$lib/cache';

const cacheTtl = 1000 * 60 * 60 * 24;
const handleCache = new PersistedLRU<Handle, AtprotoDid>({
	max: 1000,
	ttl: cacheTtl,
	prefix: 'handle'
});
const didDocCache = new PersistedLRU<ActorIdentifier, MiniDoc>({
	max: 1000,
	ttl: cacheTtl,
	prefix: 'didDoc'
});
const recordCache = new PersistedLRU<
	string,
	InferOutput<typeof ComAtprotoRepoGetRecord.mainSchema.output.schema>
>({
	max: 5000,
	ttl: cacheTtl,
	prefix: 'record'
});

export class AtpClient {
	public atcute: AtcuteClient | null = null;
	public didDoc: MiniDoc | null = null;

	private slingshotUrl: URL = new URL('https://slingshot.microcosm.blue');
	private spacedustUrl: URL = new URL('https://spacedust.microcosm.blue');
	private constellationUrl: URL = new URL('https://constellation.microcosm.blue');

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

	async getRecordUri<
		Collection extends Nsid,
		TObject extends ObjectSchema & { shape: { $type: v.LiteralSchema<Collection> } },
		TKey extends RecordKeySchema,
		Schema extends RecordSchema<TObject, TKey>,
		Output extends InferInput<Schema>
	>(schema: Schema, uri: ResourceUri): Promise<Result<Output, string>> {
		const parsedUri = expect(parseResourceUri(uri));
		if (parsedUri.collection !== schema.object.shape.$type.expected)
			return err(
				`collections don't match: ${parsedUri.collection} != ${schema.object.shape.$type.expected}`
			);
		return await this.getRecord(schema, parsedUri.repo!, parsedUri.rkey!);
	}

	async getRecord<
		Collection extends Nsid,
		TObject extends ObjectSchema & { shape: { $type: v.LiteralSchema<Collection> } },
		TKey extends RecordKeySchema,
		Schema extends RecordSchema<TObject, TKey>,
		Output extends InferInput<Schema>
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

	async listRecords<Collection extends keyof Records>(
		collection: Collection,
		repo: ActorIdentifier,
		cursor?: string,
		limit?: number
	): Promise<
		Result<InferXRPCBodyOutput<(typeof ComAtprotoRepoListRecords.mainSchema)['output']>, string>
	> {
		if (!this.atcute) return err('not authenticated');
		const res = await this.atcute.get('com.atproto.repo.listRecords', {
			params: {
				repo,
				collection,
				cursor,
				limit
			}
		});
		if (!res.ok) return err(`${res.data.error}: ${res.data.message ?? 'no details'}`);
		return ok(res.data);
	}

	async resolveHandle(handle: Handle): Promise<Result<AtprotoDid, string>> {
		const cached = handleCache.get(handle);
		if (cached) return ok(cached);

		const res = await fetchMicrocosm(
			this.slingshotUrl,
			ComAtprotoIdentityResolveHandle.mainSchema,
			{
				handle
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

	async getBacklinksUri(
		uri: CanonicalResourceUri,
		source: BacklinksSource
	): Promise<Result<Backlinks, string>> {
		const parsedResourceUri = expect(parseCanonicalResourceUri(uri));
		return await this.getBacklinks(
			parsedResourceUri.repo,
			parsedResourceUri.collection,
			parsedResourceUri.rkey,
			source
		);
	}

	async getBacklinks(
		repo: ActorIdentifier,
		collection: Nsid,
		rkey: RecordKey,
		source: BacklinksSource
	): Promise<Result<Backlinks, string>> {
		let did = repo;
		if (isHandle(did)) {
			const resolvedDid = await this.resolveHandle(did);
			if (!resolvedDid.ok) {
				return err(`failed to resolve handle: ${resolvedDid.error}`);
			}
			did = resolvedDid.value;
		}
		return await fetchMicrocosm(this.constellationUrl, BacklinksQuery, {
			subject: `at://${did}/${collection}/${rkey}`,
			source,
			limit: 100
		});
	}
}

const fetchMicrocosm = async <
	Schema extends XRPCQueryMetadata,
	Input extends Schema['params'] extends ObjectSchema ? InferOutput<Schema['params']> : undefined,
	Output extends InferXRPCBodyOutput<Schema['output']>
>(
	api: URL,
	schema: Schema,
	params: Input,
	init?: RequestInit
): Promise<Result<Output, string>> => {
	if (!schema.output || schema.output.type === 'blob') return err('schema must be blob');
	try {
		api.pathname = `/xrpc/${schema.nsid}`;
		api.search = params ? `?${new URLSearchParams(params)}` : '';
		console.info(`fetching:`, api.href);
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
