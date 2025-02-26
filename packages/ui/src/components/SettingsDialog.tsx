import { currentDialog, handleSearch, debugMode } from "@/ui/src/store/signals";
import { handleClearCache } from "@/ui/src/store/userCache";
import { deleteAllEmbeddings } from "@/ui/src/store/signals";

export function SettingsDialog() {
  if (currentDialog.value !== 'settings') return null;

  return (
    <div
      class="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          currentDialog.value = null;
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          currentDialog.value = null;
        }
      }}
      aria-modal="true"
      aria-label="Settings"
    >
      <div class="bg-white/95 dark:bg-gray-800/95 rounded-lg shadow-xl p-5 w-[400px] max-w-[90vw]">
        <h2 class="text-lg font-bold mb-4">Settings</h2>

        <div class="space-y-3">
          <div class="flex items-center">
            <input
              id="debugMode"
              type="checkbox"
              checked={debugMode.value}
              onChange={() => {
                debugMode.value = !debugMode.value;
              }}
              class="h-4 w-4 text-blue-400/60 rounded border-gray-300 focus:ring-blue-400/60"
            />
            <label htmlFor="debugMode" class="ml-2 block text-sm">
              Debug Mode
            </label>
            <p class="ml-2 text-xs text-gray-500 dark:text-gray-400">
              Shows embedding text for comparison
            </p>
          </div>

          <div>
            <button
              onClick={handleClearCache}
              class="w-full px-4 py-2 bg-red-400/60 text-white rounded-lg hover:bg-red-400/70"
            >
              Clear User Cache
            </button>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Clears cached user profile data
            </p>
          </div>
          
          <div>
            <button
              onClick={() => {
                currentDialog.value = 'import';
              }}
              class="w-full px-4 py-2 bg-blue-400/70 text-white rounded-lg hover:bg-blue-400/80"
            >
              Import Tweets
            </button>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Import tweets from a Twitter/X archive
            </p>
          </div>
          
          <div>
            <button
              onClick={deleteAllEmbeddings}
              class="w-full px-4 py-2 bg-red-400/60 text-white rounded-lg hover:bg-red-400/70"
            >
              Delete All Embeddings
            </button>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Permanently delete all imported tweet embeddings
            </p>
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              currentDialog.value = null;
              handleSearch();
            }}
            class="px-4 py-2 bg-blue-400/70 text-white rounded-lg hover:bg-blue-400/80"
          >
            Apply
          </button>
          <button
            onClick={() => (currentDialog.value = null)}
            class="px-4 py-2 bg-gray-100/90 dark:bg-gray-700/90 rounded-lg hover:bg-gray-200/90 dark:hover:bg-gray-600/90"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
} 