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

// Define interfaces for tweet media
interface TweetMedia {
  type: string;
  media_url: string;
  media_url_https: string;
  url: string;
  display_url: string;
  expanded_url: string;
  id_str: string;
  sizes: {
    small: { w: number; h: number; resize: string };
    medium: { w: number; h: number; resize: string };
    large: { w: number; h: number; resize: string };
    thumb: { w: number; h: number; resize: string };
  };
}

export interface ExtendedEntities {
  media?: TweetMedia[];
}

// Utility function to format media URLs according to the modern format
// <base_url>?format=<format>&name=<name>
const formatMediaUrl = (mediaUrl: string, size: 'small' | 'medium' | 'large' | 'thumb' = 'medium'): string => {
  // Extract the base URL and format from the media_url_https
  const lastDotIndex = mediaUrl.lastIndexOf('.');
  if (lastDotIndex === -1) return mediaUrl; // Fallback if no extension found
  
  const baseUrl = mediaUrl.substring(0, lastDotIndex);
  const format = mediaUrl.substring(lastDotIndex + 1);
  
  // Return the formatted URL using the modern format
  return `${baseUrl}?format=${format}&name=${size}`;
};

// Update the result type to include extended_entities
type TweetResult = (typeof results.value)[0] & {
  extended_entities?: ExtendedEntities;
};

interface TweetProps {
  result: TweetResult;
  index: number;
}

// Component to display tweet media (photos, videos, etc.)
const TweetMedia = ({ media }: { media: TweetMedia[] }) => {
  if (!media || media.length === 0) return null;
  
  // Different layouts based on the number of media items
  const mediaCount = media.length;
  
  // Single media item
  if (mediaCount === 1) {
    const item = media[0];
    
    if (item.type === "photo") {
      return (
        <div class="mt-2 rounded-xl overflow-hidden">
          <a 
            href={item.expanded_url} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            class="block"
          >
            <img 
              src={formatMediaUrl(item.media_url_https, 'small')} 
              alt="Tweet media" 
              class="w-full h-auto max-h-[400px] object-cover"
              loading="lazy"
              // srcSet={`
              //   ${formatMediaUrl(item.media_url_https, 'small')} 680w,
              //   ${formatMediaUrl(item.media_url_https, 'medium')} 1200w,
              //   ${formatMediaUrl(item.media_url_https, 'large')} 2048w
              // `}
              // sizes="(max-width: 680px) 100vw, (max-width: 1200px) 100vw, 100vw"
            />
          </a>
        </div>
      );
    }
    
    if (item.type === "video" || item.type === "animated_gif") {
      return (
        <div class="mt-2 rounded-xl overflow-hidden relative">
          <a 
            href={item.expanded_url} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            class="block relative"
          >
            <img 
              src={formatMediaUrl(item.media_url_https, 'medium')} 
              alt="Tweet video thumbnail" 
              class="w-full h-auto max-h-[400px] object-cover"
              loading="lazy"
            />
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="bg-black bg-opacity-50 rounded-full p-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" class="w-8 h-8">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              </div>
            </div>
          </a>
        </div>
      );
    }
    
    // Default fallback for unknown media types
    return (
      <div class="mt-2 rounded-xl overflow-hidden">
        <a 
          href={item.expanded_url} 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          class="block text-blue-500 hover:underline"
        >
          {item.display_url}
        </a>
      </div>
    );
  }
  
  // Two media items
  if (mediaCount === 2) {
    return (
      <div class="mt-2 grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
        {media.map((item) => (
          <a 
            key={item.id_str || item.url}
            href={item.expanded_url} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            class="block h-[200px]"
          >
            <img 
              src={formatMediaUrl(item.media_url_https, 'small')} 
              alt="Tweet media" 
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </a>
        ))}
      </div>
    );
  }
  
  // Three media items
  if (mediaCount === 3) {
    return (
      <div class="mt-2 grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
        <a 
          href={media[0].expanded_url} 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          class="block row-span-2 h-[400px]"
        >
          <img 
            src={formatMediaUrl(media[0].media_url_https, 'medium')} 
            alt="Tweet media 1" 
            class="w-full h-full object-cover"
            loading="lazy"
          />
        </a>
        <a 
          href={media[1].expanded_url} 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          class="block h-[198px]"
        >
          <img 
            src={formatMediaUrl(media[1].media_url_https, 'small')} 
            alt="Tweet media 2" 
            class="w-full h-full object-cover"
            loading="lazy"
          />
        </a>
        <a 
          href={media[2].expanded_url} 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          class="block h-[198px]"
        >
          <img 
            src={formatMediaUrl(media[2].media_url_https, 'small')} 
            alt="Tweet media 3" 
            class="w-full h-full object-cover"
            loading="lazy"
          />
        </a>
      </div>
    );
  }
  
  // Four or more media items (show first 4)
  return (
    <div class="mt-2 grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
      {media.slice(0, 4).map((item, idx) => (
        <a 
          key={item.id_str || item.url}
          href={item.expanded_url} 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          class="block h-[150px] relative"
        >
          <img 
            src={formatMediaUrl(item.media_url_https, 'small')} 
            alt={`Tweet media ${idx + 1}`} 
            class="w-full h-full object-cover"
            loading="lazy"
          />
          {idx === 3 && media.length > 4 && (
            <div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center text-white font-bold text-xl">
              +{media.length - 4}
            </div>
          )}
        </a>
      ))}
    </div>
  );
};

// Component for the tweet content
const TweetContent = ({ 
  full_text, 
  queryText,
  extended_entities,
}: { 
  full_text: string; 
  queryText: string;
  extended_entities?: ExtendedEntities;
}) => {
  // Process the text to handle reply mentions
  const { isReply, replyMentions, mainText } = processReplyMentions(full_text);
  
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
          __html: highlightText(isReply ? mainText : full_text, queryText),
        }}
      />
      
      {/* Display media if available */}
      {extended_entities?.media && extended_entities.media.length > 0 && (
        <TweetMedia media={extended_entities.media} />
      )}
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
  const tweetRef = useRef<HTMLElement>(null);
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
    <article
      ref={tweetRef}
      class={`block p-3 border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 transition-colors ${
        index === selectedTweetIndex.value
          ? 'bg-white [box-shadow:rgb(142,205,248)_0px_0px_0px_2px_inset] dark:bg-blue-900/20'
          : ''
      } ${debugMode.value && showDebug.value ? 'relative' : ''} user-select-text`}
      aria-label={`Tweet by ${result.username}`}
    >
      <div class="flex gap-2">
        {/* Profile Image */}
        <div class="flex-shrink-0 relative">
          <div
            onMouseEnter={handleProfileMouseEnter}
            onMouseLeave={handleProfileMouseLeave}
          >
            {!imageLoaded.value && (
              <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            )}
            <img
              src={userData.value?.photo || "/placeholder.png"}
              alt=""
              onLoad={() => imageLoaded.value = true}
              class={`w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer ${!imageLoaded.value ? 'hidden' : ''}`}
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
          {/* Tweet Header with integrated link */}
          <div class="flex items-center gap-1 mb-0.5">
            <div class="flex-1 min-w-0">
              <a
                href={`https://x.com/${result.username}`}
                target="_blank"
                rel="noopener noreferrer"
                class="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <span class="font-bold text-gray-900 dark:text-gray-100">
                  {userData.value?.account_display_name || result.username}
                </span>
                <span class="text-gray-500 dark:text-gray-400 text-sm">
                  {" "}
                  @{result.username}
                </span>
              </a>
              <span class="text-gray-500 dark:text-gray-400 text-sm">
                {" "}
                · {formattedDate}
              </span>
              <a
                href={tweetUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                class="ml-1 inline-flex items-center text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400"
                title="View on X"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3">
                  <path fill-rule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clip-rule="evenodd" />
                </svg>
              </a>
            </div>
            <span class="text-gray-500 dark:text-gray-400 text-xs shrink-0">
              {result.distance.toFixed(3)}
            </span>
          </div>

          {/* Tweet Text */}
          <TweetContent 
            full_text={result.full_text}
            queryText={query.value}
            extended_entities={result.extended_entities}
          />

          {/* Debug View (inline) */}
          {debugMode.value && showDebug.value && (
            <div class="mt-2 px-3 border-t border-gray-200 dark:border-gray-700 pt-2 bg-gray-50 dark:bg-gray-800/50">
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
                  embeddingText={result.full_text} 
                  displayText={result.full_text} 
                />
              ) : (
                <DebugJsonView result={result} />
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}); 