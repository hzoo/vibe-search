import { signal } from "@preact/signals";
import { ThemeToggle } from "./ThemeToggle";
import { useEffect } from "preact/hooks";

const query = signal("love");
const selectedUser = signal<string>("");
const nResults = signal(5);
const showSettings = signal(false);
const results = signal<Array<{
  text: string;
  distance: number;
  username: string;
  displayName: string;
  date: string;
  id: string;
}>>([]);
const loading = signal(false);

const USERS = [
  { username: "DefenderOfBasic", displayName: "Defender" },
];

const USERS_MAP = {
  "DefenderOfBasic": {
    photo: "https://pbs.twimg.com/profile_images/1784246094085443584/2qFrK_bU_400x400.jpg"
  }
} as Record<string, { photo?: string }>;

function Settings() {
  if (!showSettings.value) return null;
  
  return (
    <div class="absolute right-0 mt-2 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <div class="space-y-4">
        <div>
          <label for="nResults" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Results per search
          </label>
          <select
            id="nResults"
            value={nResults.value}
            onChange={(e) => nResults.value = Number(e.currentTarget.value)}
            class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            {[5, 10, 20, 50].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function Input() {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div class="flex gap-3 relative">
      <select
        value={selectedUser.value}
        onChange={(e) => selectedUser.value = e.currentTarget.value}
        class="px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
      >
        <option value="">All users</option>
        {USERS.map(user => (
          <option key={user.username} value={user.username}>
            {user.displayName}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={query.value}
        onInput={(e) => query.value = e.currentTarget.value}
        onKeyDown={handleKeyPress}
        class="flex-1 px-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
        placeholder="Search tweets..."
      />
      <button
        onClick={handleSearch}
        disabled={loading.value}
        class="px-6 py-2 bg-[#1DA1F2] text-white rounded-full hover:bg-[#1a8cd8] disabled:opacity-50 font-bold"
      >
        {loading.value ? "Searching..." : "Search"}
      </button>
      <button
        onClick={() => showSettings.value = !showSettings.value}
        class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
        title="Settings"
      >
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      <Settings />
    </div>
  );
}

function Results() {
  return (
    <div class="space-y-0">
      {results.value.map((result) => (
        <Tweet key={result.text} result={result} />
      ))}
    </div>
  );
}

function Tweet({ result }: { result: typeof results.value[0] }) {
  const tweetUrl = `https://x.com/${result.username}/status/${result.id}`;
  const formattedDate = new Date(result.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: result.date.includes('2024') ? undefined : 'numeric'
  });

  return (
    <a 
      href={tweetUrl}
      target="_blank"
      rel="noopener noreferrer" 
      class="block p-4 border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div class="flex gap-3">
        <div class="flex-shrink-0">
          <img 
            src={USERS_MAP[result.username]?.photo || '/placeholder.png'}
            alt={`${result.displayName}'s profile`} 
            class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" 
          />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 mb-1">
            <div class="flex-1 min-w-0">
              <span class="font-bold text-gray-900 dark:text-gray-100">{result.displayName}</span>
              <span class="text-gray-500 dark:text-gray-400"> @{result.username}</span>
              <span class="text-gray-500 dark:text-gray-400"> · {formattedDate}</span>
            </div>
            <span class="text-gray-500 dark:text-gray-400 text-xs shrink-0">
              {result.distance.toFixed(3)}
            </span>
          </div>
          <p class="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{result.text}</p>
        </div>
      </div>
    </a>
  );
}

const handleSearch = async () => {
  if (!query.value.trim()) return;
  
  loading.value = true;
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
    const json = await response.json();
    results.value = json;
  } catch (error) {
    console.error("Search failed:", error);
  } finally {
    loading.value = false;
  }
};

export function App() {
  useEffect(() => {
    handleSearch();
  }, []);

  return (
    <div class="min-h-screen bg-white dark:bg-gray-900 transition-colors theme-transition">
      <div class="max-w-[600px] mx-auto">
        <div class="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div class="flex items-center justify-between mb-4">
            <h1 class="text-xl font-bold dark:text-white">Tweet Search</h1>
            <ThemeToggle />
          </div>
          <Input />
        </div>
        
        <div class="divide-y divide-gray-100 dark:divide-gray-800">
          {results.value.length > 0 && <Results />}
        </div>
      </div>
    </div>
  );
} 