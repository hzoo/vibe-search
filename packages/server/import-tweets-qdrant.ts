#!/usr/bin/env bun

import { QdrantExtended } from "qdrant-local";
import { pipeline } from "@xenova/transformers";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	processThread,
	type TweetPreprocessingOptions,
	extractHashtags,
	extractMentions,
	extractDomains,
	unfurlUrls,
	type TweetEntities,
} from "./tweet-preprocessor";

const CHUNK_SIZE = 500; // Process fewer tweets at a time
const VECTOR_SIZE = 384; // Size of the embedding vectors from all-MiniLM-L6-v2
const IMPORT_HISTORY_PATH = join(import.meta.dir, "import-history.json");

// Configure tweet preprocessing options
const PREPROCESSING_OPTIONS: TweetPreprocessingOptions = {
	removeUrls: false,
	removeLeadingMentions: true,
	removeAllMentions: false,
	removeAllHashtags: true,
	keepImportantHashtags: ["AI", "ML", "Crypto", "Tech"],
	removeRetweetPrefix: true,
	minLength: 5,
	convertEmojis: false,
	combineThreads: true,
};

export interface Tweet {
	// Original Twitter data fields - these are fields from the Twitter API
	id: string;
	id_str: string;
	text: string;
	full_text?: string;
	created_at: string;
	entities: Record<string, unknown>;
	in_reply_to_user_id: string | null;
	in_reply_to_user_id_str: string | null;
	in_reply_to_status_id: string | null;
	in_reply_to_status_id_str: string | null;
	in_reply_to_screen_name: string | null;
	retweet_count: number;
	favorite_count: number;
	favorited: boolean;
	retweeted: boolean;
	lang: string;
	source: string;
	possibly_sensitive?: boolean;
	truncated: boolean;
	display_text_range?: [number, number];

	// Custom fields (prefixed with _) - these are fields we add for our processing
	_nextTweet?: Tweet;
	_parent?: Tweet;
	_user?: {
		username: string;
		displayName: string;
		accountId: string;
	};
	_thread_id?: string;
	_position_in_thread?: number;
	_thread_length?: number;
	_is_thread_root?: boolean;
	_tweet_type?: string;
}

interface TweetData {
	tweets: Array<{ tweet: Tweet }>;
	account: Array<{
		account: {
			createdVia: string;
			username: string;
			accountId: string;
			createdAt: string;
			accountDisplayName?: string;
		};
	}>;
}

// Simple interface for import history
interface ImportHistory {
	[username: string]: {
		lastImportDate: string;
		lastTweetDate: string;
		tweetCount: number;
	};
}

// Function to load import history
export async function loadImportHistory(): Promise<ImportHistory> {
	try {
		if (existsSync(IMPORT_HISTORY_PATH)) {
			const content = await Bun.file(IMPORT_HISTORY_PATH).text();
			if (!content.trim()) {
				return {};
			}
			try {
				return JSON.parse(content) || {};
			} catch (parseError) {
				console.error("JSON parse error in import history:", parseError);
				// If the file is corrupted, back it up and return empty object
				const backupPath = `${IMPORT_HISTORY_PATH}.backup.${Date.now()}`;
				await Bun.write(backupPath, content);
				console.warn(`Backed up corrupted import history to ${backupPath}`);
				return {};
			}
		}
	} catch (error) {
		console.warn("Error loading import history:", error);
	}
	return {};
}

// Function to save import history
export async function saveImportHistory(history: ImportHistory): Promise<void> {
	try {
		// Load existing history first
		const existingHistory = await loadImportHistory();

		// Merge the new history with existing history
		const updatedHistory = { ...existingHistory, ...history };

		// Write the merged history back to file
		await Bun.write(
			IMPORT_HISTORY_PATH,
			JSON.stringify(updatedHistory, null, 2),
		);
	} catch (error) {
		console.warn("Error saving import history:", error);
	}
}

// Add a helper for timing
export function formatTime(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export function formatProgress(current: number, total: number): string {
	const percent = ((current / total) * 100).toFixed(1);
	return `[${current}/${total}] ${percent}%`;
}

export interface ImportOptions {
	filePath: string;
	forceImport?: boolean;
	saveArchive?: boolean;
	onProgress?: (progress: number, total: number, status: string) => void;
}

export async function importTweets(options: ImportOptions) {
	const { filePath, forceImport = false, onProgress } = options;

	// Initialize Qdrant client
	const client = new QdrantExtended({ url: "http://127.0.0.1:6333" });

	console.log("Initializing Qdrant client...");
	
	// Performance tracking
	const startTime = performance.now();
	const performanceMetrics = {
		totalTweets: 0,
		processedTweets: 0,
		skippedTweets: 0,
		startTime,
		chunkTimes: [] as {chunkSize: number, processingTimeMs: number}[],
		getAverageTweetsPerSecond() {
			if (this.chunkTimes.length === 0) return 0;
			const totalTweets = this.chunkTimes.reduce((sum, chunk) => sum + chunk.chunkSize, 0);
			const totalTimeMs = this.chunkTimes.reduce((sum, chunk) => sum + chunk.processingTimeMs, 0);
			return totalTimeMs > 0 ? (totalTweets / totalTimeMs) * 1000 : 0;
		}
	};

	// Check if collection exists, if not create it
	const collections = await client.getCollections();
	const collectionExists = collections.collections.some(
		(c: { name: string }) => c.name === "tweets",
	);

	if (!collectionExists) {
		console.log("Creating 'tweets' collection in Qdrant...");
		await client.createCollection("tweets", {
			vectors: {
				size: VECTOR_SIZE,
				distance: "Cosine",
				on_disk: true, // Store vectors directly on disk for large datasets
			},
			optimizers_config: {
				indexing_threshold: 0, // Disable indexing during initial upload
			},
			shard_number: 2, // Use multiple shards for parallel uploads
			on_disk_payload: true,
			quantization_config: {
				scalar: {
					type: "int8", // Stores embeddings as int8 for memory efficiency
					always_ram: true, // Speeds up query
				},
			},
		});

		// Create payload indexes for efficient filtering
		await client.createPayloadIndex("tweets", {
			field_name: "username",
			field_schema: "keyword",
			wait: true,
		});

		// Add index for tweet_type for efficient filtering
		await client.createPayloadIndex("tweets", {
			field_name: "tweet_type",
			field_schema: "keyword",
			wait: true,
		});

		// Add index for thread_id to efficiently retrieve all tweets in a thread
		// await client.createPayloadIndex("tweets", {
		// 	field_name: "thread_id",
		// 	field_schema: "keyword",
		// 	wait: true,
		// });

		// Add numeric indexes for efficient range queries
		await client.createPayloadIndex("tweets", {
			field_name: "created_at_timestamp",
			field_schema: "integer",
			wait: true,
		});

		// await client.createPayloadIndex("tweets", {
		// 	field_name: "engagement_score",
		// 	field_schema: "integer",
		// 	wait: true,
		// });

		// await client.createPayloadIndex("tweets", {
		// 	field_name: "word_count",
		// 	field_schema: "integer",
		// 	wait: true,
		// });

		// // Add boolean indexes for filtering by content type
		// await client.createPayloadIndex("tweets", {
		// 	field_name: "has_media",
		// 	field_schema: "bool",
		// 	wait: true,
		// });

		// await client.createPayloadIndex("tweets", {
		// 	field_name: "has_links",
		// 	field_schema: "bool",
		// 	wait: true,
		// });

		await client.createPayloadIndex("tweets", {
			field_name: "contains_question",
			field_schema: "bool",
			wait: true,
		});

		// await client.createPayloadIndex("tweets", {
		// 	field_name: "is_thread_root",
		// 	field_schema: "bool",
		// 	wait: true,
		// });

		// // Add array indexes for filtering by entities
		// await client.createPayloadIndex("tweets", {
		// 	field_name: "hashtags",
		// 	field_schema: "keyword",
		// 	wait: true,
		// });

		// await client.createPayloadIndex("tweets", {
		// 	field_name: "mentions",
		// 	field_schema: "keyword",
		// 	wait: true,
		// });

		// await client.createPayloadIndex("tweets", {
		// 	field_name: "domains",
		// 	field_schema: "keyword",
		// 	wait: true,
		// });
	}

	if (!filePath) {
		throw new Error("Please provide a file path");
	}

	// Check for --force flag to skip duplicate checking
	const force = forceImport;

	console.log("Loading tweets...", filePath);
	const file = Bun.file(filePath);
	const tweetsData: TweetData = await file.json();

	const accountId = tweetsData.account[0].account.accountId;
	const username = tweetsData.account[0].account.username;
	const displayName =
		tweetsData.account[0].account.accountDisplayName || username;

	console.log(`Processing tweets for ${username}...`);

	// Filter tweets early
	console.log(`Total tweets before filtering: ${tweetsData.tweets.length}`);
	tweetsData.tweets = tweetsData.tweets.filter(({ tweet }) => {
		// Filter out retweets
		if (tweet.full_text?.startsWith("RT")) return false;

		// Filter out replies to other users
		if (
			tweet.in_reply_to_user_id_str !== null &&
			tweet.in_reply_to_user_id_str !== accountId
		)
			return false;

		return true;
	});
	console.log(`Tweets after filtering: ${tweetsData.tweets.length}`);

	if (onProgress) {
		onProgress(0, tweetsData.tweets.length, "Filtering tweets");
	}

	// Get the latest tweet date we have for this user
	let latestTweetDate: Date | null = null;

	// Load import history
	const importHistory = await loadImportHistory();

	// Skip duplicate checking if --force flag is provided
	if (force) {
		console.log("Force import flag detected, skipping duplicate checking");
	} else {
		// Check import history first (much faster than querying the database)
		if (importHistory[username]?.lastTweetDate) {
			latestTweetDate = new Date(importHistory[username].lastTweetDate);
			console.log(`Found import history for ${username}`);
			console.log(`Last import: ${importHistory[username].lastImportDate}`);
			console.log(`Latest tweet date: ${latestTweetDate.toISOString()}`);
			console.log(
				`Will only import tweets newer than ${latestTweetDate.toISOString()}`,
			);
		}
	}

	// Process tweets in chunks to avoid memory issues
	let successCount = 0;
	let errorCount = 0;
	let processedCount = 0;
	let skippedCount = 0;

	// Sort tweets by date (oldest first) to ensure proper thread building
	tweetsData.tweets.sort(
		(a, b) =>
			new Date(a.tweet.created_at).getTime() -
			new Date(b.tweet.created_at).getTime(),
	);

	// Track the latest tweet date we've seen during this import
	let newestTweetDate: Date | null = null;

	// Initialize the embedder directly in the main thread
	const embedder = await pipeline(
		"feature-extraction",
		"Xenova/all-MiniLM-L6-v2",
		{ quantized: true },
	);

	// Process tweets in chunks
	for (let i = 0; i < tweetsData.tweets.length; i += CHUNK_SIZE) {
		const chunkStartTime = performance.now();
		const chunk = tweetsData.tweets.slice(i, i + CHUNK_SIZE);
		const progress = formatProgress(i, tweetsData.tweets.length);
		console.log(`\nProcessing chunk ${progress}`);

		if (onProgress) {
			onProgress(i, tweetsData.tweets.length, "Processing tweets");
		}

		try {
			// Process this chunk
			const processedTweets = processTweets(
				chunk,
				username,
				displayName,
				accountId,
			);

			// Filter out tweets that already exist or are older than our latest tweet
			const newTweets = force
				? processedTweets // Skip filtering if force import is enabled
				: processedTweets.filter((tweet) => {
						// Skip if this tweet is older than our latest tweet
						if (latestTweetDate) {
							const tweetDate = new Date(tweet.created_at);
							if (tweetDate <= latestTweetDate) {
								skippedCount++;
								return false;
							}
						}

						return true;
					});

			if (newTweets.length === 0) {
				console.log("No new tweets in this chunk, skipping...");
				processedCount += chunk.length;
				continue;
			}

			console.log(
				`Processing ${newTweets.length} new tweets from chunk of ${processedTweets.length}`,
			);

			const threads = buildThreads(newTweets);

			if (threads.length === 0) continue;

			// Generate embeddings for this batch directly
			process.stdout.write(
				`Generating embeddings for ${threads.length} threads... `,
			);
			const embeddingStartTime = performance.now();

			// Get the text content from each thread
			const threadTexts = threads.map((t) => t?.text || "");

			// Generate embeddings directly
			// Process texts in smaller batches to avoid memory issues
			const batchSize = 50;
			const embeddings: number[][] = [];

			for (let i = 0; i < threadTexts.length; i += batchSize) {
				const batch = threadTexts.slice(i, i + batchSize);
				const batchResults = await Promise.all(
					batch.map(async (text) => {
						const result = await embedder(text, {
							pooling: "mean",
							normalize: true,
						});
						return Array.from(result.data) as number[];
					}),
				);
				embeddings.push(...batchResults);
			}

			const embeddingTime = performance.now() - embeddingStartTime;
			console.log(`done in ${formatTime(embeddingTime)}`);

			// Prepare points for Qdrant
			const points = threads.map((thread, idx) => ({
				id: BigInt(thread.id),
				vector: embeddings[idx],
				payload: {
					// Include all metadata fields for searching and filtering
					// ...thread.metadata,
					username: thread.metadata.username,
					created_at_timestamp: thread.metadata.created_at_timestamp / 1000,
					full_text: thread.metadata.full_text,
					tweet_type: thread.metadata.tweet_type,
					contains_question: thread.metadata.contains_question,
					// Add the processed text for display in search results
					text: thread.text || "",
				},
			}));

			// Upsert to Qdrant
			process.stdout.write("Upserting to Qdrant... ");
			const upsertStart = performance.now();
			try {
				await client.upsert("tweets", {
					// @ts-ignore qdrant supports bigint ids but not in the types
					points,
					wait: true,
				});
				const upsertTime = performance.now() - upsertStart;
				console.log(`done in ${formatTime(upsertTime)}`);
				successCount += threads.length;
				processedCount += threads.length;

				// Update the newest tweet date we've seen
				for (const thread of threads) {
					if (!thread) continue;
					const tweetDate = new Date(thread.metadata.created_at);
					if (!newestTweetDate || tweetDate > newestTweetDate) {
						newestTweetDate = tweetDate;
					}
				}
				
				// Track performance metrics
				const chunkEndTime = performance.now();
				const chunkProcessingTime = chunkEndTime - chunkStartTime;
				performanceMetrics.chunkTimes.push({
					chunkSize: threads.length,
					processingTimeMs: chunkProcessingTime
				});
				performanceMetrics.totalTweets += processedTweets.length;
				performanceMetrics.processedTweets += threads.length;
				
				// Log performance metrics
				const tweetsPerSecond = threads.length / (chunkProcessingTime / 1000);
				const avgTweetsPerSecond = performanceMetrics.getAverageTweetsPerSecond();
				console.log(`Chunk performance: ${tweetsPerSecond.toFixed(1)} tweets/sec`);
				console.log(`Average performance: ${avgTweetsPerSecond.toFixed(1)} tweets/sec`);
				
			} catch (error: unknown) {
				console.error("Error upserting to Qdrant:");
				if (error && typeof error === "object" && "data" in error) {
					console.error(
						"Error details:",
						JSON.stringify((error as { data: unknown }).data, null, 2),
					);
				} else {
					console.error(error);
				}
				errorCount++;
				// Continue processing other chunks
			}
		} catch (error) {
			errorCount++;
			console.error("Error processing chunk:", error);
		}

		// Log progress
		const totalProgress = formatProgress(
			processedCount,
			tweetsData.tweets.length,
		);
		console.log(`Overall progress: ${totalProgress}`);
	}

	// Calculate final performance metrics
	const endTime = performance.now();
	const totalTimeMs = endTime - startTime;
	const overallTweetsPerSecond = successCount / (totalTimeMs / 1000);
	
	// Verify the import
	const collectionInfo = await client.getCollection("tweets");
	console.log("\nImport summary:");
	console.log(`- Successfully processed: ${successCount} threads`);
	console.log(`- Skipped (already exists): ${skippedCount} tweets`);
	console.log(`- Errors encountered: ${errorCount}`);
	console.log(`- Total items in collection: ${collectionInfo.points_count}`);
	console.log(`- Total time: ${formatTime(totalTimeMs)}`);
	console.log(`- Overall performance: ${overallTweetsPerSecond.toFixed(1)} tweets/sec`);
	console.log(`- Average chunk performance: ${performanceMetrics.getAverageTweetsPerSecond().toFixed(1)} tweets/sec`);
	
	// Store performance metrics in a file for future reference
	try {
		const metricsPath = join(import.meta.dir, "import-performance.json");
		const existingMetrics = existsSync(metricsPath) 
			? JSON.parse(await Bun.file(metricsPath).text()) 
			: { imports: [] };
		
		existingMetrics.imports.push({
			date: new Date().toISOString(),
			username,
			totalTweets: tweetsData.tweets.length,
			processedTweets: successCount,
			skippedTweets: skippedCount,
			totalTimeMs,
			tweetsPerSecond: overallTweetsPerSecond,
			averageChunkTweetsPerSecond: performanceMetrics.getAverageTweetsPerSecond()
		});
		
		// Keep only the last 20 imports
		if (existingMetrics.imports.length > 20) {
			existingMetrics.imports = existingMetrics.imports.slice(-20);
		}
		
		// Define an interface for the import metrics
		interface ImportMetric {
			date: string;
			username: string;
			totalTweets: number;
			processedTweets: number;
			skippedTweets: number;
			totalTimeMs: number;
			tweetsPerSecond: number;
			averageChunkTweetsPerSecond: number;
		}

		// Calculate average performance across all imports
		const allImports = existingMetrics.imports as ImportMetric[];
		const totalProcessed = allImports.reduce((sum: number, imp: ImportMetric) => sum + imp.processedTweets, 0);
		const totalTime = allImports.reduce((sum: number, imp: ImportMetric) => sum + imp.totalTimeMs, 0);
		existingMetrics.averageTweetsPerSecond = totalProcessed / (totalTime / 1000);
		
		await Bun.write(metricsPath, JSON.stringify(existingMetrics, null, 2));
		console.log(`Performance metrics saved to ${metricsPath}`);
	} catch (error) {
		console.error("Failed to save performance metrics:", error);
	}

	// After processing all tweets, update the import history
	if (successCount > 0 && newestTweetDate) {
		// Update import history
		importHistory[username.toLowerCase()] = {
			lastImportDate: new Date().toISOString(),
			lastTweetDate: newestTweetDate.toISOString(),
			tweetCount: (importHistory[username]?.tweetCount || 0) + successCount,
		};

		await saveImportHistory(importHistory);
		console.log(`Updated import history for ${username}`);
	}

	// Re-enable indexing after upload is complete
	console.log("Re-enabling indexing...");
	await client.updateCollection("tweets", {
		optimizers_config: {
			indexing_threshold: 20000, // Default value
		},
	});

	console.log("Import complete!");

	return {
		username,
		successCount,
		skippedCount,
		errorCount,
		totalCount: tweetsData.tweets.length,
		newestTweetDate: newestTweetDate?.toISOString(),
		performanceMetrics: {
			totalTimeMs,
			tweetsPerSecond: overallTweetsPerSecond,
			averageChunkTweetsPerSecond: performanceMetrics.getAverageTweetsPerSecond()
		}
	};
}

/**
 * Determine the type of a tweet based on its relationship to other tweets
 *
 * @param tweet The tweet to classify
 * @param tweetsById Map of tweets by ID for quick lookup
 * @returns The tweet type: "standalone", "self_thread", "self_thread_continuation", "external_reply", "quote", or "retweet"
 */
function getTweetType(tweet: Tweet, tweetsById: Map<string, Tweet>): string {
	// Check for standalone tweets (not replies)
	if (tweet.in_reply_to_user_id_str === null) return "standalone";

	// Get the parent tweet if it exists in our dataset
	const parentTweet = tweet.in_reply_to_status_id_str
		? tweetsById.get(tweet.in_reply_to_status_id_str)
		: null;

	// Check for self-threads (replies to self)
	if (tweet.in_reply_to_user_id_str === tweet._user?.accountId) {
		// If we have the parent tweet, it's part of a self-thread
		// If the parent is the first tweet in the thread, mark this as a self-thread
		if (parentTweet) {
			// Check if parent is the root of the thread
			if (
				parentTweet.in_reply_to_user_id_str === null ||
				parentTweet.in_reply_to_user_id_str !== tweet._user?.accountId
			) {
				// Parent is the root, so this is the start of a self-thread
				if (parentTweet._is_thread_root !== false) {
					parentTweet._is_thread_root = true;
				}
				return "self_thread";
			}
			return "self_thread_continuation";
		}
		return "self_thread"; // Default to self-thread if we can't find the parent
	}

	// External replies (replies to others)
	return "external_reply";
}

export function processTweets(
	rawTweets: Array<{ tweet: Tweet }>,
	username: string,
	displayName: string,
	accountId: string,
): Tweet[] {
	// Build lookup table for faster access
	const tweetsById = new Map<string, Tweet>();
	rawTweets.forEach(({ tweet }) => tweetsById.set(tweet.id, tweet));

	// Early filtering and preprocessing in a single pass
	const validTweets = rawTweets
		.map(({ tweet }) => {
			// Basic preprocessing
			// tweet._url = `https://x.com/${username}/status/${tweet.id}`;
			tweet._user = {
				username: username,
				displayName: displayName,
				accountId,
			};
			// Store user_id_str for type detection
			// Determine tweet type
			tweet._tweet_type = getTweetType(tweet, tweetsById);

			return tweet;
		})
		.sort(
			(a, b) =>
				new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
		);

	console.log(
		`Filtered down to ${validTweets.length} tweets from ${rawTweets.length}`,
	);
	return validTweets;
}

export function buildThreads(tweets: Tweet[]) {
	// Build lookup table for faster access
	const tweetsById = new Map<string, Tweet>();
	tweets.forEach((tweet) => tweetsById.set(tweet.id, tweet));

	// Link replies into threads
	tweets.forEach((tweet) => {
		const parentId = tweet.in_reply_to_status_id;
		if (parentId && tweetsById.has(parentId)) {
			const parent = tweetsById.get(parentId)!;
			tweet._parent = parent;
			parent._nextTweet = tweet;
		}
	});

	// Find thread roots and build threads
	const threads: Tweet[][] = [];
	let wordCount = 0;

	for (const tweet of tweets) {
		// Skip if this tweet is part of an existing thread
		if (tweet._parent) continue;

		// Build thread
		const thread: Tweet[] = [tweet];
		let current = tweet;

		while (current._nextTweet) {
			if (current.full_text) {
				wordCount += current.full_text.split(" ").length;
			}
			thread.push(current._nextTweet);
			current = current._nextTweet;
		}

		// Add thread metadata
		const threadId = thread[0].id;
		thread.forEach((t, index) => {
			t._thread_id = threadId;
			t._position_in_thread = index + 1;
			t._thread_length = thread.length;
			t._is_thread_root = index === 0;
		});

		threads.push(thread);
	}

	console.log(
		`Built ${threads.length} threads. Total word count: ${wordCount}`,
	);

	// Convert threads to embedable format with preprocessing
	return threads
		.map((thread) => {
			// Skip empty threads
			if (!thread || thread.length === 0) return null;

			// Use our thread processor to clean and combine tweets
			const threadTweets = thread.map((tweet) => ({
				text: tweet.text || "",
				full_text: tweet.full_text || tweet.text || "",
				entities: tweet.entities,
			}));

			// Process the thread with our preprocessor
			const processedText = processThread(threadTweets, PREPROCESSING_OPTIONS);

			// Skip threads that are empty after preprocessing
			if (!processedText) {
				return null;
			}

			// Preserve the original full text for display, with URLs unfurled
			const fullText = thread
				.map((t) => {
					const text = t.full_text || t.text || "";
					// Unfurl URLs in the original text
					return unfurlUrls(text, t.entities as TweetEntities);
				})
				.join("\n\n");

			// Get the root tweet for metadata
			const rootTweet = thread[0];

			return {
				id: rootTweet.id,
				text: processedText, // Processed text for embedding
				metadata: {
					// User information
					username: rootTweet._user?.username || "",
					display_name: rootTweet._user?.displayName || "",

					// Tweet information
					created_at: rootTweet.created_at,
					created_at_timestamp: new Date(rootTweet.created_at).getTime(),
					full_text: fullText, // Original text for display

					// Classification
					tweet_type: rootTweet._tweet_type || "standalone",

					// Thread information
					thread_id: rootTweet._thread_id || rootTweet.id,
					thread_length: thread.length,
					position_in_thread: rootTweet._position_in_thread || 1,
					is_thread_root: !!rootTweet._is_thread_root,

					// Content indicators
					has_media: !!rootTweet.entities.media,
					has_links:
						Array.isArray(rootTweet.entities.urls) &&
						rootTweet.entities.urls.length > 0,
					has_mentions:
						Array.isArray(rootTweet.entities.user_mentions) &&
						rootTweet.entities.user_mentions.length > 0,
					has_hashtags:
						Array.isArray(rootTweet.entities.hashtags) &&
						rootTweet.entities.hashtags.length > 0,
					contains_question: fullText.includes("?"),
					word_count: fullText.split(/\s+/).length,

					// Extracted entities
					hashtags: extractHashtags(rootTweet.entities as TweetEntities),
					mentions: extractMentions(rootTweet.entities as TweetEntities),
					domains: extractDomains(rootTweet.entities as TweetEntities),

					// Engagement metrics
					engagement_score:
						Number(rootTweet.favorite_count) + Number(rootTweet.retweet_count),
					favorite_count: Number(rootTweet.favorite_count),
					retweet_count: Number(rootTweet.retweet_count),
				},
			};
		})
		.filter(Boolean) as {
		id: string;
		text: string;
		metadata: {
			// User information
			username: string;
			display_name: string;

			// Tweet information
			created_at: string;
			created_at_timestamp: number;
			full_text: string;

			// Classification
			tweet_type: string;

			// Thread information
			thread_id: string;
			thread_length: number;
			position_in_thread: number;
			is_thread_root: boolean;

			// Content indicators
			has_media: boolean;
			has_links: boolean;
			has_mentions: boolean;
			has_hashtags: boolean;
			contains_question: boolean;
			word_count: number;

			// Extracted entities
			hashtags: string[];
			mentions: string[];
			domains: string[];

			// Engagement metrics
			engagement_score: number;
			favorite_count: number;
			retweet_count: number;
		};
	}[]; // Remove null entries
}

// Create a CLI wrapper for direct execution
if (import.meta.main) {
	const filePath = process.argv[2];
	const forceImport = process.argv.includes("--force");

	if (!filePath) {
		console.error("Please provide a file path as a command line argument.");
		process.exit(1);
	}

	importTweets({ filePath, forceImport }).catch((error) => {
		console.error("Import failed:", error);
		process.exit(1);
	});
}
