<script lang="ts" generics="T extends string">
	interface Props {
		tabs: T[];
		activeTab: T;
		onTabChange: (tab: T) => void;
	}

	let { tabs, activeTab = $bindable(), onTabChange }: Props = $props();
</script>

<div class="flex rounded border-x-3 border-b-3 border-(--nucleus-accent)/20">
	{#each tabs as tab (tab)}
		{@const isActive = activeTab === tab}
		<button
			onclick={() => onTabChange(tab)}
			class="flex-1 border-t-3 px-4 py-3
			font-semibold transition-colors hover:cursor-pointer
			{isActive
				? 'rounded-t border-(--nucleus-accent) bg-(--nucleus-accent)/20 text-(--nucleus-accent)'
				: 'border-(--nucleus-accent)/20 bg-transparent text-(--nucleus-fg)/60 hover:bg-(--nucleus-accent)/10'}"
		>
			{tab}
		</button>
	{/each}
</div>
