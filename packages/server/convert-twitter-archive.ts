#!/usr/bin/env bun
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync, readdirSync, createReadStream, createWriteStream } from "node:fs";
import { dirname, basename, join } from "node:path";
import { $ } from "bun";
import { createInterface } from "node:readline";

/**
 * Process a Twitter archive zip file
 * @param archivePath Path to the Twitter archive zip file
 * @returns Path to the generated JSON file
 */
export async function processArchive(archivePath: string, username: string): Promise<string> {
	const outDirectory = dirname(archivePath);

	// Create a temporary directory for extraction
	const tempDir = join(outDirectory, "temp_extract");
	await mkdir(tempDir, { recursive: true });

	console.log(`Extracting ${archivePath} to ${tempDir}...`);

	// Extract the zip file using Bun's $ shell utility
	const unzipResult = await $`unzip -q -o ${archivePath} -d ${tempDir}`;
	if (unzipResult.exitCode !== 0) {
		console.error('Failed to extract archive. unzip output:');
		console.error(unzipResult.stderr.toString());
		throw new Error("Failed to extract archive");
	}

	// Files to extract and convert
	const filesToExtract = [
		"account.js",
		"tweets.js",
		"like.js",
		"following.js",
		"follower.js",
		"profile.js",
	];

	// Find and process the JS files
	const dataDir = join(tempDir, "data");
	const processedFiles: Record<string, string> = {};
	const conversionResults: Record<string, boolean> = {};

	if (existsSync(dataDir)) {
		const files = readdirSync(dataDir);

		for (const fileName of files) {
			if (filesToExtract.includes(fileName)) {
				const filePath = join(dataDir, fileName);
				const fileNameWithoutExt = basename(fileName, ".js");
				const outPath = filePath.replace(".js", ".json");
				processedFiles[fileNameWithoutExt] = outPath;

				// Convert JS to JSON using streaming for large files
				try {
					await streamJsToJson(filePath, outPath);
					
					// Validate the converted JSON
					const isValid = await validateJsonFile(outPath);
					conversionResults[fileNameWithoutExt] = isValid;
					
					if (!isValid) {
						console.error(`Warning: Conversion of ${fileName} may not be valid JSON`);
					}
				} catch (error) {
					console.error(`Error converting ${fileName}: ${error}`);
					conversionResults[fileNameWithoutExt] = false;
				}
			}
		}
	} else {
		console.error(`Data directory not found in archive: ${dataDir}`);
		throw new Error("Invalid archive structure");
	}

	// Log conversion results
	console.log("\nConversion Results:");
	for (const [file, success] of Object.entries(conversionResults)) {
		console.log(`${file}: ${success ? '✅ Success' : '❌ Failed'}`);
	}

	// Remove email from account.json
	const accountFilePath = join(dataDir, "account.json");
	if (existsSync(accountFilePath)) {
		console.log("Sanitizing account file", accountFilePath);
		const accountData = JSON.parse(await readFile(accountFilePath, 'utf-8'));

		if (accountData[0]?.account) {
			// Create sanitized account data
			accountData[0].account.email = null;
			accountData[0].account.createdVia = null;
		}

		await writeFile(accountFilePath, JSON.stringify(accountData, null, 2));
	}

	// Extract profile data and create a lightweight profile JSON
	const profilePath = await extractProfileData(dataDir, username, processedFiles);
	console.log(`Profile data extracted to: ${profilePath}`);

	// Combine all JSON files into one
	const outputFilePath = join(
		outDirectory,
		`${username.toLowerCase()}-archive.json`,
	);
	await combineJsonFiles(processedFiles, outputFilePath);

	// Verify the final output file
	const isOutputValid = await validateJsonFile(outputFilePath);
	if (isOutputValid) {
		console.log(`✅ Final output file is valid JSON: ${outputFilePath}`);
	} else {
		console.error(`❌ Warning: Final output file may not be valid JSON: ${outputFilePath}`);
	}

	// Clean up temporary directory
	await rm(tempDir, { recursive: true, force: true });

	console.log(`Archive processed successfully. Output: ${outputFilePath}`);
	return outputFilePath;
}

/**
 * Convert a Twitter JS file to JSON format using streaming
 * This is more memory efficient for large files
 */
async function streamJsToJson(
	jsFilePath: string,
	jsonFilePath: string,
): Promise<void> {
	console.log(`Converting ${jsFilePath} to JSON...`);
	
	// Create read stream for the JS file
	const readStream = createReadStream(jsFilePath, { encoding: 'utf8' });
	const writeStream = createWriteStream(jsonFilePath);
	
	// Use readline interface to process line by line
	const rl = createInterface({
		input: readStream,
		crlfDelay: Number.POSITIVE_INFINITY
	});
	
	let isFirstLine = true;
	let content = '';
	
	// Process each line
	for await (const line of rl) {
		if (isFirstLine) {
			// Extract just the JSON part after the assignment
			const match = line.match(/^window\.[^=]+=\s*(.*)/);
			if (match?.[1]) {
				content = match[1].trim();
				isFirstLine = false;
			}
		} else {
			// Append non-empty lines
			if (line.trim() !== '') {
				content += line.trim();
			}
		}
	}
	
	// Remove trailing semicolon if present
	if (content.endsWith(';')) {
		content = content.slice(0, -1);
	}
	
	// Write the cleaned JSON content
	writeStream.write(content);
	writeStream.end();
	
	// Wait for the write to complete
	await new Promise<void>((resolve, reject) => {
		writeStream.on('finish', resolve);
		writeStream.on('error', reject);
	});
}

/**
 * Combine multiple JSON files into a single JSON file
 * Uses a more efficient approach for large files
 */
async function combineJsonFiles(
	processedFiles: Record<string, string>, 
	outputFile: string
): Promise<void> {
	console.log("Combining JSON files...");
	
	// Start the combined JSON file
	const writeStream = createWriteStream(outputFile);
	writeStream.write("{\n");
	
	let isFirst = true;
	
	// Process each file
	for (const [key, filePath] of Object.entries(processedFiles)) {
		console.log(`Adding ${key} from ${filePath}`);
		
		if (!isFirst) {
			writeStream.write(",\n");
		}
		
		// Write the key
		writeStream.write(`  "${key}": `);
		
		try {
			// Read the file content
			const content = await readFile(filePath, 'utf8');
			
			// Validate that it's proper JSON before writing
			JSON.parse(content);
			
			// Write the content
			writeStream.write(content);
			
			isFirst = false;
		} catch (error) {
			console.error(`Error processing ${filePath}: ${error}`);
			console.error("Skipping this file and continuing...");
		}
	}
	
	// Close the JSON object
	writeStream.write("\n}");
	writeStream.end();
	
	// Wait for the write to complete
	await new Promise<void>((resolve, reject) => {
		writeStream.on('finish', resolve);
		writeStream.on('error', reject);
	});
	
	console.log(`Combined JSON has been written to ${outputFile}`);
}

/**
 * Validate that a file contains valid JSON
 */
async function validateJsonFile(filePath: string): Promise<boolean> {
	try {
		const content = await readFile(filePath, 'utf8');
		JSON.parse(content);
		return true;
	} catch (error) {
		console.error(`JSON validation error for ${filePath}: ${error}`);
		return false;
	}
}

/**
 * Extract profile data from Twitter archive and create a lightweight profile JSON
 * This contains essential user information needed by the UI
 */
async function extractProfileData(
	dataDir: string, 
	username: string,
	processedFiles: Record<string, string>
): Promise<string> {
	console.log("Extracting profile data...");
	
	// Initialize profile data structure
	const profileData: {
		username: string;
		account_display_name?: string;
		account_id?: string;
		photo?: string;
		bio?: string;
		website?: string;
		location?: string;
		num_tweets: number;
		num_followers: number;
		num_following: number;
		cached_at: number;
	} = {
		username: username,
		num_tweets: 0,
		num_followers: 0,
		num_following: 0,
		cached_at: Date.now()
	};
	
	// Extract account data
	const accountPath = processedFiles.account;
	if (accountPath && existsSync(accountPath)) {
		try {
			const accountData = JSON.parse(await readFile(accountPath, 'utf-8'));
			if (accountData[0]?.account) {
				profileData.account_display_name = accountData[0].account.accountDisplayName;
				profileData.account_id = accountData[0].account.accountId;
				profileData.username = accountData[0].account.username || username;
			}
		} catch (error) {
			console.error("Error extracting account data:", error);
		}
	}
	
	// Extract profile data
	const profilePath = processedFiles.profile;
	if (profilePath && existsSync(profilePath)) {
		try {
			const profileInfo = JSON.parse(await readFile(profilePath, 'utf-8'));
			if (profileInfo[0]?.profile) {
				profileData.photo = profileInfo[0].profile.avatarMediaUrl;
				profileData.bio = profileInfo[0].profile.description?.bio;
				profileData.website = profileInfo[0].profile.description?.website;
				profileData.location = profileInfo[0].profile.description?.location;
			}
		} catch (error) {
			console.error("Error extracting profile data:", error);
		}
	}
	
	// Count tweets
	const tweetsPath = processedFiles.tweets;
	if (tweetsPath && existsSync(tweetsPath)) {
		try {
			const tweetsData = JSON.parse(await readFile(tweetsPath, 'utf-8'));
			profileData.num_tweets = tweetsData.length || 0;
		} catch (error) {
			console.error("Error counting tweets:", error);
		}
	}
	
	// Count followers
	const followerPath = processedFiles.follower;
	if (followerPath && existsSync(followerPath)) {
		try {
			const followerData = JSON.parse(await readFile(followerPath, 'utf-8'));
			profileData.num_followers = followerData.length || 0;
		} catch (error) {
			console.error("Error counting followers:", error);
		}
	}
	
	// Count following
	const followingPath = processedFiles.following;
	if (followingPath && existsSync(followingPath)) {
		try {
			const followingData = JSON.parse(await readFile(followingPath, 'utf-8'));
			profileData.num_following = followingData.length || 0;
		} catch (error) {
			console.error("Error counting following:", error);
		}
	}
	
	// Write profile data to archives directory instead of temp directory
	const ARCHIVES_DIR = join(import.meta.dir, "archives");
	await mkdir(ARCHIVES_DIR, { recursive: true });
	
	// Create filename with timestamp to avoid overwriting
	const outputPath = join(ARCHIVES_DIR, `${username.toLowerCase()}-profile.json`);
	await writeFile(outputPath, JSON.stringify(profileData, null, 2));
	
	console.log(`Profile data saved to archives directory: ${outputPath}`);
	
	// Also save a copy in the temp directory for backward compatibility
	const tempOutputPath = join(dirname(dataDir), `${username.toLowerCase()}-profile.json`);
	await writeFile(tempOutputPath, JSON.stringify(profileData, null, 2));
	
	return outputPath;
}

// Main function
async function main(username: string) {
	try {
		const ARCHIVES_DIR = join(import.meta.dir, "archives");
		// Create archives directory if it doesn't exist
		await mkdir(ARCHIVES_DIR, { recursive: true });
		const archivePath = join(ARCHIVES_DIR, `${username}.zip`);
		
		// Check if archive exists
		if (!existsSync(archivePath)) {
			console.error(`Archive not found: ${archivePath}`);
			console.error('Please ensure the zip file exists in the archives directory');
			process.exit(1);
		}

		await processArchive(archivePath, username);
	} catch (error) {
		console.error("Error processing archive:", error);
		process.exit(1);
	}
}

// Verify an existing JSON file
async function verifyJsonFile(filePath: string): Promise<void> {
	console.log(`Verifying JSON file: ${filePath}`);
	
	if (!existsSync(filePath)) {
		console.error(`File not found: ${filePath}`);
		process.exit(1);
	}
	
	try {
		// Try to parse the file
		const content = await readFile(filePath, 'utf8');
		const data = JSON.parse(content);
		
		// Check for expected keys
		const expectedKeys = ['account', 'tweets', 'following', 'follower', 'profile'];
		const foundKeys = Object.keys(data);
		
		console.log(`\nFound data keys: ${foundKeys.join(', ')}`);
		
		// Check if all expected keys are present
		const missingKeys = expectedKeys.filter(key => !foundKeys.includes(key));
		if (missingKeys.length > 0) {
			console.warn(`⚠️ Warning: Missing expected keys: ${missingKeys.join(', ')}`);
		}
		
		// Print some stats about the data
		console.log('\nData statistics:');
		for (const [key, value] of Object.entries(data)) {
			if (Array.isArray(value)) {
				console.log(`- ${key}: ${value.length} items`);
			} else {
				console.log(`- ${key}: Present`);
			}
		}
		
		console.log('\n✅ JSON file is valid');
	} catch (error) {
		console.error(`❌ Error parsing JSON file: ${error}`);
		process.exit(1);
	}
}

// Run the script if called directly
if (import.meta.path === Bun.main) {
	// Get command and arguments
	const command = process.argv[2];
	const argument = process.argv[3];
	
	if (!command) {
		console.error("Please provide a command: convert <username> or verify <filepath>");
		process.exit(1);
	}
	
	if (command === 'convert') {
		if (!argument) {
			console.error("Please provide a username for conversion");
			process.exit(1);
		}
		main(argument);
	} else if (command === 'verify') {
		if (!argument) {
			console.error("Please provide a filepath to verify");
			process.exit(1);
		}
		verifyJsonFile(argument);
	} else {
		console.error(`Unknown command: ${command}`);
		console.error("Available commands: convert <username>, verify <filepath>");
		process.exit(1);
	}
}
