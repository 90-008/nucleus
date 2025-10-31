import { clientId, oauthMetadata } from '$lib/oauth';
import { domain } from '$lib/domain';
import { json } from '@sveltejs/kit';

export const GET = () => {
	return json({
		...oauthMetadata,
		client_id: clientId,
		client_uri: domain
	});
};
