import domain from '$lib/domain';
import { dev } from '$app/environment';

export const oauthMetadata = {
	client_id: `${domain}/oauth-client-metadata.json`,
	client_name: 'nucleus',
	client_uri: domain,
	logo_uri: `${domain}/favicon.png`,
	redirect_uris: [`${domain}/`],
	scope:
		'atproto repo:*?action=create&action=update&action=delete rpc:com.atproto.repo.uploadBlob?aud=* rpc:net.at-app.pet.ptr.nucleus.getPreferences?aud=* rpc:net.at-app.pet.ptr.nucleus.putPreferences?aud=* blob:*/*',
	grant_types: ['authorization_code', 'refresh_token'],
	response_types: ['code'],
	token_endpoint_auth_method: 'none',
	application_type: 'web',
	dpop_bound_access_tokens: true
};

export const redirectUri = `${domain}/`;
export const clientId = dev
	? `http://localhost` +
	`?redirect_uri=${encodeURIComponent(redirectUri)}` +
	`&scope=${encodeURIComponent(oauthMetadata.scope)}`
	: oauthMetadata.client_id;
