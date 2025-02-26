import type { TwitterUser } from "@/ui/src/store/userCache";

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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
              <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd" />
            </svg>
            <span>{userData.location}</span>
          </div>
        )}
        {userData.website && (
          <div class="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
              <path fill-rule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clip-rule="evenodd" />
            </svg>
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