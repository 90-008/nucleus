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
