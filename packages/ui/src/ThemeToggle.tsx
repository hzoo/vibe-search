import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export const isDarkMode = signal(
  typeof window !== 'undefined' 
    ? localStorage.theme === 'dark' ||
      (!('theme' in localStorage) && 
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    : false
);

export function ThemeToggle() {
  useEffect(() => {
    // On mount, apply the correct theme
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDarkMode.value);
    }
  }, []);

  const toggleTheme = () => {
    isDarkMode.value = !isDarkMode.value;
    
    if (isDarkMode.value) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  };

  return (
    <button
      onClick={toggleTheme}
      class="fixed top-4 right-4 p-2 rounded-full 
        bg-yellow-900/10 dark:bg-yellow-400/5
        hover:bg-yellow-900/20 dark:hover:bg-yellow-400/10 
        transition-colors duration-200
        backdrop-blur-sm cursor-pointer z-10"
      aria-label="Toggle theme"
    >
      {isDarkMode.value ? (
        <svg class="w-5 h-5 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"
          />
        </svg>
      ) : (
        <svg class="w-5 h-5 text-yellow-900" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
} 