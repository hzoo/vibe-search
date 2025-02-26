import { useEffect } from "preact/hooks";
import { useRef } from "preact/hooks";

import { ThemeToggle } from "@/ui/src/components/ThemeToggle";
import { SearchInput } from "@/ui/src/components/SearchInput";
import { Results } from "@/ui/src/components/Results";
import { ImportDialog } from "@/ui/src/components/import-tweets/ImportDialog";
import { SettingsDialog } from "@/ui/src/components/SettingsDialog";
import { KeyboardShortcutsDialog } from "@/ui/src/components/KeyboardShortcutsDialog";
import { SearchFilters } from "@/ui/src/components/SearchFilters";
import { handleKeyDown } from "@/ui/src/utils/keyboardUtils";
import { currentDialog, toggleDialog, handleSearch, deleteSuccess, deleteError, toggleFilters, headerHeight } from "./store/signals";
import { KeyboardIcon, ImportIcon, FilterIcon, SettingsIcon } from "@/ui/src/components/Icons";

export function App() {
	const headerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		handleSearch(); // Initial search

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		// Update header height when it changes
		if (!headerRef.current) return;
		
		// Function to calculate the full height including margins
		const calculateFullHeight = () => {
			const element = headerRef.current;
			if (!element) return 0;
			
			const styles = window.getComputedStyle(element);
			const marginTop = Number.parseFloat(styles.marginTop);
			const marginBottom = Number.parseFloat(styles.marginBottom);
			const height = element.getBoundingClientRect().height;
			
			return height + marginTop + marginBottom;
		};
		
		// Set initial height
		headerHeight.value = calculateFullHeight();
		
		// Create ResizeObserver to track header height changes
		const resizeObserver = new ResizeObserver(() => {
			headerHeight.value = calculateFullHeight();
		});
		
		// Start observing the header element
		resizeObserver.observe(headerRef.current);
		
		// Clean up observer on unmount
		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	return (
		<div 
			class="min-h-screen bg-white dark:bg-gray-900 transition-colors theme-transition dark:text-white"
		>
			<div class="max-w-[600px] mx-auto">
				<div 
					ref={headerRef}
					class="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-3 border-b border-gray-100 dark:border-gray-800 shadow-sm"
				>
					<div class="flex items-center justify-between mb-4">
						<h1 class="text-xl font-bold">Vibes Search</h1>
						<div class="flex items-center gap-2">
							<button
								onClick={() => currentDialog.value = 'shortcuts'}
								class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
								title="Keyboard Shortcuts (⌘/)"
							>
								<KeyboardIcon />
							</button>
							<ThemeToggle />
							<button
								onClick={() => toggleDialog('import')}
								class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
								title="Import Tweets"
							>
								<ImportIcon />
							</button>
							<button
								onClick={toggleFilters}
								class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
								title="Search Filters (⌘F)"
							>
								<FilterIcon />
							</button>
							<button
								onClick={() => toggleDialog('settings')}
								class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
								title="Settings (⌘,)"
							>
								<SettingsIcon />
							</button>
						</div>
					</div>
					<SearchInput />
					<SearchFilters />
				</div>

				<div class="divide-y divide-gray-100 dark:divide-gray-800">
					{deleteSuccess.value && (
						<div class="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 p-3 text-center">
							{deleteSuccess.value}
						</div>
					)}
					{deleteError.value && (
						<div class="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 p-3 text-center">
							{deleteError.value}
						</div>
					)}
					<Results />
				</div>
			</div>
			<SettingsDialog />
			<ImportDialog />
			<KeyboardShortcutsDialog />
		</div>
	);
}