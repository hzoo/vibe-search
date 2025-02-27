#!/usr/bin/env bun
/**
 * Unified startup script for Tweet Embeddings
 * 
 * This script starts all necessary services in a single process:
 * 1. Qdrant vector database
 * 2. Dev server that talks to Qdrant
 * 3. UI server
 * 
 * Usage:
 *   bun run start.ts
 */

import { spawn, type Subprocess } from "bun";
import { signal } from "@preact/signals";

// Configuration
const QDRANT_PORT = 6333;
const DEV_PORT = 3001;
const UI_PORT = 5173;

// Track process states
const qdrantReady = signal(false);
const devReady = signal(false);
const uiReady = signal(false);

// Track processes
const processes: Subprocess[] = [];

// Helper to run a command in a specific directory
function runCommand(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = spawn([cmd, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit"
  });
  
  // Track the process for clean shutdown
  processes.push(proc);
  
  if (proc.stdout) {
    proc.stdout.pipeTo(new WritableStream({
      write(chunk) {
        process.stdout.write(chunk);
      }
    }));
  }
  
  if (proc.stderr) {
    proc.stderr.pipeTo(new WritableStream({
      write(chunk) {
        process.stderr.write(chunk);
      }
    }));
  }
  
  return proc;
}

// Start Qdrant server
console.log("🚀 Starting Qdrant vector database...");
const qdrantProc = runCommand("bun", ["run", "qdrant"], "./packages/server");

// Wait for Qdrant to be ready before starting the dev server
const qdrantReadyCheck = setInterval(() => {
  fetch(`http://localhost:${QDRANT_PORT}/`)
    .then(response => {
      if (response.ok) {
        clearInterval(qdrantReadyCheck);
        qdrantReady.value = true;
        console.log("✅ Qdrant is ready!");
        startDevServer();
      }
    })
    .catch(() => {
      // Still waiting for Qdrant
      console.log("❌ Qdrant is not ready yet");
    });
}, 500);

// Start dev server
function startDevServer() {
  console.log("🚀 Starting dev server...");
  const devProc = runCommand("bun", ["run", "dev:qdrant"], "./packages/server");
  
  // Wait for dev server to be ready
  const devReadyCheck = setInterval(() => {
    fetch(`http://localhost:${DEV_PORT}/health`)
      .then(response => {
        if (response.ok) {
          clearInterval(devReadyCheck);
          devReady.value = true;
          console.log("✅ Dev server is ready!");
          startUiServer();
        }
      })
      .catch(() => {
        // Still waiting for dev server
      });
  }, 500);
}

// Start UI server
function startUiServer() {
  console.log("🚀 Starting UI server...");
  const uiProc = runCommand(
    "bun", 
    ["run", "dev"], 
    "./packages/ui",
    { VITE_API_URL: `http://localhost:${DEV_PORT}` }
  );
  
  // Wait for UI server to be ready
  const uiReadyCheck = setInterval(() => {
    fetch(`http://localhost:${UI_PORT}`)
      .then(response => {
        if (response.ok) {
          clearInterval(uiReadyCheck);
          uiReady.value = true;
          console.log("✅ UI server is ready!");
          console.log(`\n🎉 All services are running! Open http://localhost:${UI_PORT} in your browser\n`);
        }
      })
      .catch(() => {
        // Still waiting for UI
      });
  }, 500);
}

// Handle graceful shutdown
function shutdown() {
  console.log("\n🛑 Shutting down all services...");
  
  // Kill all child processes in reverse order (UI first, then dev server, then Qdrant)
  for (const proc of [...processes].reverse()) {
    try {
      proc.kill();
    } catch (err) {
      console.error("Error killing process:", err);
    }
  }
  
  console.log("All services stopped. Goodbye!");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown); 