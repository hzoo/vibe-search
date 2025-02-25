import { ChromaClient } from "chromadb";
import { serve } from "bun";

const client = new ChromaClient();
const collection = await client.getOrCreateCollection({
  name: "tweets",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface QueryParams {
  queryTexts: string[];
  nResults: number;
  where?: {
    username?: string;
  };
}

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
        
        const queryParams: QueryParams = {
          queryTexts: [query],
          nResults,
        };

        // Add username filter if provided
        if (username) {
          queryParams.where = { username };
        }

        const results = await collection.query(queryParams);

        // Transform the results into a simpler format
        const simplifiedResults = results.documents[0].map((doc: string | null, i: number) => ({
          text: doc || "",
          distance: results.distances?.[0]?.[i] || 0,
          username: results.metadatas?.[0]?.[i]?.username || "",
          date: results.metadatas?.[0]?.[i]?.created_at || "",
          id: results.ids?.[0]?.[i] || "",
        }));

        return Response.json(simplifiedResults, {
          headers: corsHeaders,
        });
      } catch (error) {
        console.error("Search error:", error);
        return Response.json(
          { error: "Search failed" },
          { status: 500 }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server is running on http://localhost:${server.port}`);