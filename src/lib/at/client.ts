import { err, expect, map, ok, type OkType, type Result } from '$lib/result';
import {
	ComAtprotoIdentityResolveHandle,
	ComAtprotoRepoGetRecord,
	ComAtprotoRepoListRecords
} from '@atcute/atproto';
import { Client as AtcuteClient, simpleFetchHandler } from '@atcute/client';
import { safeParse, type Blob as AtpBlob, type Handle, type InferOutput } from '@atcute/lexicons';
import {
	isDid,
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
import type { Records, XRPCProcedures } from '@atcute/lexicons/ambient';
import { cache as rawCache } from '$lib/cache';
import { AppBskyActorProfile } from '@atcute/bluesky';
import { WebSocket } from '@soffinal/websocket';
import type { Notification } from './stardust';
import type { OAuthUserAgent } from '@atcute/oauth-browser-client';
import { timestampFromCursor, toCanonicalUri, toResourceUri } from '$lib';
import { constellationUrl, httpToDidWeb, slingshotUrl, spacedustUrl } from '.';

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

export const xhrPost = (
	url: string,
	body: Blob | File,
	headers: Record<string, string> = {},
	onProgress?: (uploaded: number, total: number) => void
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Result<any, { error: string; message: string }>> => {
	return new Promise((resolve) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', url);

		if (onProgress && xhr.upload) {
			xhr.upload.onprogress = (event: ProgressEvent) => {
				if (event.lengthComputable) onProgress(event.loaded, event.total);
			};
		}

		Object.keys(headers).forEach((key) => xhr.setRequestHeader(key, headers[key]));

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) resolve(ok(JSON.parse(xhr.responseText)));
			else resolve(err(JSON.parse(xhr.responseText)));
		};

		xhr.onerror = () => resolve(err({ error: 'xhr_error', message: 'network error' }));
		xhr.onabort = () => resolve(err({ error: 'xhr_error', message: 'upload aborted' }));
		xhr.send(body);
	});
};

export type UploadStatus =
	| { stage: 'auth' }
	| { stage: 'uploading'; progress?: number }
	| { stage: 'processing'; progress?: number }
	| { stage: 'complete' };

export class AtpClient {
	public atcute: AtcuteClient | null = null;
	public user: MiniDoc | null = null;

	async login(agent: OAuthUserAgent): Promise<Result<null, string>> {
		try {
			const rpc = new AtcuteClient({ handler: agent });
			const res = await rpc.get('com.atproto.server.getSession');
			if (!res.ok) throw res.data.error;
			this.user = {
				did: res.data.did,
				handle: res.data.handle,
				pds: agent.session.info.aud as `${string}:${string}`,
				signing_key: ''
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
		ident: ActorIdentifier,
		collection: Collection,
		cursor?: string,
		limit: number = 100
	): Promise<
		Result<InferXRPCBodyOutput<(typeof ComAtprotoRepoListRecords.mainSchema)['output']>, string>
	> {
		if (!this.atcute) return err('not authenticated');
		const docRes = await resolveDidDoc(ident);
		if (!docRes.ok) return docRes;
		const atp =
			this.user?.did === docRes.value.did
				? this.atcute
				: new AtcuteClient({ handler: simpleFetchHandler({ service: docRes.value.pds }) });
		const res = await atp.get('com.atproto.repo.listRecords', {
			params: {
				repo: docRes.value.did,
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
		ident: ActorIdentifier,
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
			const res = await this.listRecords(ident, collection, data.cursor);
			if (!res.ok) return res;
			data.cursor = res.value.cursor;
			data.records.push(...res.value.records);
			end = data.records.length === 0 || !data.cursor;
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
						`${ident}: continuing to fetch ${collection}, on ${cursorTimestamp} until ${timestamp}`
					);
				}
			}
		}

		return ok(data);
	}

	async getBacklinks(
		subject: ResourceUri,
		source: BacklinksSource,
		filterBy?: Did[],
		limit?: number
	): Promise<Result<Backlinks, string>> {
		const { repo, collection, rkey } = expect(parseResourceUri(subject));
		const did = await resolveHandle(repo);
		if (!did.ok) return err(`cant resolve handle: ${did.error}`);

		const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
		const query = fetchMicrocosm(constellationUrl, BacklinksQuery, {
			subject: collection ? toCanonicalUri({ did: did.value, collection, rkey: rkey! }) : did.value,
			source,
			limit: limit || 100,
			did: filterBy
		});

		const results = await Promise.race([query, timeout]);
		if (!results) return err('cant fetch backlinks: timeout');

		return results;
	}

	async getServiceAuth(lxm: keyof XRPCProcedures, exp: number): Promise<Result<string, string>> {
		if (!this.atcute || !this.user) return err('not authenticated');
		const serviceAuthUrl = new URL(`${this.user.pds}xrpc/com.atproto.server.getServiceAuth`);
		serviceAuthUrl.searchParams.append('aud', httpToDidWeb(this.user.pds));
		serviceAuthUrl.searchParams.append('lxm', 'com.atproto.repo.uploadBlob');
		serviceAuthUrl.searchParams.append('exp', exp.toString()); // 30 minutes

		const serviceAuthResponse = await this.atcute.handler(
			`${serviceAuthUrl.pathname}${serviceAuthUrl.search}`,
			{
				method: 'GET'
			}
		);
		if (!serviceAuthResponse.ok) {
			const error = await serviceAuthResponse.text();
			return err(`failed to get service auth: ${error}`);
		}
		const serviceAuth = await serviceAuthResponse.json();
		return ok(serviceAuth.token);
	}

	async uploadBlob(
		blob: Blob,
		onProgress?: (progress: number) => void
	): Promise<Result<AtpBlob<string>, string>> {
		if (!this.atcute || !this.user) return err('not authenticated');
		const tokenResult = await this.getServiceAuth(
			'com.atproto.repo.uploadBlob',
			Math.floor(Date.now() / 1000) + 60
		);
		if (!tokenResult.ok) return tokenResult;
		const result = await xhrPost(
			`${this.user.pds}xrpc/com.atproto.repo.uploadBlob`,
			blob,
			{ authorization: `Bearer ${tokenResult.value}` },
			(uploaded, total) => onProgress?.(uploaded / total)
		);
		if (!result.ok) return err(`upload failed: ${result.error.message}`);
		return ok(result.value);
	}

	async uploadVideo(
		blob: Blob,
		mimeType: string,
		onStatus?: (status: UploadStatus) => void
	): Promise<Result<AtpBlob<string>, string>> {
		if (!this.atcute || !this.user) return err('not authenticated');

		onStatus?.({ stage: 'auth' });
		const tokenResult = await this.getServiceAuth(
			'com.atproto.repo.uploadBlob',
			Math.floor(Date.now() / 1000) + 60 * 30
		);
		if (!tokenResult.ok) return tokenResult;

		onStatus?.({ stage: 'uploading' });
		const uploadUrl = new URL('https://video.bsky.app/xrpc/app.bsky.video.uploadVideo');
		uploadUrl.searchParams.append('did', this.user.did);
		uploadUrl.searchParams.append('name', 'video');

		const uploadResult = await xhrPost(
			uploadUrl.toString(),
			blob,
			{
				Authorization: `Bearer ${tokenResult.value}`,
				'Content-Type': mimeType
			},
			(uploaded, total) => onStatus?.({ stage: 'uploading', progress: uploaded / total })
		);
		if (!uploadResult.ok) return err(`failed to upload video: ${uploadResult.error.message}`);
		const jobStatus = uploadResult.value;
		let videoBlobRef: AtpBlob<string> = jobStatus.blob;

		onStatus?.({ stage: 'processing' });
		while (!videoBlobRef) {
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const statusResponse = await fetch(
				`https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${jobStatus.jobId}`
			);

			if (!statusResponse.ok) {
				const error = await statusResponse.json();
				// reuse blob
				if (error.error === 'already_exists' && error.blob) {
					videoBlobRef = error.blob;
					break;
				}
				return err(`failed to get job status: ${error.message || error.error}`);
			}

			const status = await statusResponse.json();
			if (status.jobStatus.blob) {
				videoBlobRef = status.jobStatus.blob;
			} else if (status.jobStatus.state === 'JOB_STATE_FAILED') {
				return err(`video processing failed: ${status.jobStatus.error || 'unknown error'}`);
			} else if (status.jobStatus.progress !== undefined) {
				onStatus?.({
					stage: 'processing',
					progress: status.jobStatus.progress / 100
				});
			}
		}

		onStatus?.({ stage: 'complete' });
		return ok(videoBlobRef);
	}
}

// export const newPublicClient = async (ident: ActorIdentifier) => {
// 	const atp = new AtpClient();
// 	const didDoc = await resolveDidDoc(ident);
// 	if (!didDoc.ok) {
// 		console.error('failed to resolve did doc', didDoc.error);
// 		return atp;
// 	}
// 	atp.atcute = new AtcuteClient({ handler: simpleFetchHandler({ service: didDoc.value.pds }) });
// 	atp.user = didDoc.value;
// 	return atp;
// };

export const resolveHandle = (identifier: ActorIdentifier) => {
	if (isDid(identifier)) return Promise.resolve(ok(identifier as AtprotoDid));

	return cache
		.resolveHandle(identifier)
		.then((did) => ok(did))
		.catch((e) => err(String(e)));
};

export const resolveDidDoc = (ident: ActorIdentifier) =>
	cache
		.resolveDidDoc(ident)
		.then((doc) => ok(doc))
		.catch((e) => err(String(e)));

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
	api.search = params
		? `?${new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])))}`
		: '';
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
