import { currentDialog } from "@/ui/src/store/signals";
import { shortcuts } from "@/ui/src/utils/keyboardUtils";

export function KeyboardShortcutsDialog() {
  if (currentDialog.value !== 'shortcuts') return null;

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
      aria-label="Keyboard Shortcuts"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
        <h2 class="text-lg font-bold mb-4">Keyboard Shortcuts</h2>
        <div class="space-y-2">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.key} class="flex justify-between items-center">
              <span class="text-gray-600 dark:text-gray-300">{shortcut.description}</span>
              <kbd class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm">{shortcut.key}</kbd>
            </div>
          ))}
        </div>
        <div class="mt-6 flex justify-end">
          <button
            onClick={() => (currentDialog.value = null)}
            class="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 