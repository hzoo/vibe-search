#!/usr/bin/env bun
import { join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

// Archives directory path
const ARCHIVES_DIR = join(import.meta.dir, "archives");

// Create a simple utility to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${Number.parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`;
}

// Function to list all archives
function listArchives() {
  if (!existsSync(ARCHIVES_DIR)) {
    console.log("Archives directory does not exist.");
    return;
  }

  const files = readdirSync(ARCHIVES_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const filePath = join(ARCHIVES_DIR, file);
      const stats = statSync(filePath);
      return {
        filename: file,
        path: filePath,
        size: stats.size,
        created: stats.birthtime,
        username: file.split('_')[0] // Extract username from filename pattern
      };
    })
    .sort((a, b) => b.created.getTime() - a.created.getTime()); // Sort by newest first

  if (files.length === 0) {
    console.log("No archives found.");
    return;
  }

  console.log(`Found ${files.length} archives:\n`);
  
  // Group by username
  const byUsername = files.reduce((acc, file) => {
    if (!acc[file.username]) {
      acc[file.username] = [];
    }
    acc[file.username].push(file);
    return acc;
  }, {} as Record<string, typeof files>);
  
  // Print grouped by username
  Object.entries(byUsername).forEach(([username, archives]) => {
    console.log(`\n${username} (${archives.length} archives):`);
    archives.forEach(archive => {
      console.log(`  - ${archive.filename}`);
      console.log(`    Size: ${formatBytes(archive.size)}`);
      console.log(`    Created: ${archive.created.toLocaleString()}`);
    });
  });
  
  // Print total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  console.log(`\nTotal size: ${formatBytes(totalSize)}`);
}

// Main function
async function main() {
  const command = process.argv[2];
  
  if (!command || command === 'list') {
    listArchives();
  } else if (command === 'help') {
    console.log(`
Usage: bun list-archives.ts [command]

Commands:
  list    List all saved archives (default)
  help    Show this help message
    `);
  } else {
    console.error(`Unknown command: ${command}`);
    console.log('Use "bun list-archives.ts help" for usage information');
  }
}

// Run the main function if this script is executed directly
if (import.meta.main) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
} 