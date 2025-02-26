import { supabase, twitterUsers, twitterUsersLoading, twitterUsersError } from "@/ui/src/store/signals";

// Cache constants
export const USERS_CACHE_KEY = "tweetSearchTwitterUsers";
export const USERS_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// User type from Supabase
export type TwitterUser = {
  username: string;
  account_display_name: string;
  account_id: string;
  num_tweets?: number;
  num_followers?: number;
  num_following?: number;
  cached_at?: number;
};

// Load cached users from localStorage
export function loadCachedUsers(): TwitterUser[] {
  try {
    const cached = localStorage.getItem(USERS_CACHE_KEY);
    if (!cached) return [];
    
    const parsedCache = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (parsedCache.timestamp && now - parsedCache.timestamp < USERS_CACHE_TTL) {
      return parsedCache.users || [];
    }
    return [];
  } catch (e) {
    console.error("Error loading cached users:", e);
    return [];
  }
}

// Save users to localStorage
export function saveUsersToCache(users: TwitterUser[]) {
  try {
    const cacheData = {
      users,
      timestamp: Date.now()
    };
    localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(cacheData));
  } catch (e) {
    console.error("Error saving users to cache:", e);
  }
}

// Fetch Twitter users from Supabase
export async function fetchTwitterUsers(limit = 300, orderBy = "num_tweets", ascending = false) {
  // First check if we have cached users
  const cachedUsers = loadCachedUsers();
  if (cachedUsers.length > 0) {
    twitterUsers.value = cachedUsers;
    return cachedUsers;
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
      twitterUsers.value = data;
      saveUsersToCache(data);
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
    user.username.toLowerCase().includes(lowerQuery) || 
    (user.account_display_name?.toLowerCase().includes(lowerQuery))
  );
}

// Clear Twitter users cache
export function clearTwitterUsersCache() {
  localStorage.removeItem(USERS_CACHE_KEY);
  twitterUsers.value = [];
} 