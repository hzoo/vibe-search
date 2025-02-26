import { query, handleSearch } from "@/ui/src/store/signals";
import { SearchIcon, CloseIcon } from "@/ui/src/components/Icons";

export function SearchInput() {
  return (
    <div class="relative">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <SearchIcon />
      </div>
      <input
        type="text"
        value={query.value}
        onInput={(e) => {
          query.value = e.currentTarget.value;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSearch();
          }
        }}
        placeholder="Search tweets..."
        class="w-full pl-10 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {query.value && (
        <button
          onClick={() => {
            query.value = "";
            handleSearch();
          }}
          class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Clear search"
        >
          <CloseIcon title="Clear search" />
        </button>
      )}
    </div>
  );
} 