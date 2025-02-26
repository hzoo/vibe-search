import { useEffect } from "preact/hooks";
import { isDarkMode, toggleDarkMode } from "@/ui/src/store/signals";
import { SunIcon, MoonIcon } from "@/ui/src/components/Icons";

export function ThemeToggle() {

  useEffect(() => {
    // On mount, apply the correct theme
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDarkMode.value);
    }
  }, []);

  
  return (
    <button
      onClick={toggleDarkMode}
      class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      title="Toggle Dark Mode (⌘\)"
    >
      {isDarkMode.value ? <SunIcon title="Switch to light mode" /> : <MoonIcon title="Switch to dark mode" />}
    </button>
  );
} 