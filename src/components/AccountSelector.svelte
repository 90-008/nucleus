<script lang="ts">
	import { generateColorForDid, type Account } from '$lib/accounts';
	import { AtpClient } from '$lib/at/client';
	import type { Did, Handle } from '@atcute/lexicons';
	import { theme } from '$lib/theme.svelte';

	let {
		accounts = [],
		selectedDid = $bindable(null),
		onAccountSelected,
		onLoginSucceed
	}: {
		accounts: Array<Account>;
		selectedDid?: Did | null;
		onAccountSelected: (did: Did) => void;
		onLoginSucceed: (did: Did, handle: Handle, password: string) => void;
	} = $props();

	let color = $derived(selectedDid ? (generateColorForDid(selectedDid) ?? theme.fg) : theme.fg);

	let isDropdownOpen = $state(false);
	let isLoginModalOpen = $state(false);
	let loginHandle = $state('');
	let loginPassword = $state('');
	let loginError = $state('');
	let isLoggingIn = $state(false);

	const toggleDropdown = (e: MouseEvent) => {
		e.stopPropagation();
		isDropdownOpen = !isDropdownOpen;
	};

	const selectAccount = (did: Did) => {
		onAccountSelected(did);
		isDropdownOpen = false;
	};

	const openLoginModal = () => {
		isLoginModalOpen = true;
		isDropdownOpen = false;
		loginHandle = '';
		loginPassword = '';
		loginError = '';
	};

	const closeLoginModal = () => {
		isLoginModalOpen = false;
		loginHandle = '';
		loginPassword = '';
		loginError = '';
	};

	const handleLogin = async () => {
		if (!loginHandle || !loginPassword) {
			loginError = 'please enter both handle and password';
			return;
		}

		isLoggingIn = true;
		loginError = '';

		try {
			const client = new AtpClient();
			const result = await client.login(loginHandle as Handle, loginPassword);

			if (!result.ok) {
				loginError = result.error;
				isLoggingIn = false;
				return;
			}

			if (!client.didDoc) {
				loginError = 'failed to get did document';
				isLoggingIn = false;
				return;
			}

			onLoginSucceed(client.didDoc.did, loginHandle as Handle, loginPassword);
			closeLoginModal();
		} catch (error) {
			loginError = `login failed: ${error}`;
		} finally {
			isLoggingIn = false;
		}
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			closeLoginModal();
		} else if (event.key === 'Enter' && !isLoggingIn) {
			handleLogin();
		}
	};

	const closeDropdown = () => {
		isDropdownOpen = false;
	};

	let selectedAccount = $derived(accounts.find((acc) => acc.did === selectedDid));
</script>

<svelte:window onclick={closeDropdown} />

<div class="relative">
	<button
		onclick={toggleDropdown}
		class="group flex h-full items-center gap-2 rounded-2xl border-2 px-4 font-medium shadow-lg transition-all hover:scale-105 hover:shadow-xl"
		style="border-color: {theme.accent}66; background: {theme.accent}18; color: {color}; backdrop-filter: blur(8px);"
	>
		<span class="text-sm">
			{selectedAccount ? `@${selectedAccount.handle}` : 'select account'}
		</span>
		<svg
			class="h-4 w-4 transition-transform {isDropdownOpen ? 'rotate-180' : ''}"
			style="color: {theme.accent};"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if isDropdownOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute left-0 z-10 mt-3 min-w-52 overflow-hidden rounded-2xl border-2 shadow-2xl backdrop-blur-lg"
			style="border-color: {theme.accent}; background: {theme.bg}f0;"
			onclick={(e) => e.stopPropagation()}
		>
			{#if accounts.length > 0}
				<div class="p-2">
					{#each accounts as account (account.did)}
						{@const color = generateColorForDid(account.did)}
						<button
							onclick={() => selectAccount(account.did)}
							class="flex w-full items-center gap-3 rounded-xl p-2 text-left text-sm font-medium transition-all {account.did ===
							selectedDid
								? 'shadow-lg'
								: 'hover:scale-[1.02]'}"
							style="color: {color}; background: {account.did === selectedDid
								? `linear-gradient(135deg, ${theme.accent}33, ${theme.accent2}33)`
								: 'transparent'};"
						>
							<span>@{account.handle}</span>
							{#if account.did === selectedDid}
								<svg
									class="ml-auto h-5 w-5"
									style="color: {theme.accent};"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path
										fill-rule="evenodd"
										d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
										clip-rule="evenodd"
									/>
								</svg>
							{/if}
						</button>
					{/each}
				</div>
				<div
					class="mx-2 h-px"
					style="background: linear-gradient(to right, {theme.accent}, {theme.accent2});"
				></div>
			{/if}
			<button
				onclick={openLoginModal}
				class="flex w-full items-center gap-3 p-3 text-left text-sm font-semibold transition-all hover:scale-[1.02]"
				style="color: {theme.accent};"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2.5"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				<span>add account</span>
			</button>
		</div>
	{/if}
</div>

{#if isLoginModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
		style="background: {theme.bg}cc;"
		onclick={closeLoginModal}
		onkeydown={handleKeydown}
		role="button"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="w-full max-w-md rounded-3xl border-2 p-5 shadow-2xl"
			style="background: {theme.bg}; border-color: {theme.accent};"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
		>
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h2 class="text-2xl font-bold" style="color: {theme.fg};">add account</h2>
					<div class="mt-2 flex gap-2">
						<div class="h-1 w-10 rounded-full" style="background: {theme.accent};"></div>
						<div class="h-1 w-9 rounded-full" style="background: {theme.accent2};"></div>
					</div>
				</div>
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					onclick={closeLoginModal}
					class="rounded-xl p-2 transition-all hover:scale-110"
					style="color: {theme.fg}66; hover:color: {theme.fg};"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<div class="space-y-5">
				<div>
					<label for="handle" class="mb-2 block text-sm font-semibold" style="color: {theme.fg}cc;">
						handle
					</label>
					<input
						id="handle"
						type="text"
						bind:value={loginHandle}
						placeholder="example.bsky.social"
						class="placeholder-opacity-40 w-full rounded-xl border-2 px-4 py-3 font-medium transition-all focus:scale-[1.02] focus:shadow-lg focus:outline-none"
						style="background: {theme.accent}08; border-color: {theme.accent}66; color: {theme.fg};"
						disabled={isLoggingIn}
					/>
				</div>

				<div>
					<label
						for="password"
						class="mb-2 block text-sm font-semibold"
						style="color: {theme.fg}cc;"
					>
						app password
					</label>
					<input
						id="password"
						type="password"
						bind:value={loginPassword}
						placeholder="xxxx-xxxx-xxxx-xxxx"
						class="placeholder-opacity-40 w-full rounded-xl border-2 px-4 py-3 font-medium transition-all focus:scale-[1.02] focus:shadow-lg focus:outline-none"
						style="background: {theme.accent}08; border-color: {theme.accent}66; color: {theme.fg};"
						disabled={isLoggingIn}
					/>
				</div>

				{#if loginError}
					<div
						class="rounded-xl border-2 p-4"
						style="background: #ef444422; border-color: #ef4444;"
					>
						<p class="text-sm font-medium" style="color: #fca5a5;">{loginError}</p>
					</div>
				{/if}

				<div class="flex gap-3 pt-3">
					<button
						onclick={closeLoginModal}
						class="flex-1 rounded-xl border-2 px-5 py-3 font-semibold transition-all hover:scale-105"
						style="background: {theme.bg}; border-color: {theme.fg}33; color: {theme.fg};"
						disabled={isLoggingIn}
					>
						cancel
					</button>
					<button
						onclick={handleLogin}
						class="flex-1 rounded-xl border-2 px-5 py-3 font-semibold transition-all hover:scale-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
						style="background: linear-gradient(135deg, {theme.accent}, {theme.accent2}); border-color: transparent; color: {theme.fg};"
						disabled={isLoggingIn}
					>
						{isLoggingIn ? 'logging in...' : 'login'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
