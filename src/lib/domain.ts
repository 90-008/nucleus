import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

export const domain = dev ? 'http://127.0.0.1:5173' : env.PUBLIC_DOMAIN!;

export default domain;
