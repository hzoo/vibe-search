import { currentDialog, deleteAllEmbeddings, deleteLoading } from "@/ui/src/store/signals";
import { isMinimized } from "@/ui/src/components/import-tweets/ImportDialog";
import { ImportIcon, MinimizeMaximizeIcon, TrashIcon, CloseIcon } from "@/ui/src/components/Icons";

export function ImportTweetsHeader() {
	return (
		<div class="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
			<h2 class="text-base font-medium flex items-center gap-2">
				<ImportIcon />
				Import Tweets
			</h2>

			<div class="flex items-center space-x-1">
				<button
					onClick={() => (isMinimized.value = !isMinimized.value)}
					class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
					title={isMinimized.value ? "Expand" : "Minimize"}
				>
					<MinimizeMaximizeIcon />
				</button>

				<button
					onClick={deleteAllEmbeddings}
					class="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
					title="Delete All Embeddings"
					disabled={deleteLoading.value}
				>
					<TrashIcon />
				</button>

				<button
					onClick={() => (currentDialog.value = null)}
					class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
					title="Close"
				>
					<CloseIcon />
				</button>
			</div>
		</div>
)
}