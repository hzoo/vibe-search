#!/usr/bin/env bun

import { QdrantExtended } from "qdrant-local";
import { pipeline } from '@xenova/transformers';
import { randomUUIDv7 } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanTweet, processThread, type TweetPreprocessingOptions } from "./tweet-preprocessor";

const CHUNK_SIZE = 500; // Process fewer tweets at a time
const VECTOR_SIZE = 384; // Size of the embedding vectors from all-MiniLM-L6-v2
const IMPORT_HISTORY_PATH = join(import.meta.dir, "import-history.json");

// Configure tweet preprocessing options
const PREPROCESSING_OPTIONS: TweetPreprocessingOptions = {
	removeUrls: true,
	removeLeadingMentions: true,
	removeAllMentions: false,
	removeAllHashtags: true,
	keepImportantHashtags: ["AI", "ML", "Crypto", "Tech"],
	removeRetweetPrefix: true,
	minLength: 5,
	convertEmojis: false,
	combineThreads: true,
};

interface Tweet {
	id: string;
	text: string;
	full_text?: string;
	created_at: string;
	entities: Record<string, unknown>;
	in_reply_to_user_id: string | null;
	in_reply_to_user_id_str: string | null;
	in_reply_to_status_id: string | null;
	retweet_count: number;
	favorite_count: number;
	// Extended properties for our use
	url?: string;
	nextTweet?: Tweet;
	parent?: Tweet;
	is_external_reply?: boolean;
	user?: {
		username: string;
		displayName: string;
	};
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
		await Bun.write(IMPORT_HISTORY_PATH, JSON.stringify(updatedHistory, null, 2));
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
	onProgress?: (progress: number, total: number, status: string) => void;
}

export async function importTweets(options: ImportOptions) {
	const { filePath, forceImport = false, onProgress } = options;
	
	// Initialize Qdrant client
	const client = new QdrantExtended({ url: "http://127.0.0.1:6333" });

	console.log("Initializing Qdrant client...");
	
	// Check if collection exists, if not create it
	const collections = await client.getCollections();
	const collectionExists = collections.collections.some((c: { name: string }) => c.name === "tweets");
	
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
		
		await client.createPayloadIndex("tweets", {
			field_name: "created_at",
			field_schema: "keyword",
			wait: true,
		});
		
		// Index for original tweet ID to allow searching by the original ID
		await client.createPayloadIndex("tweets", {
			field_name: "tweet_id",
			field_schema: "keyword",
			wait: true,
		});
	}

	if (!filePath) {
		throw new Error("Please provide a file path");
	}

	// Check for --force flag to skip duplicate checking
	const force = forceImport;
	
	console.log("Loading tweets...");
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

	// Get existing tweet IDs to prevent duplicates
	console.log("Checking for existing tweets...");
	const existingTweetIds = new Set<string>();
	
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
			console.log(`Will only import tweets newer than ${latestTweetDate.toISOString()}`);
		} else {
			console.log(`No import history found for ${username}, checking database...`);
			try {
				// Get a small sample of tweets to find the latest one
				const latestTweetQuery = await client.scroll("tweets", {
					filter: {
						must: [
							{
								key: "username",
								match: {
									value: username,
								},
							},
						],
					},
					limit: 100, // Get a reasonable sample to find the latest tweet
					with_payload: true,
				});
				
				// Find the latest tweet date from the sample
				if (latestTweetQuery.points.length > 0) {
					// Find the latest date from the returned tweets
					for (const point of latestTweetQuery.points) {
						if (point.payload?.created_at) {
							const tweetDate = new Date(point.payload.created_at as string);
							if (!latestTweetDate || tweetDate > latestTweetDate) {
								latestTweetDate = tweetDate;
							}
						}
					}
					
					if (latestTweetDate) {
						console.log(`Latest tweet date from database: ${latestTweetDate.toISOString()}`);
						console.log(`Will only import tweets newer than ${latestTweetDate.toISOString()}`);
					}
				} else {
					console.log("No existing tweets found for this user, will import all tweets");
				}
			} catch (error) {
				console.warn("Error checking for existing tweets:", error);
				console.warn("Continuing with import, but duplicates may be created.");
			}
		}
	}

	// Process tweets in chunks to avoid memory issues
	let successCount = 0;
	let errorCount = 0;
	let processedCount = 0;
	let skippedCount = 0;
	
	// Sort tweets by date (oldest first) to ensure proper thread building
	tweetsData.tweets.sort((a, b) => 
		new Date(a.tweet.created_at).getTime() - new Date(b.tweet.created_at).getTime()
	);

	// Track the latest tweet date we've seen during this import
	let newestTweetDate: Date | null = null;

	// Initialize the embedder directly in the main thread
	const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

	// Process tweets in chunks
	for (let i = 0; i < tweetsData.tweets.length; i += CHUNK_SIZE) {
		const chunk = tweetsData.tweets.slice(i, i + CHUNK_SIZE);
		const progress = formatProgress(i, tweetsData.tweets.length);
		console.log(`\nProcessing chunk ${progress}`);
		
		if (onProgress) {
			onProgress(i, tweetsData.tweets.length, "Processing tweets");
		}

		try {
			// Process this chunk
			const processedTweets = processTweets(chunk, username, displayName);
			
			// Filter out tweets that already exist or are older than our latest tweet
			const newTweets = force 
				? processedTweets // Skip filtering if force import is enabled
				: processedTweets.filter(tweet => {
					// Skip if we already have this tweet
					if (existingTweetIds.has(tweet.id)) {
						skippedCount++;
						return false;
					}
					
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
			
			console.log(`Processing ${newTweets.length} new tweets from chunk of ${processedTweets.length}`);
			
			const threads = buildThreads(newTweets);

			if (threads.length === 0) continue;

			// Generate embeddings for this batch directly
			process.stdout.write(
				`Generating embeddings for ${threads.length} threads... `,
			);
			const startTime = performance.now();
			
			// Get the text content from each thread
			const threadTexts = threads.map(t => t.text);
			
			// Generate embeddings directly
				// Process texts in smaller batches to avoid memory issues
			const batchSize = 50;
			const embeddings: number[][] = [];

			for (let i = 0; i < threadTexts.length; i += batchSize) {
				const batch = threadTexts.slice(i, i + batchSize);
				const batchResults = await Promise.all(
					batch.map(async (text) => {
						const result = await embedder(text, { pooling: 'mean', normalize: true });
						return Array.from(result.data) as number[];
					})
				);
				embeddings.push(...batchResults);
			}

			console.log(`done in ${formatTime(performance.now() - startTime)}`);

			// Prepare points for Qdrant
			const points = threads.map((thread, idx) => ({
				// Use UUIDv7 for point ID instead of tweet ID to avoid truncation issues
				// UUIDv7 includes a timestamp component which maintains sortability
				id: randomUUIDv7(),
				vector: embeddings[idx],
				payload: {
					text: thread.text,
					username: thread.metadata.username,
					created_at: thread.metadata.created_at,
					tweet_id: thread.id, // Store original tweet ID in payload
				},
			}));

			// Upsert to Qdrant
			process.stdout.write("Upserting to Qdrant... ");
			const upsertStart = performance.now();
			try {
				await client.upsert("tweets", {
					points,
					wait: true,
				});
				console.log(`done in ${formatTime(performance.now() - upsertStart)}`);
				successCount += threads.length;
				processedCount += threads.length;
				
				// Add these tweet IDs to our set to prevent duplicates in future chunks
				threads.forEach(thread => existingTweetIds.add(thread.id));
				
				// Update the newest tweet date we've seen
				for (const thread of threads) {
					const tweetDate = new Date(thread.metadata.created_at);
					if (!newestTweetDate || tweetDate > newestTweetDate) {
						newestTweetDate = tweetDate;
					}
				}
			} catch (error: unknown) {
				console.error("Error upserting to Qdrant:");
				if (error && typeof error === 'object' && 'data' in error) {
					console.error("Error details:", JSON.stringify((error as { data: unknown }).data, null, 2));
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
		const totalProgress = formatProgress(processedCount, tweetsData.tweets.length);
		console.log(`Overall progress: ${totalProgress}`);
	}

	// Verify the import
	const collectionInfo = await client.getCollection("tweets");
	console.log("\nImport summary:");
	console.log(`- Successfully processed: ${successCount} threads`);
	console.log(`- Skipped (already exists): ${skippedCount} tweets`);
	console.log(`- Errors encountered: ${errorCount}`);
	console.log(`- Total items in collection: ${collectionInfo.points_count}`);
	
	// After processing all tweets, update the import history
	if (successCount > 0 && newestTweetDate) {
		// Update import history
		importHistory[username.toLowerCase()] = {
			lastImportDate: new Date().toISOString(),
			lastTweetDate: newestTweetDate.toISOString(),
			tweetCount: (importHistory[username]?.tweetCount || 0) + successCount
		};
		
		await saveImportHistory(importHistory);
		console.log(`Updated import history for ${username}`);
	}
	
	// Re-enable indexing after upload is complete
	console.log("Re-enabling indexing...");
	await client.updateCollection("tweets", {
		optimizers_config: {
			indexing_threshold: 20000, // Default value
		}
	});
	
	console.log("Import complete!");
	
	return {
		username,
		successCount,
		skippedCount,
		errorCount,
		totalCount: tweetsData.tweets.length,
		newestTweetDate: newestTweetDate?.toISOString()
	};
}

export function processTweets(
	rawTweets: Array<{ tweet: Tweet }>,
	username: string,
	displayName: string,
): Tweet[] {
	// Early filtering and preprocessing in a single pass
	const validTweets = rawTweets
		.map(({ tweet }) => {
			// Basic preprocessing
			tweet.url = `https://x.com/${username}/status/${tweet.id}`;
			tweet.user = {
				username: username,
				displayName: displayName,
			};
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
			tweet.parent = parent;
			parent.nextTweet = tweet;
		}
	});

	// Find thread roots and build threads
	const threads: Tweet[][] = [];
	let wordCount = 0;

	for (const tweet of tweets) {
		// Skip if this tweet is part of an existing thread
		if (tweet.parent) continue;

		// Build thread
		const thread: Tweet[] = [tweet];
		let current = tweet;

		while (current.nextTweet) {
			if (current.full_text) {
				wordCount += current.full_text.split(" ").length;
			}
			thread.push(current.nextTweet);
			current = current.nextTweet;
		}

		threads.push(thread);
	}

	console.log(
		`Built ${threads.length} threads. Total word count: ${wordCount}`,
	);

	// Convert threads to embedable format with preprocessing
	return threads.map((thread) => {
		// Use our thread processor to clean and combine tweets
		const threadTweets = thread.map(tweet => ({
			text: tweet.text || "",
			full_text: tweet.full_text || tweet.text || "",
		}));
		
		// Process the thread with our preprocessor
		const processedText = processThread(threadTweets, PREPROCESSING_OPTIONS);
		
		// Skip threads that are empty after preprocessing
		if (!processedText) {
			return null;
		}
		
		return {
			id: thread[0].id,
			text: processedText,
			metadata: {
				username: thread[0].user?.username || "",
				created_at: thread[0].created_at,
			},
		};
	}).filter(Boolean); // Remove null entries
}

// Create a CLI wrapper for direct execution
if (import.meta.main) {
	const filePath = process.argv[2];
	const forceImport = process.argv.includes("--force");
	
	if (!filePath) {
		console.error("Please provide a file path as a command line argument.");
		process.exit(1);
	}
	
	importTweets({ filePath, forceImport })
		.catch(error => {
			console.error("Import failed:", error);
			process.exit(1);
		});
} 