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
  // First escape HTML
  const escapedText = text.replace(
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

  // Create a combined regex that captures both URLs and usernames
  // The regex uses capturing groups to differentiate between URLs and usernames
  const combinedRegex = /(https?:\/\/[^\s<]+)|(@\w+)/g;
  
  // Replace both URLs and usernames in a single pass
  return escapedText.replace(combinedRegex, (match, url, username) => {
    // If url is defined, this match is a URL
    if (url) {
      const trimmedUrl = url.replace(/[.,;:]$/, "");
      
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
    
    // If username is defined and not part of a URL, this match is a username
    // We know it's not part of a URL because the URL pattern would have matched first
    if (username) {
      // Extract just the username without the @ symbol
      const usernameWithoutAt = username.substring(1);
      return `<a href="https://x.com/${usernameWithoutAt}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${username}</a>`;
    }
    
    // This should never happen, but return the original match just in case
    return match;
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
    '<mark class="bg-yellow-200 dark:bg-yellow-500 px-0.5 rounded">$1</mark>',
  );
} 