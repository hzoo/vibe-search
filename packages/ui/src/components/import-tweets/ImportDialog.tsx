import { useEffect } from "preact/hooks";
import { effect, useSignal } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import {
	currentDialog,
	importLoading,
	importError,
	importStatus,
	importHistory,
	twitterUsers,
} from "@/ui/src/store/signals";
import { fetchTwitterUsers } from "@/ui/src/store/userCache";
import { ImportTweetsHeader } from "@/ui/src/components/import-tweets/ImportTweetsHeader";
import { ImportTweetsStatus } from "@/ui/src/components/import-tweets/ImportTweetsStatus";
import { ImportUsernameMode } from "@/ui/src/components/import-tweets/ImportUsernameMode";
import { ImportFileMode } from "@/ui/src/components/import-tweets/ImportFileMode";
import { usernameInput, isMinimized } from "@/ui/src/components/import-tweets/importSignals";

function ImportTweetsLoadingStatusBar() {
	// Add signals for tracking time and performance
	const elapsedTime = useSignal(0);
	const estimatedTimeRemaining = useSignal(0);
	const processingRate = useSignal(0);

	// Update elapsed time and estimates every second
	useEffect(() => {
		if (!importStatus.value || importStatus.value.status !== "processing")
			return;

		// Calculate initial elapsed time
		const startTime = importStatus.value.startTime;
		elapsedTime.value = Math.floor((Date.now() - startTime) / 1000);

		const interval = setInterval(() => {
			// Update elapsed time
			if (!importStatus.value) return;

			elapsedTime.value = Math.floor((Date.now() - startTime) / 1000);

			// Calculate processing rate (tweets per second)
			if (elapsedTime.value > 0 && importStatus.value) {
				processingRate.value = importStatus.value.progress / elapsedTime.value;
			}

			// Calculate estimated time remaining
			if (processingRate.value > 0 && importStatus.value) {
				const remainingTweets =
					importStatus.value.total - importStatus.value.progress;
				estimatedTimeRemaining.value = Math.floor(
					remainingTweets / processingRate.value,
				);
			}
		}, 1000);

		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [importStatus.value, elapsedTime, estimatedTimeRemaining, processingRate]);

	// Format time as mm:ss or hh:mm:ss
	const formatTime = (secondsInput: number) => {
		const seconds = secondsInput < 0 ? 0 : secondsInput;
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
		}
		return `${minutes}:${secs.toString().padStart(2, "0")}`;
	};

	if (
		isMinimized.value &&
		importLoading.value &&
		importStatus.value?.status === "processing"
	) {
		// Calculate progress percentage
		const progressPercent =
			importStatus.value.total > 0
				? (importStatus.value.progress / importStatus.value.total) * 100
				: 0;

		return (
			<div className="p-2">
				<div className="space-y-1">
					<div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
						<div
							className="bg-blue-600 h-2 rounded-full transition-all duration-300"
							style={{
								width: `${progressPercent}%`,
							}}
						/>
					</div>
					<div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
						<span>
							{importStatus.value.progress} / {importStatus.value.total} tweets
							({progressPercent.toFixed(1)}%)
						</span>
						<span>
							{processingRate.value > 0 && (
								<>{processingRate.value.toFixed(1)} tweets/sec</>
							)}
						</span>
					</div>
					<div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
						<span>Elapsed: {formatTime(elapsedTime.value)}</span>
						{estimatedTimeRemaining.value > 0 && (
							<span>
								Remaining: ~{formatTime(estimatedTimeRemaining.value)}
							</span>
						)}
					</div>
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

	const importMode = useSignal<"username" | "file">("username");
	const showUserDropdown = useSignal(false);

	// Check import history when username changes
	useSignalEffect(() => {
		// Don't check if username is empty
		if (!usernameInput.value.trim()) {
			importHistory.value = null;
			return;
		}

		// debouncedChecks(usernameInput.value.trim());
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
	}, [showUserDropdown.value]);

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
									<ImportUsernameMode/>
								) : (
									<ImportFileMode />
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
