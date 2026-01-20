<script lang="ts">
	import { generateColorForDid, type Account } from '$lib/accounts';
	import type { AtprotoDid } from '@atcute/lexicons/syntax';
	import Icon from '@iconify/svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		accounts: Array<Account>;
		selectedDid?: AtprotoDid | null;
		onSelect: (did: AtprotoDid) => void;
		accountActions?: Snippet<[Account]>;
	}

	let { accounts = [], selectedDid = $bindable(null), onSelect, accountActions }: Props = $props();
</script>

{#if accounts.length > 0}
	<div class="p-2">
		{#each accounts as account (account.did)}
			{@const color = generateColorForDid(account.did)}
			<button
				onclick={() => onSelect(account.did)}
				class="
				group flex w-full items-center gap-3 rounded-sm p-2 text-left text-sm font-medium transition-all
				{account.did === selectedDid ? 'shadow-lg' : ''}
			"
				style="color: {color}; background: {account.did === selectedDid
					? `linear-gradient(135deg, color-mix(in srgb, var(--nucleus-accent) 20%, transparent), color-mix(in srgb, var(--nucleus-accent2) 20%, transparent))`
					: 'transparent'};"
			>
				<span>@{account.handle ?? account.did.slice(0, 16)}</span>

				<div class="grow"></div>

				{#if accountActions}
					{@render accountActions(account)}
				{/if}

				{#if account.did === selectedDid}
					<Icon
						icon="heroicons:check-16-solid"
						class="h-5 w-5 scale-125 text-(--nucleus-accent) group-hover:hidden"
					/>
				{/if}
			</button>
		{/each}
	</div>
{/if}
