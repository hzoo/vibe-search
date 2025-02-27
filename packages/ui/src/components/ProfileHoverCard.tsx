import type { TwitterUser } from "@/ui/src/store/userCache";
import { LocationIcon, WebsiteIcon } from "@/ui/src/components/Icons";

interface ProfileHoverCardProps {
  userData: TwitterUser | null;
  username: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

// Helper function to format numbers with k/m suffix
function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return num.toString();
}

export function ProfileHoverCard({ 
  userData, 
  username, 
  onMouseEnter, 
  onMouseLeave 
}: ProfileHoverCardProps) {
  if (!userData) return null;
  
  return (
    <div 
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      class="absolute left-0 top-0 -translate-y-2 transform translate-x-16 z-50 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 transition-opacity duration-300"
    >
      <div class="flex items-start gap-3">
        <img
          src={userData.photo || "/placeholder.png"}
          alt=""
          class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700"
        />
        <div class="flex-1 min-w-0">
          <div class="font-bold text-gray-900 dark:text-gray-100 truncate">
            {userData.account_display_name}
          </div>
          <div class="text-gray-500 dark:text-gray-400">@{username}</div>
          
          {/* Stats row */}
          {(userData.num_tweets > 0 || userData.num_followers > 0 || userData.num_following > 0) && (
            <div class="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
              {userData.num_tweets > 0 && (
                <div>
                  <span class="font-semibold text-gray-700 dark:text-gray-300">{formatNumber(userData.num_tweets)}</span> Tweets
                </div>
              )}
              {userData.num_following > 0 && (
                <div>
                  <span class="font-semibold text-gray-700 dark:text-gray-300">{formatNumber(userData.num_following)}</span> Following
                </div>
              )}
              {userData.num_followers > 0 && (
                <div>
                  <span class="font-semibold text-gray-700 dark:text-gray-300">{formatNumber(userData.num_followers)}</span> Followers
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {userData.bio && (
        <p class="mt-3 text-gray-900 dark:text-gray-100 text-sm">{userData.bio}</p>
      )}
      <div class="mt-3 space-y-1">
        {userData.location && (
          <div class="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
            <LocationIcon />
            <span>{userData.location}</span>
          </div>
        )}
        {userData.website && (
          <div class="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
            <WebsiteIcon />
            <a 
              href={userData.website} 
              target="_blank" 
              rel="noopener noreferrer" 
              class="hover:underline text-blue-500"
              onClick={(e) => e.stopPropagation()}
            >
              {new URL(userData.website).hostname}
            </a>
          </div>
        )}
      </div>
    </div>
  );
} 