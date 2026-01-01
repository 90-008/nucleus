/* eslint-disable svelte/no-navigation-without-resolve */
import { pushState, replaceState } from '$app/navigation';
import { SvelteMap } from 'svelte/reactivity';

export const routes = [
	{ path: '/', order: 0 },
	{ path: '/following', order: 1 },
	{ path: '/notifications', order: 2 },
	{ path: '/settings', order: 3 },
	{ path: '/settings/:tab', order: 3 },
	{ path: '/profile/:actor', order: 4 }
] as const;

export type RouteConfig = (typeof routes)[number];
export type RoutePath = RouteConfig['path'];

type ExtractParams<Path extends string> =
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	Path extends `${infer Start}/:${infer Param}/${infer Rest}`
		? { [K in Param | keyof ExtractParams<`/${Rest}`>]: string }
		: // eslint-disable-next-line @typescript-eslint/no-unused-vars
			Path extends `${infer Start}/:${infer Param}`
			? { [K in Param]: string }
			: Record<string, never>;

export type Route<K extends RoutePath = RoutePath> = {
	[T in K]: {
		params: ExtractParams<T>;
		path: T;
		order: number;
		url: string;
	};
}[K];

type RouteNode = {
	children: Map<string, RouteNode>;
	paramName?: string;
	paramChild?: RouteNode;
	config?: RouteConfig;
};

const fallbackRoute: Route<'/'> = {
	params: {},
	path: '/',
	order: 0,
	url: '/'
};

export class Router {
	current = $state<Route>(fallbackRoute);

	direction = $state<'left' | 'right' | 'none'>('none');
	scrollPositions = new SvelteMap<string, number>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private root: RouteNode = { children: new Map() };

	constructor() {
		for (const route of routes) this.addRoute(route);
	}

	private addRoute(config: RouteConfig) {
		const segments = config.path.split('/').filter(Boolean);
		let node = this.root;

		for (const segment of segments) {
			if (segment.startsWith(':')) {
				const paramName = segment.slice(1);
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				if (!node.paramChild) node.paramChild = { children: new Map(), paramName };
				node = node.paramChild;
			} else {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				if (!node.children.has(segment)) node.children.set(segment, { children: new Map() });
				node = node.children.get(segment)!;
			}
		}
		node.config = config;
	}

	init() {
		if (typeof window === 'undefined') return;
		// initialize state
		this._updateState(window.location.pathname);
		// update state on browser navigation
		window.addEventListener('popstate', () => this._updateState(window.location.pathname));
	}

	match(urlPath: string): Route {
		const segments = urlPath.split('/').filter(Boolean);
		const params: Record<string, string> = {};

		let node = this.root;

		for (const segment of segments) {
			if (node.children.has(segment)) {
				node = node.children.get(segment)!;
			} else if (node.paramChild) {
				node = node.paramChild;
				if (node.paramName) params[node.paramName] = decodeURIComponent(segment);
			} else {
				return fallbackRoute;
			}
		}

		if (node.config)
			return {
				params: params as unknown,
				path: node.config.path,
				order: node.config.order,
				url: urlPath
			} as Route<typeof node.config.path>;

		return fallbackRoute;
	}

	updateDirection(newOrder: number, oldOrder: number) {
		if (newOrder === oldOrder) this.direction = 'none';
		else if (newOrder > oldOrder) this.direction = 'right';
		else this.direction = 'left';
	}

	private _updateState(url: string) {
		const target = this.match(url);

		// save scroll position
		if (typeof window !== 'undefined') this.scrollPositions.set(this.current.url, window.scrollY);

		this.updateDirection(target.order, this.current.order);
		this.current = target;

		if (typeof window !== 'undefined') {
			setTimeout(() => {
				const savedScroll = this.scrollPositions.get(target.url) ?? 0;
				window.scrollTo({ top: savedScroll, behavior: 'auto' });
			}, 0);
		}
	}

	navigate(url: string, { replace = false } = {}) {
		if (typeof window === 'undefined') return;
		if (this.current.url === url) return;

		if (replace) replaceState(url, {});
		else pushState(url, {});

		this._updateState(url);
	}

	replace(url: string) {
		this.navigate(url, { replace: true });
	}

	back() {
		if (typeof window !== 'undefined') history.back();
	}
}
