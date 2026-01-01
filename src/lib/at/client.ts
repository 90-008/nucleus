import { err, expect, map, ok, type OkType, type Result } from '$lib/result';
import {
	ComAtprotoIdentityResolveHandle,
	ComAtprotoRepoGetRecord,
	ComAtprotoRepoListRecords
} from '@atcute/atproto';
import { Client as AtcuteClient, simpleFetchHandler } from '@atcute/client';
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
import { cache as rawCache } from '$lib/cache';
import { AppBskyActorProfile } from '@atcute/bluesky';
import { WebSocket } from '@soffinal/websocket';
import type { Notification } from './stardust';
import { get } from 'svelte/store';
import { settings } from '$lib/settings';
import type { OAuthUserAgent } from '@atcute/oauth-browser-client';
import { timestampFromCursor, toCanonicalUri, toResourceUri } from '$lib';

export const slingshotUrl: URL = new URL(get(settings).endpoints.slingshot);
export const spacedustUrl: URL = new URL(get(settings).endpoints.spacedust);
export const constellationUrl: URL = new URL(get(settings).endpoints.constellation);

export type RecordOutput<Output> = { uri: ResourceUri; cid: Cid | undefined; record: Output };

const cacheWithHandles = rawCache.define(
	'resolveHandle',
	async (handle: Handle): Promise<AtprotoDid> => {
		const res = await fetchMicrocosm(slingshotUrl, ComAtprotoIdentityResolveHandle.mainSchema, {
			handle
		});
		if (!res.ok) throw new Error(res.error);
		return res.value.did as AtprotoDid;
	}
);

const cacheWithDidDocs = cacheWithHandles.define(
	'resolveDidDoc',
	async (identifier: ActorIdentifier): Promise<MiniDoc> => {
		const res = await fetchMicrocosm(slingshotUrl, MiniDocQuery, {
			identifier
		});
		if (!res.ok) throw new Error(res.error);
		return res.value;
	}
);

const cacheWithRecords = cacheWithDidDocs.define('fetchRecord', async (uri: ResourceUri) => {
	const parsedUri = parseResourceUri(uri);
	if (!parsedUri.ok) throw new Error(`can't parse resource uri: ${parsedUri.error}`);
	const { repo, collection, rkey } = parsedUri.value;
	const res = await fetchMicrocosm(slingshotUrl, ComAtprotoRepoGetRecord.mainSchema, {
		repo,
		collection: collection!,
		rkey: rkey!
	});
	if (!res.ok) throw new Error(res.error);
	return res.value;
});

const cache = cacheWithRecords;

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

		try {
			const rawValue = await cache.fetchRecord(
				toResourceUri({ repo, collection, rkey, fragment: undefined })
			);

			const parsed = safeParse(schema, rawValue.value);
			if (!parsed.ok) return err(parsed.message);

			return ok({
				uri: rawValue.uri,
				cid: rawValue.cid,
				record: parsed.value as Output
			});
		} catch (e) {
			return err(String(e));
		}
	}

	async getProfile(repo?: ActorIdentifier): Promise<Result<AppBskyActorProfile.Main, string>> {
		repo = repo ?? this.user?.did;
		if (!repo) return err('not authenticated');
		return map(await this.getRecord(AppBskyActorProfile.mainSchema, repo, 'self'), (d) => d.record);
	}

	async listRecords<Collection extends keyof Records>(
		collection: Collection,
		cursor?: string,
		limit: number = 100
	): Promise<
		Result<InferXRPCBodyOutput<(typeof ComAtprotoRepoListRecords.mainSchema)['output']>, string>
	> {
		if (!this.atcute || !this.user) return err('not authenticated');
		const res = await this.atcute.get('com.atproto.repo.listRecords', {
			params: {
				repo: this.user.did,
				collection,
				cursor,
				limit,
				reverse: false
			}
		});
		if (!res.ok) return err(`${res.data.error}: ${res.data.message ?? 'no details'}`);

		for (const record of res.data.records)
			await cache.set('fetchRecord', `fetchRecord~${record.uri}`, record, 60 * 60 * 24);

		return ok(res.data);
	}

	async listRecordsUntil<Collection extends keyof Records>(
		collection: Collection,
		cursor?: string,
		timestamp: number = -1
	): Promise<ReturnType<typeof this.listRecords>> {
		const data: OkType<Awaited<ReturnType<typeof this.listRecords>>> = {
			records: [],
			cursor
		};

		let end = false;
		while (!end) {
			const res = await this.listRecords(collection, data.cursor);
			if (!res.ok) return res;
			data.cursor = res.value.cursor;
			data.records.push(...res.value.records);
			end = !data.cursor;
			if (!end && timestamp > 0) {
				const cursorTimestamp = timestampFromCursor(data.cursor);
				if (cursorTimestamp === undefined) {
					console.warn(
						'could not parse timestamp from cursor, stopping fetch to prevent infinite loop:',
						data.cursor
					);
					end = true;
				} else if (cursorTimestamp <= timestamp) {
					end = true;
				} else {
					console.info(
						`${this.user?.did}: continuing to fetch ${collection}, on ${cursorTimestamp} until ${timestamp}`
					);
				}
			}
		}

		return ok(data);
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
		source: BacklinksSource,
		limit?: number
	): Promise<Result<Backlinks, string>> {
		const did = await resolveHandle(repo);
		if (!did.ok) return err(`cant resolve handle: ${did.error}`);

		const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
		const query = fetchMicrocosm(constellationUrl, BacklinksQuery, {
			subject: toCanonicalUri({ did: did.value, collection, rkey }),
			source,
			limit: limit || 100
		});

		const results = await Promise.race([query, timeout]);
		if (!results) return err('cant fetch backlinks: timeout');

		return results;
	}
}

export const newPublicClient = async (ident: ActorIdentifier): Promise<AtpClient> => {
	const atp = new AtpClient();
	const didDoc = await resolveDidDoc(ident);
	if (!didDoc.ok) {
		console.error('failed to resolve did doc', didDoc.error);
		return atp;
	}
	atp.atcute = new AtcuteClient({ handler: simpleFetchHandler({ service: didDoc.value.pds }) });
	atp.user = { did: didDoc.value.did, handle: didDoc.value.handle };
	return atp;
};

// Wrappers that use the cache

export const resolveHandle = async (
	identifier: ActorIdentifier
): Promise<Result<AtprotoDid, string>> => {
	if (isDid(identifier)) return ok(identifier as AtprotoDid);

	try {
		const did = await cache.resolveHandle(identifier);
		return ok(did);
	} catch (e) {
		return err(String(e));
	}
};

export const resolveDidDoc = async (ident: ActorIdentifier): Promise<Result<MiniDoc, string>> => {
	try {
		const doc = await cache.resolveDidDoc(ident);
		return ok(doc);
	} catch (e) {
		return err(String(e));
	}
};

type NotificationsStreamEncoder = WebSocket.Encoder<undefined, Notification>;
export type NotificationsStream = WebSocket<NotificationsStreamEncoder>;
export type NotificationsStreamEvent = WebSocket.Event<NotificationsStreamEncoder>;

export const streamNotifications = (
	subjects: Did[],
	...sources: BacklinksSource[]
): NotificationsStream => {
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
};

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
