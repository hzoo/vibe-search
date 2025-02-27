# Twitter Archive Converter and API

This package provides tools to convert Twitter archives to JSON format and serve profile data via an API.

## Features

- Convert Twitter archive zip files to JSON format
- Extract profile data from archives
- Serve profile data via a REST API
- Memory-efficient processing for large files

## Installation

```bash
cd packages/server
bun install
```

## Usage

### Converting a Twitter Archive

1. Place your Twitter archive zip file in the `packages/server/archives` directory
2. Run the conversion script:

```bash
bun convert your_username
```

This will:
- Extract the archive
- Convert JS files to JSON
- Create a lightweight profile JSON file
- Combine all data into a single JSON file

### Verifying a Converted Archive

To verify that a converted archive is valid:

```bash
bun verify path/to/archive.json
```

### Starting the API Server

To start the API server:

```bash
bun start
```

Or for development:

```bash
bun dev:qdrant
```

The server will run on port 3001 by default.

## API Endpoints

### Get User Profile

```
GET /api/profile/:username
```

Returns profile data for the specified username.

### List Available Profiles

```
GET /api/profiles
```

Returns a list of all available profiles.

### Health Check

```
GET /health
```

Returns a simple health check response.

## Integration with UI

The UI will automatically check for local profiles if a user is not found in Supabase. This allows you to view your own Twitter archive data in the UI without needing to upload it to Supabase.

## File Structure

- `convert-twitter-archive.ts` - Script to convert Twitter archives
- `server-qdrant.ts` - HTTP server with API endpoints
- `archives/` - Directory for Twitter archives and converted files 