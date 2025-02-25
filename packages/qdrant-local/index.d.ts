import { QdrantClient } from "@qdrant/js-client-rest";

export interface QdrantConfig {
  httpPort?: number;
  enableStaticContent?: boolean;
  dataPath?: string;
}

export class QdrantExtended extends QdrantClient {
  constructor(opt: string | { url: string } | { host: string; port: number } | QdrantConfig);
}

export function runQdrant(config?: QdrantConfig): number; 