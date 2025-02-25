#!/usr/bin/env bun
import { QdrantExtended } from "qdrant-local";
import { pipeline } from '@xenova/transformers';
import { serve } from "bun";

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

// Initialize the embedding model
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

// Initialize Qdrant client
const client = new QdrantExtended({ url: "http://localhost:6333" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server is running on http://localhost:${server.port}`); 