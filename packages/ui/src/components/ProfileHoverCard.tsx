import type { TwitterUser } from "@/ui/src/store/userCache";
import { LocationIcon, WebsiteIcon } from "@/ui/src/components/Icons";

interface ProfileHoverCardProps {
  userData: TwitterUser | null;
  username: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
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