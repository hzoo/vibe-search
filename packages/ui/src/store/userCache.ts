import { supabase, USERS, handleSearch } from "./signals";

// User data interface
export type UserData = {
  displayName: string;
  photo: string;
  bio?: string;
  website?: string;
  location?: string;
  loadedAt: number;
  accountId: string;
};

// Cache interface
export interface UserCache {
  [username: string]: UserData;
}

// Cache constants
export const CACHE_KEY = "tweetSearchUserCache";
export const CACHE_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

// Load cache from localStorage
export function loadCache(): UserCache {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    console.error("Error loading cache:", e);
    return {};
  }
}

// Save cache to localStorage
export function saveCache(cache: UserCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Error saving cache:", e);
  }
}

// Initialize cache from localStorage
export let userCache: UserCache = loadCache();

// Get user data from cache or fetch from API
export async function getUserData(
  result: { username: string }
): Promise<UserData | null> {
  const now = Date.now();
  const cached = userCache[result.username];
  if (cached && now - cached.loadedAt < CACHE_TTL) {
    return cached;
  }

  try {
    // First check hardcoded USERS array
    const hardcodedUser = USERS.find(user => user.username === result.username);
    
    // Get account data either from hardcoded user or database
    const { data: account } = hardcodedUser 
      ? { data: { account_id: hardcodedUser.id, account_display_name: hardcodedUser.displayName } }
      : await supabase.value
        .from("all_account")
        .select("account_id, account_display_name")
        .eq("username", result.username)
        .single();

    if (!account) {
      console.error("Account not found for username:", result.username);
      return null;
    }

    // Then get profile data using account_id
    const { data: profile } = await supabase.value
      .from("profile")
      .select("avatar_media_url, bio, website, location")
      .eq("account_id", account.account_id)
      .single();

    if (profile) {
      const userData = {
        displayName: account.account_display_name || result.username,
        photo: profile.avatar_media_url,
        bio: profile.bio,
        website: profile.website,
        location: profile.location,
        loadedAt: now,
        accountId: account.account_id,
      };

      // Update cache in memory and localStorage
      userCache = { ...userCache, [result.username]: userData };
      saveCache(userCache);

      return userData;
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
  }

  return null;
}

// Clear user cache
export const handleClearCache = () => {
  userCache = {};
  saveCache(userCache);
  handleSearch(); // Refresh to update display names/photos
}; 