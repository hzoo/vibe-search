import { signal } from "@preact/signals";
import { ThemeToggle } from "./ThemeToggle";
import { useEffect, useState } from "preact/hooks";
import { createClient } from '@supabase/supabase-js';

// Supabase setup
const supabaseUrl = import.meta.env.VITE_LOCAL_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Cache interface
type UserData = {
  displayName: string;
  photo: string;
  loadedAt: number;
  accountId: string;
}
interface UserCache {
  [username: string]: UserData;
}

// Load cache from localStorage
const CACHE_KEY = 'tweetSearchUserCache';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 1 day

function loadCache(): UserCache {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    console.error('Error loading cache:', e);
    return {};
  }
}

function saveCache(cache: UserCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Error saving cache:', e);
  }
}

// Initialize cache from localStorage
let userCache: UserCache = loadCache();

async function getUserData(result: typeof results.value[0]): Promise<UserData | null> {
  const now = Date.now();
  const cached = userCache[result.username];
  if (cached && (now - cached.loadedAt < CACHE_TTL)) {
    return cached;
  }

  try {
    // First get account data to get the account_id
    const { data: account } = await supabase
      .from('all_account')
      .select('account_id, account_display_name')
      .eq('username', result.username)
      .single();

    if (!account) {
      console.error('Account not found for username:', result.username);
      return null;
    }

    // Then get profile data using account_id
    const { data: profile } = await supabase
      .from('profile')
      .select('avatar_media_url')
      .eq('account_id', account.account_id)
      .single();

    if (profile) {
      const userData = {
        displayName: account.account_display_name || result.username,
        photo: profile.avatar_media_url,
        loadedAt: now,
        accountId: account.account_id
      };
      
      // Update cache in memory and localStorage
      userCache = { ...userCache, [result.username]: userData };
      saveCache(userCache);
      
      return userData;
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
  }

  return null;
}

const query = signal("love");
const selectedUser = signal<string>("");
const nResults = signal(5);
const results = signal<Array<{
  text: string;
  distance: number;
  username: string;
  date: string;
  id: string;
}>>([]);
const loading = signal(false);
const error = signal<string | null>(null);

function Input() {
  return (
    <div class="relative">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </div>
      <input
        type="text"
        value={query.value}
        onInput={(e) => query.value = e.currentTarget.value}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSearch();
          }
        }}
        placeholder="Search for tweets..."
        class="w-full pl-10 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {query.value && (
        <button
          onClick={() => {
            query.value = "";
            handleSearch(); // Clear results
          }}
          class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Clear search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function LoadingTweet() {
  return (
    <div class="p-4 border-b border-gray-100 animate-pulse">
      <div class="flex gap-3">
        <div class="flex-shrink-0">
          <div class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 mb-1">
            <div class="flex-1 min-w-0">
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-1" />
              <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
            </div>
            <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/6" />
          </div>
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
        </div>
      </div>
    </div>
  );
}

function Results() {
  if (loading.value) {
    return (
      <div class="space-y-0">
        <LoadingTweet />
        <LoadingTweet />
        <LoadingTweet />
      </div>
    );
  }

  if (error.value) {
    return (
      <div class="p-4 text-red-500 dark:text-red-400">
        Error: {error.value}
      </div>
    );
  }

  if (results.value.length === 0) {
    return (
      <div class="p-4 text-gray-500 dark:text-gray-400">
        No tweets found matching your search.
      </div>
    );
  }

  return (
    <div class="space-y-0">
      {results.value.map((result) => (
        <Tweet key={result.id} result={result} />
      ))}
    </div>
  );
}

function Tweet({ result }: { result: typeof results.value[0] }) {
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    // Try to get from cache immediately
    const cached = userCache[result.username];
    if (cached && (Date.now() - cached.loadedAt < CACHE_TTL)) {
      setUserData(cached);
    }
    // Then fetch/update in background
    getUserData(result).then(data => {
      if (data) setUserData(data);
    });
  }, [result]);

  const tweetUrl = `https://x.com/${result.username}/status/${result.id}`;
  const formattedDate = new Date(result.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: result.date.includes('2024') ? undefined : 'numeric'
  });

  const linkify = (text: string) => {
    const urlRegex = /https?:\/\/[^\s<]+/g;  // Updated to avoid matching inside HTML
    const usernameRegex = /@(\w+)/g;  // Simplified username regex

    // First escape HTML
    const escapedText = text.replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]!));

    // Replace URLs first
    let replacedText = escapedText.replace(urlRegex, (url) => {
      const trimmedUrl = url.replace(/[.,;:]$/, '');
      return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${trimmedUrl}</a>`;
    });

    // Then replace usernames
    replacedText = replacedText.replace(usernameRegex, (match, username) => 
      `<a href="https://x.com/${username}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${match}</a>`
    );

    return replacedText;
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return linkify(text);

    const linkedText = linkify(text);
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Use a non-greedy match to avoid matching across HTML tags
    const regex = new RegExp(`(${safeQuery})(?![^<]*>)`, 'gi');
    
    return linkedText.replace(regex, 
      '<mark class="bg-yellow-200 dark:bg-yellow-500 px-0.5 rounded">$1</mark>'
    );
  };

  return (
    <a href={tweetUrl} target="_blank" rel="noopener noreferrer" 
       class="block p-4 border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div class="flex gap-3">
        <div class="flex-shrink-0">
          <img 
            src={userData?.photo || '/placeholder.png'} 
            alt=""
            class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" 
          />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 mb-1">
            <div class="flex-1 min-w-0">
              <a 
                href={`https://x.com/${result.username}`}
                target="_blank"
                rel="noopener noreferrer"
                class="hover:underline"
                onClick={e => e.stopPropagation()}
              >
                <span class="font-bold text-gray-900 dark:text-gray-100">
                  {userData?.displayName || result.username}
                </span>
                <span class="text-gray-500 dark:text-gray-400"> @{result.username}</span>
              </a>
              <span class="text-gray-500 dark:text-gray-400"> · {formattedDate}</span>
            </div>
            <span class="text-gray-500 dark:text-gray-400 text-xs shrink-0">
              {result.distance.toFixed(3)}
            </span>
          </div>
          <p 
            class="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words" 
            dangerouslySetInnerHTML={{ __html: highlightText(result.text, query.value) }} 
          />
        </div>
      </div>
    </a>
  );
}

const handleSearch = async () => {
  if (!query.value.trim()) {
    results.value = []; // Clear results on empty query
    error.value = null;
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const response = await fetch("http://localhost:3001/api/search", {
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
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    results.value = json;
  } catch (err) {
    error.value = (err instanceof Error) ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

export function App() {
  useEffect(() => {
    handleSearch(); // Initial search
  }, []);

  return (
    <div class="min-h-screen bg-white dark:bg-gray-900 transition-colors theme-transition dark:text-white">
      <ThemeToggle />
      <div class="max-w-[600px] mx-auto">
        <div class="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div class="flex items-center justify-between mb-4">
            <h1 class="text-xl font-bold">Tweet Search</h1>
            <div class="flex items-center gap-2">
              <Input />
            </div>
          </div>
        </div>

        <div class="divide-y divide-gray-100 dark:divide-gray-800">
          <Results />
        </div>
      </div>
    </div>
  );
} 