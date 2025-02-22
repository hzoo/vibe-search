#!/usr/bin/env bun
import { join, dirname } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { $ } from "bun";

// Get the directory where the script is located
const SCRIPT_DIR = import.meta.dir;

const usernameArgument = process.argv[2];
if (!usernameArgument) {
  console.error("Please provide a username as argument");
  process.exit(1);
}

const filesToExtract = [
  'account.js',
  'tweets.js',
  'like.js',
  'following.js',
  'follower.js',
  'profile.js'
];

interface AccountData {
  account: {
    email?: string;
    createdVia?: string;
    [key: string]: unknown;
  }[];
}

async function processArchive(archivePath: string) {
  const outDirectory = dirname(archivePath);
  const dataDir = join(outDirectory, 'data');
  console.log(`Processing archive for ${usernameArgument} in ${outDirectory}`);
  console.log(`Archive path: ${archivePath}`);
  console.log(`Data directory: ${dataDir}`);

  // Create data directory
  await mkdir(dataDir, { recursive: true });

  // Extract archive quietly but still capture errors
  const unzipResult = await $`unzip -q -o ${archivePath} -d ${dataDir}`;
  if (unzipResult.exitCode !== 0) {
    console.error('Failed to extract archive. unzip output:');
    console.error(unzipResult.stderr);
    process.exit(1);
  }
  console.log('Archive extracted successfully');

  // Process each file
  for (const filename of filesToExtract) {
    const sourcePath = join(dataDir, 'data', filename);
    const targetPath = join(dataDir, filename.replace('.js', '.json'));
    const sourceFile = Bun.file(sourcePath);

    if (await sourceFile.exists()) {
      // Read file content and modify
      const content = await sourceFile.text();
      const modifiedContent = `[${content.split('\n').slice(1).join('\n')}`;
      await Bun.write(targetPath, modifiedContent);
      console.log(`Processed ${filename}`);
    }
  }

  // Process account.json specifically
  const accountFilePath = join(dataDir, 'account.json');
  const accountFile = Bun.file(accountFilePath);
  if (await accountFile.exists()) {
    console.log("Reading account file", accountFilePath);
    const accountData = await accountFile.json() as AccountData;
    
    // Create new account data without sensitive fields
    const sanitizedAccount = {
      ...accountData,
      account: accountData.account.map(acc => {
        const { email, createdVia, ...rest } = acc;
        return rest;
      })
    };
    
    console.log("Writing account file", accountFilePath);
    await Bun.write(accountFilePath, JSON.stringify(sanitizedAccount, null, 2));
  }

  // Combine all files
  await combineJsonFiles(
    dataDir,
    join(outDirectory, `${usernameArgument.toLowerCase()}-combined.json`)
  );
}

async function combineJsonFiles(directory: string, outputFile: string) {
  const combinedData: Record<string, unknown> = {};

  try {
    // List all JSON files in directory using node:fs
    const files = await readdir(directory);
    const jsonFiles = files.filter((f: string) => f.endsWith('.json'));

    // Process each JSON file
    for (const filename of jsonFiles) {
      const filepath = join(directory, filename);
      const fileNameWithoutExt = filename.replace('.json', '');
      const fileContents = await Bun.file(filepath).json();
      combinedData[fileNameWithoutExt] = fileContents;
    }

    // Write combined data
    await Bun.write(outputFile, JSON.stringify(combinedData, null, 2));
    console.log('Combined JSON written to', outputFile);

  } catch (err) {
    console.error('Error combining files:', err);
    throw err;
  }
}

async function run() {
  const archivePath = join(SCRIPT_DIR, 'archives', `${usernameArgument}.zip`);
  const archiveFile = Bun.file(archivePath);
  
  // Check if archive exists using Bun's file API
  if (!(await archiveFile.exists())) {
    console.error(`Archive not found: ${archivePath}`);
    console.error('Please ensure the zip file exists in packages/server/archives directory');
    process.exit(1);
  }

  await processArchive(archivePath);
  
  // Clean up data directory
  await $`rm -rf ${join(SCRIPT_DIR, 'archives', 'data')}`.quiet();
}

run().catch(console.error);
