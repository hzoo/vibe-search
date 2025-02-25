import { signal } from "@preact/signals";
import { createClient } from "@supabase/supabase-js";

// Supabase setup
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = signal(createClient(supabaseUrl, supabaseKey));

// API endpoints
export const embeddingsUrl =
  window.location.hostname === "localhost"
    ? "http://localhost:3001/api/search"
    : "http://vibe-search-api.henryzoo.com/api/search";

export const importUrl =
  window.location.hostname === "localhost"
    ? "http://localhost:3001/api/import"
    : "http://vibe-search-api.henryzoo.com/api/import";

// Available users for filtering
export const USERS = [
  {
    username: "DefenderOfBasic",
    displayName: "Defender",
    id: "1680757426889342977",
  },
  { username: "exgenesis", displayName: "❤️‍🔥 xiq in NYC 🏙️ Feb 16 - 28", id: "322603863" },
] as { username: string; displayName: string; id: string }[];

// Search related signals
export const query = signal("love");
export const selectedUser = signal<string>("");
export const nResults = signal(10);
export const results = signal<
  Array<{
    text: string;
    distance: number;
    username: string;
    date: string;
    id: string;
  }>
>([]);
export const loading = signal(false);
export const error = signal<string | null>(null);

// Dialog control
export const currentDialog = signal<'settings' | 'shortcuts' | 'import' | null>(null);

// Tweet selection
export const selectedTweetIndex = signal<number>(-1);

// Theme control
export const isDarkMode = signal(localStorage.getItem('theme') === 'dark');
export const headerHeight = signal(119);

// Import related signals
export const importStatus = signal<{
  id: string;
  username: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  error?: string;
  startTime: number;
  endTime?: number;
} | null>(null);
export const importLoading = signal(false);
export const importError = signal<string | null>(null);
export const importHistory = signal<{
  lastImportDate: string;
  lastTweetDate: string;
  tweetCount: number;
} | null>(null);

// Track last dialog open time to handle double-press to close
export const lastDialogOpenTime = signal<{ dialog: string; time: number } | null>(null);

// Toggle dark mode
export function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value;
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light');
}

// Toggle dialog
export function toggleDialog(dialog: 'settings' | 'shortcuts' | 'import') {
  const now = Date.now();
  // If same dialog was opened in last 500ms, close it
  if (lastDialogOpenTime.value?.dialog === dialog && now - lastDialogOpenTime.value.time < 500) {
    currentDialog.value = null;
    lastDialogOpenTime.value = null;
  } else {
    currentDialog.value = dialog;
    lastDialogOpenTime.value = { dialog, time: now };
  }
}

// Define a type for search results from the API
interface SearchResult {
  text: string;
  distance: number;
  username: string;
  date: string;
  tweet_id: string;
}

// Handle search
export const handleSearch = async () => {
  if (!query.value.trim()) {
    results.value = []; // Clear results on empty query
    error.value = null;
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const response = await fetch(embeddingsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.value,
        username: selectedUser.value || undefined,
        nResults: nResults.value,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      
      // Check if this is a "no tweets imported" error
      if (errorData.code === "NO_TWEETS_IMPORTED") {
        // Automatically open the import dialog
        currentDialog.value = 'import';
        throw new Error(errorData.error || "No tweets found. Please import tweets first.");
      }
      
      throw new Error(
        errorData.error || `Search failed: ${response.status} ${response.statusText}`
      );
    }

    const json = await response.json();
    results.value = json.map((result: SearchResult) => ({
      ...result,
      id: result.tweet_id
    }));
    
    // After search, unfocus input and select first tweet
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    searchInput?.blur();
    selectedTweetIndex.value = results.value.length > 0 ? 0 : -1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}; 