import { useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import {
	currentDialog,
	importUrl,
	importLoading,
	importError,
	importStatus,
	importHistory,
	selectedUser,
	handleSearch,
	deleteAllEmbeddings,
	deleteLoading,
} from "../store/signals";
import { formatDate } from "../utils/textUtils";
import { debounce } from "../utils";

async function checkImportHistory(username: string) {
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

const debouncedCheckHistory = debounce(async (username: string) => {
  await checkImportHistory(username);
}, 600)

export function ImportDialog() {
	if (currentDialog.value !== "import") return null;

	const fileInputRef = useRef<HTMLInputElement>(null);
	const dragActive = useSignal(false);
	const usernameInput = useSignal("");
	const importMode = useSignal<"username" | "file">("username");
	const forceImport = useSignal(false);
	const isMinimized = useSignal(false);

	// Check import history when username changes
	useSignalEffect(() => {
		// Don't check if username is empty
		if (!usernameInput.value.trim()) {
			importHistory.value = null;
			return;
		}

		debouncedCheckHistory(usernameInput.value.trim());
	});

	const handleDrag = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (e.type === "dragenter" || e.type === "dragover") {
			dragActive.value = true;
		} else if (e.type === "dragleave") {
			dragActive.value = false;
		}
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragActive.value = false;

		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			handleFileUpload(e.dataTransfer.files[0]);
		}
	};

	const handleFileChange = (e: Event) => {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			handleFileUpload(target.files[0]);
		}
	};

	const handleButtonClick = () => {
		fileInputRef.current?.click();
	};

	// Handle file upload for import
	const handleFileUpload = async (file: File) => {
		if (!file) return;

		importLoading.value = true;
		importError.value = null;

		try {
			const formData = new FormData();
			formData.append("file", file);

			const response = await fetch(importUrl, {
				method: "POST",
				body: formData,
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
						// Don't close the dialog automatically, let user close it
						// currentDialog.value = null;
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

	// When importing, automatically minimize
	useSignalEffect(() => {
		if (importLoading.value && importStatus.value) {
			isMinimized.value = true;
		}
	});

	return (
		<div
			class="fixed bottom-4 right-4 z-50 flex flex-col w-[500px] max-w-[90vw]"
		>
			<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
				{/* Header with title and controls */}
				<div class="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
					<h2 class="text-base font-bold flex items-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="w-5 h-5 mr-2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
							/>
						</svg>
						Import Tweets
					</h2>

					<div class="flex items-center space-x-1">
						{/* Minimize/Maximize button */}
						<button
							onClick={() => (isMinimized.value = !isMinimized.value)}
							class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
							title={isMinimized.value ? "Expand" : "Minimize"}
						>
							{isMinimized.value ? (
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
										d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
									/>
								</svg>
							) : (
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
										d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
									/>
								</svg>
							)}
						</button>

						{/* Delete button */}
						<button
							onClick={deleteAllEmbeddings}
							class="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
							title="Delete All Embeddings"
							disabled={deleteLoading.value}
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
									d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
								/>
							</svg>
						</button>

						{/* Close button */}
						<button
							onClick={() => (currentDialog.value = null)}
							class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
							title="Close"
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
					</div>
				</div>

				{/* Content area - only show if not minimized */}
				{!isMinimized.value && (
					<div class="p-4">
						{importLoading.value && importStatus.value ? (
							<div class="space-y-3">
								<div>
									<p class="mb-2 text-sm">
										{importStatus.value.status === "pending" &&
											"Preparing to import tweets..."}
										{importStatus.value.status === "processing" &&
											"Importing tweets..."}
										{importStatus.value.status === "completed" &&
											"Import completed!"}
										{importStatus.value.status === "failed" && "Import failed"}
									</p>

									{importStatus.value.status === "processing" && (
										<div class="space-y-1">
											<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
												<div
													class="bg-blue-600 h-2 rounded-full transition-all duration-300"
													style={{
														width: `${importStatus.value.total > 0 ? (importStatus.value.progress / importStatus.value.total) * 100 : 0}%`,
													}}
												/>
											</div>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												{importStatus.value.progress} / {importStatus.value.total}{" "}
												tweets
											</p>
										</div>
									)}

									{importStatus.value.status === "completed" && (
										<div class="mt-3">
											<p class="text-green-500 dark:text-green-400 text-sm mb-2">
												Successfully imported {importStatus.value.total} tweets!
											</p>
											<button
												onClick={() => {
													currentDialog.value = null;
													// If we know the username, set it as the selected user
													if (
														importStatus.value?.username &&
														importStatus.value.username !== "unknown"
													) {
														selectedUser.value = importStatus.value.username;
													}
													handleSearch();
												}}
												class="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
											>
												Close
											</button>
										</div>
									)}

									{importStatus.value.status === "failed" && (
										<div class="mt-3">
											<p class="text-red-500 dark:text-red-400 text-sm mb-2">
												{importStatus.value.error ||
													"An unknown error occurred during import."}
											</p>
											<button
												onClick={() => {
													currentDialog.value = null;
													importStatus.value = null;
												}}
												class="px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
											>
												Close
											</button>
										</div>
									)}
								</div>
							</div>
						) : (
							<div class="space-y-3">
								<div class="flex space-x-2">
									<button
										class={`px-3 py-1 text-sm rounded-md ${
											importMode.value === "username"
												? "bg-blue-500 text-white"
												: "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
										}`}
										onClick={() => (importMode.value = "username")}
									>
										By Username
									</button>
									<button
										class={`px-3 py-1 text-sm rounded-md ${
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
									<div class="space-y-3">
										<div>
											<label
												htmlFor="username-input"
												class="block text-sm font-medium mb-1"
											>
												Community Archive Username
											</label>
											<input
												id="username-input"
												type="text"
												class="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
												placeholder="e.g. elonmusk"
												value={usernameInput.value}
												onInput={(e) =>
													(usernameInput.value = (
														e.target as HTMLInputElement
													).value)
												}
											/>
										</div>

										{importHistory.value && (
											<div class="text-xs border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-md">
												<p class="font-medium text-blue-800 dark:text-blue-300">
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
												<p class="mt-1">
													Only tweets newer than the latest tweet date will be
													imported.
												</p>
											</div>
										)}

										{usernameInput.value.trim() && !importHistory.value && (
											<div class="mb-1 text-xs text-gray-500 dark:text-gray-400">
												no previous import found
											</div>
										)}

										<div class="flex items-center">
											<input
												type="checkbox"
												id="force-import"
												class="mr-2"
												checked={forceImport.value}
												onChange={(e) =>
													(forceImport.value = (
														e.target as HTMLInputElement
													).checked)
												}
											/>
											<label htmlFor="force-import" class="text-xs">
												Force import (ignore previous imports)
											</label>
										</div>

										<button
											class="w-full px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
											onClick={handleUsernameImport}
											disabled={!usernameInput.value.trim() || importLoading.value}
										>
											Import Tweets
										</button>
									</div>
								) : (
									<div class="space-y-3">
										<p class="text-xs text-gray-600 dark:text-gray-300">
											Upload your Twitter/X archive JSON file to import your tweets
											into the search database.
										</p>

										<div
											class={`border-2 border-dashed rounded-lg p-4 text-center ${
												dragActive.value
													? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
													: "border-gray-300 dark:border-gray-700"
											}`}
											onDragEnter={handleDrag}
											onDragOver={handleDrag}
											onDragLeave={handleDrag}
											onDrop={handleDrop}
										>
											<input
												ref={fileInputRef}
												type="file"
												accept=".json"
												class="hidden"
												onChange={handleFileChange}
											/>

											<svg
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
												stroke-width="1.5"
												stroke="currentColor"
												class="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
												/>
											</svg>

											<p class="mb-1 text-xs text-gray-500 dark:text-gray-400">
												<span class="font-semibold">Click to upload</span> or drag
												and drop
											</p>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												JSON file only
											</p>
										</div>

										<div class="flex justify-between">
											<button
												onClick={handleButtonClick}
												class="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
											>
												Select File
											</button>

											<button
												onClick={() => (currentDialog.value = null)}
												class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
											>
												Cancel
											</button>
										</div>
									</div>
								)}

								{importError.value && (
									<div class="text-red-500 text-xs mt-1">{importError.value}</div>
								)}
							</div>
						)}
					</div>
				)}

				{/* Minimized view - only show status bar when minimized and importing */}
				{isMinimized.value && importLoading.value && importStatus.value && importStatus.value.status === "processing" && (
					<div class="p-2">
						<div class="space-y-1">
							<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
								<div
									class="bg-blue-600 h-2 rounded-full transition-all duration-300"
									style={{
										width: `${importStatus.value.total > 0 ? (importStatus.value.progress / importStatus.value.total) * 100 : 0}%`,
									}}
								/>
							</div>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								{importStatus.value.progress} / {importStatus.value.total} tweets
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
