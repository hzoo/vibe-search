#!/usr/bin/env bun
import { DefaultEmbeddingFunction } from "chromadb";

async function testEmbeddings() {
  console.log("Testing embeddings...");
  const embedder = new DefaultEmbeddingFunction();
  
  const startTime = performance.now();
  const embeddings = await embedder.generate(["This is a test tweet"]);
  const time = performance.now() - startTime;
  
  console.log(`Generated ${embeddings.length} embeddings in ${time.toFixed(0)}ms`);
  console.log(`First embedding length: ${embeddings[0].length}`);
  console.log(`Sample values: ${embeddings[0].slice(0, 5).map(v => v.toFixed(4))}`);
}

testEmbeddings().catch(console.error); 