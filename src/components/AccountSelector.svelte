<script lang="ts">
	import { generateColorForDid, loggingIn, type Account } from '$lib/accounts';
	import { AtpClient } from '$lib/at/client';
	import type { Handle } from '@atcute/lexicons';
	import ProfilePicture from './ProfilePicture.svelte';
	import PfpPlaceholder from './PfpPlaceholder.svelte';
	import Popup from './Popup.svelte';
	import Dropdown from './Dropdown.svelte';
	import { flow } from '$lib/at/oauth';
	import { isHandle, type AtprotoDid } from '@atcute/lexicons/syntax';
	import Icon from '@iconify/svelte';

	interface Props {
		client: AtpClient;
		accounts: Array<Account>;
		selectedDid?: AtprotoDid | null;
		onAccountSelected: (did: AtprotoDid) => void;
		onLogout: (did: AtprotoDid) => void;
	}

	let {
		client,
		accounts = [],
		selectedDid = $bindable(null),
		onAccountSelected,
		onLogout
	}: Props = $props();

	let isDropdownOpen = $state(false);
	let isLoginModalOpen = $state(false);
	let loginHandle = $state('');
	let loginError = $state('');
	let isLoggingIn = $state(false);

	const toggleDropdown = () => (isDropdownOpen = !isDropdownOpen);
	const closeDropdown = () => (isDropdownOpen = false);

	const selectAccount = (did: AtprotoDid) => {
		onAccountSelected(did);
		closeDropdown();
	};

	const openLoginModal = () => {
		isLoginModalOpen = true;
		closeDropdown();
		loginHandle = '';
		loginError = '';
		// HACK: i hate this but it works so it doesnt really matter
		setTimeout(() => document.getElementById('handle')?.focus(), 100);
	};

	const closeLoginModal = () => {
		document.getElementById('handle')?.blur();
		isLoginModalOpen = false;
		loginHandle = '';
		loginError = '';
	};

	const handleLogin = async () => {
		try {
			if (!loginHandle) throw 'please enter handle';

			isLoggingIn = true;
			loginError = '';

			let handle: Handle;
			if (isHandle(loginHandle)) handle = loginHandle;
			else throw 'handle is invalid';

			let did = await client.resolveHandle(handle);
			if (!did.ok) throw did.error;

			await initiateLogin(did.value, handle);
		} catch (error) {
			loginError = `login failed: ${error}`;
			loggingIn.set(null);
		} finally {
			isLoggingIn = false;
		}
	};

	const initiateLogin = async (did: AtprotoDid, handle: Handle | null) => {
		loggingIn.set({ did, handle });
		const result = await flow.start(handle ?? did);
		if (!result.ok) throw result.error;
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter' && !isLoggingIn) handleLogin();
	};
</script>

<Dropdown
	class="min-w-52 rounded-sm border-2 border-(--nucleus-accent) bg-(--nucleus-bg) shadow-2xl"
	bind:isOpen={isDropdownOpen}
	placement="top-start"
>
	{#snippet trigger()}
		<button
			onclick={toggleDropdown}
			class="flex h-13 w-13 items-center justify-center rounded-sm shadow-md transition-all hover:scale-110 hover:shadow-xl hover:saturate-150"
		>
			{#if selectedDid}
				<ProfilePicture {client} did={selectedDid} size={13} />
			{:else}
				<PfpPlaceholder color="var(--nucleus-accent)" size={13} />
			{/if}
		</button>
	{/snippet}

	{#if accounts.length > 0}
		<div class="p-2">
			{#each accounts as account (account.did)}
				{@const color = generateColorForDid(account.did)}
				{#snippet action(name: string, icon: string, onClick: () => void)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						title={name}
						onclick={onClick}
						class="hidden text-(--nucleus-accent) transition-all group-hover:block hover:scale-[1.2] hover:shadow-md"
					>
						<Icon class="h-5 w-5" {icon} />
					</div>
				{/snippet}
				<button
					onclick={() => selectAccount(account.did)}
					class="
					group flex w-full items-center gap-3 rounded-sm p-2 text-left text-sm font-medium transition-all
					{account.did === selectedDid ? 'shadow-lg' : ''}
				"
					style="color: {color}; background: {account.did === selectedDid
						? `linear-gradient(135deg, color-mix(in srgb, var(--nucleus-accent) 20%, transparent), color-mix(in srgb, var(--nucleus-accent2) 20%, transparent))`
						: 'transparent'};"
				>
					<span>@{account.handle}</span>

					<div class="grow"></div>

					{@render action('relogin', 'heroicons:arrow-path-rounded-square-solid', () =>
						initiateLogin(account.did, account.handle)
					)}
					{@render action('logout', 'heroicons:trash-solid', () => onLogout(account.did))}

					{#if account.did === selectedDid}
						<Icon
							icon="heroicons:check-16-solid"
							class="h-5 w-5 scale-125 text-(--nucleus-accent) group-hover:hidden"
						/>
					{/if}
				</button>
			{/each}
		</div>
		<div class="mx-2 h-px bg-linear-to-r from-(--nucleus-accent) to-(--nucleus-accent2)"></div>
	{/if}
	<button
		onclick={openLoginModal}
		class="group flex w-full origin-left items-center gap-3 p-3 text-left text-sm font-semibold text-(--nucleus-accent) transition-all hover:scale-[1.1]"
	>
		<Icon class="h-5 w-5 scale-[130%]" icon="heroicons:plus-16-solid" />
		<span>add account</span>
	</button>
</Dropdown>

<Popup bind:isOpen={isLoginModalOpen} onClose={closeLoginModal} title="add account">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="space-y-2" onkeydown={handleKeydown}>
		<div>
			<label for="handle" class="mb-2 block text-sm font-semibold text-(--nucleus-fg)/80">
				account handle
			</label>
			<input
				id="handle"
				type="text"
				bind:value={loginHandle}
				placeholder="example.bsky.social"
				class="single-line-input border-(--nucleus-accent)/40 bg-(--nucleus-accent)/3"
				disabled={isLoggingIn}
			/>
		</div>

		{#if loginError}
			<div class="error-disclaimer">
				<p>
					<Icon class="inline h-10 w-10" icon="heroicons:exclamation-triangle-16-solid" />
					{loginError}
				</p>
			</div>
		{/if}

		<div class="flex gap-3 pt-3">
			<button onclick={closeLoginModal} class="flex-1 action-button" disabled={isLoggingIn}>
				cancel
			</button>
			<button
				onclick={handleLogin}
				class="flex-1 action-button border-transparent text-(--nucleus-fg)"
				style="background: linear-gradient(135deg, var(--nucleus-accent), var(--nucleus-accent2));"
				disabled={isLoggingIn}
			>
				{isLoggingIn ? 'logging in...' : 'login'}
			</button>
		</div>
	</div>
</Popup>
