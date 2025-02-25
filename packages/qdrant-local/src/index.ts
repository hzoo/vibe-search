import { runQdrant as runQdrantInternal } from "./runner.js";
import { QdrantClient } from "@qdrant/js-client-rest";

export interface QdrantConfig {
  httpPort?: number;
  enableStaticContent?: boolean;
  dataPath?: string;
}

export class QdrantExtended extends QdrantClient {
  private clientConfig: { host: string; port: number } | { url: string };

  constructor(opt: string | { url: string } | { host: string; port: number } | QdrantConfig) {
    // If the special ":local:" string is passed, we need to handle it differently
    // since runQdrant is now async
    if (opt === ":local:") {
      // Initialize with a temporary port, we'll update it later
      const initialConfig = {
        host: "localhost",
        port: 0
      };
      super(initialConfig);
      this.clientConfig = initialConfig;
      
      // Start Qdrant and update the client configuration when ready
      this.initializeLocalQdrant();
    } else {
      // Otherwise, pass the options directly to QdrantClient
      if (typeof opt === 'string') {
        super({ url: opt });
        this.clientConfig = { url: opt };
      } else if ('url' in opt) {
        super({ url: opt.url });
        this.clientConfig = { url: opt.url };
      } else if ('host' in opt && 'port' in opt) {
        super({ host: opt.host, port: opt.port });
        this.clientConfig = { host: opt.host, port: opt.port };
      } else {
        throw new Error('Invalid configuration for QdrantClient');
      }
    }
  }
  
  private async initializeLocalQdrant(): Promise<void> {
    try {
      const port = await runQdrantInternal();
      // Create a new client with the correct port
      const newConfig = {
        host: "localhost",
        port
      };
      
      // Update our stored configuration
      this.clientConfig = newConfig;
      
      // Unfortunately QdrantClient doesn't have a public method to update configuration
      // We'll need to create a new client and copy its properties
      const newClient = new QdrantClient(newConfig);
      
      // Copy the new client's properties to this instance
      Object.getOwnPropertyNames(QdrantClient.prototype).forEach(key => {
        if (key !== 'constructor' && typeof newClient[key as keyof QdrantClient] === 'function') {
          // @ts-ignore - We're doing a runtime property copy that TypeScript can't statically verify
          this[key] = newClient[key].bind(newClient);
        }
      });
    } catch (error) {
      console.error("Failed to initialize local Qdrant instance:", error);
      throw error;
    }
  }
}

// Re-export the runQdrant function
export const runQdrant = runQdrantInternal; 