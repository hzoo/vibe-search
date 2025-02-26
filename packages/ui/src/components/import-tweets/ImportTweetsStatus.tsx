import { importStatus, currentDialog, selectedUser, handleSearch } from "@/ui/src/store/signals";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// Helper function to format time in a human-readable way
function formatElapsedTime(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60000);
	const seconds = Math.floor((ms % 60000) / 1000);
	return `${minutes}m ${seconds}s`;
}

export function ImportTweetsStatus() {
	if (!importStatus.value) return null;

	// Track elapsed time
	const elapsedTime = useSignal(0);
	const estimatedTimeRemaining = useSignal<number | null>(null);
	const processingRate = useSignal<number | null>(null);

	// Update elapsed time every second
	useEffect(() => {
		if (importStatus.value?.status !== "processing") return;
		
		const interval = setInterval(() => {
			if (!importStatus.value) return;
			
			const currentTime = Date.now();
			const startTime = importStatus.value.startTime;
			elapsedTime.value = currentTime - startTime;
			
			// Calculate processing rate (items per second)
			if (importStatus.value.progress > 0) {
				processingRate.value = importStatus.value.progress / (elapsedTime.value / 1000);
				
				// Calculate estimated time remaining
				if (processingRate.value > 0) {
					const remainingItems = importStatus.value.total - importStatus.value.progress;
					estimatedTimeRemaining.value = (remainingItems / processingRate.value) * 1000;
				}
			}
		}, 1000);
		
		return () => clearInterval(interval);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Empty dependency array is fine here since we're using signals that don't need to be in deps

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
					<div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
						<span>
							{importStatus.value.progress} /{" "}
							{importStatus.value.total} tweets
						</span>
						<span>
							{processingRate.value ? `${processingRate.value.toFixed(1)} tweets/sec` : ""}
						</span>
					</div>
					
					<div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
						<span>
							Elapsed: {formatElapsedTime(elapsedTime.value)}
						</span>
						{estimatedTimeRemaining.value && estimatedTimeRemaining.value > 0 && (
							<span>
								Est. remaining: {formatElapsedTime(estimatedTimeRemaining.value)}
							</span>
						)}
					</div>
				</div>
			)}

			{importStatus.value.status === "completed" && (
				<div class="mt-3">
					<p class="text-green-500 dark:text-green-400 text-sm mb-2">
						Successfully imported {importStatus.value.total} tweets!
					</p>
					{importStatus.value.endTime && importStatus.value.startTime && (
						<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
							Total time: {formatElapsedTime(importStatus.value.endTime - importStatus.value.startTime)}
						</p>
					)}
					{importStatus.value.performanceMetrics && (
						<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
							Performance: {importStatus.value.performanceMetrics.tweetsPerSecond.toFixed(1)} tweets/sec
						</p>
					)}
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