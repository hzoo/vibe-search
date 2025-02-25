import { useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { useSignalEffect } from "@preact/signals";
import { 
  currentDialog, 
  importUrl, 
  importLoading, 
  importError, 
  importStatus, 
  importHistory, 
  selectedUser, 
  handleSearch 
} from "../store/signals";
import { formatDate } from "../utils/textUtils";

export function ImportDialog() {
  if (currentDialog.value !== 'import') return null;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragActive = useSignal(false);
  const importMode = useSignal<'username' | 'file'>('username');
  const usernameInput = useSignal('');
  const forceImport = useSignal(false);
  const checkingHistory = useSignal(false);
  const debounceTimeout = useRef<number | null>(null);
  
  // Check import history when username changes
  useSignalEffect(() => {
    // Clear any existing timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
      debounceTimeout.current = null;
    }
    
    // Don't check if username is empty
    if (!usernameInput.value.trim()) {
      importHistory.value = null;
      return;
    }
    
    // Set a debounce timeout
    debounceTimeout.current = window.setTimeout(async () => {
      checkingHistory.value = true;
      
      try {
        const response = await fetch(`${importUrl}/history?username=${encodeURIComponent(usernameInput.value.trim())}`);
        
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
      } finally {
        checkingHistory.value = false;
        debounceTimeout.current = null;
      }
    }, 600); // Slightly longer debounce for better UX
  });
  
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      dragActive.value = true;
    } else if (e.type === "dragleave") {
      dragActive.value = false;
    }
  };
  
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragActive.value = false;
    
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };
  
  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      handleFileUpload(target.files[0]);
    }
  };
  
  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };
  
  // Handle file upload for import
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    
    importLoading.value = true;
    importError.value = null;
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch(importUrl, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Import failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.importId) {
        // Start polling for status
        pollImportStatus(data.importId);
      } else {
        throw new Error("No import ID returned from server");
      }
    } catch (err) {
      importError.value = err instanceof Error ? err.message : String(err);
      importLoading.value = false;
    }
  };
  
  const handleUsernameImport = async () => {
    if (!usernameInput.value.trim()) return;
    
    importLoading.value = true;
    importError.value = null;
    
    try {
      const response = await fetch(`${importUrl}/username`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          username: usernameInput.value.trim(),
          force: forceImport.value
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Import failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.importId) {
        // Start polling for status
        pollImportStatus(data.importId);
      } else {
        throw new Error("No import ID returned from server");
      }
    } catch (err) {
      importError.value = err instanceof Error ? err.message : String(err);
      importLoading.value = false;
    }
  };
  
  // Poll for import status
  const pollImportStatus = async (importId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${importUrl}?id=${importId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to get import status: ${response.status}`);
        }
        
        const status = await response.json();
        importStatus.value = status;
        
        // Continue polling if not completed or failed
        if (status.status !== 'completed' && status.status !== 'failed') {
          setTimeout(checkStatus, 2000);
        } else {
          importLoading.value = false;
          // If completed successfully, refresh search results
          if (status.status === 'completed') {
            // If we know the username, set it as the selected user
            if (status.username && status.username !== 'unknown') {
              selectedUser.value = status.username;
            }
            handleSearch();
            currentDialog.value = null;
          }
        }
      } catch (err) {
        importError.value = err instanceof Error ? err.message : String(err);
        importLoading.value = false;
      }
    };
    
    // Start checking
    checkStatus();
  };
  
  return (
    <div
      class="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !importLoading.value) {
          currentDialog.value = null;
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !importLoading.value) {
          currentDialog.value = null;
        }
      }}
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[500px] max-w-[90vw]">
        <h2 class="text-lg font-bold mb-4">Import Tweets</h2>
        
        {importLoading.value && importStatus.value ? (
          <div class="space-y-4">
            <div class="text-center">
              <p class="mb-2">
                {importStatus.value.status === 'pending' && 'Preparing to import tweets...'}
                {importStatus.value.status === 'processing' && 'Importing tweets...'}
                {importStatus.value.status === 'completed' && 'Import completed!'}
                {importStatus.value.status === 'failed' && 'Import failed'}
              </p>
              
              {importStatus.value.status === 'processing' && (
                <div class="space-y-2">
                  <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div 
                      class="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                      style={{ width: `${importStatus.value.total > 0 ? (importStatus.value.progress / importStatus.value.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {importStatus.value.progress} / {importStatus.value.total} tweets
                  </p>
                </div>
              )}
              
              {importStatus.value.status === 'completed' && (
                <div class="mt-4">
                  <p class="text-green-500 dark:text-green-400 mb-2">Successfully imported {importStatus.value.total} tweets!</p>
                  <button
                    onClick={() => {
                      currentDialog.value = null;
                      // If we know the username, set it as the selected user
                      if (importStatus.value?.username && importStatus.value.username !== 'unknown') {
                        selectedUser.value = importStatus.value.username;
                      }
                      handleSearch();
                    }}
                    class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    Close and Search
                  </button>
                </div>
              )}
              
              {importStatus.value.status === 'failed' && (
                <div class="mt-4">
                  <p class="text-red-500 dark:text-red-400 mb-2">
                    {importStatus.value.error || 'An unknown error occurred during import.'}
                  </p>
                  <button
                    onClick={() => {
                      currentDialog.value = null;
                      importStatus.value = null;
                    }}
                    class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div class="space-y-4">
            <div class="flex space-x-4">
              <button
                class={`px-4 py-2 rounded-md ${
                  importMode.value === 'username'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
                onClick={() => importMode.value = 'username'}
              >
                By Username
              </button>
              <button
                class={`px-4 py-2 rounded-md ${
                  importMode.value === 'file'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
                onClick={() => importMode.value = 'file'}
              >
                Upload File
              </button>
            </div>
            
            {importMode.value === 'username' ? (
              <div class="space-y-4">
                <div>
                  <label htmlFor="username-input" class="block text-sm font-medium mb-1">
                    Community Archive Username {usernameInput.value.trim() && !importHistory.value && (
                      <span class="ml-1 text-xs text-gray-500 dark:text-gray-400">no previous import found</span>
                    )}
                  </label>
                  <input
                    id="username-input"
                    type="text"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="e.g. elonmusk"
                    value={usernameInput.value}
                    onInput={(e) => usernameInput.value = (e.target as HTMLInputElement).value}
                  />
                </div>
                
                {checkingHistory.value && (
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Checking import history...
                  </div>
                )}
                
                {importHistory.value && (
                  <div class="text-sm border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md">
                    <p class="font-medium text-blue-800 dark:text-blue-300">Previous import found</p>
                    <p>Last imported: {formatDate(importHistory.value.lastImportDate)}</p>
                    <p>Latest tweet: {formatDate(importHistory.value.lastTweetDate)}</p>
                    <p>Total tweets: {importHistory.value.tweetCount}</p>
                    <p class="mt-2">Only tweets newer than the latest tweet date will be imported.</p>
                  </div>
                )}
                
                <div class="flex items-center">
                  <input
                    type="checkbox"
                    id="force-import"
                    class="mr-2"
                    checked={forceImport.value}
                    onChange={(e) => forceImport.value = (e.target as HTMLInputElement).checked}
                  />
                  <label htmlFor="force-import" class="text-sm">
                    Force import (ignore previous imports)
                  </label>
                </div>
                
                <button
                  class="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleUsernameImport}
                  disabled={!usernameInput.value.trim() || importLoading.value}
                >
                  Import Tweets
                </button>
              </div>
            ) : (
              <div class="space-y-4">
                <p class="text-gray-600 dark:text-gray-300">
                  Upload your Twitter/X archive JSON file to import your tweets into the search database.
                </p>
                
                <div 
                  class={`border-2 border-dashed rounded-lg p-6 text-center ${
                    dragActive.value 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-gray-300 dark:border-gray-700'
                  }`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    class="hidden"
                    onChange={handleFileChange}
                  />
                  
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke-width="1.5" 
                    stroke="currentColor" 
                    class="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-3"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  
                  <p class="mb-2 text-sm text-gray-500 dark:text-gray-400">
                    <span class="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    JSON file only
                  </p>
                </div>
                
                <div class="flex justify-between">
                  <button
                    onClick={handleButtonClick}
                    class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    Select File
                  </button>
                  
                  <button
                    onClick={() => (currentDialog.value = null)}
                    class="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {importError.value && (
              <div class="text-red-500 text-sm mt-2">
                {importError.value}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 