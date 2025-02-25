import { signal, useSignal, useSignalEffect } from "@preact/signals";
import { ThemeToggle } from "./ThemeToggle";
import { useEffect, useRef } from "preact/hooks";
import { memo } from "preact/compat";
import { createClient } from "@supabase/supabase-js";

// Supabase setup
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
// const supabaseUrl =
// 	window.location.hostname === "localhost"
// 		? import.meta.env.VITE_LOCAL_SUPABASE_URL
// 		: import.meta.env.VITE_PUBLIC_SUPABASE_URL;
// const supabaseKey =
// 	window.location.hostname === "localhost"
// 		? import.meta.env.VITE_SUPABASE_ANON_KEY
// 		: import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const supabase = signal(createClient(supabaseUrl, supabaseKey));

const embeddingsUrl =
	window.location.hostname === "localhost"
		? "http://localhost:3001/api/search"
		: "http://vibe-search-api.henryzoo.com/api/search";

// Available users for filtering
const USERS = [
	{
		username: "DefenderOfBasic",
		displayName: "Defender",
		id: "1680757426889342977",
	},
	{ username: "exgenesis", displayName: "❤️‍🔥 xiq in NYC 🏙️ Feb 16 - 28", id: "322603863" },
] as { username: string; displayName: string; id: string }[];

// Cache interface
type UserData = {
	displayName: string;
	photo: string;
	bio?: string;
	website?: string;
	location?: string;
	loadedAt: number;
	accountId: string;
};
interface UserCache {
	[username: string]: UserData;
}

// Load cache from localStorage
const CACHE_KEY = "tweetSearchUserCache";
const CACHE_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

function loadCache(): UserCache {
	try {
		const cached = localStorage.getItem(CACHE_KEY);
		return cached ? JSON.parse(cached) : {};
	} catch (e) {
		console.error("Error loading cache:", e);
		return {};
	}
}

function saveCache(cache: UserCache) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
	} catch (e) {
		console.error("Error saving cache:", e);
	}
}

// Initialize cache from localStorage
let userCache: UserCache = loadCache();

async function getUserData(
	result: (typeof results.value)[0],
): Promise<UserData | null> {
	const now = Date.now();
	const cached = userCache[result.username];
	if (cached && now - cached.loadedAt < CACHE_TTL) {
		return cached;
	}

	try {
		// First check hardcoded USERS array
		const hardcodedUser = USERS.find(user => user.username === result.username);
		
		// Get account data either from hardcoded user or database
		const { data: account } = hardcodedUser 
			? { data: { account_id: hardcodedUser.id, account_display_name: hardcodedUser.displayName } }
			: await supabase.value
				.from("all_account")
				.select("account_id, account_display_name")
				.eq("username", result.username)
				.single();

		if (!account) {
			console.error("Account not found for username:", result.username);
			return null;
		}

		// Then get profile data using account_id
		const { data: profile } = await supabase.value
			.from("profile")
			.select("avatar_media_url, bio, website, location")
			.eq("account_id", account.account_id)
			.single();

		if (profile) {
			const userData = {
				displayName: account.account_display_name || result.username,
				photo: profile.avatar_media_url,
				bio: profile.bio,
				website: profile.website,
				location: profile.location,
				loadedAt: now,
				accountId: account.account_id,
			};

			// Update cache in memory and localStorage
			userCache = { ...userCache, [result.username]: userData };
			saveCache(userCache);

			return userData;
		}
	} catch (error) {
		console.error("Error fetching user data:", error);
	}

	return null;
}

const query = signal("love");
const selectedUser = signal<string>("");
const nResults = signal(10);
const results = signal<
	Array<{
		text: string;
		distance: number;
		username: string;
		date: string;
		id: string;
	}>
>([]);
const loading = signal(false);
const error = signal<string | null>(null);
// Dialog control
const currentDialog = signal<'settings' | 'shortcuts' | null>(null);
// Tweet selection
const selectedTweetIndex = signal<number>(-1);
// Theme control
const isDarkMode = signal(document.documentElement.classList.contains('dark'));
const headerHeight = signal(119);

function toggleDarkMode() {
	isDarkMode.value = !isDarkMode.value;
	document.documentElement.classList.toggle('dark');
	localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light');
}

// Track last dialog open time to handle double-press to close
const lastDialogOpenTime = signal<{ dialog: string; time: number } | null>(null);

function toggleDialog(dialog: 'settings' | 'shortcuts') {
	const now = Date.now();
	// If same dialog was opened in last 500ms, close it
	if (lastDialogOpenTime.value?.dialog === dialog && now - lastDialogOpenTime.value.time < 500) {
		currentDialog.value = null;
		lastDialogOpenTime.value = null;
	} else {
		currentDialog.value = dialog;
		lastDialogOpenTime.value = { dialog, time: now };
	}
}

function UserSelect() {
	return (
		<select
			id="userFilter"
			value={selectedUser.value}
			onChange={(e) => {
				selectedUser.value = e.currentTarget.value;
				handleSearch();
			}}
			class="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
		>
			<option value="">All users</option>
			{USERS.map((user) => (
				<option key={user.username} value={user.username}>
					{user.displayName}
				</option>
			))}
		</select>
	);
}


const handleClearCache = () => {
	userCache = {};
	saveCache(userCache);
	handleSearch(); // Refresh to update display names/photos
};

// Settings Dialog
function SettingsDialog() {
	if (currentDialog.value !== 'settings') return null;

	return (
		<div
			class="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50"
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					currentDialog.value = null;
				}
			}}
			onKeyDown={(e) => {
				if (e.key === 'Escape') {
					currentDialog.value = null;
				}
			}}
			role="dialog"
			aria-modal="true"
			aria-label="Search Settings"
		>
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
				<h2 class="text-lg font-bold mb-4">Search Settings</h2>

				<div class="space-y-4">
					<div>
						<label htmlFor="resultsPerSearch" class="block text-sm font-medium mb-1">
							Results per search
						</label>
						<input
							id="resultsPerSearch"
							type="number"
							min="1"
							max="100"
							value={nResults.value}
							onInput={(e) => {
								const val = Number.parseInt(e.currentTarget.value);
								if (val > 0 && val <= 100) {
									nResults.value = val;
								}
							}}
							class="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
						/>
					</div>

					<div>
						<label htmlFor="userFilter" class="block text-sm font-medium mb-1">Filter by user</label>
						<UserSelect />
					</div>

					<div>
						<button
							onClick={handleClearCache}
							class="w-full px-4 py-2 bg-red-500/80 text-white rounded-lg hover:bg-red-600"
						>
							Clear User Cache
						</button>
						<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
							This will clear cached user data (display names, photos, etc.)
						</p>
					</div>
				</div>

				<div class="mt-6 flex justify-end gap-2">
					<button
						onClick={() => {
							currentDialog.value = null;
							handleSearch();
						}}
						class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
					>
						Apply
					</button>
					<button
						onClick={() => (currentDialog.value = null)}
						class="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}

const handleSearch = async () => {
	if (!query.value.trim()) {
		results.value = []; // Clear results on empty query
		error.value = null;
		return;
	}

	loading.value = true;
	error.value = null;
	try {
		const response = await fetch(embeddingsUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: query.value,
				username: selectedUser.value || undefined,
				nResults: nResults.value,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Search failed: ${response.status} ${response.statusText}`,
			);
		}

		const json = await response.json();
		results.value = json;
		
		// After search, unfocus input and select first tweet
		const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
		searchInput?.blur();
		selectedTweetIndex.value = results.value.length > 0 ? 0 : -1;
	} catch (err) {
		error.value = err instanceof Error ? err.message : String(err);
	} finally {
		loading.value = false;
	}
};

function Input() {
	return (
		<div class="relative">
			<div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-5 h-5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
					/>
				</svg>
			</div>
			<input
				type="text"
				value={query.value}
				onInput={(e) => {
					query.value = e.currentTarget.value;
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						handleSearch();
					}
				}}
				placeholder="Search tweets..."
				class="w-full pl-10 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			/>
			{query.value && (
				<button
					onClick={() => {
						query.value = "";
						handleSearch();
					}}
					class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
					aria-label="Clear search"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="w-5 h-5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			)}
		</div>
	);
}

function LoadingTweet() {
	return (
		<div class="p-4 border-b border-gray-100 animate-pulse">
			<div class="flex gap-3">
				<div class="flex-shrink-0">
					<div class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-1 mb-1">
						<div class="flex-1 min-w-0">
							<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-1" />
							<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
						</div>
						<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/6" />
					</div>
					<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
					<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
				</div>
			</div>
		</div>
	);
}

function Results() {
	if (loading.value) {
		return (
			<div class="space-y-0">
				<LoadingTweet />
				<LoadingTweet />
				<LoadingTweet />
			</div>
		);
	}

	if (error.value) {
		return (
			<div class="p-4 text-red-500 dark:text-red-400">Error: {error.value}</div>
		);
	}

	if (results.value.length === 0) {
		return (
			<div class="p-4 text-gray-500 dark:text-gray-400">
				No tweets found matching your search.
			</div>
		);
	}

	return (
		<div class="space-y-0">
			<div class="space-y-0">
				{results.value.map((result, index) => (
					<Tweet key={result.id} result={result} index={index} />
				))}
			</div>
			{/* Add padding at bottom to allow scrolling last tweet to top */}
			<div class="h-screen" />
		</div>
	);
}

function linkify(text: string) {
	const urlRegex = /https?:\/\/[^\s<]+/g;
	const usernameRegex = /@(\w+)/g;

	// First escape HTML
	const escapedText = text.replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#039;",
			})[char]!,
	);

	// Replace URLs first
	let replacedText = escapedText.replace(urlRegex, (url) => {
		const trimmedUrl = url.replace(/[.,;:]$/, "");
		return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${trimmedUrl}</a>`;
	});

	// Then replace usernames
	replacedText = replacedText.replace(
		usernameRegex,
		(match, username) =>
			`<a href="https://x.com/${username}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${match}</a>`,
	);

	return replacedText;
}

function highlightText(text: string, query: string) {
	if (!query) return linkify(text);

	const linkedText = linkify(text);
	const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Use a non-greedy match to avoid matching across HTML tags
	const regex = new RegExp(`(${safeQuery})(?![^<]*>)`, "gi");

	return linkedText.replace(
		regex,
		'<mark class="bg-yellow-200 dark:bg-yellow-500 px-0.5 rounded">$1</mark>',
	);
}

const Tweet = memo(({ result, index }: { result: (typeof results.value)[0]; index: number }) => {
	const userData = useSignal<UserData | null>(null);
	const showProfile = useSignal(false);
	const isSelected = index === selectedTweetIndex.value;
	const imageLoaded = useSignal(false);
	const tweetRef = useRef<HTMLAnchorElement>(null);
	const profileTimeoutRef = useRef<number | null>(null);

	useSignalEffect(() => {
		// Try to get from cache immediately
		const cached = userCache[result.username];
		if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
			userData.value = cached;
			return;
		}
		// Then fetch/update in background
		getUserData(result).then((data) => {
			if (data) userData.value = data;
		});
	});

	useEffect(() => {
		if (isSelected && tweetRef.current) {
			const scrollTop = window.scrollY + tweetRef.current.getBoundingClientRect().top - headerHeight.value;
			window.scrollTo({
				top: scrollTop,
				behavior: 'instant'
			});
		}
		
		// Cleanup timeout on unmount
		return () => {
			if (profileTimeoutRef.current) {
				clearTimeout(profileTimeoutRef.current);
			}
		};
	}, [isSelected]);

	const handleProfileMouseEnter = () => {
		if (profileTimeoutRef.current) {
			clearTimeout(profileTimeoutRef.current);
			profileTimeoutRef.current = null;
		}
		showProfile.value = true;
	};

	const handleProfileMouseLeave = () => {
		profileTimeoutRef.current = window.setTimeout(() => {
			showProfile.value = false;
		}, 300); // Short delay before hiding
	};

	const tweetUrl = `https://x.com/${result.username}/status/${result.id}`;
	const formattedDate = new Date(result.date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: result.date.includes("2024") ? undefined : "numeric",
	});

	return (
		<a
			ref={tweetRef}
			href={tweetUrl}
			target="_blank"
			rel="noopener noreferrer"
			class={`block p-4 border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 transition-colors ${
				isSelected ? 'bg-white [box-shadow:rgb(142,205,248)_0px_0px_0px_2px_inset] dark:bg-blue-900/20' : ''
			}`}
			onClick={(e) => {
				if (!e.ctrlKey && !e.metaKey) {
					e.preventDefault();
					selectedTweetIndex.value = index;
				}
			}}
			onKeyDown={(e) => {
				if (e.key === 'Enter') {
					window.open(tweetUrl, '_blank');
				}
			}}
			tabIndex={0}
		>
			<div class="flex gap-3">
				<div class="flex-shrink-0 relative">
					<div
						onMouseEnter={handleProfileMouseEnter}
						onMouseLeave={handleProfileMouseLeave}
					>
						{!imageLoaded.value && (
							<div class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
						)}
						<img
							src={userData.value?.photo || "/placeholder.png"}
							alt=""
							onLoad={() => imageLoaded.value = true}
							class={`w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer ${!imageLoaded.value ? 'hidden' : ''}`}
						/>
						{showProfile.value && (
							<ProfileHoverCard 
								userData={userData.value} 
								username={result.username} 
								onMouseEnter={handleProfileMouseEnter}
								onMouseLeave={handleProfileMouseLeave}
							/>
						)}
					</div>
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-1 mb-1">
						<div class="flex-1 min-w-0">
							<a
								href={`https://x.com/${result.username}`}
								target="_blank"
								rel="noopener noreferrer"
								class="hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								<span class="font-bold text-gray-900 dark:text-gray-100">
									{userData.value?.displayName || result.username}
								</span>
								<span class="text-gray-500 dark:text-gray-400">
									{" "}
									@{result.username}
								</span>
							</a>
							<span class="text-gray-500 dark:text-gray-400">
								{" "}
								· {formattedDate}
							</span>
						</div>
						<span class="text-gray-500 dark:text-gray-400 text-xs shrink-0">
							{result.distance.toFixed(3)}
						</span>
					</div>
					<p
						class="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words"
						dangerouslySetInnerHTML={{
							__html: highlightText(result.text, query.value),
						}}
					/>
				</div>
			</div>
		</a>
	);
});

const shortcuts = [
	{ key: 'Ctrl + /', description: 'Show keyboard shortcuts' },
	{ key: 'Ctrl + ,', description: 'Show settings' },
	{ key: 'j', description: 'Next tweet' },
	{ key: 'k', description: 'Previous tweet' },
	{ key: 'Space', description: 'Page down' },
	{ key: '/', description: 'Focus search' },
	{ key: 'Enter', description: 'Open selected tweet' },
	{ key: 'Esc', description: 'Close dialog' },
];

function KeyboardShortcutsDialog() {
	if (currentDialog.value !== 'shortcuts') return null;

	return (
		<div
			class="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50"
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					currentDialog.value = null;
				}
			}}
			onKeyDown={(e) => {
				if (e.key === 'Escape') {
					currentDialog.value = null;
				}
			}}
			role="dialog"
			aria-modal="true"
			aria-label="Keyboard Shortcuts"
		>
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
				<h2 class="text-lg font-bold mb-4">Keyboard Shortcuts</h2>
				<div class="space-y-2">
					{shortcuts.map((shortcut) => (
						<div key={shortcut.key} class="flex justify-between items-center">
							<span class="text-gray-600 dark:text-gray-300">{shortcut.description}</span>
							<kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm">{shortcut.key}</kbd>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function ProfileHoverCard({ 
	userData, 
	username, 
	onMouseEnter, 
	onMouseLeave 
}: { 
	userData: UserData | null; 
	username: string;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
}) {
	if (!userData) return null;
  
	return (
		<div 
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			class="absolute left-0 top-0 -translate-y-2 transform translate-x-16 z-50 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 transition-opacity duration-300"
		>
			<div class="flex items-start gap-3">
				<img
					src={userData.photo || "/placeholder.png"}
					alt=""
					class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700"
				/>
				<div class="flex-1 min-w-0">
					<div class="font-bold text-gray-900 dark:text-gray-100 truncate">
						{userData.displayName}
					</div>
					<div class="text-gray-500 dark:text-gray-400">@{username}</div>
				</div>
			</div>
			{userData.bio && (
				<p class="mt-3 text-gray-900 dark:text-gray-100 text-sm">{userData.bio}</p>
			)}
			<div class="mt-3 space-y-1">
				{userData.location && (
					<div class="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
							<path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
						</svg>
						<span>{userData.location}</span>
					</div>
				)}
				{userData.website && (
					<div class="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
							<path fill-rule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clip-rule="evenodd" />
						</svg>
						<a 
							href={userData.website} 
							target="_blank" 
							rel="noopener noreferrer" 
							class="hover:underline text-blue-500"
							onClick={(e) => e.stopPropagation()}
						>
							{new URL(userData.website).hostname}
						</a>
					</div>
				)}
			</div>
		</div>
	);
}

function handleKeyDownStable(e: KeyboardEvent) {
	// Don't handle shortcuts if input is focused, except for Escape
	if (e.target instanceof HTMLInputElement && e.key !== 'Escape') {
		return;
	}

	// Add copy shortcut (Cmd/Ctrl+C)
	if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedTweetIndex.value !== -1) {
		e.preventDefault();
		const selectedTweet = results.value[selectedTweetIndex.value];
		navigator.clipboard.writeText(selectedTweet.text);
		return;
	}

	// Cmd/Ctrl + K to focus search
	if ((e.metaKey || e.ctrlKey) && e.key === "k") {
		e.preventDefault();
		const searchInput = document.querySelector(
			'input[type="text"]',
		) as HTMLInputElement;
		searchInput?.focus();
	}
	// Cmd/Ctrl + , to toggle settings
	if ((e.metaKey || e.ctrlKey) && e.key === ",") {
		e.preventDefault();
		toggleDialog('settings');
	}
	// Ctrl + / to toggle shortcuts
	if ((e.metaKey || e.ctrlKey) && e.key === "/") {
		e.preventDefault();
		toggleDialog('shortcuts');
	}
	// Cmd + \ to toggle dark mode
	if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
		e.preventDefault();
		toggleDarkMode();
	}
	// / to focus search
	if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
		e.preventDefault();
		const searchInput = document.querySelector(
			'input[type="text"]',
		) as HTMLInputElement;
		searchInput?.focus();
	}
	// j/k for next/previous tweet
	if (e.key === "j" || e.key === "k") {
		e.preventDefault();
		if (selectedTweetIndex.value === -1 && results.value.length > 0) {
			// If no tweet selected, select first one
			selectedTweetIndex.value = 0;
		} else {
			selectedTweetIndex.value = Math.max(
				0,
				Math.min(
					selectedTweetIndex.value + (e.key === "j" ? 1 : -1),
					results.value.length - 1
				)
			);
		}
		document.querySelectorAll('a[href^="https://x.com"]')[selectedTweetIndex.value]?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
		});
	}
	// Esc to close dialog
	if (e.key === "Escape") {
		currentDialog.value = null;
	}
	// Space for page down (if no dialog is open)
	if (e.key === " " && !currentDialog.value) {
		e.preventDefault();
		window.scrollBy({
			top: window.innerHeight * 0.8,
			behavior: 'smooth',
		});
	}
	// Enter to open selected tweet
	if (e.key === "Enter" && selectedTweetIndex.value !== -1) {
		e.preventDefault();
		const tweetUrl = `https://x.com/${results.value[selectedTweetIndex.value].username}/status/${results.value[selectedTweetIndex.value].id}`;
		window.open(tweetUrl, '_blank');
	}
}

export function App() {
	useEffect(() => {
		handleSearch(); // Initial search

		document.addEventListener("keydown", handleKeyDownStable);
		return () => document.removeEventListener("keydown", handleKeyDownStable);
	}, []);

	return (
		<div 
			class="min-h-screen bg-white dark:bg-gray-900 transition-colors theme-transition dark:text-white"
		>
			<ThemeToggle />
			<div class="max-w-[600px] mx-auto">
				<div class="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-3 border-b border-gray-100 dark:border-gray-800 shadow-sm">
					<div class="flex items-center justify-between mb-4">
						<h1 class="text-xl font-bold">Vibes Search</h1>
						<div class="flex items-center gap-2">
							<button
								onClick={() => currentDialog.value = 'shortcuts'}
								class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
								title="Keyboard Shortcuts (⌘/)"
							>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.02.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
									<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
								</svg>
							</button>
							<button
								onClick={() => currentDialog.value = 'settings'}
								class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
								title="Search Settings (⌘,)"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="w-5 h-5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
							</button>
						</div>
					</div>
					<Input />
				</div>

				<div class="divide-y divide-gray-100 dark:divide-gray-800">
					<Results />
				</div>
			</div>
			<SettingsDialog />
			<KeyboardShortcutsDialog />
		</div>
	);
}