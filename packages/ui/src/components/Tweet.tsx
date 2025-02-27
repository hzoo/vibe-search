import { memo } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import { ProfileHoverCard } from "@/ui/src/components/ProfileHoverCard";
import type { TwitterUser } from "@/ui/src/store/userCache";
import { getUserData } from "@/ui/src/store/userCache";
import { selectedTweetIndex, headerHeight, query, debugMode } from "@/ui/src/store/signals";
import type { results } from "@/ui/src/store/signals";
import { formatTweetDate, highlightText, processReplyMentions } from "@/ui/src/utils/textUtils";

interface TweetProps {
  result: (typeof results.value)[0];
  index: number;
}

// Component for the tweet header with user info and date
const TweetHeader = ({ 
  userData, 
  username, 
  formattedDate, 
  distance,
}: { 
  userData: TwitterUser | null; 
  username: string; 
  formattedDate: string;
  distance: number;
}) => (
  <div class="flex items-center gap-1 mb-1">
    <div class="flex-1 min-w-0">
      <a
        href={`https://x.com/${username}`}
        target="_blank"
        rel="noopener noreferrer"
        class="hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <span class="font-bold text-gray-900 dark:text-gray-100">
          {userData?.account_display_name || username}
        </span>
        <span class="text-gray-500 dark:text-gray-400">
          {" "}
          @{username}
        </span>
      </a>
      <span class="text-gray-500 dark:text-gray-400">
        {" "}
        · {formattedDate}
      </span>
    </div>
    <span class="text-gray-500 dark:text-gray-400 text-xs shrink-0">
      {distance.toFixed(3)}
    </span>
  </div>
);

// Component for the tweet content
const TweetContent = ({ 
  text, 
  queryText,
}: { 
  text: string; 
  queryText: string;
}) => {
  // Process the text to handle reply mentions
  const { isReply, replyMentions, mainText } = processReplyMentions(text);
  
  return (
    <div class="relative">
      {isReply && (
        <div class="flex items-center gap-1 mb-1 text-xs text-gray-500 dark:text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clip-rule="evenodd" />
          </svg>
          <span>Replying to</span>
          <span 
            class="hover:underline cursor-pointer"
            title={replyMentions}
          >
            {replyMentions.split(/\s+/).length > 1 
              ? `${replyMentions.split(/\s+/)[0]} and ${replyMentions.split(/\s+/).length - 1} others` 
              : replyMentions}
          </span>
        </div>
      )}
      <p
        class="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trying to render html tweet text
        dangerouslySetInnerHTML={{
          __html: highlightText(isReply ? mainText : text, queryText),
        }}
      />
    </div>
  );
};

// Component for the debug view tabs
const DebugTabs = ({ 
  activeTab, 
  onTabChange 
}: { 
  activeTab: 'comparison' | 'json'; 
  onTabChange: (tab: 'comparison' | 'json') => void;
}) => (
  <div class="flex border-b border-gray-200 dark:border-gray-700 mb-3">
    <button
      onClick={(e) => {
        e.preventDefault();
        onTabChange('comparison');
      }}
      class={`px-3 py-1 text-xs font-medium ${
        activeTab === 'comparison'
          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      Text Comparison
    </button>
    <button
      onClick={(e) => {
        e.preventDefault();
        onTabChange('json');
      }}
      class={`px-3 py-1 text-xs font-medium ${
        activeTab === 'json'
          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      JSON Data
    </button>
  </div>
);

// Component for the debug comparison view
const DebugComparisonView = ({ 
  embeddingText, 
  displayText 
}: { 
  embeddingText: string; 
  displayText: string;
}) => (
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div class="border border-yellow-200 dark:border-yellow-800 rounded p-2 bg-yellow-50 dark:bg-yellow-900/30">
      <h4 class="font-medium text-xs text-yellow-800 dark:text-yellow-300 mb-1">Embedding Text:</h4>
      <p class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
        {embeddingText}
      </p>
    </div>
    
    <div class="border border-blue-200 dark:border-blue-800 rounded p-2 bg-blue-50 dark:bg-blue-900/30">
      <h4 class="font-medium text-xs text-blue-800 dark:text-blue-300 mb-1">Display Text:</h4>
      <p class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
        {displayText}
      </p>
    </div>
  </div>
);

// Component for the debug JSON view
const DebugJsonView = ({ result }: { result: TweetProps['result'] }) => (
  <div class="border border-gray-200 dark:border-gray-700 rounded p-2 bg-gray-50 dark:bg-gray-900/30">
    <div class="flex justify-between items-center mb-1">
      <h4 class="font-medium text-xs text-gray-800 dark:text-gray-300">Tweet JSON Data:</h4>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigator.clipboard.writeText(JSON.stringify(result, null, 2));
        }}
        class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-1.5 py-0.5 rounded"
        title="Copy JSON to clipboard"
      >
        Copy
      </button>
    </div>
    <pre class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-[300px]">
      {JSON.stringify(result, null, 2)}
    </pre>
  </div>
);

// Main Tweet component
export const Tweet = memo(({ result, index }: TweetProps) => {
  const userData = useSignal<TwitterUser | null>(null);
  const showProfile = useSignal(false);
  const imageLoaded = useSignal(false);
  const showDebug = useSignal(false);
  const activeTab = useSignal<'comparison' | 'json'>('comparison');
  const tweetRef = useRef<HTMLAnchorElement>(null);
  const profileTimeoutRef = useRef<number | null>(null);

  // Use useEffect with proper dependency tracking
  useEffect(() => {
    getUserData(result).then((data) => {
      if (data) userData.value = data;
    });
  }, [result, userData]); // Add dependencies to re-fetch when they change

  useSignalEffect(() => {
    if (index === selectedTweetIndex.value && tweetRef.current) {
      // Get the current header height, with a fallback if not yet measured
      const headerOffset = headerHeight.value > 0 ? headerHeight.value : 0;
      
      // Calculate the element's position relative to the viewport
      const rect = tweetRef.current.getBoundingClientRect();
      
      // Calculate the scroll position needed to position the element below the header
      // We add a small buffer (8px) to give some visual spacing
      const scrollTop = window.scrollY + rect.top - headerOffset - 8;
      
      window.scrollTo({
        top: Math.max(0, scrollTop), // Ensure we don't scroll to negative positions
        behavior: 'instant'
      });
    }
  });

  // When the selected tweet changes, automatically show debug info if in debug mode
  useSignalEffect(() => {
    if (debugMode.value && index === selectedTweetIndex.value) {
      showDebug.value = true;
    } else if (!debugMode.value) {
      showDebug.value = false;
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

  const tweetUrl = `https://x.com/${result.username}/status/${result.id}`;
  const formattedDate = formatTweetDate(result.date * 1000);

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
      } ${debugMode.value && showDebug.value ? 'relative' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          window.open(tweetUrl, '_blank');
        }
      }}
      tabIndex={0}
    >
      <div class="flex gap-3">
        {/* Profile Image */}
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

        {/* Tweet Content */}
        <div class="flex-1 min-w-0">
          {/* Tweet Header */}
          <TweetHeader 
            userData={userData.value} 
            username={result.username} 
            formattedDate={formattedDate}
            distance={result.distance}
          />

          {/* Tweet Text */}
          <TweetContent 
            text={result.full_text || result.text}
            queryText={query.value}
          />

          {/* Debug View (inline) */}
          {debugMode.value && showDebug.value && (
            <div class="mt-3 px-4 border-t border-gray-200 dark:border-gray-700 pt-2 bg-gray-50 dark:bg-gray-800/50">
              <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2">
                  <DebugTabs 
                    activeTab={activeTab.value} 
                    onTabChange={(tab) => {
                      activeTab.value = tab
                    }} 
                  />
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showDebug.value = false;
                  }}
                  class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xs"
                >
                  Hide
                </button>
              </div>
              
              {activeTab.value === 'comparison' ? (
                <DebugComparisonView 
                  embeddingText={result.text} 
                  displayText={result.full_text || result.text} 
                />
              ) : (
                <DebugJsonView result={result} />
              )}
            </div>
          )}
        </div>
      </div>
    </a>
  );
}); 