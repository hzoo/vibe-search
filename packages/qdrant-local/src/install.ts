import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get Qdrant binary info
const packageJsonPath = join(dirname(dirname(__filename)), "package.json");
const packageJson = JSON.parse(await Bun.file(packageJsonPath).text());
const { qdrantBinary } = packageJson;
const { name, repository, directory, version } = qdrantBinary;

// All the binary files will be stored in the /bin directory
const binDir = join(dirname(dirname(__dirname)), directory);
console.log(`Binary directory path: ${binDir}`);

/**
 * Main installation function
 */
async function install(): Promise<void> {
  try {
    if (existsSync(binDir)) {
      console.info("Binary directory already exists. Skipping download.");
      console.info(`If you want to re-download the binary, please remove the ${binDir} directory.`);
      return;
    }
    
    await mkdir(binDir, { recursive: true });
    await getBinary();
  } catch (error) {
    console.error("Installation failed:", (error as Error).message);
  }
}

/**
 * Downloads and extracts the Qdrant binary
 */
async function getBinary(): Promise<void> {
  const downloadURL = getBinaryDownloadURL();
  console.log(`Downloading ${name} v${version} from ${downloadURL}`);
  
  const pkgName = ["win32", "cygwin"].includes(process.platform)
    ? "package.zip"
    : "package.tar.gz";
    
  const packagePath = join(binDir, pkgName);

  // Download the package
  await downloadPackage(downloadURL, packagePath);
  
  // Extract the package
  await extractPackage(packagePath, binDir);

  // Clean up the downloaded package
  await Bun.write(packagePath, ""); // Empty the file
  await rm(packagePath); // Remove the file
  
  console.log(`Successfully installed Qdrant v${version}`);
}

/**
 * Gets the download URL for the Qdrant binary
 * @returns The download URL
 */
function getBinaryDownloadURL(): string {
  let os: string;
  let arch: string;

  // Determine OS
  switch (process.platform) {
    case "win32":
    case "cygwin":
      os = "pc-windows-msvc";
      break;
    case "darwin":
      os = "apple-darwin";
      break;
    case "linux":
      os = "unknown-linux-gnu";
      break;
    default:
      throw new Error(`Unsupported OS: ${process.platform}`);
  }

  // Determine architecture
  switch (process.arch) {
    case "x64":
      arch = "x86_64";
      break;
    case "arm64":
      // Qdrant release workflow cuts arm64 binaries only for darwin and linux
      if (!(os === "apple-darwin" || os === "unknown-linux-gnu")) {
        throw new Error(
          `Qdrant local is not supported in ${process.platform}-arm64`
        );
      }
      arch = "aarch64";
      break;
    default:
      throw new Error(`Unsupported architecture: ${process.arch}`);
  }

  const extension = os === "pc-windows-msvc" ? "zip" : "tar.gz";

  return `${repository}/releases/download/v${version}/${name}-${arch}-${os}.${extension}`;
}

/**
 * Downloads a package from a URL
 * @param url The URL to download from
 * @param outputPath The path to save the downloaded file
 */
async function downloadPackage(url: string, outputPath: string): Promise<void> {
  // Use Bun.fetch to download the file
  const response = await fetch(url);
  
  if (!response.ok) {
    if (response.status === 302 || response.status === 301) {
      // Handle redirects
      const location = response.headers.get("location");
      if (location) {
        return downloadPackage(location, outputPath);
      }
    }
    throw new Error(`Failed to download ${name}. Status code: ${response.status}`);
  }
  
  // Save the file
  const blob = await response.blob();
  await Bun.write(outputPath, blob);
}

/**
 * Extracts a package
 * @param inputPath The path to the package
 * @param outputPath The path to extract to
 */
async function extractPackage(inputPath: string, outputPath: string): Promise<void> {
  const ext = extname(inputPath);
  
  if (ext === ".gz") {
    // For tar.gz files, use Bun.spawn to run tar
    const proc = Bun.spawn(["tar", "-xzf", inputPath, "-C", outputPath]);
    await proc.exited;
    
    if (proc.exitCode !== 0) {
      throw new Error(`Failed to extract ${inputPath}. Exit code: ${proc.exitCode}`);
    }
  } else if (ext === ".zip") {
    // For zip files, use Bun.spawn to run unzip
    const proc = Bun.spawn(["unzip", "-o", inputPath, "-d", outputPath]);
    await proc.exited;
    
    if (proc.exitCode !== 0) {
      throw new Error(`Failed to extract ${inputPath}. Exit code: ${proc.exitCode}`);
    }
  } else {
    throw new Error(`Unsupported file extension: ${ext}`);
  }
}

// Run the installation
await install(); 