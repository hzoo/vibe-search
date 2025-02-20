#!/usr/bin/env bun
import { $ } from "bun";

async function runPythonImport(filePath: string) {
  try {
    const python = await $`python3 import_tweets.py ${filePath}`.text();
    console.log(python);
  } catch (error) {
    console.error("Failed to run Python import:", error);
  }
}

// Usage
await runPythonImport("path/to/tweets.json"); 