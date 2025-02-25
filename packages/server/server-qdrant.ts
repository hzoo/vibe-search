#!/usr/bin/env bun
import { QdrantExtended } from "qdrant-local";
import { pipeline } from '@xenova/transformers';
import { serve } from "bun";
import { spawn } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUIDv7 } from "bun";

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
      } catch (error) {
        return Response.json(
          { error: "Search failed" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Import API endpoint
    if (req.url.includes("/api/import")) {
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
            const { username } = await req.json();
            
            if (!username) {
              return Response.json(
                { error: "Username is required" },
                { status: 400, headers: corsHeaders }
              );
            }
            
            const importId = randomUUIDv7();
            const archiveUrl = `https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/${username.toLowerCase()}/archive.json`;
            
            // Start the import process for remote file
            startRemoteImport(importId, archiveUrl, username);
            
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
            startImport(importId, tempPath);
            
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
            startRemoteImport(importId, archiveUrl, username);
            
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
function startImport(importId: string, filePath: string) {
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
    
    // Start the import process in a separate process
    const importProcess = spawn(["bun", "run", "import-tweets-qdrant.ts", filePath], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        IMPORT_ID: importId
      }
    });
    
    // Update status to processing
    const status = importStatus.get(importId)!;
    status.status = "processing";
    importStatus.set(importId, status);
    
    // Parse output to track progress
    if (importProcess.stdout) {
      importProcess.stdout.pipeTo(new WritableStream({
        write(chunk) {
          const text = new TextDecoder().decode(chunk);
          
          // Extract username
          const usernameMatch = text.match(/Processing tweets for ([^\.]+)/);
          if (usernameMatch?.[1]) {
            const status = importStatus.get(importId)!;
            status.username = usernameMatch[1];
            importStatus.set(importId, status);
          }
          
          // Extract total tweets
          const totalMatch = text.match(/Tweets after filtering: (\d+)/);
          if (totalMatch?.[1]) {
            const status = importStatus.get(importId)!;
            status.total = Number.parseInt(totalMatch[1], 10);
            importStatus.set(importId, status);
          }
          
          // Extract progress
          const progressMatch = text.match(/Overall progress: \[(\d+)\/(\d+)\]/);
          if (progressMatch?.[1] && progressMatch?.[2]) {
            const status = importStatus.get(importId)!;
            status.progress = Number.parseInt(progressMatch[1], 10);
            importStatus.set(importId, status);
          }
          
          // Log output
          process.stdout.write(chunk);
        }
      }));
    }
    
    // Handle errors
    if (importProcess.stderr) {
      importProcess.stderr.pipeTo(new WritableStream({
        write(chunk) {
          const text = new TextDecoder().decode(chunk);
          
          // Update status with error
          const status = importStatus.get(importId)!;
          status.error = text;
          importStatus.set(importId, status);
          
          // Log error
          process.stderr.write(chunk);
        }
      }));
    }
    
    // Handle process completion
    importProcess.exited.then((code) => {
      const status = importStatus.get(importId)!;
      status.endTime = Date.now();
      
      if (code === 0) {
        status.status = "completed";
        status.progress = status.total;
      } else {
        status.status = "failed";
        if (!status.error) {
          status.error = `Process exited with code ${code}`;
        }
      }
      
      importStatus.set(importId, status);
      
      // Clean up temp file
      try {
        Bun.spawn(["rm", filePath]);
      } catch (e) {
        console.error("Failed to remove temp file:", e);
      }
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
async function startRemoteImport(importId: string, url: string, username: string) {
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
    
    // Start the import process
    startImport(importId, tempPath);
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