#!/usr/bin/env bun
import { QdrantExtended } from "qdrant-local";
import { pipeline } from '@xenova/transformers';
import { serve } from "bun";
import { spawn } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUIDv7 } from "bun";

// Import history path
const IMPORT_HISTORY_PATH = join(import.meta.dir, "import-history.json");

// Interface for import history
interface ImportHistory {
  [username: string]: {
    lastImportDate: string;
    lastTweetDate: string;
    tweetCount: number;
  };
}

// Function to load import history
async function loadImportHistory(): Promise<ImportHistory> {
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
        Bun.write(backupPath, content);
        console.warn(`Backed up corrupted import history to ${backupPath}`);
        return {};
      }
    }
  } catch (error) {
    console.warn("Error loading import history:", error);
  }
  return {};
}

// Define types for search parameters and results
interface SearchParams {
  vector: number[];
  limit: number;
  with_payload: boolean;
  filter?: {
    must: Array<{
      key: string;
      match: {
        value: string;
      };
    }>;
  };
  params?: {
    quantization: {
      rescore: boolean;
      oversampling: number;
    }
  }
}

// Import progress tracking
const importStatus = new Map<string, {
  id: string;
  username: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  error?: string;
  startTime: number;
  endTime?: number;
}>();

// Initialize the embedding model
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

// Initialize Qdrant client
const client = new QdrantExtended({ url: "http://localhost:6333" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Health check endpoint
const healthResponse = Response.json({ status: "ok" }, { headers: corsHeaders });

const server = serve({
  port: 3001,
  development: true,
  async fetch(req) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // Health check endpoint
    if (req.url.includes("/health")) {
      return healthResponse;
    }

    // Search API endpoint
    if (req.url.includes("/api/search")) {
      try {
        const { query, username, nResults = 5 } = await req.json();
        
        if (!query) {
          return Response.json(
            { error: "Query is required" },
            { status: 400, headers: corsHeaders }
          );
        }
        
        // Wait for embedder to be initialized
        if (!embedder) {
          return Response.json(
            { error: "Embedding model is still loading, please try again in a moment" },
            { status: 503, headers: corsHeaders }
          );
        }
        
        // Generate embedding for the query
        const result = await embedder(query, { pooling: 'mean', normalize: true });
        const queryVector = Array.from(result.data);
        
        // Prepare search parameters
        const searchParams: SearchParams = {
          vector: queryVector,
          limit: nResults,
          with_payload: true,
          params: {
            quantization: {
              rescore: true,
              oversampling: 1.5,
            }
          }
        };
        
        // Add filter if username is provided
        if (username) {
          searchParams.filter = {
            must: [
              {
                key: "username",
                match: {
                  value: username,
                },
              },
            ],
          };
        }
        
        // Search in Qdrant
        try {
          const results = await client.search("tweets", searchParams);
          
          // Transform the results into a simpler format
          const simplifiedResults = results.map((result) => ({
            text: result.payload?.text || "",
            distance: result.score || 0,
            username: result.payload?.username || "",
            date: result.payload?.created_at || "",
            tweet_id: result.payload?.tweet_id || ""
          }));

          return Response.json(simplifiedResults, {
            headers: corsHeaders,
          });
        } catch (searchError: unknown) {
          // Check if this is a "Not Found" error (collection doesn't exist)
          const error = searchError as { status?: number; message?: string };
          if (error.status === 404 || error.message?.includes("Not Found")) {
            return Response.json(
              { 
                error: "No tweets found. Please import tweets first.", 
                code: "NO_TWEETS_IMPORTED" 
              },
              { status: 404, headers: corsHeaders }
            );
          }
          
          // Other search errors
          console.error("Search error:", searchError);
          throw searchError;
        }
      } catch (error) {
        console.error("Search failed:", error);
        return Response.json(
          { error: "Search failed" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Import API endpoint
    if (req.url.includes("/api/import")) {
      // Check import history for a username
      if (req.url.includes("/api/import/history") && req.method === "GET") {
        const url = new URL(req.url);
        const username = url.searchParams.get("username");
        
        if (!username) {
          return Response.json(
            { error: "Username is required" },
            { status: 400, headers: corsHeaders }
          );
        }
        
        try {
          const importHistory = await loadImportHistory();
          const userHistory = importHistory[username.toLowerCase()];
          
          return Response.json(
            userHistory || { exists: false },
            { headers: corsHeaders }
          );
        } catch (error) {
          console.error("Error loading import history:", error);
          return Response.json(
            { error: "Failed to load import history" },
            { status: 500, headers: corsHeaders }
          );
        }
      }
      
      // Handle import status check
      if (req.method === "GET") {
        const url = new URL(req.url);
        const importId = url.searchParams.get("id");
        
        if (!importId) {
          return Response.json(
            { error: "Import ID is required" },
            { status: 400, headers: corsHeaders }
          );
        }
        
        const status = importStatus.get(importId);
        if (!status) {
          return Response.json(
            { error: "Import not found" },
            { status: 404, headers: corsHeaders }
          );
        }
        
        return Response.json(status, { headers: corsHeaders });
      }
      
      if (req.method === "POST") {
        // Check if this is a username import via JSON
        if (req.url.includes("/api/import/username")) {
          try {
            const { username, force = false } = await req.json();
            
            if (!username) {
              return Response.json(
                { error: "Username is required" },
                { status: 400, headers: corsHeaders }
              );
            }
            
            const importId = randomUUIDv7();
            const archiveUrl = `https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/${username.toLowerCase()}/archive.json`;
            
            // Start the import process for remote file
            startRemoteImport(importId, archiveUrl, username, force);
            
            return Response.json({ 
              success: true, 
              importId,
              message: "Remote import started" 
            }, { headers: corsHeaders });
          } catch (error) {
            console.error("Username import error:", error);
            return Response.json(
              { error: "Username import failed" },
              { status: 500, headers: corsHeaders }
            );
          }
        }
        
        // Handle regular form data upload
        try {
          const formData = await req.formData();
          const file = formData.get("file") as File | null;
          const username = formData.get("username") as string | null;
          const force = formData.get("force") === "true";
          
          // Handle file upload
          if (file) {
            const importId = randomUUIDv7();
            const tempPath = join(import.meta.dir, "temp", `${importId}.json`);
            
            // Ensure temp directory exists
            await Bun.spawn(["mkdir", "-p", join(import.meta.dir, "temp")]);
            
            // Save the uploaded file
            const buffer = await file.arrayBuffer();
            await Bun.write(tempPath, buffer);
            
            // Start the import process
            startImport(importId, tempPath, force);
            
            return Response.json({ 
              success: true, 
              importId,
              message: "Import started" 
            }, { headers: corsHeaders });
          }
          
          // Handle remote archive import
          if (username) {
            const importId = randomUUIDv7();
            const archiveUrl = `https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/${username}/archive.json`;
            
            // Start the import process for remote file
            startRemoteImport(importId, archiveUrl, username, force);
            
            return Response.json({ 
              success: true, 
              importId,
              message: "Remote import started" 
            }, { headers: corsHeaders });
          }
          
          return Response.json(
            { error: "No file or username provided" },
            { status: 400, headers: corsHeaders }
          );
        } catch (error) {
          console.error("Import error:", error);
          return Response.json(
            { error: "Import failed" },
            { status: 500, headers: corsHeaders }
          );
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

// Start the import process
function startImport(importId: string, filePath: string, force = false) {
  try {
    // Check if file exists
    if (!existsSync(filePath)) {
      importStatus.set(importId, {
        id: importId,
        username: "unknown",
        status: "failed",
        progress: 0,
        total: 0,
        error: "File not found",
        startTime: Date.now(),
        endTime: Date.now()
      });
      return;
    }
    
    // Initialize import status
    importStatus.set(importId, {
      id: importId,
      username: "unknown", // Will be updated when we read the file
      status: "pending",
      progress: 0,
      total: 0,
      startTime: Date.now()
    });
    
    // Start the import process directly using the library
    const status = importStatus.get(importId)!;
    status.status = "processing";
    importStatus.set(importId, status);
    
    // Import tweets using the library function
    import("./import-tweets-qdrant.js").then(async ({ importTweets }) => {
      try {
        const result = await importTweets({
          filePath,
          forceImport: force,
          onProgress: (progress, total, status) => {
            const currentStatus = importStatus.get(importId);
            if (currentStatus) {
              currentStatus.progress = progress;
              currentStatus.total = total;
              importStatus.set(importId, currentStatus);
            }
          }
        });
        
        // Update status with results
        const status = importStatus.get(importId)!;
        status.username = result.username;
        status.total = result.totalCount;
        status.progress = result.totalCount;
        status.status = "completed";
        status.endTime = Date.now();
        importStatus.set(importId, status);
        
        // Clean up temp file
        try {
          Bun.spawn(["rm", filePath]);
        } catch (e) {
          console.error("Failed to remove temp file:", e);
        }
      } catch (error) {
        // Update status with error
        const status = importStatus.get(importId)!;
        status.status = "failed";
        status.error = String(error);
        status.endTime = Date.now();
        importStatus.set(importId, status);
        
        console.error("Import failed:", error);
      }
    }).catch(error => {
      // Handle module import error
      const status = importStatus.get(importId)!;
      status.status = "failed";
      status.error = `Failed to load import module: ${error}`;
      status.endTime = Date.now();
      importStatus.set(importId, status);
      
      console.error("Failed to load import module:", error);
    });
  } catch (error) {
    console.error("Failed to start import:", error);
    
    // Update status with error
    importStatus.set(importId, {
      id: importId,
      username: "unknown",
      status: "failed",
      progress: 0,
      total: 0,
      error: String(error),
      startTime: Date.now(),
      endTime: Date.now()
    });
  }
}

// Start the import process for a remote file
async function startRemoteImport(importId: string, url: string, username: string, force = false) {
  try {
    // Initialize import status
    importStatus.set(importId, {
      id: importId,
      username,
      status: "pending",
      progress: 0,
      total: 0,
      startTime: Date.now()
    });
    
    // Update status to downloading
    const status = importStatus.get(importId)!;
    status.status = "processing";
    importStatus.set(importId, status);
    
    // Download the file
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download archive: ${response.status} ${response.statusText}`);
    }
    
    // Save to temp file
    const tempPath = join(import.meta.dir, "temp", `${importId}.json`);
    
    // Ensure temp directory exists
    await Bun.spawn(["mkdir", "-p", join(import.meta.dir, "temp")]);
    
    // Save the downloaded file
    const buffer = await response.arrayBuffer();
    await Bun.write(tempPath, buffer);
    
    // Start the import process directly using the library
    import("./import-tweets-qdrant.js").then(async ({ importTweets }) => {
      try {
        const result = await importTweets({
          filePath: tempPath,
          forceImport: force,
          onProgress: (progress, total, status) => {
            const currentStatus = importStatus.get(importId);
            if (currentStatus) {
              currentStatus.progress = progress;
              currentStatus.total = total;
              importStatus.set(importId, currentStatus);
            }
          }
        });
        
        // Update status with results
        const status = importStatus.get(importId)!;
        status.username = result.username;
        status.total = result.totalCount;
        status.progress = result.totalCount;
        status.status = "completed";
        status.endTime = Date.now();
        importStatus.set(importId, status);
        
        // Clean up temp file
        try {
          Bun.spawn(["rm", tempPath]);
        } catch (e) {
          console.error("Failed to remove temp file:", e);
        }
      } catch (error) {
        // Update status with error
        const status = importStatus.get(importId)!;
        status.status = "failed";
        status.error = String(error);
        status.endTime = Date.now();
        importStatus.set(importId, status);
        
        console.error("Import failed:", error);
      }
    }).catch(error => {
      // Handle module import error
      const status = importStatus.get(importId)!;
      status.status = "failed";
      status.error = `Failed to load import module: ${error}`;
      status.endTime = Date.now();
      importStatus.set(importId, status);
      
      console.error("Failed to load import module:", error);
    });
  } catch (error) {
    console.error("Failed to start remote import:", error);
    
    // Update status with error
    importStatus.set(importId, {
      id: importId,
      username,
      status: "failed",
      progress: 0,
      total: 0,
      error: String(error),
      startTime: Date.now(),
      endTime: Date.now()
    });
  }
}

console.log(`Server is running on http://localhost:${server.port}`); 