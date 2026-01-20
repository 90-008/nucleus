import { httpToDidWeb, pocketUrl } from './index';
import type { Did } from '@atcute/lexicons/syntax';
import type { AtpClient } from './client.svelte';
import { err, ok, type Result } from '$lib/result';

const POCKET_PROXY = `${httpToDidWeb(pocketUrl.toString())}#pocket_prefs`;

export type Preferences = {
    mutes?: Did[];
    updatedAt: string;
};

type PrefsResponse = {
    preferences: Preferences;
};

export async function getPreferences(client: AtpClient): Promise<Result<Preferences | null, string>> {
    const auth = client.user;
    if (!auth) return err('not authenticated');

    try {
        const response = await auth.atcute.handler(
            '/xrpc/net.at-app.pet.ptr.nucleus.getPreferences',
            {
                method: 'GET',
                headers: {
                    'atproto-proxy': POCKET_PROXY
                }
            }
        );

        if (!response.ok) {
            if (response.status === 400) return ok(null);
            const error = await response.text();
            return err(`failed to get preferences: ${error}`);
        }

        const data = (await response.json()) as PrefsResponse;
        return ok(data.preferences);
    } catch (error) {
        return err(`failed to get preferences: ${error}`);
    }
}

export async function putPreferences(
    client: AtpClient,
    prefs: Preferences
): Promise<Result<null, string>> {
    const auth = client.user;
    if (!auth) return err('not authenticated');

    try {
        const response = await auth.atcute.handler(
            '/xrpc/net.at-app.pet.ptr.nucleus.putPreferences',
            {
                method: 'POST',
                headers: {
                    'atproto-proxy': POCKET_PROXY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ preferences: prefs })
            }
        );

        if (!response.ok) {
            const error = await response.text();
            return err(`failed to put preferences: ${error}`);
        }

        return ok(null);
    } catch (error) {
        return err(`failed to put preferences: ${error}`);
    }
}
