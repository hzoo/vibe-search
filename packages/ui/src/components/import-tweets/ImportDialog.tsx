import { useEffect } from "preact/hooks";
import { effect, signal, useSignal } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import {
	currentDialog,
	importUrl,
	importLoading,
	importError,
	importStatus,
	importHistory,
	twitterUsers,
} from "@/ui/src/store/signals";
import { debounce } from "@/ui/src/utils";
import {
	fetchTwitterUsers,
	searchTwitterUsers,
} from "@/ui/src/store/twitterUsers";
import type { TwitterUser } from "@/ui/src/store/twitterUsers";
import { ImportTweetsHeader } from "@/ui/src/components/import-tweets/ImportTweetsHeader";
import { ImportTweetsStatus } from "@/ui/src/components/import-tweets/ImportTweetsStatus";
import { ImportUsernameMode } from "@/ui/src/components/import-tweets/ImportUsernameMode";
import { ImportFileMode } from "@/ui/src/components/import-tweets/ImportFileMode";

// Interface for archive information
interface ArchiveInfo {
	filename: string;
	size: number;
	created: string;
}

export interface ArchivesResponse {
	exists: boolean;
	archives: ArchiveInfo[];
}

export async function checkImportHistory(username: string) {
	try {
		const response = await fetch(
			`${importUrl}/history?username=${encodeURIComponent(username)}`,
		);

		if (response.ok) {
			const data = await response.json();
			if (data.lastImportDate) {
				importHistory.value = data;
			} else {
				importHistory.value = null;
			}
		} else {
			importHistory.value = null;
		}
	} catch (err) {
		console.error("Error checking import history:", err);
		importHistory.value = null;
	}
}

// Function to check if archives exist for a username
export async function checkArchives(
	username: string,
): Promise<ArchivesResponse | null> {
	try {
		const response = await fetch(
			`${importUrl.replace("/import", "/archives")}?username=${encodeURIComponent(username)}`,
		);

		if (response.ok) {
			return await response.json();
		}
	} catch (err) {
		console.error("Error checking archives:", err);
	}
	return null;
}

export const existingArchives = signal<ArchivesResponse | null>(null);
export const isMinimized = signal(false);

export const debouncedChecks = debounce(async (username: string) => {
	await checkImportHistory(username);
}, 600);

// Helper function to format file size
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function ImportTweetsLoadingStatusBar() {
	if (
		isMinimized.value &&
		importLoading.value &&
		importStatus.value?.status === "processing"
	) {
		return (
			<div className="p-2">
				<div className="space-y-1">
					<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
						<div
							className="bg-blue-600 h-2 rounded-full transition-all duration-300"
							style={{
								width: `${importStatus.value.total > 0 ? (importStatus.value.progress / importStatus.value.total) * 100 : 0}%`,
							}}
						/>
					</div>
					<p className="text-xs text-gray-500 dark:text-gray-400">
						{importStatus.value.progress} / {importStatus.value.total} tweets
					</p>
				</div>
			</div>
		);
	}
	return null;
}

// When importing, automatically minimize
effect(() => {
	if (importLoading.value && importStatus.value) {
		isMinimized.value = true;
	}
});

export function ImportDialog() {
	if (currentDialog.value !== "import") return null;

	const usernameInput = useSignal("");
	const importMode = useSignal<"username" | "file">("username");
	const forceImport = useSignal(false);
	const saveArchive = useSignal(false);
	const showUserDropdown = useSignal(false);
	const userSearchQuery = useSignal("");
	const filteredUsers = useSignal<TwitterUser[]>([]);

	// Check import history when username changes
	useSignalEffect(() => {
		// Don't check if username is empty
		if (!usernameInput.value.trim()) {
			importHistory.value = null;
			existingArchives.value = null;
			return;
		}

		debouncedChecks(usernameInput.value.trim());
	});

	// Filter users when search query changes
	useSignalEffect(() => {
		if (userSearchQuery.value.trim()) {
			filteredUsers.value = searchTwitterUsers(userSearchQuery.value);
		} else {
			filteredUsers.value = twitterUsers.value.slice(0, 25); // Limit to first 50 users
		}
	});

	// Handle keyboard navigation in dropdown
	const selectedIndex = useSignal(-1);

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

	return (
		<div className="fixed bottom-4 right-4 z-50 flex flex-col w-[450px] max-w-[90vw]">
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
				<ImportTweetsHeader />
				{/* Content area - only show if not minimized */}
				{!isMinimized.value && (
					<div className="p-4">
						{importLoading.value && importStatus.value ? (
							<ImportTweetsStatus />
						) : (
							<div className="space-y-3">
								<div className="flex space-x-2">
									<button
										className={`px-3 py-1.5 text-sm rounded-md ${
											importMode.value === "username"
												? "bg-blue-500 text-white"
												: "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
										}`}
										onClick={() => (importMode.value = "username")}
									>
										By Username
									</button>
									<button
										className={`px-3 py-1.5 text-sm rounded-md ${
											importMode.value === "file"
												? "bg-blue-500 text-white"
												: "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
										}`}
										onClick={() => (importMode.value = "file")}
									>
										Upload File
									</button>
								</div>

								{importMode.value === "username" ? (
									<ImportUsernameMode 
										usernameInput={usernameInput} 
										forceImport={forceImport} 
										saveArchive={saveArchive} 
									/>
								) : (
									<ImportFileMode saveArchive={saveArchive} />
								)}

								{importError.value && (
									<div className="text-red-500 text-xs mt-1">
										{importError.value}
									</div>
								)}
							</div>
						)}
					</div>
				)}

				<ImportTweetsLoadingStatusBar />
			</div>
		</div>
	);
}
