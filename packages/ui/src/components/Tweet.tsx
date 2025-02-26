import { memo } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import { ProfileHoverCard } from "./ProfileHoverCard";
import type { UserData } from "../store/userCache";
import { getUserData } from "../store/userCache";
import { selectedTweetIndex, headerHeight, query, debugMode } from "../store/signals";
import type { results } from "../store/signals";
import { formatTweetDate, highlightText } from "../utils/textUtils";

interface TweetProps {
  result: (typeof results.value)[0];
  index: number;
}

export const Tweet = memo(({ result, index }: TweetProps) => {
  const userData = useSignal<UserData | null>(null);
  const showProfile = useSignal(false);
  const imageLoaded = useSignal(false);
  const showDebugTooltip = useSignal(false);
  const tweetRef = useRef<HTMLAnchorElement>(null);
  const debugTimeoutRef = useRef<number | null>(null);
  const profileTimeoutRef = useRef<number | null>(null);

  // Use useEffect with proper dependency tracking
  useEffect(() => {
    getUserData(result).then((data) => {
      if (data) userData.value = data;
    });
  }, [result, userData]); // Add dependencies to re-fetch when they change

  useSignalEffect(() => {
    if (index === selectedTweetIndex.value && tweetRef.current) {
      const scrollTop = window.scrollY + tweetRef.current.getBoundingClientRect().top - headerHeight.value;
      window.scrollTo({
        top: scrollTop,
        behavior: 'instant'
      });
    }
  });

  const handleProfileMouseEnter = () => {
    if (profileTimeoutRef.current) {
      clearTimeout(profileTimeoutRef.current);
      profileTimeoutRef.current = null;
    }
    showProfile.value = true;
  };

  const handleProfileMouseLeave = () => {
    profileTimeoutRef.current = window.setTimeout(() => {
      showProfile.value = false;
    }, 300); // Short delay before hiding
  };

  const handleDebugMouseEnter = () => {
    if (debugTimeoutRef.current) {
      clearTimeout(debugTimeoutRef.current);
      debugTimeoutRef.current = null;
    }
    if (debugMode.value) {
      showDebugTooltip.value = true;
    }
  };

  const handleDebugMouseLeave = () => {
    debugTimeoutRef.current = window.setTimeout(() => {
      showDebugTooltip.value = false;
    }, 300); // Short delay before hiding
  };

  const tweetUrl = `https://x.com/${result.username}/status/${result.id}`;
  const formattedDate = formatTweetDate(result.date);
  const hasTextDifference = result.text !== result.full_text;

  return (
    <a
      ref={tweetRef}
      href={tweetUrl}
      target="_blank"
      rel="noopener noreferrer"
      class={`block p-4 border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 transition-colors ${
        index === selectedTweetIndex.value
          ? 'bg-white [box-shadow:rgb(142,205,248)_0px_0px_0px_2px_inset] dark:bg-blue-900/20'
          : ''
      }`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          window.open(tweetUrl, '_blank');
        }
      }}
      tabIndex={0}
    >
      <div class="flex gap-3">
        <div class="flex-shrink-0 relative">
          <div
            onMouseEnter={handleProfileMouseEnter}
            onMouseLeave={handleProfileMouseLeave}
          >
            {!imageLoaded.value && (
              <div class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            )}
            <img
              src={userData.value?.photo || "/placeholder.png"}
              alt=""
              onLoad={() => imageLoaded.value = true}
              class={`w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer ${!imageLoaded.value ? 'hidden' : ''}`}
            />
            {showProfile.value && (
              <ProfileHoverCard 
                userData={userData.value} 
                username={result.username} 
                onMouseEnter={handleProfileMouseEnter}
                onMouseLeave={handleProfileMouseLeave}
              />
            )}
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 mb-1">
            <div class="flex-1 min-w-0">
              <a
                href={`https://x.com/${result.username}`}
                target="_blank"
                rel="noopener noreferrer"
                class="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <span class="font-bold text-gray-900 dark:text-gray-100">
                  {userData.value?.displayName || result.username}
                </span>
                <span class="text-gray-500 dark:text-gray-400">
                  {" "}
                  @{result.username}
                </span>
              </a>
              <span class="text-gray-500 dark:text-gray-400">
                {" "}
                · {formattedDate}
              </span>
            </div>
            <span class="text-gray-500 dark:text-gray-400 text-xs shrink-0">
              {result.distance.toFixed(3)}
            </span>
          </div>
          <div class="relative">
            <div 
              class="relative"
              onMouseEnter={handleDebugMouseEnter}
              onMouseLeave={handleDebugMouseLeave}
            >
              <p
                class="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: trying to render html tweet text
                dangerouslySetInnerHTML={{
                  __html: highlightText(result.full_text || result.text, query.value),
                }}
              />
              
              {/* Debug badge indicator */}
              {debugMode.value && hasTextDifference && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showDebugTooltip.value = !showDebugTooltip.value;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      showDebugTooltip.value = !showDebugTooltip.value;
                    }
                  }}
                  class="absolute top-0 right-0 bg-yellow-500 hover:bg-yellow-600 text-xs text-white px-1.5 py-0.5 rounded cursor-pointer"
                  title="Toggle embedding text view"
                >
                  ≠
                </button>
              )}
            </div>
            
            {/* Debug tooltip showing the original embedding text */}
            {debugMode.value && showDebugTooltip.value && hasTextDifference && (
              <div 
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showDebugTooltip.value = false;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    showDebugTooltip.value = false;
                  }
                }}
              >
                <div 
                  class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-lg text-gray-900 dark:text-white">Embedding Text Comparison</h3>
                    <button
                      onClick={() => showDebugTooltip.value = false}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          showDebugTooltip.value = false;
                        }
                      }}
                      class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 bg-yellow-50 dark:bg-yellow-900/30">
                      <h4 class="font-bold text-yellow-800 dark:text-yellow-300 mb-2">Embedding Text:</h4>
                      <p class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                        {result.text}
                      </p>
                    </div>
                    
                    <div class="border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/30">
                      <h4 class="font-bold text-blue-800 dark:text-blue-300 mb-2">Display Text:</h4>
                      <p class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                        {result.full_text || result.text}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}); 