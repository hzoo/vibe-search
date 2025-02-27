import { supabase, handleSearch, twitterUsers, twitterUsersLoading, twitterUsersError, baseUrl } from "@/ui/src/store/signals";

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
  num_tweets: number;
  num_followers: number;
  num_following: number;
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

// Define the local profile type
export type LocalProfile = {
  username: string;
  account_display_name?: string;
  account_id?: string;
  photo?: string;
  bio?: string;
  website?: string;
  location?: string;
  num_tweets: number;
  num_followers: number;
  num_following: number;
  cached_at: number;
};

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

    if (account) {
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
    }
    
    // If not found in Supabase, try to get from local API
    const localProfile = await fetchLocalProfile(result.username);
    
    if (localProfile) {
      // Start with existing cached data if available
      const existingData = cached || {};
      
      const userData: TwitterUser = {
        ...existingData,
        username: localProfile.username,
        account_display_name: localProfile.account_display_name || localProfile.username,
        photo: localProfile.photo,
        bio: localProfile.bio,
        website: localProfile.website,
        location: localProfile.location,
        loadedAt: now,
        accountId: localProfile.account_id || '',
        num_tweets: localProfile.num_tweets,
        num_followers: localProfile.num_followers,
        num_following: localProfile.num_following,
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

// Fetch profile data from local API
async function fetchLocalProfile(username: string): Promise<LocalProfile | null> {
  try {
    const response = await fetch(`${baseUrl}/api/profile/${username}`);
    
    if (!response.ok) {
      if (response.status !== 404) {
        console.error(`Error fetching local profile: ${response.statusText}`);
      }
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error("Error fetching local profile:", error);
    return null;
  }
}

/**
 * Fetch and cache a user profile after import completion
 * This ensures the profile is immediately available for display
 */
export async function fetchAndCacheUserProfile(username: string): Promise<TwitterUser | null> {
  console.log(`Fetching and caching profile for ${username} after import`);
  
  // Force a fresh fetch by bypassing the cache
  const profile = await getUserData({ username });
  
  if (profile) {
    // Make sure the profile is added to the twitterUsers list if not already there
    const existingUserIndex = twitterUsers.value.findIndex(u => u.username === username);
    
    if (existingUserIndex >= 0) {
      // Update the existing user in the list
      const updatedUsers = [...twitterUsers.value];
      updatedUsers[existingUserIndex] = {
        ...updatedUsers[existingUserIndex],
        ...profile
      };
      twitterUsers.value = updatedUsers;
    } else {
      // Add the user to the list
      twitterUsers.value = [profile, ...twitterUsers.value];
    }
    
    return profile;
  }
  
  return null;
}

// Fetch available local profiles
export async function fetchLocalProfiles(): Promise<string[]> {
  try {
    const response = await fetch('/api/profiles');
    
    if (!response.ok) {
      console.error(`Error fetching local profiles: ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    return data.profiles || [];
  } catch (error) {
    console.error("Error fetching local profiles:", error);
    return [];
  }
}

// Fetch Twitter users from Supabase
export async function fetchTwitterUsers(limit = 300, orderBy = "num_tweets") {
  const now = Date.now();
  const metadata = loadCacheMetadata();
  
  // Check if we have a recent full fetch
  if (now - metadata.lastFullFetch < USERS_LIST_CACHE_TTL) {
    // If we have cached users, use them
    const cachedUsers = Object.values(userCache)
      .sort((a, b) => b.num_tweets - a.num_tweets);
      
    if (cachedUsers.length > 0) {
      twitterUsers.value = cachedUsers;
      return cachedUsers;
    }
  }
  
  twitterUsersLoading.value = true;
  twitterUsersError.value = null;
  
  try {
    // First try to get users from Supabase
    const { data, error } = await supabase.value
      .from("account")
      .select("account_id, username, account_display_name, num_tweets, num_followers, num_following")
      .order(orderBy, { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    let users = data || [];
    
    // Then try to get local profiles
    const localProfiles = await fetchLocalProfiles();
    
    // For each local profile, fetch the full profile data
    for (const username of localProfiles) {
      // Skip if already in the list
      if (users.some(u => u.username === username)) continue;
      
      const profile = await fetchLocalProfile(username);
      if (profile) {
        users.push({
          account_id: profile.account_id || '',
          username: profile.username,
          account_display_name: profile.account_display_name || profile.username,
          num_tweets: profile.num_tweets,
          num_followers: profile.num_followers,
          num_following: profile.num_following
        });
      }
    }
    
    if (users.length > 0) {
      // Sort by tweet count
      users = users.sort((a, b) => b.num_tweets - a.num_tweets);
      
      // Update twitterUsers signal
      twitterUsers.value = users;
      
      // Update cache with user data
      const now = Date.now();
      users.forEach(user => {
        // Merge with existing data if available
        const existingData = userCache[user.username] || {};
        userCache[user.username] = {
          ...existingData,
          loadedAt: existingData.loadedAt || now
        };
      });
      
      // Save updated cache
      saveCache(userCache);
      
      // Update metadata
      cacheMetadata.lastFullFetch = now;
      saveCacheMetadata(cacheMetadata);
      
      return users;
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