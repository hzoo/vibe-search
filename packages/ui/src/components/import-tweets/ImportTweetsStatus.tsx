import { importStatus, currentDialog, selectedUser, handleSearch } from "@/ui/src/store/signals";

export function ImportTweetsStatus() {
	if (!importStatus.value) return null;


	return (<div class="space-y-3">
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
						{importStatus.value.progress} /{" "}
						{importStatus.value.total} tweets
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
	</div>)
}