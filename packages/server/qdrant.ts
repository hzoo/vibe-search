#!/usr/bin/env bun
import { runQdrant } from "qdrant-local";

// Start a local Qdrant instance with a fixed port
const port = await runQdrant({
  httpPort: 6333,
  enableStaticContent: true,
  dataPath: "./qdrant-data",
});

console.log(`Qdrant is running on http://localhost:${port}`);
console.log("Press Ctrl+C to stop");

// Handle termination signals for clean shutdown
process.on('SIGINT', () => {
  console.log('Shutting down Qdrant server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down Qdrant server...');
  process.exit(0);
});

// Keep the process running
process.stdin.resume(); 