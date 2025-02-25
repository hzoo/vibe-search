import { 
  currentDialog, 
  toggleDialog, 
  toggleDarkMode, 
  selectedTweetIndex, 
  results, 
} from '../store/signals';

// Available keyboard shortcuts
export const shortcuts = [
  { key: '⌘ + /', description: 'Show shortcuts' },
  { key: '⌘ + ,', description: 'Show settings' },
  { key: 'j', description: 'Next tweet' },
  { key: 'k', description: 'Previous tweet' },
  { key: '⌘\\', description: 'Toggle dark mode' },
  { key: '⌘I', description: 'Import tweets' },
  { key: '⌘C', description: 'Copy selected tweet' },
  { key: 'Space', description: 'Page down' },
  { key: '/', description: 'Focus search' },
  { key: 'Enter', description: 'Open selected tweet' },
  { key: 'Esc', description: 'Close dialog' },
];

// Handle keyboard shortcuts
export function handleKeyDown(e: KeyboardEvent) {
  // Don't handle shortcuts if input is focused, except for Escape
  if (e.target instanceof HTMLInputElement && e.key !== 'Escape') {
    return;
  }

  // Add copy shortcut (Cmd/Ctrl+C)
  if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedTweetIndex.value !== -1) {
    e.preventDefault();
    const selectedTweet = results.value[selectedTweetIndex.value];
    navigator.clipboard.writeText(selectedTweet.text);
    return;
  }

  // Cmd/Ctrl + , to toggle settings
  if ((e.metaKey || e.ctrlKey) && e.key === ",") {
    e.preventDefault();
    toggleDialog('settings');
  }
  
  // Cmd/Ctrl + I to toggle import dialog
  if ((e.metaKey || e.ctrlKey) && e.key === "i") {
    e.preventDefault();
    toggleDialog('import');
  }
  
  // Ctrl + / to toggle shortcuts
  if ((e.metaKey || e.ctrlKey) && e.key === "/") {
    e.preventDefault();
    toggleDialog('shortcuts');
  }
  
  // Cmd + \ to toggle dark mode
  if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
    e.preventDefault();
    toggleDarkMode();
  }
  
  // / to focus search
  if (e.key === "/" && !(e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    searchInput?.focus();
  }
  
  // j/k for next/previous tweet
  if (e.key === "j" || e.key === "k") {
    e.preventDefault();
    if (selectedTweetIndex.value === -1 && results.value.length > 0) {
      // If no tweet selected, select first one
      selectedTweetIndex.value = 0;
    } else {
      selectedTweetIndex.value = Math.max(
        0,
        Math.min(
          selectedTweetIndex.value + (e.key === "j" ? 1 : -1),
          results.value.length - 1
        )
      );
    }
    document.querySelectorAll('a[href^="https://x.com"]')[selectedTweetIndex.value]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }
  
  // Esc to close dialog
  if (e.key === "Escape") {
    currentDialog.value = null;
    if (e.target instanceof HTMLInputElement) {
      e.target.blur();
    }
  }
  
  // Space for page down (if no dialog is open)
  if (e.key === " " && !currentDialog.value) {
    e.preventDefault();
    window.scrollBy({
      top: window.innerHeight * 0.8,
      behavior: 'smooth',
    });
  }
  
  // Enter to open selected tweet
  if (e.key === "Enter" && selectedTweetIndex.value !== -1) {
    e.preventDefault();
    const tweetUrl = `https://x.com/${results.value[selectedTweetIndex.value].username}/status/${results.value[selectedTweetIndex.value].id}`;
    window.open(tweetUrl, '_blank');
  }
} 