#!/usr/bin/env bun

import { QdrantExtended } from "qdrant-local";
import { pipeline } from '@xenova/transformers';
import { randomUUIDv7 } from "bun";

const CHUNK_SIZE = 500; // Process fewer tweets at a time
const VECTOR_SIZE = 384; // Size of the embedding vectors from all-MiniLM-L6-v2

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


// Initialize the embedder directly in the main thread
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

// Function to get embeddings directly
async function getEmbeddings(texts: string[]): Promise<number[][]> {
	// Process texts in smaller batches to avoid memory issues
	const batchSize = 50;
	const results: number[][] = [];
	
	for (let i = 0; i < texts.length; i += batchSize) {
		const batch = texts.slice(i, i + batchSize);
		const batchResults = await Promise.all(
			batch.map(async (text) => {
				const result = await embedder!(text, { pooling: 'mean', normalize: true });
				return Array.from(result.data) as number[];
			})
		);
		results.push(...batchResults);
	}
	
	return results;
}

// Add a helper for timing
function formatTime(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatProgress(current: number, total: number): string {
	const percent = ((current / total) * 100).toFixed(1);
	return `[${current}/${total}] ${percent}%`;
}

async function importTweets() {
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

	const filePath = process.argv[2];
	if (!filePath) {
		console.error("Please provide a file path as a command line argument.");
		process.exit(1);
	}

	// Check for --force flag to skip duplicate checking
	const forceImport = process.argv.includes("--force");
	
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

	// Get existing tweet IDs to prevent duplicates
	console.log("Checking for existing tweets...");
	const existingTweetIds = new Set<string>();
	
	// Get the latest tweet date we have for this user
	let latestTweetDate: Date | null = null;
	
	// Skip duplicate checking if --force flag is provided
	if (forceImport) {
		console.log("Force import flag detected, skipping duplicate checking");
	} else {
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
					console.log(`Latest tweet date: ${latestTweetDate.toISOString()}`);
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

	// Process tweets in chunks to avoid memory issues
	let successCount = 0;
	let errorCount = 0;
	let processedCount = 0;
	let skippedCount = 0;
	
	// Sort tweets by date (oldest first) to ensure proper thread building
	tweetsData.tweets.sort((a, b) => 
		new Date(a.tweet.created_at).getTime() - new Date(b.tweet.created_at).getTime()
	);

	// Process tweets in chunks
	for (let i = 0; i < tweetsData.tweets.length; i += CHUNK_SIZE) {
		const chunk = tweetsData.tweets.slice(i, i + CHUNK_SIZE);
		const progress = formatProgress(i, tweetsData.tweets.length);
		console.log(`\nProcessing chunk ${progress}`);

		try {
			// Process this chunk
			const processedTweets = processTweets(chunk, username, displayName);
			
			// Filter out tweets that already exist or are older than our latest tweet
			const newTweets = forceImport 
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
			const embeddings = await getEmbeddings(threadTexts);
			
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
	
	// Re-enable indexing after upload is complete
	console.log("Re-enabling indexing...");
	await client.updateCollection("tweets", {
		optimizers_config: {
			indexing_threshold: 20000, // Default value
		}
	});
	
	console.log("Import complete!");
}

function processTweets(
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

function buildThreads(tweets: Tweet[]) {
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

	// Convert threads to embedable format
	return threads.map((thread) => ({
		id: thread[0].id,
		text: thread
			.map((tweet) => tweet.full_text || "")
			.filter(Boolean)
			.join(" ")
			.trim(),
		metadata: {
			username: thread[0].user?.username || "",
			created_at: thread[0].created_at,
		},
	}));
}

importTweets().catch(console.error); 