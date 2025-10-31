import {
	configureOAuth,
	defaultIdentityResolver,
	createAuthorizationUrl,
	finalizeAuthorization,
	OAuthUserAgent,
	getSession,
	deleteStoredSession
} from '@atcute/oauth-browser-client';

import {
	CompositeDidDocumentResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	XrpcHandleResolver
} from '@atcute/identity-resolver';
import { slingshotUrl } from './client';
import type { ActorIdentifier } from '@atcute/lexicons';
import { err, ok, type Result } from '$lib/result';
import type { AtprotoDid } from '@atcute/lexicons/syntax';
import { clientId, redirectUri } from '$lib/oauth';

configureOAuth({
	metadata: {
		client_id: clientId,
		redirect_uri: redirectUri
	},
	identityResolver: defaultIdentityResolver({
		handleResolver: new XrpcHandleResolver({ serviceUrl: slingshotUrl.href }),

		didDocumentResolver: new CompositeDidDocumentResolver({
			methods: {
				plc: new PlcDidDocumentResolver(),
				web: new WebDidDocumentResolver()
			}
		})
	})
});

export const sessions = {
	get: async (did: AtprotoDid) => {
		const session = await getSession(did, { allowStale: true });
		return new OAuthUserAgent(session);
	},
	remove: async (did: AtprotoDid) => {
		try {
			const agent = await sessions.get(did);
			await agent.signOut();
		} catch {
			deleteStoredSession(did);
		}
	}
};

export const flow = {
	start: async (identifier: ActorIdentifier): Promise<Result<null, string>> => {
		try {
			const authUrl = await createAuthorizationUrl({
				target: { type: 'account', identifier },
				scope: 'atproto transition:generic'
			});
			// recommended to wait for the browser to persist local storage before proceeding
			await new Promise((resolve) => setTimeout(resolve, 200));
			// redirect the user to sign in and authorize the app
			window.location.assign(authUrl);
			// if this is on an async function, ideally the function should never ever resolve.
			// the only way it should resolve at this point is if the user aborted the authorization
			// by returning back to this page (thanks to back-forward page caching)
			await new Promise((_resolve, reject) => {
				const listener = () => {
					reject(new Error(`user aborted the login request`));
				};
				window.addEventListener('pageshow', listener, { once: true });
			});
			return ok(null);
		} catch (error) {
			return err(`login error: ${error}`);
		}
	},
	finalize: async (url: URL): Promise<Result<OAuthUserAgent | null, string>> => {
		try {
			// createAuthorizationUrl asks server to put the params in the hash
			const params = new URLSearchParams(url.hash.slice(1));
			if (!params.has('code')) return ok(null);
			const { session } = await finalizeAuthorization(params);
			return ok(new OAuthUserAgent(session));
		} catch (error) {
			return err(`login error: ${error}`);
		}
	}
};
