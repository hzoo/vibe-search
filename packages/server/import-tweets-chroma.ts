#!/usr/bin/env bun
import { ChromaClient, DefaultEmbeddingFunction } from "chromadb";

const CHUNK_SIZE = 500; // Process fewer tweets at a time

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

interface ThreadEmbed {
	id: string;
	text: string;
	metadata: {
		username: string;
		created_at: string;
	};
}

interface BatchData {
	batch: ThreadEmbed[];
	collectionName: string;
	embeddings: number[][];
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
	const client = new ChromaClient();
	const embedder = new DefaultEmbeddingFunction();

	const collection = await client.getOrCreateCollection({
		name: "tweets",
		embeddingFunction: embedder,
	});

	const filePath = process.argv[2];
	if (!filePath) {
		console.error("Please provide a file path as a command line argument.");
		process.exit(1);
	}

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

	// Process tweets in chunks to avoid memory issues
	let successCount = 0;
	let errorCount = 0;
	let processedCount = 0;

	// Process tweets in chunks
	for (let i = 0; i < tweetsData.tweets.length; i += CHUNK_SIZE) {
		const chunk = tweetsData.tweets.slice(i, i + CHUNK_SIZE);
		const progress = formatProgress(i, tweetsData.tweets.length);
		console.log(`\nProcessing chunk ${progress}`);

		try {
			// Process this chunk
			const processedTweets = processTweets(chunk, username, displayName);
			const threads = buildThreads(processedTweets);

			if (threads.length === 0) continue;

			// Generate embeddings for this batch
			process.stdout.write(
				`Generating embeddings for ${threads.length} threads... `,
			);
			const startTime = performance.now();
			const embeddings = await embedder.generate(threads.map((t) => t.text));
			console.log(`done in ${formatTime(performance.now() - startTime)}`);

			// Upsert to collection
			process.stdout.write("Upserting to collection... ");
			const upsertStart = performance.now();
			await collection.upsert({
				ids: threads.map((t) => t.id),
				documents: threads.map((t) => t.text),
				metadatas: threads.map((t) => t.metadata),
				embeddings,
			});
			console.log(`done in ${formatTime(performance.now() - upsertStart)}`);

			successCount += threads.length;
			processedCount += threads.length;
		} catch (error) {
			errorCount++;
			console.error("Error processing chunk:", error);
		}

		// Log progress
		const totalProgress = formatProgress(processedCount, tweetsData.tweets.length);
		console.log(`Overall progress: ${totalProgress}`);
	}

	// Verify the import
	const count = await collection.count();
	console.log("\nImport summary:");
	console.log(`- Successfully processed: ${successCount} threads`);
	console.log(`- Errors encountered: ${errorCount}`);
	console.log(`- Total items in collection: ${count}`);
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
