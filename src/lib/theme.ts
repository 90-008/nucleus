export type Theme = Record<string, string> & {
	bg: string;
	fg: string;
	accent: string;
	accent2: string;
};

export const defaultTheme: Theme = {
	bg: '#11001c',
	fg: '#f8fafc',
	accent: '#ec4899',
	accent2: '#8b5cf6'
};

export const hashColor = (input: string): string => {
	let hash: number;

	const id = input.split(':').pop() || input;

	hash = 0;
	for (let i = 0; i < Math.min(10, id.length); i++) hash = (hash << 4) + id.charCodeAt(i);
	hash = hash >>> 0;

	// magic mixing
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x21f0aaad);
	hash ^= hash >>> 15;
	hash = hash >>> 0;

	const hue = hash % 360;
	const saturation = 0.8 + ((hash >>> 10) % 20) * 0.01; // 80-100%
	const lightness = 0.45 + ((hash >>> 20) % 35) * 0.01; // 45-80%

	const rgb = hslToRgb(hue, saturation, lightness);
	const hex = rgb.map((value) => value.toString(16).padStart(2, '0')).join('');

	return `#${hex}`;
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hPrime = h / 60;
	const x = c * (1 - Math.abs((hPrime % 2) - 1));
	const m = l - c / 2;

	let r: number, g: number, b: number;

	if (hPrime < 1) {
		r = c;
		g = x;
		b = 0;
	} else if (hPrime < 2) {
		r = x;
		g = c;
		b = 0;
	} else if (hPrime < 3) {
		r = 0;
		g = c;
		b = x;
	} else if (hPrime < 4) {
		r = 0;
		g = x;
		b = c;
	} else if (hPrime < 5) {
		r = x;
		g = 0;
		b = c;
	} else {
		r = c;
		g = 0;
		b = x;
	}

	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};
