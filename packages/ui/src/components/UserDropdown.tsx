import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import { twitterUsers, twitterUsersLoading } from "@/ui/src/store/signals";
import { searchTwitterUsers } from "@/ui/src/store/userCache";
import type { TwitterUser } from "@/ui/src/store/userCache";
import type { JSX } from "preact";
import { useRef } from "preact/hooks";
import { UserIcon, SpinnerIcon } from "@/ui/src/components/Icons";

export interface UserDropdownProps {
  isOpen: Signal<boolean>;
  searchQuery: Signal<string>;
  selectedIndex?: Signal<number>;
  onSelect: (user: TwitterUser | null) => void;
  onClose?: () => void;
  position?: "up" | "down";
  showAllOption?: boolean;
  containerClassName?: string;
  dropdownClassName?: string;
  maxHeight?: string;
  placeholder?: string;
  renderUser?: (user: TwitterUser, isSelected: boolean) => JSX.Element;
}

export function UserDropdown({
  isOpen,
  searchQuery,
  selectedIndex = useSignal(-1),
  onSelect,
  onClose,
  position = "down",
  showAllOption = false,
  containerClassName = "",
  dropdownClassName = "",
  maxHeight = "max-h-80",
  placeholder = "Search users...",
  renderUser,
}: UserDropdownProps) {
  const filteredUsers = useSignal<TwitterUser[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter users when search query changes
  useSignalEffect(() => {
    if (searchQuery.value.trim()) {
      // Type assertion to handle the Partial<TwitterUser>[] issue
      filteredUsers.value = searchTwitterUsers(searchQuery.value) as TwitterUser[];
    } else {
      // Type assertion to handle the Partial<TwitterUser>[] issue
      filteredUsers.value = twitterUsers.value.slice(0, 25) as TwitterUser[];
    }
  });

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen.value) {
      // Small timeout to ensure the input is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen.value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".user-dropdown-container")) {
        isOpen.value = false;
        if (onClose) onClose();
      }
    }

    // Close on escape key
    function handleEscKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        isOpen.value = false;
        if (onClose) onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscKey);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isOpen, onClose]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen.value) return;

    const userCount = filteredUsers.value.length;
    if (userCount === 0) return;

    // Arrow down
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % userCount;
    }
    // Arrow up
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex.value =
        selectedIndex.value <= 0 ? userCount - 1 : selectedIndex.value - 1;
    }
    // Enter
    else if (e.key === "Enter") {
      e.preventDefault();

      // If there's only one user in the dropdown, select it regardless of selectedIndex
      if (userCount === 1) {
        onSelect(filteredUsers.value[0]);
        isOpen.value = false;
        selectedIndex.value = -1;
        return;
      }

      // Otherwise, select the highlighted user if any
      if (selectedIndex.value >= 0) {
        const selectedUser = filteredUsers.value[selectedIndex.value];
        if (selectedUser) {
          onSelect(selectedUser);
          isOpen.value = false;
          selectedIndex.value = -1;
        }
      }
    }
  };

  // Position classes
  const positionClasses = position === "up" 
    ? "bottom-full mb-1" 
    : "top-full mt-1";

  // Default user renderer
  const defaultRenderUser = (user: TwitterUser, isSelected: boolean) => (
    <button
      key={user.username}
      id={`user-item-${user.username}`}
      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${
        isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500" : ""
      }`}
      onClick={() => {
        onSelect(user);
        isOpen.value = false;
      }}
      aria-selected={isSelected}
    >
      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 mr-2 flex items-center justify-center overflow-hidden">
        <UserIcon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          <span className="font-medium truncate">
            {user.account_display_name || user.username}
          </span>
          <span className="ml-1 text-gray-500 dark:text-gray-400 truncate">
            @{user.username}
          </span>
        </div>
        {user.num_tweets && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {user.num_tweets.toLocaleString()} tweets
            {user.num_followers && ` (${user.num_followers.toLocaleString()} followers)`}
          </div>
        )}
      </div>
    </button>
  );

  // Use custom renderer or default
  const renderUserItem = renderUser || defaultRenderUser;

  return (
    <div className={`w-full ${containerClassName} user-dropdown-container`}>
      {isOpen.value && (
        <div 
          className={`absolute ${positionClasses} w-full max-h-[500px] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 ${maxHeight} ${dropdownClassName}`}
        >
          <div className="py-1" id="user-dropdown-list" tabIndex={-1} onKeyDown={handleKeyDown}>
            {/* Search input */}
            <div className="p-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={searchQuery.value}
                onInput={(e) => {
                  searchQuery.value = (e.target as HTMLInputElement).value;
                }}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* All users option */}
            {showAllOption && (
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  onSelect(null);
                  isOpen.value = false;
                }}
              >
                All users
              </button>
            )}

            {/* Loading state */}
            {twitterUsersLoading.value && twitterUsers.value.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center">
                <SpinnerIcon className="w-4 h-4 mr-2 text-blue-500" />
                Loading users...
              </div>
            ) : filteredUsers.value.length > 0 ? (
              filteredUsers.value.map((user, index) => 
                renderUserItem(user, selectedIndex.value === index)
              )
            ) : searchQuery.value ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No users found
              </div>
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                Type to search for users
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 