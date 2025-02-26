import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import { selectedUser, USERS, handleSearch, twitterUsers, twitterUsersLoading } from "@/ui/src/store/signals";
import { fetchTwitterUsers, searchTwitterUsers } from "@/ui/src/store/twitterUsers";
import type { TwitterUser } from "@/ui/src/store/twitterUsers";

export function UserSelect() {
  const isOpen = useSignal(false);
  const searchQuery = useSignal("");
  const filteredUsers = useSignal<typeof twitterUsers.value>([]);

  // Fetch Twitter users on component mount
  useEffect(() => {
    if (twitterUsers.value.length === 0) {
      fetchTwitterUsers();
    }
  }, []);

  // Filter users when search query changes
  useSignalEffect(() => {
    if (searchQuery.value.trim()) {
      filteredUsers.value = searchTwitterUsers(searchQuery.value);
    } else {
      filteredUsers.value = twitterUsers.value;
    }
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-select-container')) {
        isOpen.value = false;
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div class="relative user-select-container">
      <button
        onClick={() => isOpen.value = !isOpen.value}
        class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span>{selectedUser.value ? `@${selectedUser.value}` : "All users"}</span>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 20 20" 
          fill="currentColor" 
          class={`w-4 h-4 transition-transform ${isOpen.value ? 'rotate-180' : ''}`}
        >
          <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
        </svg>
      </button>

      {isOpen.value && (
        <div class="absolute z-10 mt-1 w-64 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <div class="p-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery.value}
              onInput={(e) => searchQuery.value = (e.target as HTMLInputElement).value}
              class="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          
          <div class="p-1">
            <button
              class={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${!selectedUser.value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''}`}
              onClick={() => {
                selectedUser.value = "";
                handleSearch();
                isOpen.value = false;
              }}
            >
              All users
            </button>

            {/* Hardcoded users first */}
            {USERS.map((user) => (
              <button
                key={user.username}
                class={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedUser.value === user.username ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''}`}
                onClick={() => {
                  selectedUser.value = user.username;
                  handleSearch();
                  isOpen.value = false;
                }}
              >
                <div class="flex items-center">
                  <span class="font-medium">{user.displayName}</span>
                  <span class="ml-1 text-gray-500 dark:text-gray-400">@{user.username}</span>
                </div>
              </button>
            ))}

            {/* Divider if we have both hardcoded and fetched users */}
            {USERS.length > 0 && filteredUsers.value.length > 0 && (
              <div class="my-1 border-t border-gray-200 dark:border-gray-700" />
            )}

            {/* Loading state */}
            {twitterUsersLoading.value && twitterUsers.value.length === 0 && (
              <div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                Loading users...
              </div>
            )}

            {/* Fetched users from Supabase */}
            {filteredUsers.value.map((user: TwitterUser) => (
              <button
                key={user.username}
                class={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedUser.value === user.username ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''}`}
                onClick={() => {
                  selectedUser.value = user.username;
                  handleSearch();
                  isOpen.value = false;
                }}
              >
                <div class="flex items-center">
                  <span class="font-medium">{user.account_display_name || user.username}</span>
                  <span class="ml-1 text-gray-500 dark:text-gray-400">@{user.username}</span>
                </div>
                {user.num_tweets && (
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {user.num_tweets.toLocaleString()} tweets
                  </div>
                )}
              </button>
            ))}

            {/* No results */}
            {searchQuery.value && filteredUsers.value.length === 0 && !twitterUsersLoading.value && (
              <div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No users found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 