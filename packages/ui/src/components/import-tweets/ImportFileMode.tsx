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

export function ImportFileMode() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dragActive = useSignal(false);

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
			formData.append("saveArchive", saveArchive.value.toString());

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
			<p className="text-sm text-gray-600 dark:text-gray-300">
				Upload your Twitter/X archive JSON file to import your
				tweets into the search database.
			</p>

			<div
				className={`border-2 border-dashed rounded-lg p-6 text-center ${
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
					className="hidden"
					onChange={handleFileChange}
				/>

				<ImportIcon className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />

				<p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
					<span className="font-semibold">Click to upload</span> or
					drag and drop
				</p>
				<p className="text-xs text-gray-500 dark:text-gray-400">
					JSON file only
				</p>
			</div>

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
					onClick={handleButtonClick}
					className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
				>
					Select File
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