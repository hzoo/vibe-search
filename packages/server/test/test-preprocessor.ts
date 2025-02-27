#!/usr/bin/env bun

import {
	cleanTweet,
	processThread,
	isValidTweet,
	type TweetPreprocessingOptions,
} from "../tweet-preprocessor";

// Sample tweets to test preprocessing
const sampleTweets = [
	// Tweet with leading mentions, URLs, and hashtags
	"@user1 @user2 Check out this cool article https://example.com/article #tech #news",

	// Retweet with URL and hashtags
	"RT @influencer: Just released my new course on AI! Check it out: https://example.com/course #AI #MachineLearning",

	// Tweet with emojis
	"This new product is 🔥! I'm so excited to try it 😊 #excited",

	// Tweet with inline mentions
	"Shoutout to @friend for the recommendation! It was amazing.",

	// Very short tweet after cleaning
	"Just #vibes",

	// Tweet with numbers and statistics
	"Our team grew by 250% this quarter! 🚀 #growth",

	// Thread-like tweets
	"1/4 Here's my thoughts on the new AI developments we're seeing in 2023. #AI #tech",
	"2/4 The most impressive aspect is how these models understand context across different domains.",
	"3/4 However, we still need to address issues like bias and energy consumption. @OpenAI is working on this.",
	"4/4 Overall, I'm optimistic about the future of AI. What do you think? https://example.com/survey",
];

// Test different preprocessing options
const testOptions: Record<string, TweetPreprocessingOptions> = {
	Default: {},
	"Keep Hashtags": {
		removeAllHashtags: false,
	},
	"Keep Important Hashtags": {
		removeAllHashtags: true,
		keepImportantHashtags: ["AI", "MachineLearning", "tech"],
	},
	"Remove All Mentions": {
		removeAllMentions: true,
	},
	"Convert Emojis": {
		convertEmojis: true,
	},
	"Strict (min length 20)": {
		minLength: 20,
	},
};

// Function to display test results
function displayResults(
	tweets: string[],
	options: TweetPreprocessingOptions,
	optionName: string,
) {
	console.log(`\n=== Testing with ${optionName} options ===`);

	tweets.forEach((tweet, index) => {
		const cleaned = cleanTweet(tweet, options);
		const isValid = isValidTweet(tweet, options);

		console.log(`\nOriginal [${index + 1}]: ${tweet}`);
		console.log(`Cleaned  [${index + 1}]: ${cleaned || "(empty)"}`);
		console.log(`Valid?   [${index + 1}]: ${isValid ? "Yes" : "No"}`);
	});

	// Test thread processing
	const threadTweets = tweets.slice(6).map((full_text) => ({ full_text, entities: {} }));
	console.log(`\n--- Thread Processing ---`);
	console.log(`Original Thread: ${threadTweets.map((t) => t.full_text).join("\n")}`);
	console.log(`Processed Thread: ${processThread(threadTweets, options)}`);
}

// Create a CLI wrapper for direct execution
if (import.meta.main) {
	// Run tests with different options
	console.log("🧹 Tweet Preprocessor Test 🧹");

	for (const [name, options] of Object.entries(testOptions)) {
		displayResults(sampleTweets, options, name);
	}

	// Example of how to use in the actual application
	console.log("\n\n=== Example Usage in Application ===");
	console.log(
		"// Import the preprocessor\n" +
			"import { cleanTweet, processThread, TweetPreprocessingOptions } from './tweet-preprocessor';\n" +
			"\n" +
			"// Configure preprocessing options\n" +
			"const preprocessingOptions: TweetPreprocessingOptions = {\n" +
			"  removeUrls: true,\n" +
			"  removeLeadingMentions: true,\n" +
			"  removeAllMentions: false,\n" +
			"  removeAllHashtags: true,\n" +
			'  keepImportantHashtags: ["AI", "ML", "Crypto"],\n' +
			"  removeRetweetPrefix: true,\n" +
			"  minLength: 5,\n" +
			"  convertEmojis: true,\n" +
			"  combineThreads: true\n" +
			"};\n" +
			"\n" +
			"// In your tweet processing pipeline:\n" +
			"function processTweets(tweets) {\n" +
			"  return tweets\n" +
			"    .map(tweet => {\n" +
			"      // Clean the tweet text\n" +
			"      const cleanedText = cleanTweet(tweet.full_text, preprocessingOptions);\n" +
			"      \n" +
			"      // Skip invalid tweets\n" +
			"      if (!cleanedText) return null;\n" +
			"      \n" +
			"      // Return the tweet with cleaned text\n" +
			"      return {\n" +
			"        ...tweet,\n" +
			"        cleanedText\n" +
			"      };\n" +
			"    })\n" +
			"    .filter(Boolean); // Remove null entries\n" +
			"}\n" +
			"\n" +
			"// For thread processing:\n" +
			"function buildThreads(tweets) {\n" +
			"  // ... your existing thread building logic ...\n" +
			"  \n" +
			"  // Process each thread for embedding\n" +
			"  return threads.map(thread => ({\n" +
			"    id: thread[0].id,\n" +
			"    text: processThread(thread, preprocessingOptions),\n" +
			"    metadata: {\n" +
			"      // ... your metadata ...\n" +
			"    }\n" +
			"  }));\n" +
			"}",
	);
}
