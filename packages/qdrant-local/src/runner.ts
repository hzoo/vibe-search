import { spawn, type ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { QdrantConfig } from "./index.js";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get Qdrant binary info
const packageJsonPath = join(dirname(dirname(__filename)), "package.json");
const packageJson = JSON.parse(await Bun.file(packageJsonPath).text());
const { qdrantBinary } = packageJson;
const { name, directory } = qdrantBinary;

// Determine the executable name based on platform
const exeName = ["win32", "cygwin"].includes(process.platform)
  ? `${name}.exe`
  : name;

// Set paths - fix the path to the binary
const cwd = join(dirname(dirname(__filename)), directory.replace("qdrant-local/", ""));
const binPath = join(cwd, exeName);

// For debugging
console.log("Binary path:", binPath);
console.log("Binary exists:", existsSync(binPath));

// Keep track of running instances to avoid starting multiple
const runningInstances = new Map<number, ChildProcess>();

/**
 * Starts a Qdrant instance
 * @param config Configuration options
 * @returns The port number the Qdrant instance is running on
 */
export async function runQdrant(config: QdrantConfig = {}): Promise<number> {
  // Default configuration
  const defaultConfig = {
    httpPort: 0, // 0 means random free port
    enableStaticContent: false,
    dataPath: join(cwd, "data"),
  };

  // Merge default config with user config
  const finalConfig = { ...defaultConfig, ...config };
  
  // Create data directory if it doesn't exist
  if (!existsSync(finalConfig.dataPath)) {
    mkdir(finalConfig.dataPath, { recursive: true });
  }
  
  // Get a random free port if not specified
  const restPort = finalConfig.httpPort === 0 ? getRandomFreePort() : finalConfig.httpPort;
  
  // Check if we already have an instance running on this port
  if (runningInstances.has(restPort)) {
    console.log(`Reusing existing Qdrant instance on port ${restPort}`);
    return restPort;
  }
  
  console.log(`Starting Qdrant on port ${restPort}...`);
  
  // Prepare environment variables for Qdrant
  const env = {
    ...process.env,
    "QDRANT__SERVICE__HTTP_PORT": restPort.toString(),
    "QDRANT__SERVICE__ENABLE_STATIC_CONTENT": finalConfig.enableStaticContent ? "1" : "0",
    "QDRANT__STORAGE__STORAGE_PATH": finalConfig.dataPath,
  };
  
  // Start Qdrant process
  try {
    const child = spawn(binPath, [], {
      stdio: "ignore", // Ignore stdio to prevent blocking
      cwd,
      env,
      detached: true, // Detach the process so it can run independently
    });
    
    // Store the process reference
    runningInstances.set(restPort, child);
  } catch (error) {
    throw new Error(`Failed to start Qdrant: ${error}`);
  }
  
  // Clean up on process exit
  process.on('exit', () => {
    if (runningInstances.has(restPort)) {
      const instance = runningInstances.get(restPort);
      instance?.kill();
      runningInstances.delete(restPort);
    }
  });
  
  // Wait for Qdrant to start and return the port only when it's ready
  await waitForQdrantReady(restPort);
  
  return restPort;
}

/**
 * Gets a random free port
 * @returns A random free port
 */
function getRandomFreePort(): number {
  // 0 means random free port assigned by the OS
  const server = createServer();
  server.listen(0);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server address');
  }
  const port = address.port;
  server.close();
  return port;
}

/**
 * Waits for Qdrant to be ready
 * @param port The port to check
 * @param maxRetries Maximum number of retries
 * @param retryInterval Interval between retries in milliseconds
 * @returns A promise that resolves when Qdrant is ready
 */
async function waitForQdrantReady(port: number, maxRetries = 30, retryInterval = 500): Promise<number> {
  console.log(`Waiting for Qdrant to be ready on port ${port}...`);
  
  return new Promise((resolve, reject) => {
    let retries = 0;
    
    const checkReady = async () => {
      try {
        // Use Bun.fetch instead of http.request
        const response = await fetch(`http://localhost:${port}/readyz`, {
          method: 'GET',
        });
        
        if (response.status === 200) {
          console.log(`Qdrant is ready on port ${port}`);
          resolve(port);
        } else {
          retry();
        }
      } catch (error) {
        retry();
      }
    };
    
    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        reject(new Error(`Qdrant failed to start after ${maxRetries} retries`));
      } else {
        setTimeout(checkReady, retryInterval);
      }
    };
    
    // Start checking
    checkReady();
  });
} 