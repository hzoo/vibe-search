import { currentDialog, nResults, selectedUser, handleSearch } from "../store/signals";
import { handleClearCache } from "../store/userCache";
import { UserSelect } from "./UserSelect";

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
      aria-label="Search Settings"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
        <h2 class="text-lg font-bold mb-4">Search Settings</h2>

        <div class="space-y-4">
          <div>
            <label htmlFor="resultsPerSearch" class="block text-sm font-medium mb-1">
              Results per search
            </label>
            <input
              id="resultsPerSearch"
              type="number"
              min="1"
              max="100"
              value={nResults.value}
              onInput={(e) => {
                const val = Number.parseInt(e.currentTarget.value);
                if (val > 0 && val <= 100) {
                  nResults.value = val;
                }
              }}
              class="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="userFilter" class="block text-sm font-medium mb-1">Filter by user</label>
            <UserSelect />
          </div>

          <div>
            <button
              onClick={handleClearCache}
              class="w-full px-4 py-2 bg-red-500/80 text-white rounded-lg hover:bg-red-600"
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
              class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Import Tweets
            </button>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Import tweets from a Twitter/X archive
            </p>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            onClick={() => {
              currentDialog.value = null;
              handleSearch();
            }}
            class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Apply
          </button>
          <button
            onClick={() => (currentDialog.value = null)}
            class="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
} 