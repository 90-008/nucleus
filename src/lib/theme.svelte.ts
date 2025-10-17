export const theme = $state({
	bg: '#0f172a', // slate-900 - deep blue-grey background
	fg: '#f8fafc', // slate-50 - crisp white foreground
	accent: '#ec4899', // pink-500 - vibrant pink accent
	accent2: '#8b5cf6' // violet-500 - purple secondary accent
});

export const setTheme = (bg: string, fg: string, accent: string, accent2: string) => {
	theme.bg = bg;
	theme.fg = fg;
	theme.accent = accent;
	theme.accent2 = accent2;
};
