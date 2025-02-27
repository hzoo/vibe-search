import { computed, signal } from "@preact/signals";
import { createClient } from "@supabase/supabase-js";
import type { TwitterUser } from "@/ui/src/store/userCache";
import type { ExtendedEntities } from "@/ui/src/components/Tweet";

// Supabase setup with error handling for missing environment variables
// Ensure to add the following to your .env file:
// VITE_PUBLIC_SUPABASE_URL=https://your-supabase-url.supabase.co
// VITE_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  alert("Missing .env variables (VITE_PUBLIC_SUPABASE_URL, VITE_PUBLIC_SUPABASE_ANON_KEY). Please refer to the README for local setup instructions: https://github.com/TheExGenesis/community-archive/blob/main/README.md");
}

export const supabase = signal(createClient(supabaseUrl, supabaseKey));

// Debug mode
export const debugMode = signal(false);

// API endpoints
export const baseUrl = "http://localhost:3001";
export const embeddingsUrl = `${baseUrl}/api/search`;
export const importUrl = `${baseUrl}/api/import`;
export const deleteEmbeddingsUrl = `${baseUrl}/api/delete-embeddings`;

// Search related signals
export const query = signal("open source");
export const selectedUser = signal<string>("");
export const nResults = signal(10);

// New search filter signals
export type TweetType = "all" | "standalone" | "self_thread" | "self_thread_continuation" | "external_reply" | "quote" | "retweet";
export const selectedTweetType = signal<TweetType>("all");
export const containsQuestion = signal<boolean | null>(null); // null means don't filter
export const dateRangeStart = signal<string | null>(null);
export const dateRangeEnd = signal<string | null>(null);
export const showFilters = signal<boolean>(false); // Toggle for filter panel visibility

// Search results
export const results = signal<
  Array<{
    full_text: string;
    distance: number;
    username: string;
    date: number;
    id: string;
    tweet_type?: string;
    contains_question?: boolean;
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
export const headerHeight = signal(0); // Will be measured dynamically

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
  performanceMetrics?: {
    tweetsPerSecond: number;
    averageChunkTweetsPerSecond: number;
  };
} | null>(null);
export const importLoading = signal(false);
export const importError = signal<string | null>(null);
export const importHistory = signal<{
  lastImportDate: string;
  lastTweetDate: string;
  tweetCount: number;
} | null>(null);
export const deleteLoading = signal(false);
export const deleteError = signal<string | null>(null);
export const deleteSuccess = signal<string | null>(null);

// Track last dialog open time to handle double-press to close
export const lastDialogOpenTime = signal<{ dialog: string; time: number } | null>(null);

// Twitter users from Supabase
export const twitterUsers = signal<Partial<TwitterUser>[]>([]);
export const twitterUsersLoading = signal(false);
export const twitterUsersError = signal<string | null>(null);
export const userSearchQuery = signal("");
export const filteredUsers = computed(() => {
  if (!userSearchQuery.value.trim()) return twitterUsers.value.slice(0, 25);
  
  const lowerQuery = userSearchQuery.value.toLowerCase().trim();
  return twitterUsers.value.filter(user => 
    user.username?.toLowerCase().includes(lowerQuery) || 
    (user.account_display_name?.toLowerCase().includes(lowerQuery))
  );
});

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

// Toggle search filters panel
export function toggleFilters() {
  showFilters.value = !showFilters.value;
}

// Reset all filters to default values
export function resetFilters() {
  selectedUser.value = "";
  selectedTweetType.value = "all";
  containsQuestion.value = null;
  dateRangeStart.value = null;
  dateRangeEnd.value = null;
}

// Define a type for search results from the API
interface SearchResult {
  full_text: string;
  distance: number;
  username: string;
  date: string;
  id: string;
  tweet_type?: string;
  contains_question?: boolean;
  extended_entities?: ExtendedEntities;
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
    // Prepare search filters
    const filters: {
      username?: string;
      tweet_type?: string;
      contains_question?: boolean;
      date_start?: number;
      date_end?: number;
    } = {};
    
    if (selectedUser.value) {
      filters.username = selectedUser.value;
    }
    
    if (selectedTweetType.value !== "all") {
      filters.tweet_type = selectedTweetType.value;
    }
    
    if (containsQuestion.value !== null) {
      filters.contains_question = containsQuestion.value;
    }
    
    if (dateRangeStart.value) {
      filters.date_start = new Date(dateRangeStart.value).getTime();
    }
    
    if (dateRangeEnd.value) {
      filters.date_end = new Date(dateRangeEnd.value).getTime();
    }

    const response = await fetch(embeddingsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.value,
        filters,
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
      id: result.id,
      full_text: result.full_text,
      extended_entities: result.extended_entities
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

// Delete all embeddings
export const deleteAllEmbeddings = async () => {
  if (!confirm("Are you sure you want to delete all embeddings? This action cannot be undone.")) {
    return;
  }
  
  deleteLoading.value = true;
  deleteError.value = null;
  deleteSuccess.value = null;
  
  try {
    const response = await fetch(deleteEmbeddingsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Delete failed: ${response.status} ${response.statusText}`
      );
    }

    const json = await response.json();
    deleteSuccess.value = json.message || "All embeddings deleted successfully";
    
    // Clear results
    results.value = [];
    error.value = null;
    
    // Clear import history
    importHistory.value = null;
    currentDialog.value = null;
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : String(err);
  } finally {
    deleteLoading.value = false;
    
    // Auto-hide success message after 3 seconds
    if (deleteSuccess.value) {
      setTimeout(() => {
        deleteSuccess.value = null;
      }, 3000);
    }
  }
}; 