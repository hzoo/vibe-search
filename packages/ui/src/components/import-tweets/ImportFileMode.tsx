import { useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
	importUrl,
	importLoading,
	importError,
	importStatus,
	selectedUser,
	handleSearch,
	currentDialog,
} from "@/ui/src/store/signals";
import { saveArchive } from "@/ui/src/components/import-tweets/importSignals";
import { ImportIcon, InfoIcon } from "@/ui/src/components/Icons";
import { debounce } from "@/ui/src/utils";
import { checkArchives, checkImportHistory, checkingArchives, existingArchives } from "@/ui/src/components/import-tweets/importSignals";

// Define the local import URL
const localImportUrl = `${importUrl}/local`;

const debouncedCheck = debounce(async (username: string) => {
	await checkArchives(username);
	await checkImportHistory(username);
}, 700);

export function ImportFileMode() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dragActive = useSignal(false);
	const isTwitterArchive = useSignal(false);
	const customUsername = useSignal("");
	const selectedFile = useSignal<File | null>(null);
	const localFilePath = useSignal<string>("");
	const useLocalPath = useSignal<boolean>(false);

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
			const file = e.dataTransfer.files[0];
			// Check if it's a zip file (likely a Twitter archive)
			if (file.name.toLowerCase().endsWith('.zip')) {
				isTwitterArchive.value = true;
			} else {
				isTwitterArchive.value = false;
			}
			selectedFile.value = file;
			
			// Try to get the local file path from the file object
			try {
				// @ts-ignore - This is a non-standard property but works in some browsers
				if (file.path) {
					// @ts-ignore
					localFilePath.value = file.path;
				}
			} catch (e) {
				console.log("Could not get local file path:", e);
			}
		}
	};

	const handleFileChange = (e: Event) => {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const file = target.files[0];
			// Check if it's a zip file (likely a Twitter archive)
			if (file.name.toLowerCase().endsWith('.zip')) {
				isTwitterArchive.value = true;
			} else {
				isTwitterArchive.value = false;
			}
			selectedFile.value = file;
			
			// Try to get the local file path from the file object
			try {
				// @ts-ignore - This is a non-standard property but works in some browsers
				if (file.path) {
					// @ts-ignore
					localFilePath.value = file.path;
				}
			} catch (e) {
				console.log("Could not get local file path:", e);
			}
		}
	};

	const handleSelectFileClick = () => {
		fileInputRef.current?.click();
	};

	const handleUsernameChange = (username: string) => {
		customUsername.value = username;
		
		if (isTwitterArchive.value) {
			debouncedCheck(username);
		}
	};

	// Handle file upload for import
	const handleFileUpload = async () => {
		// If we're using a local file path without a selected file
		if (useLocalPath.value && localFilePath.value && !selectedFile.value) {
			importLoading.value = true;
			importError.value = null;
			
			try {
				console.log("Using local file path only:", localFilePath.value);
				
				// Determine if it's a Twitter archive based on file extension
				const isZipFile = localFilePath.value.toLowerCase().endsWith('.zip');
				if (isZipFile) {
					isTwitterArchive.value = true;
				}
				
				interface ImportPayload {
					filePath: string;
					saveArchive: boolean;
					isTwitterArchive: boolean;
					username?: string;
					force?: boolean;
				}
				
				const payload: ImportPayload = {
					filePath: localFilePath.value,
					saveArchive: saveArchive.value,
					isTwitterArchive: isTwitterArchive.value,
				};
				
				// Add custom username if provided for Twitter archives
				if (isTwitterArchive.value && customUsername.value.trim()) {
					payload.username = customUsername.value.trim();
				}
				
				console.log("Sending local import request:", payload);
				
				try {
					const response = await fetch(localImportUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(payload),
					});
					
					console.log("Response status:", response.status, response.statusText);
					
					if (!response.ok) {
						const errorText = await response.text();
						console.error("Server error response:", errorText);
						throw new Error(
							`Import failed: ${response.status} ${response.statusText} - ${errorText}`,
						);
					}
					
					const data = await response.json();
					console.log("Response data:", data);
					
					if (data.importId) {
						// Start polling for status
						pollImportStatus(data.importId);
					} else {
						throw new Error("No import ID returned from server");
					}
				} catch (fetchError: unknown) {
					console.error("Fetch error:", fetchError);
					
					// Check for specific network error
					const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
					if (errorMessage.includes("NetworkError") || errorMessage.includes("Failed to fetch")) {
						throw new Error(
							"Network error: The server might be down. Please check that the server is running."
						);
					}
					
					throw new Error(`Network error: ${errorMessage}`);
				}
				
				return;
			} catch (err) {
				console.error("Import error:", err);
				importError.value = err instanceof Error ? err.message : String(err);
				importLoading.value = false;
				return;
			}
		}
		
		// Regular file upload flow
		if (!selectedFile.value && !useLocalPath.value) return;

		importLoading.value = true;
		importError.value = null;

		try {
			// If we have a local file path, use the local import endpoint
			if (localFilePath.value) {
				console.log("Using local file import with path:", localFilePath.value);
				
				interface ImportPayload {
					filePath: string;
					saveArchive: boolean;
					isTwitterArchive: boolean;
					username?: string;
					force?: boolean;
				}
				
				const payload: ImportPayload = {
					filePath: localFilePath.value,
					saveArchive: saveArchive.value,
					isTwitterArchive: isTwitterArchive.value,
				};
				
				// Add custom username if provided for Twitter archives
				if (isTwitterArchive.value && customUsername.value.trim()) {
					payload.username = customUsername.value.trim();
				}
				
				console.log("Sending local import request:", payload);
				
				try {
					const response = await fetch(localImportUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(payload),
					});
					
					console.log("Response status:", response.status, response.statusText);
					
					if (!response.ok) {
						const errorText = await response.text();
						console.error("Server error response:", errorText);
						throw new Error(
							`Import failed: ${response.status} ${response.statusText} - ${errorText}`,
						);
					}
					
					const data = await response.json();
					console.log("Response data:", data);
					
					if (data.importId) {
						// Start polling for status
						pollImportStatus(data.importId);
					} else {
						throw new Error("No import ID returned from server");
					}
				} catch (fetchError: unknown) {
					console.error("Fetch error:", fetchError);
					
					// Check for specific network error
					const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
					if (errorMessage.includes("NetworkError") || errorMessage.includes("Failed to fetch")) {
						throw new Error(
							"Network error: The server might be down. Please check that the server is running."
						);
					}
					
					throw new Error(`Network error: ${errorMessage}`);
				}
			} else {
				// Fall back to form data upload if we don't have a local file path
				console.log("Falling back to form data upload");
				
				const formData = new FormData();
				formData.append("file", selectedFile.value!);
				formData.append("saveArchive", saveArchive.value.toString());
				
				// Add Twitter archive flag if it's a zip file
				if (selectedFile.value!.name.toLowerCase().endsWith('.zip')) {
					formData.append("isTwitterArchive", "true");
					// Add custom username if provided
					if (customUsername.value.trim()) {
						formData.append("username", customUsername.value.trim());
					}
				}
				
				console.log("Sending request to:", importUrl);
				console.log("FormData entries:");
				for (const [key, value] of formData.entries()) {
					console.log(`- ${key}: ${value instanceof File ? `File(${value.name}, ${value.size} bytes)` : value}`);
				}
				
				try {
					// Create an AbortController with a timeout
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minute timeout
					
					const response = await fetch(importUrl, {
						method: "POST",
						body: formData,
						signal: controller.signal,
					});
					
					// Clear the timeout
					clearTimeout(timeoutId);
					
					console.log("Response status:", response.status, response.statusText);
					
					if (!response.ok) {
						const errorText = await response.text();
						console.error("Server error response:", errorText);
						throw new Error(
							`Import failed: ${response.status} ${response.statusText} - ${errorText}`,
						);
					}
					
					const data = await response.json();
					console.log("Response data:", data);
					
					if (data.importId) {
						// Start polling for status
						pollImportStatus(data.importId);
					} else {
						throw new Error("No import ID returned from server");
					}
				} catch (fetchError: unknown) {
					console.error("Fetch error:", fetchError);
					
					// Check for specific network error
					const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
					if (errorMessage.includes("NetworkError") || errorMessage.includes("Failed to fetch")) {
						throw new Error(
							"Network error: The server might be down or not configured to handle large files. " +
							"Please check that the server is running and try again with a smaller file or " +
							"increase the server's maxRequestBodySize limit."
						);
					}
					
					throw new Error(`Network error: ${errorMessage}`);
				}
			}
		} catch (err) {
			console.error("Import error:", err);
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

	const clearSelectedFile = () => {
		selectedFile.value = null;
		isTwitterArchive.value = false;
		customUsername.value = "";
		localFilePath.value = "";
		useLocalPath.value = false;
		existingArchives.value = { exists: false, archives: [] };
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	return (
		<div className="space-y-3">
			<p className="text-sm text-gray-600 dark:text-gray-300">
				You can obtain your Twitter archive by going to <a href="https://x.com/settings/download_your_data" className="text-blue-500 hover:text-blue-700">x.com/settings/download_your_data</a> and following the instructions to receive an email with the link.
			</p>

			<div className="flex items-center mb-4">
				<input
					type="checkbox"
					id="use-local-path"
					className="mr-2"
					checked={useLocalPath.value}
					onChange={(e) => (useLocalPath.value = (e.target as HTMLInputElement).checked)}
				/>
				<label htmlFor="use-local-path" className="text-sm font-medium">
					Use local file path directly (no upload required)
				</label>
			</div>

			{useLocalPath.value ? (
				<div className="space-y-3">
					<div>
						<label 
							htmlFor="file-path" 
							className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
						>
							Local file path <span className="text-red-500">*</span>
						</label>
						<input
							id="file-path"
							type="text"
							className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
							placeholder="e.g., /Users/username/Downloads/twitter-archive.zip"
							value={localFilePath.value}
							onChange={(e) => {
								localFilePath.value = (e.target as HTMLInputElement).value;
								// Auto-detect if it's a Twitter archive based on file extension
								if (localFilePath.value.toLowerCase().endsWith('.zip')) {
									isTwitterArchive.value = true;
								} else {
									isTwitterArchive.value = false;
								}
							}}
						/>
						<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
							Enter the full path to your file on the server. The server must have read access to this location.
						</p>
					</div>
				</div>
			) : (
				<>
					{!selectedFile.value ? (
						<button
							type="button"
							className={`w-full border-2 border-dashed rounded-lg p-6 text-center ${
								dragActive.value
									? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
									: "border-gray-300 dark:border-gray-700"
							} cursor-pointer`}
							onDragEnter={handleDrag}
							onDragOver={handleDrag}
							onDragLeave={handleDrag}
							onDrop={handleDrop}
							onClick={handleSelectFileClick}
						>
							<input
								ref={fileInputRef}
								type="file"
								accept=".json,.zip"
								className="hidden"
								onChange={handleFileChange}
							/>

							<ImportIcon className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />

							<p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
								<span className="font-semibold">Click to select</span> or
								drag and drop
							</p>
							<p className="text-xs text-gray-500 dark:text-gray-400">
								JSON or ZIP file (Twitter archive)
							</p>
						</button>
					) : (
						<div className="space-y-3">
							<div className="border rounded-lg p-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center">
										<ImportIcon className="w-6 h-6 text-blue-500 mr-2" />
										<div>
											<p className="font-medium">{selectedFile.value.name.length > 30 ? `${selectedFile.value.name.substring(0, 30)}...` : selectedFile.value.name}</p>
											<p className="text-xs text-gray-500">
												{(selectedFile.value.size / 1024 / 1024).toFixed(2)} MB
											</p>
										</div>
									</div>
									<button 
										onClick={clearSelectedFile}
										className="text-gray-500 hover:text-red-500"
										aria-label="Remove file"
									>
										×
									</button>
								</div>
							</div>
							
							<div>
								<label 
									htmlFor="file-path" 
									className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>
									Local file path (optional)
								</label>
								<input
									id="file-path"
									type="text"
									className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
									placeholder="e.g., /Users/username/Downloads/twitter-archive.zip"
									value={localFilePath.value}
									onChange={(e) => (localFilePath.value = (e.target as HTMLInputElement).value)}
								/>
								<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
									If provided, the server will read the file directly from this path instead of uploading it
								</p>
							</div>
						</div>
					)}
				</>
			)}

			{(isTwitterArchive.value || (useLocalPath.value && localFilePath.value.toLowerCase().endsWith('.zip'))) && (
				<div className="mt-3">
					<label 
						htmlFor="custom-username" 
						className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
					>
						Custom username for this archive (optional)
					</label>
					<input
						id="custom-username"
						type="text"
						className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						placeholder="e.g., my_twitter_handle"
						value={customUsername.value}
						onChange={(e) => handleUsernameChange((e.target as HTMLInputElement).value)}
					/>
					<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
						This will be used to identify your tweets in the search results
					</p>
					
					{checkingArchives.value && (
						<p className="mt-1 text-xs text-blue-500">
							Checking for existing archives...
						</p>
					)}
					
					{!checkingArchives.value && existingArchives.value && existingArchives.value.exists && (
						<div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
							<p className="text-xs text-yellow-700 dark:text-yellow-300">
								Found {existingArchives.value.archives.length} existing archive(s) for this username. 
								Uploading will add to the existing data.
							</p>
						</div>
					)}
				</div>
			)}

			<div className="flex items-center group relative">
				<input
					type="checkbox"
					id="save-archive-file"
					className="mr-2"
					checked={saveArchive.value}
					onChange={(e) =>
						(saveArchive.value = (
							e.target as HTMLInputElement
						).checked)
					}
				/>
				<label
					htmlFor="save-archive-file"
					className="text-sm flex items-center"
				>
					Save archive to disk
					<InfoIcon className="w-4 h-4 ml-1 text-gray-500 group-hover:text-blue-500 transition-colors" />
				</label>
				<div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
					Archives are saved to:{" "}
					<code className="bg-gray-800 px-1 py-0.5 rounded">
						packages/server/archives/filename_timestamp.json
					</code>
				</div>
			</div>

			<div className="flex justify-between">
				<button
					onClick={handleFileUpload}
					className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
					disabled={importLoading.value || (useLocalPath.value && !localFilePath.value) || (!useLocalPath.value && !selectedFile.value)}
				>
					{importLoading.value ? "Uploading..." : "Import File"}
				</button>

				<button
					onClick={() => (currentDialog.value = null)}
					className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
				>
					Cancel
				</button>
			</div>
		</div>
	);
} 