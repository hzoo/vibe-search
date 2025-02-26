import { supabase, handleSearch, twitterUsers, twitterUsersLoading, twitterUsersError } from "@/ui/src/store/signals";

// Cache namespace
export const CACHE_NAMESPACE = "vibe-search";

// Combined user data interface with all possible fields
export type TwitterUser = {
  username: string;
  account_display_name?: string;
  account_id?: string;
  photo?: string;
  bio?: string;
  website?: string;
  location?: string;
  loadedAt: number;
  accountId: string;
  num_tweets?: number;
  num_followers?: number;
  num_following?: number;
  cached_at?: number;
};

// Cache interface - a simple map of username to user data
export interface UserCache {
  [username: string]: TwitterUser;
}

// Cache metadata interface
export interface CacheMetadata {
  lastFullFetch: number;
}

// Cache constants
export const CACHE_KEY = `${CACHE_NAMESPACE}::users`;
export const CACHE_METADATA_KEY = `${CACHE_NAMESPACE}::metadata`;
export const USER_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days
export const USERS_LIST_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

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

// Load cache metadata
export function loadCacheMetadata(): CacheMetadata {
  try {
    const cached = localStorage.getItem(CACHE_METADATA_KEY);
    return cached ? JSON.parse(cached) : { lastFullFetch: 0 };
  } catch (e) {
    console.error("Error loading cache metadata:", e);
    return { lastFullFetch: 0 };
  }
}

// Save cache metadata
export function saveCacheMetadata(metadata: CacheMetadata) {
  try {
    localStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(metadata));
  } catch (e) {
    console.error("Error saving cache metadata:", e);
  }
}

// Initialize cache from localStorage
export let userCache: UserCache = loadCache();
export let cacheMetadata: CacheMetadata = loadCacheMetadata();

// Get user data from cache or fetch from API
export async function getUserData(
  result: { username: string }
): Promise<TwitterUser | null> {
  const now = Date.now();
  const cached = userCache[result.username];
  
  // If we have a complete cached user with photo and it's not expired
  if (cached?.photo && now - cached.loadedAt < USER_CACHE_TTL) {
    return cached;
  }

  try {
    // Get account data from database
    const { data: account } = await supabase.value
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
      // Start with existing cached data if available
      const existingData = cached || {};
      
      const userData: TwitterUser = {
        ...existingData,
        username: result.username,
        account_display_name: account.account_display_name || result.username,
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

// Fetch Twitter users from Supabase
export async function fetchTwitterUsers(limit = 300, orderBy = "num_tweets", ascending = false) {
  const now = Date.now();
  const metadata = loadCacheMetadata();
  
  // Check if we have a recent full fetch
  if (now - metadata.lastFullFetch < USERS_LIST_CACHE_TTL) {
    // If we have cached users, use them
    const cachedUsers = Object.values(userCache)
      .filter(user => user.num_tweets !== undefined)
      .map(user => ({
        username: user.username,
        account_display_name: user.account_display_name,
        account_id: user.account_id,
        num_tweets: user.num_tweets,
        num_followers: user.num_followers,
        num_following: user.num_following
      }));
      
    if (cachedUsers.length > 0) {
      twitterUsers.value = cachedUsers;
      return cachedUsers;
    }
  }
  
  twitterUsersLoading.value = true;
  twitterUsersError.value = null;
  
  try {
    const { data, error } = await supabase.value
      .from("account")
      .select("account_id, username, account_display_name, num_tweets, num_followers, num_following")
      .order(orderBy, { ascending })
      .limit(limit);
    
    if (error) throw error;
    
    if (data && data.length > 0) {
      // Update twitterUsers signal
      twitterUsers.value = data;
      
      // Update cache with user data
      const now = Date.now();
      data.forEach(user => {
        // Merge with existing data if available
        const existingData = userCache[user.username] || {};
        
        userCache[user.username] = {
          ...existingData,
          username: user.username,
          account_display_name: user.account_display_name,
          account_id: user.account_id,
          num_tweets: user.num_tweets,
          num_followers: user.num_followers,
          num_following: user.num_following,
          loadedAt: existingData.loadedAt || now
        };
      });
      
      // Save updated cache
      saveCache(userCache);
      
      // Update metadata
      cacheMetadata.lastFullFetch = now;
      saveCacheMetadata(cacheMetadata);
      
      return data;
    }
    
    return [];
  } catch (error) {
    console.error("Error fetching Twitter users:", error);
    twitterUsersError.value = error instanceof Error ? error.message : String(error);
    return [];
  } finally {
    twitterUsersLoading.value = false;
  }
}

// Search for Twitter users by username or display name
export function searchTwitterUsers(query: string) {
  if (!query.trim()) return twitterUsers.value;
  
  const lowerQuery = query.toLowerCase().trim();
  return twitterUsers.value.filter(user => 
    user.username?.toLowerCase().includes(lowerQuery) || 
    (user.account_display_name?.toLowerCase().includes(lowerQuery))
  );
}

// Clear all caches
export const handleClearCache = () => {
  // Clear cache
  userCache = {};
  saveCache(userCache);
  
  // Reset metadata
  cacheMetadata = { lastFullFetch: 0 };
  saveCacheMetadata(cacheMetadata);
  
  // Clear twitterUsers signal
  twitterUsers.value = [];
  
  handleSearch(); // Refresh to update display names/photos
}; 