<script lang="ts">
	import { generateColorForDid, loggingIn, type Account } from '$lib/accounts';
	import { AtpClient } from '$lib/at/client';
	import type { Handle } from '@atcute/lexicons';
	import ProfilePicture from './ProfilePicture.svelte';
	import PfpPlaceholder from './PfpPlaceholder.svelte';
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

	const toggleDropdown = (e: MouseEvent) => {
		e.stopPropagation();
		isDropdownOpen = !isDropdownOpen;
	};

	const selectAccount = (did: AtprotoDid) => {
		onAccountSelected(did);
		isDropdownOpen = false;
	};

	const openLoginModal = () => {
		isLoginModalOpen = true;
		isDropdownOpen = false;
		loginHandle = '';
		loginError = '';
	};

	const closeLoginModal = () => {
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

			loggingIn.set({ did: did.value, handle });
			const result = await flow.start(handle);
			if (!result.ok) throw result.error;
		} catch (error) {
			loginError = `login failed: ${error}`;
			loggingIn.set(null);
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
			<PfpPlaceholder color="var(--nucleus-accent)" size={15} />
		{/if}
	</button>

	{#if isDropdownOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute left-0 z-10 mt-3 min-w-52 animate-fade-in-scale-fast overflow-hidden rounded-sm border-2 border-(--nucleus-accent) bg-(--nucleus-bg)/94 shadow-2xl backdrop-blur-lg transition-all"
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
								? `linear-gradient(135deg, color-mix(in srgb, var(--nucleus-accent) 20%, transparent), color-mix(in srgb, var(--nucleus-accent2) 20%, transparent))`
								: 'transparent'};"
						>
							<span>@{account.handle}</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								onclick={() => onLogout(account.did)}
								class="ml-auto hidden h-5 w-5 text-(--nucleus-accent) transition-all group-hover:block hover:scale-[1.2] hover:shadow-md"
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
									class="ml-auto h-5 w-5 text-(--nucleus-accent) group-hover:hidden"
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
				<div class="mx-2 h-px bg-linear-to-r from-(--nucleus-accent) to-(--nucleus-accent2)"></div>
			{/if}
			<button
				onclick={openLoginModal}
				class="group flex w-full origin-left items-center gap-3 p-3 text-left text-sm font-semibold text-(--nucleus-accent) transition-all hover:scale-[1.1]"
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
		class="fixed inset-0 z-50 flex items-center justify-center bg-(--nucleus-bg)/80 backdrop-blur-sm"
		onclick={closeLoginModal}
		onkeydown={handleKeydown}
		role="button"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="w-full max-w-md animate-fade-in-scale rounded-sm border-2 border-(--nucleus-accent) bg-(--nucleus-bg) p-4 shadow-2xl transition-all"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
		>
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h2 class="text-2xl font-bold">add account</h2>
					<div class="mt-2 flex gap-2">
						<div class="h-1 w-10 rounded-full bg-(--nucleus-accent)"></div>
						<div class="h-1 w-9 rounded-full bg-(--nucleus-accent2)"></div>
					</div>
				</div>
				<!-- svelte-ignore a11y_consider_explicit_label -->
				<button
					onclick={closeLoginModal}
					class="rounded-xl p-2 text-(--nucleus-fg)/40 transition-all hover:scale-110 hover:text-(--nucleus-fg)"
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
					<label for="handle" class="mb-2 block text-sm font-semibold text-(--nucleus-fg)/80">
						handle
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
		</div>
	</div>
{/if}
