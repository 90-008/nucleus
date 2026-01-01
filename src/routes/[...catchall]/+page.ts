import { replaceState } from '$app/navigation';
import { addAccount, loggingIn } from '$lib/accounts';
import { AtpClient } from '$lib/at/client';
import { flow, sessions } from '$lib/at/oauth';
import { err, ok, type Result } from '$lib/result';
import type { PageLoad } from './$types';

export type PageProps = {
	data: {
		client: Result<AtpClient | null, string>;
	};
};

export const load: PageLoad = async (): Promise<PageProps['data']> => {
	return { client: await handleLogin() };
};

const handleLogin = async (): Promise<Result<AtpClient | null, string>> => {
	const account = loggingIn.get();
	if (!account) return ok(null);

	const currentUrl = new URL(window.location.href);
	// scrub history so auth state cant be replayed
	try {
		replaceState('', '/');
	} catch {
		// if router was unitialized then we probably dont need to scrub anyway
		// so its fine
	}

	loggingIn.set(null);
	await sessions.remove(account.did);
	const agent = await flow.finalize(currentUrl);
	if (!agent.ok || !agent.value) {
		if (!agent.ok) return err(agent.error);
		return err('no session was logged into?!');
	}

	const client = new AtpClient();
	const result = await client.login(agent.value);
	if (!result.ok) return err(result.error);

	addAccount(account);
	return ok(client);
};
