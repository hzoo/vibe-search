import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
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
import { existingArchives, checkArchives, formatFileSize, type ArchivesResponse } from "./ImportDialog";
import { saveArchive } from "@/ui/src/components/import-tweets/importSignals";

interface ArchiveInfo {
	filename: string;
	size: number;
	created: string;
}

interface ImportUsernameModeProps {
	usernameInput: { value: string };
}

export function ImportUsernameMode({ 
	usernameInput, 
}: ImportUsernameModeProps) {
	const showUserDropdown = useSignal(false);
	const userSearchQuery = useSignal("");
	const filteredUsers = useSignal<TwitterUser[]>([]);
	const selectedIndex = useSignal(-1);
	const forceImport = useSignal(false);

	// Filter users when search query changes
	useSignalEffect(() => {
		if (userSearchQuery.value.trim()) {
			filteredUsers.value = searchTwitterUsers(userSearchQuery.value);
		} else {
			filteredUsers.value = twitterUsers.value.slice(0, 25); // Limit to first 25 users
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
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as HTMLElement;
			if (
				!target.closest(".user-dropdown-container") &&
				!target.closest(".username-input")
			) {
				showUserDropdown.value = false;
			}
		}

		// Close on escape key
		function handleEscKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				showUserDropdown.value = false;
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscKey);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
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
				checkArchives(usernameInput.value.trim()).then((archives: ArchivesResponse | null) => {
					existingArchives.value = archives;
				});
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

	const handleUsernameImport = async () => {
		if (!usernameInput.value.trim()) return;

		importLoading.value = true;
		importError.value = null;

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
				}),
			});

			if (!response.ok) {
				throw new Error(
					`Import failed: ${response.status} ${response.statusText}`,
				);
			}

			const data = await response.json();

			if (data.importId) {
				// Start polling for status
				pollImportStatus(data.importId);
			} else {
				throw new Error("No import ID returned from server");
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
										<svg
											className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											/>
										</svg>
										Loading users...
									</div>
								) : filteredUsers.value.length > 0 ? (
									filteredUsers.value.map((user, index) => (
										<button
											key={user.username}
											id={`user-item-${index}`}
											className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${selectedIndex.value === index ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500" : ""}`}
											onClick={() => {
												usernameInput.value = user.username;
												showUserDropdown.value = false;
											}}
											aria-selected={
												selectedIndex.value === index
											}
										>
											<div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 mr-2 flex items-center justify-center overflow-hidden">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													fill="currentColor"
													className="w-4 h-4 text-gray-500"
												>
													<path
														fill-rule="evenodd"
														d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
														clip-rule="evenodd"
													/>
												</svg>
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
										</button>
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
							id="username-input"
							type="text"
							className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 username-input"
							placeholder="e.g. elonmusk"
							value={usernameInput.value}
							autofocus
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
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								className={`w-5 h-5 transition-transform ${showUserDropdown.value ? "rotate-180" : ""}`}
							>
								<path
									fill-rule="evenodd"
									d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
									clip-rule="evenodd"
								/>
							</svg>
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
				/>
				<label
					htmlFor="save-archive"
					className="text-sm flex items-center"
				>
					Save archive to disk
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						className="w-4 h-4 ml-1 text-gray-500 group-hover:text-blue-500 transition-colors"
					>
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
							clip-rule="evenodd"
						/>
					</svg>
				</label>
				<div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
					Archives are saved to:{" "}
					<code className="bg-gray-800 px-1 py-0.5 rounded">
						packages/server/archives/username_timestamp.json
					</code>
				</div>
			</div>

			<button
				className="w-full px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
				onClick={handleUsernameImport}
				disabled={
					!usernameInput.value.trim() || importLoading.value
				}
			>
				Import Tweets
			</button>
		</div>
	);
} 