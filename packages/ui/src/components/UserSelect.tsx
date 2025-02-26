import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { selectedUser, handleSearch, twitterUsers } from "@/ui/src/store/signals";
import { fetchTwitterUsers } from "@/ui/src/store/userCache";
import type { TwitterUser } from "@/ui/src/store/userCache";
import { UserDropdown } from "@/ui/src/components/UserDropdown";
import { ChevronDownIcon } from "@/ui/src/components/Icons";

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
    <div class="relative user-select-container w-full">
      <button
        onClick={() => {
          isOpen.value = !isOpen.value;
        }}
        class="w-full flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
      >
        <span class="truncate">{selectedUser.value ? `@${selectedUser.value}` : "All users"}</span>
        <ChevronDownIcon className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen.value ? 'rotate-180' : ''}`} />
      </button>

      <UserDropdown
        isOpen={isOpen}
        searchQuery={searchQuery}
        onSelect={handleUserSelect}
        showAllOption={true}
        containerClassName="user-select-container"
        dropdownClassName="w-full min-w-[150px]"
      />
    </div>
  );
} 