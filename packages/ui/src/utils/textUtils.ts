// Format date for display
export function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString();
}


const currentYear = new Date().getFullYear();
// Format tweet date
export function formatTweetDate(dateString: number) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === currentYear ? undefined : "numeric",
  });
}

// Convert text with URLs and usernames to HTML with links
export function linkify(text: string) {
  // Create a combined regex that captures both URLs and usernames
  // The regex uses capturing groups to differentiate between URLs and usernames
  const combinedRegex = /(https?:\/\/[^\s<]+)|(@\w+)/g;
  
  // First, replace URLs and usernames with placeholder tokens
  // This prevents them from being affected by HTML escaping
  const tokens: Record<string, string> = {};
  let tokenCounter = 0;
  
  const tokenizedText = text.replace(combinedRegex, (match) => {
    const token = `__TOKEN_${tokenCounter++}__`;
    tokens[token] = match;
    return token;
  });
  
  // Now escape HTML in the remaining text
  const escapedText = tokenizedText.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]!,
  );
  
  // Finally, replace tokens with their HTML link versions
  return escapedText.replace(/__TOKEN_(\d+)__/g, (_, index) => {
    const originalMatch = tokens[`__TOKEN_${index}__`];
    
    // Check if it's a URL
    if (originalMatch.startsWith('http')) {
      const trimmedUrl = originalMatch.replace(/[.,;:]$/, "");
      
      // Special handling for remaining t.co URLs
      if (trimmedUrl.includes('t.co/')) {
        return '';
      }
      
      // Clean up the display text for the URL
      let displayUrl = trimmedUrl
        // Remove protocol (http://, https://)
        .replace(/^https?:\/\//, '')
        // Remove www. prefix
        .replace(/^www\./, '');
      
      // Simple truncation for long URLs
      const MAX_URL_LENGTH = 25;
      if (displayUrl.length > MAX_URL_LENGTH) {
        displayUrl = `${displayUrl.substring(0, MAX_URL_LENGTH)}...`;
      }
      
      return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${displayUrl}</a>`;
    }
    
    // If it's a username
    if (originalMatch.startsWith('@')) {
      // Extract just the username without the @ symbol
      const usernameWithoutAt = originalMatch.substring(1);
      return `<a href="https://x.com/${usernameWithoutAt}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${originalMatch}</a>`;
    }
    
    // This should never happen, but return the original match just in case
    return originalMatch;
  });
}

/**
 * Process tweet text to identify and separate reply mentions
 * @param text The tweet text to process
 * @returns An object containing the processed text parts
 */
export function processReplyMentions(text: string): { 
  isReply: boolean;
  replyMentions: string; 
  mainText: string;
} {
  // Regular expression to match mentions at the beginning of a tweet
  // This matches one or more @username patterns at the start, followed by optional whitespace
  const replyMentionsRegex = /^((@\w+\s*)+)(?=\S)/;
  
  const match = text.match(replyMentionsRegex);
  
  if (match) {
    // This is a reply tweet with mentions at the beginning
    const replyMentions = match[1].trim();
    const mainText = text.slice(match[0].length).trim();
    
    return {
      isReply: true,
      replyMentions,
      mainText
    };
  }
  
  // Not a reply or no mentions at the beginning
  return {
    isReply: false,
    replyMentions: '',
    mainText: text
  };
}

// Highlight search terms in text
export function highlightText(text: string, query: string) {
  if (!query) return linkify(text);

  const linkedText = linkify(text);
  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Use a non-greedy match to avoid matching across HTML tags
  const regex = new RegExp(`(${safeQuery})(?![^<]*>)`, "gi");

  return linkedText.replace(
    regex,
    '<mark class="bg-yellow-200 dark:bg-yellow-500/80 px-0.5 rounded">$1</mark>',
  );
} 