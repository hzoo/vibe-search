import { signal } from "@preact/signals";
import { importHistory, importUrl } from "@/ui/src/store/signals";

// Interface for archive information
interface ArchiveInfo {
	filename: string;
	size: number;
	created: string;
}

export interface ArchivesResponse {
	exists: boolean;
	archives: ArchiveInfo[];
}

export const saveArchive = signal(false);
export const checkingArchives = signal(false);
export const existingArchives = signal<ArchivesResponse>({
	exists: false,
	archives: [],
});
export const isMinimized = signal(false);
export const usernameInput = signal("");

export async function checkImportHistory(username: string) {
	try {
		const response = await fetch(
			`${importUrl}/history?username=${encodeURIComponent(username)}`,
		);

		if (response.ok) {
			const data = await response.json();
			if (data.lastImportDate) {
				importHistory.value = data;
			} else {
				importHistory.value = null;
			}
		} else {
			importHistory.value = null;
		}
	} catch (err) {
		console.error("Error checking import history:", err);
		importHistory.value = null;
	}
}

// Check if archives exist for a username
export const checkArchives = async (username: string) => {
	if (!username.trim()) {
		existingArchives.value = { exists: false, archives: [] };
		return;
	}

	checkingArchives.value = true;
	try {
		const response = await fetch(
			`${importUrl.replace("/import", "/archives")}?username=${encodeURIComponent(username.trim())}`,
		);

		if (!response.ok) {
			throw new Error(`Failed to check archives: ${response.status}`);
		}

		const data = await response.json();
		existingArchives.value = data.archives || [];
	} catch (err) {
		console.error("Error checking archives:", err);
		existingArchives.value = { exists: false, archives: [] };
	} finally {
		checkingArchives.value = false;
	}
};

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}