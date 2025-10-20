<script lang="ts">
	import { generateColorForDid, type Account } from '$lib/accounts';
	import { AtpClient } from '$lib/at/client';
	import type { Did, Handle } from '@atcute/lexicons';
	import { theme } from '$lib/theme.svelte';
	import ProfilePicture from './ProfilePicture.svelte';
	import PfpPlaceholder from './PfpPlaceholder.svelte';

	interface Props {
		client: AtpClient;
		accounts: Array<Account>;
		selectedDid?: Did | null;
		onAccountSelected: (did: Did) => void;
		onLoginSucceed: (did: Did, handle: Handle, password: string) => void;
		onLogout: (did: Did) => void;
	}

	let {
		client,
		accounts = [],
		selectedDid = $bindable(null),
		onAccountSelected,
		onLoginSucceed,
		onLogout
	}: Props = $props();

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
</script>

<svelte:window onclick={closeDropdown} />

<div class="relative">
	<button
		onclick={toggleDropdown}
		class="flex h-16 w-16 items-center justify-center rounded-sm shadow-lg transition-all hover:scale-105 hover:shadow-xl"
	>
		{#if selectedDid}
			<ProfilePicture {client} did={selectedDid} size={15} />
		{:else}
			<PfpPlaceholder color={theme.accent} size={15} />
		{/if}
	</button>

	{#if isDropdownOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute left-0 z-10 mt-3 min-w-52 overflow-hidden rounded-sm border-2 shadow-2xl backdrop-blur-lg"
			style="border-color: {theme.accent}; background: {theme.bg}f0;"
			onclick={(e) => e.stopPropagation()}
		>
			{#if accounts.length > 0}
				<div class="p-2">
					{#each accounts as account (account.did)}
						{@const color = generateColorForDid(account.did)}
						<button
							onclick={() => selectAccount(account.did)}
							class="
    							group flex w-full items-center gap-3 rounded-sm p-2 text-left text-sm font-medium transition-all
    							{account.did === selectedDid ? 'shadow-lg' : ''}
							"
							style="color: {color}; background: {account.did === selectedDid
								? `linear-gradient(135deg, ${theme.accent}33, ${theme.accent2}33)`
								: 'transparent'};"
						>
							<span>@{account.handle}</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								onclick={() => onLogout(account.did)}
								class="ml-auto hidden h-5 w-5 transition-all group-hover:[display:block] hover:scale-[1.2] hover:shadow-md"
								style="color: {theme.accent};"
								width="24"
								height="24"
								viewBox="0 0 20 20"
								><path
									fill="currentColor"
									fill-rule="evenodd"
									d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443q-1.193.115-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022l.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52l.149.023a.75.75 0 0 0 .23-1.482A41 41 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1zM10 4q1.26 0 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325Q8.74 4 10 4M8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06z"
									clip-rule="evenodd"
								/></svg
							>

							{#if account.did === selectedDid}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="ml-auto h-5 w-5 group-hover:hidden"
									style="color: {theme.accent};"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									><path
										fill="currentColor"
										fill-rule="evenodd"
										d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353l8.493-12.74a.75.75 0 0 1 1.04-.207"
										clip-rule="evenodd"
										stroke-width="1.5"
										stroke="currentColor"
									/></svg
								>
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
				class="group flex w-full origin-left items-center gap-3 p-3 text-left text-sm font-semibold transition-all hover:scale-[1.1]"
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
			class="w-full max-w-md rounded-sm border-2 p-5 shadow-2xl"
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
						class="placeholder-opacity-40 w-full rounded-sm border-2 px-4 py-3 font-medium transition-all focus:scale-[1.02] focus:shadow-lg focus:outline-none"
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
						class="placeholder-opacity-40 w-full rounded-sm border-2 px-4 py-3 font-medium transition-all focus:scale-[1.02] focus:shadow-lg focus:outline-none"
						style="background: {theme.accent}08; border-color: {theme.accent}66; color: {theme.fg};"
						disabled={isLoggingIn}
					/>
				</div>

				{#if loginError}
					<div
						class="rounded-sm border-2 p-4"
						style="background: #ef444422; border-color: #ef4444;"
					>
						<p class="text-sm font-medium" style="color: #fca5a5;">{loginError}</p>
					</div>
				{/if}

				<div class="flex gap-3 pt-3">
					<button
						onclick={closeLoginModal}
						class="flex-1 rounded-sm border-2 px-5 py-3 font-semibold transition-all hover:scale-105"
						style="background: {theme.bg}; border-color: {theme.fg}33; color: {theme.fg};"
						disabled={isLoggingIn}
					>
						cancel
					</button>
					<button
						onclick={handleLogin}
						class="flex-1 rounded-sm border-2 px-5 py-3 font-semibold transition-all hover:scale-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
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
