#!/usr/bin/env bun
import { QdrantExtended } from "qdrant-local";
import { pipeline } from '@xenova/transformers';
import { serve } from "bun";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { randomUUIDv7 } from "bun";
import { cleanTweet, type TweetPreprocessingOptions } from "./tweet-preprocessor";
import { processArchive } from "./convert-twitter-archive";

// Import history path
const IMPORT_HISTORY_PATH = join(import.meta.dir, "import-history.json");
// Archives directory path
const ARCHIVES_DIR = join(import.meta.dir, "archives");
// Performance metrics path
const PERFORMANCE_METRICS_PATH = join(import.meta.dir, "import-performance.json");

// Configure tweet preprocessing options for search queries
const SEARCH_PREPROCESSING_OPTIONS: TweetPreprocessingOptions = {
  removeUrls: true,
  removeLeadingMentions: true,
  removeAllMentions: false,
  removeAllHashtags: false, // Keep hashtags in search queries
  removeRetweetPrefix: true,
  minLength: 2, // Allow shorter search queries
  // convertEmojis: true, // Convert emojis in search queries
};

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

// Function to check if archives exist for a username
function checkArchivesForUsername(username: string) {
  if (!existsSync(ARCHIVES_DIR)) {
    return { exists: false, archives: [] };
  }
  
  try {
    const files = readdirSync(ARCHIVES_DIR)
      .filter(file => file.toLowerCase().startsWith(username.toLowerCase()) && file.endsWith('.json'))
      .map(file => {
        const filePath = join(ARCHIVES_DIR, file);
        const stats = statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          created: stats.birthtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()); // Sort by newest first
    
    return {
      exists: files.length > 0,
      archives: files
    };
  } catch (error) {
    console.error("Error checking archives:", error);
    return { exists: false, archives: [] };
  }
}

// Define types for search parameters and results
interface SearchParams {
  vector: number[];
  limit: number;
  with_payload: boolean;
  filter?: {
    must: Array<
      | {
          key: string;
          match: {
            value: string | boolean;
          };
        }
      | {
          key: string;
          range: {
            gte?: number;
            lte?: number;
          };
        }
    >;
  };
  params?: {
    quantization: {
      rescore: boolean;
      oversampling: number;
    }
  }
}

// Define the profile data type
interface TwitterUserProfile {
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
}

// Cache for profile data
const profileCache: Record<string, TwitterUserProfile> = {};

/**
 * Get user profile data from local file
 */
async function getUserProfile(username: string): Promise<TwitterUserProfile | null> {
  // Check cache first
  if (profileCache[username]) {
    return profileCache[username];
  }

  console.log('username', username);
  
  // Try to load from file
  try {
    if (!existsSync(ARCHIVES_DIR)) {
      return null;
    }
    
    const files = readdirSync(ARCHIVES_DIR);
    
    // Look for profile files that match the username, handling date prefixes
    // Format could be either username-profile.json or date_username-profile.json
    const profileFile = files.find(file => {
      // Match either exact username-profile.json or date_username-profile.json pattern
      return (file === `${username.toLowerCase()}-profile.json`) || 
             (file.endsWith(`${username.toLowerCase()}-profile.json`) && file.includes('_'));
    });
    
    if (!profileFile) {
      return null;
    }

    console.log('profileFile', profileFile);
    
    const profilePath = join(ARCHIVES_DIR, profileFile);
    const content = await Bun.file(profilePath).text();
    const profileData = JSON.parse(content) as TwitterUserProfile;
    
    // Cache the profile data
    profileCache[username] = profileData;
    
    return profileData;
  } catch (error) {
    console.error(`Error loading profile for ${username}:`, error);
    return null;
  }
}

/**
 * List all available profiles
 */
async function listProfiles(): Promise<string[]> {
  if (!existsSync(ARCHIVES_DIR)) {
    return [];
  }
  
  try {
    const files = readdirSync(ARCHIVES_DIR);
    
    // Filter for profile JSON files
    const profileFiles = files.filter(file => file.endsWith("-profile.json"));
    
    // Extract usernames from filenames, handling date prefixes
    return profileFiles.map(file => {
      // Remove the -profile.json suffix
      const withoutSuffix = file.replace(/-profile\.json$/, "");
      
      // If there's a date prefix (contains underscore), extract just the username part
      if (withoutSuffix.includes('_')) {
        return withoutSuffix.split('_').pop() || withoutSuffix;
      }
      
      return withoutSuffix;
    });
  } catch (error) {
    console.error("Error listing profiles:", error);
    return [];
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
  archivePath?: string; // Add path to saved archive
  performanceMetrics?: {
    tweetsPerSecond: number;
    averageChunkTweetsPerSecond: number;
  };
  message?: string;
}>();

// Initialize the embedding model
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

// Initialize Qdrant client
const client = new QdrantExtended({ url: "http://localhost:6333" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, Content-Length",
  "Access-Control-Max-Age": "86400",
};

// Health check endpoint
const healthResponse = Response.json({ status: "ok" }, { headers: corsHeaders });

const server = serve({
  port: 3001,
  development: true,
  maxRequestBodySize: 1024 * 1024 * 1024, // 1GB max upload size
  async fetch(req) {
    // debug logs
    console.log(req.url, req.method);

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

    // Get user profile endpoint
    if (req.url.includes("/api/profile/") && req.method === "GET") {
      console.log('req.url', req.url);
      
      try {
        const url = new URL(req.url);
        const username = url.pathname.split('/').pop();
        
        if (!username) {
          return Response.json(
            { error: "Username is required" },
            { status: 400, headers: corsHeaders }
          );
        }
        
        const profile = await getUserProfile(username);
        
        if (!profile) {
          return Response.json(
            { error: "Profile not found" },
            { status: 404, headers: corsHeaders }
          );
        }
        
        return Response.json(profile, { headers: corsHeaders });
      } catch (error) {
        console.error("Error fetching profile:", error);
        return Response.json(
          { error: "Failed to fetch profile" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // List available profiles endpoint
    if (req.url.includes("/api/profiles") && req.method === "GET") {
      try {
        const profiles = await listProfiles();
        return Response.json({ profiles }, { headers: corsHeaders });
      } catch (error) {
        console.error("Error listing profiles:", error);
        return Response.json(
          { error: "Failed to list profiles" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Delete all embeddings endpoint
    if (req.url.includes("/api/delete-embeddings") && req.method === "POST") {
      try {
        console.log("Deleting all embeddings...");
        
        // Check if tweets collection exists
        const collections = await client.getCollections();
        const collectionExists = collections.collections.some(c => c.name === "tweets");
        
        if (collectionExists) {
          // Delete the collection
          await client.deleteCollection("tweets");
          
          // Clear import history
          if (existsSync(IMPORT_HISTORY_PATH)) {
            await Bun.write(IMPORT_HISTORY_PATH, "{}");
          }
          
          return Response.json(
            { success: true, message: "All embeddings deleted successfully" },
            { headers: corsHeaders }
          );
        }
        
        return Response.json(
          { success: true, message: "No embeddings to delete" },
          { headers: corsHeaders }
        );
      } catch (error) {
        console.error("Failed to delete embeddings:", error);
        return Response.json(
          { error: "Failed to delete embeddings" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Check archives endpoint
    if (req.url.includes("/api/archives") && req.method === "GET") {
      const url = new URL(req.url);
      const username = url.searchParams.get("username");
      
      if (!username) {
        return Response.json(
          { error: "Username is required" },
          { status: 400, headers: corsHeaders }
        );
      }
      
      const archives = checkArchivesForUsername(username);
      return Response.json(archives, { headers: corsHeaders });
    }

    // Search API endpoint
    if (req.url.includes("/api/search")) {
      try {
        const { query, filters = {}, nResults = 5 } = await req.json();
        
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
        
        // Preprocess the query text
        const cleanedQuery = cleanTweet(query, SEARCH_PREPROCESSING_OPTIONS);
        
        // If the query is empty after cleaning, return an error
        if (!cleanedQuery) {
          return Response.json(
            { error: "Query is empty after preprocessing" },
            { status: 400, headers: corsHeaders }
          );
        }
        
        // Generate embedding for the cleaned query
        const result = await embedder(cleanedQuery, { pooling: 'mean', normalize: true });
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
        
        // Add filters if provided
        const filterConditions = [];
        
        // Username filter
        if (filters.username) {
          filterConditions.push({
            key: "username",
            match: {
              value: filters.username,
            },
          });
        }
        
        // Tweet type filter
        if (filters.tweet_type) {
          filterConditions.push({
            key: "tweet_type",
            match: {
              value: filters.tweet_type,
            },
          });
        }
        
        // Contains question filter
        if (filters.contains_question !== undefined) {
          filterConditions.push({
            key: "contains_question",
            match: {
              value: filters.contains_question,
            },
          });
        }
        
        // Date range filters
        if (filters.date_start) {
          filterConditions.push({
            key: "created_at_timestamp",
            range: {
              gte: filters.date_start,
            },
          });
        }
        
        if (filters.date_end) {
          filterConditions.push({
            key: "created_at_timestamp",
            range: {
              lte: filters.date_end,
            },
          });
        }
        
        // Apply filters if any
        if (filterConditions.length > 0) {
          searchParams.filter = {
            must: filterConditions,
          };
        }
        
        // Search in Qdrant
        try {
          const results = await client.search("tweets", searchParams);
          
          // Transform the results into a simpler format
          const simplifiedResults = results.filter(r => r.payload).map((result) => {
            const payload = result.payload as {
              text: string;
              full_text?: string;
              username: string;
              created_at_timestamp: number;
              tweet_type?: string;
              contains_question?: boolean;
            };
            return {
              text: payload.text,
              full_text: payload.full_text,
              distance: result.score,
              username: payload.username,
              date: payload.created_at_timestamp,
              id: result.id.toString(),
              tweet_type: payload.tweet_type,
              contains_question: payload.contains_question || false
            };
          });

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
      // Performance metrics endpoint - handle this first
      if (req.url.includes("/api/import/performance") && req.method === "GET") {
        try {
          // Check if metrics file exists
          if (existsSync(PERFORMANCE_METRICS_PATH)) {
            const content = await Bun.file(PERFORMANCE_METRICS_PATH).text();
            if (!content.trim()) {
              return Response.json(
                { averageTweetsPerSecond: 100, lastUpdated: new Date().toISOString() },
                { headers: corsHeaders }
              );
            }
            
            try {
              const metrics = JSON.parse(content);
              return Response.json(
                { 
                  averageTweetsPerSecond: metrics.averageTweetsPerSecond || 100,
                  lastUpdated: new Date().toISOString()
                },
                { headers: corsHeaders }
              );
            } catch (parseError) {
              console.error("JSON parse error in performance metrics:", parseError);
              return Response.json(
                { averageTweetsPerSecond: 100, lastUpdated: new Date().toISOString() },
                { headers: corsHeaders }
              );
            }
          } else {
            // No metrics file yet, return default values
            return Response.json(
              { averageTweetsPerSecond: 100, lastUpdated: new Date().toISOString() },
              { headers: corsHeaders }
            );
          }
        } catch (error) {
          console.error("Error loading performance metrics:", error);
          return Response.json(
            { error: "Failed to load performance metrics" },
            { status: 500, headers: corsHeaders }
          );
        }
      }
      
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
      
      // Check if this is a username import via JSON
      if (req.url.includes("/api/import/username") && req.method === "POST") {
        try {
          const data = await req.json();
          const { username, force = false, saveArchive = false, forceDownload = false } = data;
          
          if (!username) {
            return Response.json(
              { error: "Username is required" },
              { status: 400, headers: corsHeaders }
            );
          }
          
          const importId = randomUUIDv7();
          const archiveUrl = `https://fabxmporizzqflnftavs.supabase.co/storage/v1/object/public/archives/${username}/archive.json`;
          
          // Start the import process for remote file
          startRemoteImport(importId, archiveUrl, username, force, saveArchive, false);
          
          return Response.json({ 
            success: true, 
            importId,
            message: "Remote import started" 
          }, { headers: corsHeaders });
        } catch (error) {
          console.error("Import error:", error);
          return Response.json(
            { error: "Import failed" },
            { status: 500, headers: corsHeaders }
          );
        }
      }
      
      // Handle local file import via JSON payload
      if (req.url.includes("/api/import/local") && req.method === "POST") {
        console.log("Processing local file import request");
        try {
          const data = await req.json();
          const { filePath, username, force = false, saveArchive = false, isTwitterArchive = false } = data;
          
          if (!filePath) {
            return Response.json(
              { error: "File path is required" },
              { status: 400, headers: corsHeaders }
            );
          }
          
          console.log("Local file import request:", {
            filePath,
            username,
            force,
            saveArchive,
            isTwitterArchive
          });
          
          // Check if file exists
          if (!existsSync(filePath)) {
            return Response.json(
              { error: `File not found at path: ${filePath}` },
              { status: 404, headers: corsHeaders }
            );
          }
          
          const importId = randomUUIDv7();
          
          // Handle Twitter archive zip file
          if (isTwitterArchive && filePath.toLowerCase().endsWith('.zip')) {
            console.log("Processing local Twitter archive zip file...");
            // Create a temporary username if not provided
            const archiveUsername = username || `user_${Date.now()}`;
            
            // Update import status
            importStatus.set(importId, {
              id: importId,
              username: archiveUsername,
              status: "processing",
              progress: 0,
              total: 100,
              startTime: Date.now(),
              message: "Processing Twitter archive zip file..."
            });
            
            // Process the archive in the background
            processTwitterArchive(importId, filePath, archiveUsername, force, saveArchive);
            
            console.log("Twitter archive import started with ID:", importId);
            return Response.json({ 
              success: true, 
              importId,
              message: "Twitter archive import started" 
            }, { headers: corsHeaders });
          }
          
          // Handle regular JSON file
          console.log("Processing local JSON file...");
          
          // Start the import process directly
          startImport(importId, filePath, force, saveArchive);
          
          console.log("JSON import started with ID:", importId);
          return Response.json({ 
            success: true, 
            importId,
            message: "Import started" 
          }, { headers: corsHeaders });
        } catch (error) {
          console.error("Local file import error:", error);
          return Response.json(
            { error: `Import failed: ${error instanceof Error ? error.message : String(error)}` },
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
      
      // Handle regular form data upload
      if (req.method === "POST") {
        console.log("Processing POST request to /api/import");
        try {
          console.log("Attempting to parse form data...");
          const formData = await req.formData();
          console.log("Form data parsed successfully");
          
          const file = formData.get("file") as File | null;
          const username = formData.get("username") as string | null;
          const force = formData.get("force") === "true";
          const saveArchive = formData.get("saveArchive") === "true";
          const isTwitterArchive = formData.get("isTwitterArchive") === "true";
          
          console.log("Form data contents:", {
            hasFile: !!file,
            fileName: file?.name,
            fileSize: file?.size,
            username,
            force,
            saveArchive,
            isTwitterArchive
          });
          
          // Handle file upload
          if (file) {
            console.log("Processing file upload...");
            const importId = randomUUIDv7();
            
            // Handle Twitter archive zip file
            if (isTwitterArchive && file.name.toLowerCase().endsWith('.zip')) {
              console.log("Processing Twitter archive zip file...");
              // Create a temporary username if not provided
              const archiveUsername = username || `user_${Date.now()}`;
              
              // Ensure archives directory exists
              try {
                await Bun.spawn(["mkdir", "-p", ARCHIVES_DIR]);
                console.log("Archives directory created/verified");
              } catch (mkdirError) {
                console.error("Error creating archives directory:", mkdirError);
                throw new Error(`Failed to create archives directory: ${mkdirError}`);
              }
              
              // Save the uploaded zip file
              const zipPath = join(ARCHIVES_DIR, `${archiveUsername}.zip`);
              console.log(`Saving zip file to ${zipPath}...`);
              
              try {
                const buffer = await file.arrayBuffer();
                console.log(`Got file buffer, size: ${buffer.byteLength} bytes`);
                await Bun.write(zipPath, buffer);
                console.log("Zip file saved successfully");
              } catch (writeError) {
                console.error("Error writing zip file:", writeError);
                throw new Error(`Failed to save zip file: ${writeError}`);
              }
              
              // Update import status
              importStatus.set(importId, {
                id: importId,
                username: archiveUsername,
                status: "processing",
                progress: 0,
                total: 100,
                startTime: Date.now(),
                message: "Processing Twitter archive zip file..."
              });
              
              // Process the archive in the background
              processTwitterArchive(importId, zipPath, archiveUsername, force, saveArchive);
              
              console.log("Twitter archive import started with ID:", importId);
              return Response.json({ 
                success: true, 
                importId,
                message: "Twitter archive import started" 
              }, { headers: corsHeaders });
            }
            
            // Handle regular JSON file upload
            console.log("Processing regular JSON file upload...");
            const tempPath = join(import.meta.dir, "temp", `${importId}.json`);
            
            // Ensure temp directory exists
            try {
              await Bun.spawn(["mkdir", "-p", join(import.meta.dir, "temp")]);
              console.log("Temp directory created/verified");
            } catch (mkdirError) {
              console.error("Error creating temp directory:", mkdirError);
              throw new Error(`Failed to create temp directory: ${mkdirError}`);
            }
            
            // Save the uploaded file
            console.log(`Saving JSON file to ${tempPath}...`);
            try {
              const buffer = await file.arrayBuffer();
              console.log(`Got file buffer, size: ${buffer.byteLength} bytes`);
              await Bun.write(tempPath, buffer);
              console.log("JSON file saved successfully");
            } catch (writeError) {
              console.error("Error writing JSON file:", writeError);
              throw new Error(`Failed to save JSON file: ${writeError}`);
            }
            
            // Start the import process
            startImport(importId, tempPath, force, saveArchive);
            
            console.log("JSON import started with ID:", importId);
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
            startRemoteImport(importId, archiveUrl, username, force, saveArchive, false);
            
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
          console.error("Import error details:", error);
          return Response.json(
            { error: `Import failed: ${error instanceof Error ? error.message : String(error)}` },
            { status: 500, headers: corsHeaders }
          );
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

// Start the import process
function startImport(importId: string, filePath: string, force = false, saveArchive = false) {
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
        // Add performance metrics
        if (result.performanceMetrics) {
          status.performanceMetrics = {
            tweetsPerSecond: result.performanceMetrics.tweetsPerSecond,
            averageChunkTweetsPerSecond: result.performanceMetrics.averageChunkTweetsPerSecond
          };
        }
        
        // Save archive if requested
        if (saveArchive && result.username) {
          try {
            const archivePath = await saveArchiveFile(filePath, result.username);
            status.archivePath = archivePath;
          } catch (saveErr) {
            console.error("Failed to save archive:", saveErr);
          }
        }
        
        importStatus.set(importId, status);
        
        // Clean up temp file if not saving or if saving was successful
        if (!saveArchive || status.archivePath) {
          try {
            // Check if there's a profile file in the same directory that we need to preserve
            const tempDir = dirname(filePath);
            const tempFileName = basename(filePath);
            const username = result.username?.toLowerCase();
            
            if (username) {
              const profileFileName = `${username}-profile.json`;
              const profilePath = join(tempDir, profileFileName);
              
              // If profile file exists, copy it to archives directory before deleting temp files
              if (existsSync(profilePath)) {
                // Create a timestamp for the filename
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const archivesProfilePath = join(ARCHIVES_DIR, `${timestamp}_${profileFileName}`);
                
                // Ensure archives directory exists
                Bun.spawn(["mkdir", "-p", ARCHIVES_DIR]);
                
                // Copy profile file to archives directory
                Bun.spawn(["cp", profilePath, archivesProfilePath]);
                console.log(`Preserved profile file: ${archivesProfilePath}`);
              }
            }
            
            // Now remove the temp file
            Bun.spawn(["rm", filePath]);
          } catch (e) {
            console.error("Failed to remove temp file:", e);
          }
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
async function startRemoteImport(
  importId: string, 
  url: string, 
  username: string, 
  force = false, 
  saveArchive = false,
  forceDownload = false
) {
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
    
    // Check if we already have archives for this username
    const archives = checkArchivesForUsername(username);
    
    // Use existing archive if available and not forcing download
    if (archives.exists && !forceDownload) {
      console.log(`Using existing archive for ${username}`);
      
      // Get the most recent archive
      const mostRecentArchive = archives.archives[0];
      const archivePath = join(ARCHIVES_DIR, mostRecentArchive.filename);
      
      // Start the import process with the existing archive
      startImport(importId, archivePath, force, false); // Don't save again
      return;
    }
    
    // Update status to downloading
    const status = importStatus.get(importId)!;
    status.status = "processing";
    status.progress = 5;
    status.message = "Downloading archive...";
    importStatus.set(importId, status);
    
    // Create temp directory if it doesn't exist
    const tempDir = join(import.meta.dir, "temp");
    Bun.spawn(["mkdir", "-p", tempDir]);
    
    // Download the file
    const tempPath = join(tempDir, `${importId}.json`);
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download archive: ${response.status} ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      await Bun.write(tempPath, buffer);
      
      // Update status
      status.progress = 10;
      status.message = "Download complete, starting import...";
      importStatus.set(importId, status);
      
      console.log(`Downloaded archive to ${tempPath}`);
    } catch (error) {
      console.error("Failed to download archive:", error);
      throw error;
    }
    
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
        // Add performance metrics
        if (result.performanceMetrics) {
          status.performanceMetrics = {
            tweetsPerSecond: result.performanceMetrics.tweetsPerSecond,
            averageChunkTweetsPerSecond: result.performanceMetrics.averageChunkTweetsPerSecond
          };
        }
        
        // Save archive if requested and we downloaded it (not if we used an existing archive)
        if (saveArchive && (forceDownload || !archives.exists)) {
          try {
            const archivePath = await saveArchiveFile(tempPath, username);
            status.archivePath = archivePath;
          } catch (saveErr) {
            console.error("Failed to save archive:", saveErr);
          }
        }
        
        importStatus.set(importId, status);
        
        // Clean up temp file if not saving or if saving was successful or if we used an existing archive
        if ((!saveArchive || status.archivePath) && (forceDownload || !archives.exists)) {
          try {
            // Check if there's a profile file in the same directory that we need to preserve
            const tempDir = dirname(tempPath);
            const username = result.username?.toLowerCase() || status.username.toLowerCase();
            
            if (username) {
              const profileFileName = `${username}-profile.json`;
              const profilePath = join(tempDir, profileFileName);
              
              // If profile file exists, copy it to archives directory before deleting temp files
              if (existsSync(profilePath)) {
                // Create a timestamp for the filename
                const archivesProfilePath = join(ARCHIVES_DIR, profileFileName);
                
                // Ensure archives directory exists
                Bun.spawn(["mkdir", "-p", ARCHIVES_DIR]);
                
                // Copy profile file to archives directory
                Bun.spawn(["cp", profilePath, archivesProfilePath]);
                console.log(`Preserved profile file: ${archivesProfilePath}`);
              }
            }
            
            // Now remove the temp file
            Bun.spawn(["rm", tempPath]);
          } catch (e) {
            console.error("Failed to remove temp file:", e);
          }
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

// Function to save archive file to permanent storage
async function saveArchiveFile(tempPath: string, username: string): Promise<string> {
  // Ensure archives directory exists
  Bun.spawn(["mkdir", "-p", ARCHIVES_DIR]);
  
  // Create a filename with timestamp to avoid overwriting
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${username.toLowerCase()}_${timestamp}.json`;
  const archivePath = join(ARCHIVES_DIR, filename);
  
  // Copy the file
  Bun.spawn(["cp", tempPath, archivePath]);
  
  console.log(`Saved archive for ${username} to ${archivePath}`);
  return archivePath;
}

// Function to process a Twitter archive zip file
async function processTwitterArchive(
  importId: string,
  zipPath: string,
  username: string,
  force = false,
  saveArchive = false
): Promise<void> {
  try {
    // Update status to processing
    const status = importStatus.get(importId)!;
    status.status = "processing";
    status.progress = 10;
    importStatus.set(importId, status);
    
    try {
      // Process the archive to convert it to JSON
      const jsonPath = await processArchive(zipPath, username);
      
      // Update status
      status.progress = 50;
      status.message = "Archive converted to JSON, starting import...";
      importStatus.set(importId, status);
      
      // Start the import process with the converted JSON
      startImport(importId, jsonPath, force, saveArchive);

      // Clean up the zip file
      Bun.spawn(["rm", zipPath]);
    } catch (error) {
      // Update status with error
      status.status = "failed";
      status.error = String(error);
      status.endTime = Date.now();
      importStatus.set(importId, status);
      
      console.error("Failed to process Twitter archive:", error);
    }
  } catch (error) {
    console.error("Failed to start Twitter archive import:", error);
    
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