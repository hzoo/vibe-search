/**
 * Tweet Preprocessor
 * 
 * This module provides functions to clean and preprocess tweets before embedding.
 * It removes noise like URLs, mentions, and certain hashtags that don't contribute
 * to the semantic meaning of tweets.
 */

/**
 * Options for tweet preprocessing
 */
export interface TweetPreprocessingOptions {
  /** Remove all URLs from the tweet */
  removeUrls?: boolean;
  /** Remove leading @mentions (at the start of tweets) */
  removeLeadingMentions?: boolean;
  /** Remove all @mentions from the tweet */
  removeAllMentions?: boolean;
  /** Remove all hashtags from the tweet */
  removeAllHashtags?: boolean;
  /** Keep only important hashtags that match this list */
  keepImportantHashtags?: string[];
  /** Remove "RT @user:" prefixes from retweets */
  removeRetweetPrefix?: boolean;
  /** Minimum length of cleaned tweet to be considered valid */
  minLength?: number;
  /** Convert common emojis to text */
  convertEmojis?: boolean;
  /** Combine thread tweets for better context */
  combineThreads?: boolean;
}

/**
 * Default preprocessing options
 */
export const DEFAULT_PREPROCESSING_OPTIONS: TweetPreprocessingOptions = {
  removeUrls: true,
  removeLeadingMentions: true,
  removeAllMentions: false,
  removeAllHashtags: true,
  keepImportantHashtags: [],
  removeRetweetPrefix: true,
  minLength: 5,
  convertEmojis: false,
  combineThreads: true,
};

/**
 * Tweet entities interface for type safety
 */
export interface TweetEntities {
  urls?: Array<{
    url: string;
    expanded_url: string;
    display_url: string;
    indices: [number, number];
  }>;
  hashtags?: Array<{
    text: string;
    indices: [number, number];
  }>;
  user_mentions?: Array<{
    screen_name: string;
    name: string;
    indices: [number, number];
    id_str: string;
  }>;
  media?: Array<{
    type: string;
    media_url: string;
    url: string;
    indices: [number, number];
  }>;
}

/**
 * Unfurl URLs in tweet text by replacing them with their expanded URLs
 * 
 * @param text The raw tweet text
 * @param entities The tweet entities containing URL information
 * @returns The text with t.co URLs replaced by their expanded URLs
 */
export function unfurlUrls(text: string, entities: TweetEntities): string {
  if (!text || !entities?.urls?.length) {
    return text;
  }
  
  let unfurledText = text;
  
  // Sort URLs by their position in reverse order to avoid index shifting
  const urls = [...entities.urls].sort((a, b) => b.indices[0] - a.indices[0]);
  
  // Replace each URL with its expanded URL
  for (const url of urls) {
    if (url.indices && url.indices.length === 2 && url.expanded_url) {
      const start = url.indices[0];
      const end = url.indices[1];
      
      // Make sure the indices are valid
      if (start >= 0 && end <= unfurledText.length && start < end) {
        // Replace the t.co URL with its expanded URL
        unfurledText = 
          unfurledText.substring(0, start) + 
          url.expanded_url + 
          unfurledText.substring(end);
      }
    }
  }
  
  return unfurledText;
}

/**
 * Clean a tweet by removing noise like URLs, mentions, and hashtags
 * 
 * @param text The raw tweet text
 * @param options Preprocessing options
 * @param entities Optional tweet entities for URL unfurling
 * @returns The cleaned tweet text
 */
export function cleanTweet(
  text: string, 
  options: TweetPreprocessingOptions = DEFAULT_PREPROCESSING_OPTIONS,
  entities?: TweetEntities
): string {
  if (!text) return '';
  
  let cleanedText = text;
  
  // Remove retweet prefix (RT @user:)
  if (options.removeRetweetPrefix) {
    cleanedText = cleanedText.replace(/^RT @\w+:\s+/g, '');
  }
  
  // Unfurl URLs if entities are provided and we're not removing URLs
  if (entities?.urls?.length && !options.removeUrls) {
    cleanedText = unfurlUrls(cleanedText, entities);
  } else if (options.removeUrls) {
    // Otherwise remove URLs if specified
    cleanedText = cleanedText.replace(/https?:\/\/\S+/g, '');
  }
  
  // Remove leading @mentions
  if (options.removeLeadingMentions) {
    cleanedText = cleanedText.replace(/^(@\w+\s+)+/g, '');
  }
  
  // Remove all @mentions
  if (options.removeAllMentions) {
    cleanedText = cleanedText.replace(/@\w+/g, '');
  }
  
  // Handle hashtags
  if (options.removeAllHashtags) {
    // If we have important hashtags to keep
    if (options.keepImportantHashtags && options.keepImportantHashtags.length > 0) {
      // Create a regex pattern to match hashtags that are NOT in the important list
      const importantTagsPattern = options.keepImportantHashtags.join('|');
      const hashtagRegex = new RegExp(`#(?!(${importantTagsPattern})\\b)\\w+`, 'g');
      cleanedText = cleanedText.replace(hashtagRegex, '');
    } else {
      // Remove all hashtags
      cleanedText = cleanedText.replace(/#\w+/g, '');
    }
  }
  
  // Convert common emojis to text
  if (options.convertEmojis) {
    // Map of common emojis to their text representation
    const emojiMap: Record<string, string> = {
      '🔥': 'fire',
      '😂': 'laughing',
      '👍': 'thumbs up',
      '❤️': 'love',
      '🙏': 'thank you',
      '😊': 'smile',
      '👏': 'applause',
      '🤔': 'thinking',
      '💯': '100',
      '🚀': 'rocket',
    };
    
    // Replace emojis with their text representation
    for (const [emoji, text] of Object.entries(emojiMap)) {
      cleanedText = cleanedText.replace(new RegExp(emoji, 'g'), ` ${text} `);
    }
  }
  
  // Clean up extra whitespace
  cleanedText = cleanedText
    .replace(/\s+/g, ' ')
    .trim();
  
  // Check minimum length
  if (options.minLength && cleanedText.length < options.minLength) {
    return '';
  }
  
  return cleanedText;
}

/**
 * Process a thread of tweets for embedding
 * 
 * @param tweets Array of tweets in a thread
 * @param options Preprocessing options
 * @returns Cleaned and combined text ready for embedding
 */
export function processThread(
  tweets: Array<{ 
    text: string; 
    full_text?: string; 
    entities?: TweetEntities 
  }>, 
  options: TweetPreprocessingOptions = DEFAULT_PREPROCESSING_OPTIONS
): string {
  if (!tweets || tweets.length === 0) return '';
  
  // If we're not combining threads, just process the first tweet
  if (!options.combineThreads) {
    const tweetText = tweets[0].full_text || tweets[0].text || '';
    return cleanTweet(tweetText, options, tweets[0].entities);
  }
  
  // Process each tweet in the thread
  const cleanedTweets = tweets.map(tweet => {
    const tweetText = tweet.full_text || tweet.text || '';
    return cleanTweet(tweetText, options, tweet.entities);
  }).filter(Boolean); // Remove empty tweets
  
  // Combine the cleaned tweets
  return cleanedTweets.join(' ');
}

/**
 * Check if a tweet is valid for embedding after cleaning
 * 
 * @param text The raw tweet text
 * @param options Preprocessing options
 * @returns Whether the tweet is valid for embedding
 */
export function isValidTweet(text: string, options: TweetPreprocessingOptions = DEFAULT_PREPROCESSING_OPTIONS): boolean {
  const cleanedText = cleanTweet(text, options);
  
  // Check if the cleaned text is empty or too short
  if (!cleanedText || (options.minLength && cleanedText.length < options.minLength)) {
    return false;
  }
  
  // Check if the cleaned text has actual content (not just punctuation or symbols)
  const wordCount = cleanedText.split(/\s+/).filter(word => /\w+/.test(word)).length;
  return wordCount > 0;
}

/**
 * Extract hashtags from tweet entities
 * 
 * @param entities The tweet entities containing hashtag information
 * @returns Array of hashtag texts without the # symbol
 */
export function extractHashtags(entities?: TweetEntities): string[] {
  if (!entities?.hashtags?.length) {
    return [];
  }
  
  return entities.hashtags.map(hashtag => hashtag.text.toLowerCase());
}

/**
 * Extract mentions from tweet entities
 * 
 * @param entities The tweet entities containing user_mentions information
 * @returns Array of mentioned usernames without the @ symbol
 */
export function extractMentions(entities?: TweetEntities): string[] {
  if (!entities?.user_mentions?.length) {
    return [];
  }
  
  return entities.user_mentions.map(mention => mention.screen_name.toLowerCase());
}

/**
 * Extract domains from URLs in tweet entities
 * 
 * @param entities The tweet entities containing URL information
 * @returns Array of domains from the URLs
 */
export function extractDomains(entities?: TweetEntities): string[] {
  if (!entities?.urls?.length) {
    return [];
  }
  
  return entities.urls
    .map(url => {
      try {
        // Try to extract domain from expanded_url
        const urlObj = new URL(url.expanded_url);
        return urlObj.hostname.replace(/^www\./, '');
      } catch (e) {
        // If URL parsing fails, return null
        return null;
      }
    })
    .filter(Boolean) as string[]; // Remove nulls
} 