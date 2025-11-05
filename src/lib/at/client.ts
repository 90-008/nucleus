import { err, expect, map, ok, type Result } from '$lib/result';
import {
	ComAtprotoIdentityResolveHandle,
	ComAtprotoRepoGetRecord,
	ComAtprotoRepoListRecords
} from '@atcute/atproto';
import { Client as AtcuteClient } from '@atcute/client';
import { safeParse, type Handle, type InferOutput } from '@atcute/lexicons';
import {
	isDid,
	parseCanonicalResourceUri,
	parseResourceUri,
	type ActorIdentifier,
	type AtprotoDid,
	type Cid,
	type Did,
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
import { AppBskyActorProfile } from '@atcute/bluesky';
import { WebSocket } from '@soffinal/websocket';
import type { Notification } from './stardust';
import { get } from 'svelte/store';
import { settings } from '$lib/settings';
import type { OAuthUserAgent } from '@atcute/oauth-browser-client';
// import { JetstreamSubscription } from '@atcute/jetstream';

const cacheTtl = 1000 * 60 * 60 * 24;
export const handleCache = new PersistedLRU<Handle, AtprotoDid>({
	max: 1000,
	ttl: cacheTtl,
	prefix: 'handle'
});
export const didDocCache = new PersistedLRU<ActorIdentifier, MiniDoc>({
	max: 1000,
	ttl: cacheTtl,
	prefix: 'didDoc'
});
export const recordCache = new PersistedLRU<
	string,
	InferOutput<typeof ComAtprotoRepoGetRecord.mainSchema.output.schema>
>({
	max: 5000,
	ttl: cacheTtl,
	prefix: 'record'
});

export const slingshotUrl: URL = new URL(get(settings).endpoints.slingshot);
export const spacedustUrl: URL = new URL(get(settings).endpoints.spacedust);
export const constellationUrl: URL = new URL(get(settings).endpoints.constellation);

type NotificationsStreamEncoder = WebSocket.Encoder<undefined, Notification>;
export type NotificationsStream = WebSocket<NotificationsStreamEncoder>;
export type NotificationsStreamEvent = WebSocket.Event<NotificationsStreamEncoder>;

export type RecordOutput<Output> = { uri: ResourceUri; cid: Cid | undefined; record: Output };

export class AtpClient {
	public atcute: AtcuteClient | null = null;
	public user: { did: Did; handle: Handle } | null = null;

	async login(agent: OAuthUserAgent): Promise<Result<null, string>> {
		try {
			const rpc = new AtcuteClient({ handler: agent });
			const res = await rpc.get('com.atproto.server.getSession');
			if (!res.ok) throw res.data.error;
			this.user = {
				did: res.data.did,
				handle: res.data.handle
			};
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
	>(schema: Schema, uri: ResourceUri): Promise<Result<RecordOutput<Output>, string>> {
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
	>(
		schema: Schema,
		repo: ActorIdentifier,
		rkey: RecordKey
	): Promise<Result<RecordOutput<Output>, string>> {
		const collection = schema.object.shape.$type.expected;
		const cacheKey = `${repo}:${collection}:${rkey}`;

		const cached = recordCache.get(cacheKey);
		if (cached) return ok({ uri: cached.uri, cid: cached.cid, record: cached.value as Output });
		const cachedSignal = recordCache.getSignal(cacheKey);

		const result = await Promise.race([
			fetchMicrocosm(slingshotUrl, ComAtprotoRepoGetRecord.mainSchema, {
				repo,
				collection,
				rkey
			}).then((result): Result<RecordOutput<Output>, string> => {
				if (!result.ok) return result;

				const parsed = safeParse(schema, result.value.value);
				if (!parsed.ok) return err(parsed.message);

				recordCache.set(cacheKey, result.value);

				return ok({
					uri: result.value.uri,
					cid: result.value.cid,
					record: parsed.value as Output
				});
			}),
			cachedSignal.then(
				(d): Result<RecordOutput<Output>, string> =>
					ok({ uri: d.uri, cid: d.cid, record: d.value as Output })
			)
		]);

		if (!result.ok) return result;

		return ok(result.value);
	}

	async getProfile(repo?: ActorIdentifier): Promise<Result<AppBskyActorProfile.Main, string>> {
		repo = repo ?? this.user?.did;
		if (!repo) return err('not authenticated');
		return map(await this.getRecord(AppBskyActorProfile.mainSchema, repo, 'self'), (d) => d.record);
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

	async resolveHandle(identifier: ActorIdentifier): Promise<Result<AtprotoDid, string>> {
		if (isDid(identifier)) return ok(identifier as AtprotoDid);

		const cached = handleCache.get(identifier);
		if (cached) return ok(cached);
		const cachedSignal = handleCache.getSignal(identifier);

		const res = await Promise.race([
			fetchMicrocosm(slingshotUrl, ComAtprotoIdentityResolveHandle.mainSchema, {
				handle: identifier
			}),
			cachedSignal.then((d): Result<{ did: Did }, string> => ok({ did: d }))
		]);

		const mapped = map(res, (data) => data.did as AtprotoDid);

		if (mapped.ok) handleCache.set(identifier, mapped.value);

		return mapped;
	}

	async resolveDidDoc(handleOrDid: ActorIdentifier): Promise<Result<MiniDoc, string>> {
		const cached = didDocCache.get(handleOrDid);
		if (cached) return ok(cached);
		const cachedSignal = didDocCache.getSignal(handleOrDid);

		const result = await Promise.race([
			fetchMicrocosm(slingshotUrl, MiniDocQuery, {
				identifier: handleOrDid
			}),
			cachedSignal.then((d): Result<MiniDoc, string> => ok(d))
		]);

		if (result.ok) didDocCache.set(handleOrDid, result.value);

		return result;
	}

	async getBacklinksUri(
		uri: ResourceUri,
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
		const did = await this.resolveHandle(repo);
		if (!did.ok) return err(`cant resolve handle: ${did.error}`);

		const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
		const query = fetchMicrocosm(constellationUrl, BacklinksQuery, {
			subject: `at://${did.value}/${collection}/${rkey}`,
			source,
			limit: 100
		});

		const results = await Promise.race([query, timeout]);
		if (!results) return err('cant fetch backlinks: timeout');

		return results;
	}

	streamNotifications(subjects: Did[], ...sources: BacklinksSource[]): NotificationsStream {
		const url = new URL(spacedustUrl);
		url.protocol = 'wss:';
		url.pathname = '/subscribe';
		const searchParams = [];
		sources.every((source) => searchParams.push(['wantedSources', source]));
		subjects.every((subject) => searchParams.push(['wantedSubjectDids', subject]));
		subjects.every((subject) => searchParams.push(['wantedSubjects', `at://${subject}`]));
		searchParams.push(['instant', 'true']);
		url.search = `?${new URLSearchParams(searchParams)}`;
		// console.log(`streaming notifications: ${url}`);
		const encoder = WebSocket.getDefaultEncoder<undefined, Notification>();
		const ws = new WebSocket<typeof encoder>(url.toString(), {
			encoder
		});
		return ws;
	}

	// streamJetstream(subjects: Did[], ...collections: Nsid[]) {
	// 	return new JetstreamSubscription({
	// 		url: 'wss://jetstream2.fr.hose.cam',
	// 		wantedCollections: collections,
	// 		wantedDids: subjects
	// 	});
	// }
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
	api.pathname = `/xrpc/${schema.nsid}`;
	api.search = params ? `?${new URLSearchParams(params)}` : '';
	try {
		const body = await fetchJson(api, init);
		if (!body.ok) return err(body.error);
		const parsed = safeParse(schema.output.schema, body.value);
		if (!parsed.ok) return err(parsed.message);
		return ok(parsed.value as Output);
	} catch (error) {
		return err(`FetchError: ${error}`);
	}
};

const fetchJson = async (url: URL, init?: RequestInit): Promise<Result<unknown, string>> => {
	try {
		const response = await fetch(url, init);
		const body = await response.json();
		if (response.status === 400) return err(`${body.error}: ${body.message}`);
		if (response.status !== 200) return err(`UnexpectedStatusCode: ${response.status}`);
		return ok(body);
	} catch (error) {
		return err(`FetchError: ${error}`);
	}
};
