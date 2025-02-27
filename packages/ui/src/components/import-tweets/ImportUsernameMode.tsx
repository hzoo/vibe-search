import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import {
	importUrl,
	importLoading,
	importError,
	importStatus,
	importHistory,
	selectedUser,
	handleSearch,
	twitterUsers,
	twitterUsersLoading,
} from "@/ui/src/store/signals";
import { formatDate } from "@/ui/src/utils/textUtils";
import {
	fetchTwitterUsers,
	searchTwitterUsers,
} from "@/ui/src/store/userCache";
import type { TwitterUser } from "@/ui/src/store/userCache";
import { existingArchives, checkArchives, formatFileSize, checkImportHistory, usernameInput } from "@/ui/src/components/import-tweets/importSignals";
import { saveArchive } from "@/ui/src/components/import-tweets/importSignals";
import { SpinnerIcon, UserIcon, ChevronDownIcon, InfoIcon } from "@/ui/src/components/Icons";
import { signal } from "@preact/signals";

interface ArchiveInfo {
	filename: string;
	size: number;
	created: string;
}

// Add a signal to store the performance metrics
const performanceMetrics = signal<{
	averageTweetsPerSecond: number;
	lastUpdated: string;
} | null>(null);

// Function to fetch performance metrics from the server
async function fetchPerformanceMetrics() {
	try {
		// Use the correct endpoint that matches the server implementation
		const response = await fetch(`${importUrl}/performance`);
		if (response.ok) {
			const data = await response.json();
			performanceMetrics.value = data;
			console.log("Loaded performance metrics:", data);
		} else {
			console.log("Failed to load performance metrics, status:", response.status);
		}
	} catch (error) {
		console.error("Failed to fetch performance metrics:", error);
	}
}

function UserDropdownItem({ user, index }: { user: TwitterUser, index: number }) {
	return (<button
		key={user.username}
		id={`user-item-${index}`}
		className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${selectedIndex.value === index ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500" : ""}`}
		onClick={() => {
			usernameInput.value = user.username;
			showUserDropdown.value = false;
			checkArchives(usernameInput.value);
			checkImportHistory(usernameInput.value);
		}}
		aria-selected={
			selectedIndex.value === index
		}
	>
		<div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 mr-2 flex items-center justify-center overflow-hidden">
			<UserIcon className="w-4 h-4 text-gray-500" />
		</div>
		<div className="min-w-0 flex-1">
			<div className="flex items-center">
				<span className="font-medium truncate">
					{user.account_display_name ||
						user.username}
				</span>
				<span className="ml-1 text-gray-500 dark:text-gray-400 truncate">
					@{user.username}
				</span>
			</div>
			{user.num_tweets && (
				<div className="text-xs text-gray-500 dark:text-gray-400">
					{user.num_tweets.toLocaleString()}{" "}
					tweets (
					{user.num_followers?.toLocaleString() || 0}{" "}
					followers)
				</div>
			)}
		</div>
	</button>)
}

const selectedIndex = signal(-1);
const showUserDropdown = signal(false);

export function ImportUsernameMode() {
	const userSearchQuery = useSignal("");
	const filteredUsers = useSignal<TwitterUser[]>([]);
	const forceImport = useSignal(false);
	const forceDownload = useSignal(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Filter users when search query changes
	useSignalEffect(() => {
		if (userSearchQuery.value.trim()) {
			filteredUsers.value = searchTwitterUsers(userSearchQuery.value) as TwitterUser[];
		} else {
			filteredUsers.value = twitterUsers.value.slice(0, 25) as TwitterUser[]; // Limit to first 25 users
		}
	});

	// Fetch Twitter users when dropdown is opened
	useEffect(() => {
		if (showUserDropdown.value && twitterUsers.value.length === 0) {
			fetchTwitterUsers();
		}

		// Reset selected index when dropdown opens/closes
		selectedIndex.value = -1;
	}, [showUserDropdown.value, selectedIndex]);

	// Close dropdown when clicking outside
	useEffect(() => {
		// function handleClickOutside(e: MouseEvent) {
		// 	const target = e.target as HTMLElement;
		// 	if (
		// 		!target.closest(".user-dropdown-container") &&
		// 		!target.closest(".username-input")
		// 	) {
		// 		showUserDropdown.value = false;
		// 	}
		// }

		// Close on escape key
		function handleEscKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				showUserDropdown.value = false;
			}
		}

		// document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscKey);

		return () => {
			// document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscKey);
		};
	}, [showUserDropdown]);

	const handleKeyDown = (e: KeyboardEvent) => {
		if (!showUserDropdown.value) return;

		const userCount = filteredUsers.value.length;
		if (userCount === 0) return;

		// Arrow down
		if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedIndex.value = (selectedIndex.value + 1) % userCount;
		}
		// Arrow up
		else if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedIndex.value =
				selectedIndex.value <= 0 ? userCount - 1 : selectedIndex.value - 1;
		}
		// Enter
		else if (e.key === "Enter") {
			e.preventDefault();

			// If there's only one user in the dropdown, select it regardless of selectedIndex
			if (userCount === 1) {
				usernameInput.value = filteredUsers.value[0].username;
				showUserDropdown.value = false;
				selectedIndex.value = -1;
				checkArchives(usernameInput.value);
				checkImportHistory(usernameInput.value);
				return;
			}

			// Otherwise, select the highlighted user if any
			if (selectedIndex.value >= 0) {
				const selectedUser = filteredUsers.value[selectedIndex.value];
				if (selectedUser) {
					usernameInput.value = selectedUser.username;
					showUserDropdown.value = false;
					selectedIndex.value = -1;
				}
			}
		}
	};

	const handleImport = async () => {
		if (!usernameInput.value.trim()) {
			importError.value = "Please enter a username";
			return;
		}

		importLoading.value = true;
		importError.value = null;
		importStatus.value = null;

		try {
			const response = await fetch(`${importUrl}/username`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					username: usernameInput.value.trim(),
					force: forceImport.value,
					saveArchive: saveArchive.value,
					forceDownload: forceDownload.value
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.error || `Import failed: ${response.status} ${response.statusText}`
				);
			}

			const data = await response.json();
			
			if (data.importId) {
				// Start polling for status
				pollImportStatus(data.importId);
			} else {
				importError.value = "No import ID returned";
				importLoading.value = false;
			}
		} catch (err) {
			importError.value = err instanceof Error ? err.message : String(err);
			importLoading.value = false;
		}
	};

	// Poll for import status
	const pollImportStatus = async (importId: string) => {
		const checkStatus = async () => {
			try {
				const response = await fetch(`${importUrl}?id=${importId}`);

				if (!response.ok) {
					throw new Error(`Failed to get import status: ${response.status}`);
				}

				const status = await response.json();
				importStatus.value = status;

				// Continue polling if not completed or failed
				if (status.status !== "completed" && status.status !== "failed") {
					setTimeout(checkStatus, 2000);
				} else {
					importLoading.value = false;
					// If completed successfully, refresh search results
					if (status.status === "completed") {
						// If we know the username, set it as the selected user
						if (status.username && status.username !== "unknown") {
							selectedUser.value = status.username;
						}
						handleSearch();
					}
				}
			} catch (err) {
				importError.value = err instanceof Error ? err.message : String(err);
				importLoading.value = false;
			}
		};

		// Start checking
		checkStatus();
	};

	// focus
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.focus();
		}
	}, []);

	// In the ImportUsernameMode component, add a useEffect to fetch performance metrics
	useEffect(() => {
		// Fetch performance metrics when the component mounts
		fetchPerformanceMetrics();
	}, []);

	return (
		<div className="space-y-3">
			<div>
				<label
					htmlFor="username-input"
					className="block text-sm font-medium mb-1"
				>
					Community Archive Username
				</label>
				<div className="relative flex flex-col">
					{showUserDropdown.value && (
						<div className="w-full bottom-full mb-1 max-h-[500px] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg user-dropdown-container">
							<div
								className="py-1"
								id="user-dropdown-list"
								tabIndex={-1}
							>
								{twitterUsersLoading.value &&
								twitterUsers.value.length === 0 ? (
									<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center">
										<SpinnerIcon className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" />
										Loading users...
									</div>
								) : filteredUsers.value.length > 0 ? (
									filteredUsers.value.map((user, index) => (
										<UserDropdownItem key={user.username} user={user} index={index} />
									))
								) : userSearchQuery.value ? (
									<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
										No users found
									</div>
								) : (
									<div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
										Type to search for users
									</div>
								)}
							</div>
						</div>
					)}
					<div className="relative">
						<input
							ref={inputRef}
							id="username-input"
							type="text"
							className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 username-input"
							placeholder="e.g. elonmusk"
							value={usernameInput.value}
							onInput={(e) => {
								const value = (e.target as HTMLInputElement)
									.value;
								usernameInput.value = value;
								userSearchQuery.value = value;
								// Show dropdown when input is empty or has content
								if (
									!showUserDropdown.value &&
									(value === "" || value.trim())
								) {
									showUserDropdown.value = true;
								}
							}}
							onFocus={() => (showUserDropdown.value = true)}
							onKeyDown={handleKeyDown}
							aria-expanded={showUserDropdown.value}
							aria-autocomplete="list"
							aria-controls={
								showUserDropdown.value
									? "user-dropdown-list"
									: undefined
							}
							aria-activedescendant={
								selectedIndex.value >= 0
									? `user-item-${selectedIndex.value}`
									: undefined
							}
						/>
						<button
							type="button"
							onClick={() =>
								(showUserDropdown.value = !showUserDropdown.value)
							}
							className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
						>
							<ChevronDownIcon className={`w-5 h-5 transition-transform ${showUserDropdown.value ? "rotate-180" : ""}`} />
						</button>
					</div>
				</div>
			</div>

			{importHistory.value && (
				<div className="text-xs border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md">
					<p className="font-medium text-blue-800 dark:text-blue-300">
						Previous import found
					</p>
					<p>
						Last imported:{" "}
						{formatDate(importHistory.value.lastImportDate)}
					</p>
					<p>
						Latest tweet:{" "}
						{formatDate(importHistory.value.lastTweetDate)}
					</p>
					<p>Total tweets: {importHistory.value.tweetCount}</p>
					<p className="mt-1">
						Only tweets newer than the latest tweet date will be
						imported.
					</p>
					
					{/* Import time estimate inside the blue section */}
					{performanceMetrics.value && (
						<div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
							<p className="font-medium text-blue-800 dark:text-blue-300">
								Import time estimate
							</p>
							<p>
								Processing speed: ~{performanceMetrics.value.averageTweetsPerSecond.toFixed(1)} tweets/sec
							</p>
						</div>
					)}
				</div>
			)}

			{existingArchives.value?.exists && (
				<div className="text-xs border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 p-3 rounded-md">
					<p className="font-medium text-green-800 dark:text-green-300">
						{existingArchives.value.archives.length} saved{" "}
						{existingArchives.value.archives.length === 1
							? "archive"
							: "archives"}{" "}
						found
					</p>
					<div className="mt-1 max-h-24 overflow-y-auto">
						{existingArchives.value.archives.map((archive: ArchiveInfo) => (
							<div
								key={`${archive.filename}-${archive.created}`}
								className="mb-1 pb-1 border-b border-green-100 dark:border-green-800 last:border-0"
							>
								<p className="text-green-700 dark:text-green-400">
									{archive.filename}
								</p>
								<p className="text-green-600 dark:text-green-500">
									Size: {formatFileSize(archive.size)} • Created:{" "}
									{formatDate(archive.created)}
								</p>
							</div>
						))}
					</div>
					<p className="mt-2 text-green-700 dark:text-green-400 font-medium">
						This archive will be used automatically (no download needed)
					</p>
					
					{/* Import time estimate inside the green section */}
					{performanceMetrics.value && !importHistory.value && (
						<div className="mt-2 pt-2 border-t border-green-200 dark:border-green-700">
							<p className="font-medium text-green-800 dark:text-green-300">
								Import time estimate
							</p>
							<p>
								Processing speed: ~{performanceMetrics.value.averageTweetsPerSecond.toFixed(1)} tweets/sec
							</p>
						</div>
					)}
				</div>
			)}

			{usernameInput.value.trim() &&
				!importHistory.value &&
				existingArchives.value?.exists === false && (
					<div className="text-xs text-gray-500 dark:text-gray-400">
						No previous import or saved archives found
					</div>
				)}

			<div className="flex items-center">
				<input
					type="checkbox"
					id="force-import"
					className="mr-2"
					checked={forceImport.value}
					onChange={(e) =>
						(forceImport.value = (
							e.target as HTMLInputElement
						).checked)
					}
				/>
				<label htmlFor="force-import" className="text-sm">
					Force import (ignore previous imports)
				</label>
			</div>

			{existingArchives.value?.exists && (
				<div className="flex items-center group relative">
					<input
						type="checkbox"
						id="force-download"
						className="mr-2"
						checked={forceDownload.value}
						onChange={(e) =>
							(forceDownload.value = (
								e.target as HTMLInputElement
							).checked)
						}
					/>
					<label
						htmlFor="force-download"
						className="text-sm flex items-center"
					>
						Force download fresh archive
						<InfoIcon className="w-4 h-4 ml-1 text-gray-500 group-hover:text-blue-500 transition-colors" />
					</label>
					<div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
						By default, existing archives are used. Check this to download a fresh archive instead.
					</div>
				</div>
			)}

			<div className="flex items-center group relative">
				<input
					type="checkbox"
					id="save-archive"
					className="mr-2"
					checked={saveArchive.value}
					onChange={(e) =>
						(saveArchive.value = (
							e.target as HTMLInputElement
						).checked)
					}
					disabled={existingArchives.value?.exists && !forceDownload.value}
				/>
				<label
					htmlFor="save-archive"
					className={`text-sm flex items-center ${existingArchives.value?.exists && !forceDownload.value ? 'text-gray-400 dark:text-gray-600' : ''}`}
				>
					Save archive to disk
					<InfoIcon className="w-4 h-4 ml-1 text-gray-500 group-hover:text-blue-500 transition-colors" />
				</label>
				<div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
					{existingArchives.value?.exists && !forceDownload.value
						? "Not needed - already using a saved archive"
						: existingArchives.value?.exists 
							? "Only applies when downloading a fresh archive" 
							: "Archives are saved to:"} {" "}
					{!existingArchives.value?.exists || forceDownload.value ? (
						<code className="bg-gray-800 px-1 py-0.5 rounded">
							packages/server/archives/username_timestamp.json
						</code>
					) : null}
				</div>
			</div>

			<button
				className="w-full px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
				onClick={handleImport}
				disabled={
					!usernameInput.value.trim() || importLoading.value
				}
			>
				Import Tweets
			</button>
		</div>
	);
} 