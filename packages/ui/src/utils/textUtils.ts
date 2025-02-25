// Format date for display
export function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Format tweet date
export function formatTweetDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: dateString.includes("2024") ? undefined : "numeric",
  });
}

// Convert text with URLs and usernames to HTML with links
export function linkify(text: string) {
  const urlRegex = /https?:\/\/[^\s<]+/g;
  const usernameRegex = /@(\w+)/g;

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

  // Replace URLs first
  let replacedText = escapedText.replace(urlRegex, (url) => {
    const trimmedUrl = url.replace(/[.,;:]$/, "");
    return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${trimmedUrl}</a>`;
  });

  // Then replace usernames
  replacedText = replacedText.replace(
    usernameRegex,
    (match, username) =>
      `<a href="https://x.com/${username}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${match}</a>`,
  );

  return replacedText;
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