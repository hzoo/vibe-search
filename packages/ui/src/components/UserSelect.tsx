import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { selectedUser, handleSearch, twitterUsers } from "@/ui/src/store/signals";
import { fetchTwitterUsers } from "@/ui/src/store/userCache";
import type { TwitterUser } from "@/ui/src/store/userCache";
import { UserDropdown } from "@/ui/src/components/UserDropdown";

export function UserSelect() {
  const isOpen = useSignal(false);
  const searchQuery = useSignal("");

  // Fetch Twitter users on component mount
  useEffect(() => {
    if (twitterUsers.value.length === 0) {
      fetchTwitterUsers();
    }
  }, []);

  const handleUserSelect = (user: TwitterUser | null) => {
    selectedUser.value = user ? user.username : "";
    handleSearch();
  };

  return (
    <div class="relative user-select-container">
      <button
        onClick={() => {
          isOpen.value = !isOpen.value;
        }}
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

      <UserDropdown
        isOpen={isOpen}
        searchQuery={searchQuery}
        onSelect={handleUserSelect}
        showAllOption={true}
        containerClassName="user-select-container"
        dropdownClassName="w-64"
      />
    </div>
  );
} 