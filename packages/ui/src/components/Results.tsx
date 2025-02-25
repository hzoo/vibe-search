import { loading, error, results } from "../store/signals";
import { Tweet } from "./Tweet";

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

export function Results() {
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
      <div class="p-4 text-red-500 dark:text-red-400">Error: {error.value}</div>
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
      <div class="space-y-0">
        {results.value.map((result, index) => (
          <Tweet key={result.id} result={result} index={index} />
        ))}
      </div>
      {/* Add padding at bottom to allow scrolling last tweet to top */}
      <div class="h-screen" />
    </div>
  );
} 