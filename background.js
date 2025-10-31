let activeTabId = null; // ID of the currently active tab
let activeTabStartTime = null; // Start time of the active tab
const usageData = {}; // Object to store usage data
const warningStates = {}; // Track which warnings have been shown for each hostname

const dbName = 'usageDataDB';
const storeName = 'usageStore';
let db = null;

// Open the IndexedDB database
function openDatabase() {
  console.log('Opening IndexedDB...');
  const request = indexedDB.open(dbName, 1);

  request.onupgradeneeded = (event) => {
    console.log('IndexedDB upgrade needed...');
    db = event.target.result;
    const store = db.createObjectStore(storeName, { keyPath: 'hostname' });
    store.createIndex('hostname', 'hostname', { unique: true });
    console.log('Object store created in IndexedDB');
  };

  request.onsuccess = (event) => {
    db = event.target.result;
    console.log('Database opened successfully');
  };

  request.onerror = (event) => {
    console.error('Database error:', event.target.error);
  };
}

openDatabase();

// Load existing usage data from IndexedDB into memory
async function loadUsageData() {
  console.log('Loading existing usage data from IndexedDB...');
  if (!db) {
    console.error('Database not open yet, cannot load usage data.');
    setTimeout(loadUsageData, 1000); // Retry after 1 second
    return;
  }

  const transaction = db.transaction([storeName], 'readonly');
  const store = transaction.objectStore(storeName);
  const request = store.getAll();

  request.onsuccess = (event) => {
    const records = event.target.result;
    records.forEach(record => {
      usageData[record.hostname] = record.time;
    });
    console.log('Usage data loaded from IndexedDB:', usageData);
  };

  request.onerror = (event) => {
    console.error('Error loading data from IndexedDB:', event.target.error);
  };
}

// Check if we need to reset daily data
async function checkDailyReset() {
  console.log('Checking if daily reset is needed...');
  chrome.storage.local.get(['lastResetDate'], (data) => {
    const today = new Date().toDateString();
    const lastResetDate = data.lastResetDate;

    if (lastResetDate !== today) {
      console.log('Performing daily reset...');
      resetAllUsageData();
      chrome.storage.local.set({ lastResetDate: today });
    } else {
      console.log('Daily reset not needed. Last reset:', lastResetDate);
    }
  });
}

// Reset all usage data
function resetAllUsageData() {
  console.log('Resetting all usage data...');

  // Clear in-memory data
  for (const key in usageData) {
    delete usageData[key];
  }

  // Clear warning states
  for (const key in warningStates) {
    delete warningStates[key];
  }

  // Clear IndexedDB
  if (!db) {
    console.error('Database not open yet, cannot reset usage data.');
    return;
  }

  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  const request = store.clear();

  request.onsuccess = () => {
    console.log('All usage data cleared from IndexedDB');
  };

  request.onerror = (event) => {
    console.error('Error clearing IndexedDB:', event.target.error);
  };
}

// Wait for database to open, then load data and check for daily reset
setTimeout(() => {
  loadUsageData();
  checkDailyReset();
}, 1000);

// Save usage data to IndexedDB
async function saveUsageData() {
  console.log('Attempting to save usage data to IndexedDB...');
  if (!db) {
    console.error('Database not open yet, cannot save usage data.');
    return;
  }

  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);

  for (const [hostname, time] of Object.entries(usageData)) {
    console.log(`Saving data for hostname: ${hostname}, time: ${time}`);
    const record = { hostname, time };
    await new Promise((resolve, reject) => {
      const request = store.put(record); // Use put() to insert or update the data
      request.onsuccess = resolve;
      request.onerror = (event) => reject(event.target.error);
    });
  }

  transaction.oncomplete = () => {
    console.log('Usage data saved to IndexedDB:', usageData);
  };

  transaction.onerror = (event) => {
    console.error('Error saving data to IndexedDB:', event.target.error);
  };
}

// Fetch limits from chrome.storage.local
function getLimits() {
  console.log('Fetching limits from chrome.storage.local...');
  return new Promise((resolve) => {
    chrome.storage.local.get(["limits"], (data) => {
      console.log('Limits fetched:', data.limits || {});
      resolve(data.limits || {});
    });
  });
}

// Check if a URL is supported (e.g., exclude chrome:// or internal URLs)
function isSupportedUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    console.log(`Checking URL support for: ${url}`);
    return protocol === "http:" || protocol === "https:";
  } catch (error) {
    console.error('Error checking URL support:', error);
    return false;
  }
}

// Notify the user when a tab is closed due to exceeding the time limit
function notifyUser(hostname, type = "limit") {
  console.log(`Notifying user about ${type} for: ${hostname}`);
  const messages = {
    limit: `Your time limit for ${hostname} has been reached, and the tab has been closed.`,
    warning80: `You've used 80% of your time limit for ${hostname}. You have a few minutes remaining.`,
    warning90: `You've used 90% of your time limit for ${hostname}. The tab will close soon.`
  };

  const titles = {
    limit: "Time Limit Reached",
    warning80: "Time Limit Warning",
    warning90: "Time Limit Warning"
  };

  chrome.notifications.create({
    type: "basic",
    iconUrl: "img/icon64.png",
    title: titles[type] || "Screen Time Notification",
    message: messages[type] || `Notification for ${hostname}`,
  });
}

// Check if a tab exceeds its limit and close it if necessary
async function checkAndCloseTab(hostname, tabId) {
  console.log(`Checking time limits for hostname: ${hostname}, Tab ID: ${tabId}`);
  const limits = await getLimits();
  if (limits[hostname]) {
    const limit = limits[hostname];
    const usedTime = usageData[hostname] || 0;
    const percentage = (usedTime / limit) * 100;

    console.log(`[checkAndCloseTab] Hostname: ${hostname}, Used: ${usedTime} mins, Limit: ${limit} mins, Percentage: ${percentage.toFixed(1)}%`);

    // Initialize warning state for this hostname if it doesn't exist
    if (!warningStates[hostname]) {
      warningStates[hostname] = { warning80: false, warning90: false };
    }

    // Check if limit is exceeded
    if (usedTime >= limit) {
      console.log(`Time limit exceeded for ${hostname}. Closing tab ID: ${tabId}`);
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          console.error(`[checkAndCloseTab] Error closing tab: ${chrome.runtime.lastError.message}`);
        } else {
          console.log(`[checkAndCloseTab] Tab with ID ${tabId} closed due to exceeded limit.`);
          notifyUser(hostname, "limit");
          // Reset warning states after limit is reached
          warningStates[hostname] = { warning80: false, warning90: false };
        }
      });
    }
    // Check if 90% warning should be shown
    else if (percentage >= 90 && !warningStates[hostname].warning90) {
      console.log(`[checkAndCloseTab] 90% warning for ${hostname}`);
      notifyUser(hostname, "warning90");
      warningStates[hostname].warning90 = true;
    }
    // Check if 80% warning should be shown
    else if (percentage >= 80 && !warningStates[hostname].warning80) {
      console.log(`[checkAndCloseTab] 80% warning for ${hostname}`);
      notifyUser(hostname, "warning80");
      warningStates[hostname].warning80 = true;
    }
  } else {
    console.log(`[checkAndCloseTab] No limit set for hostname: ${hostname}`);
  }
}

// Record time spent on a tab
async function recordTabTime(tabId) {
  console.log(`Recording time for Tab ID: ${tabId}`);
  if (!tabId || !activeTabStartTime) {
    console.log('No active tab or start time; skipping time recording.');
    return;
  }

  const elapsedTime = Math.round((Date.now() - activeTabStartTime) / 1000 / 60); // Convert to minutes
  console.log(`Elapsed time for Tab ID ${tabId}: ${elapsedTime} minutes`);

  if (elapsedTime > 0) {
    try {
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError || !tab || !tab.url) {
            reject('Error getting tab information');
          } else {
            resolve(tab);
          }
        });
      });

      if (!isSupportedUrl(tab.url)) {
        console.log(`[recordTabTime] Unsupported URL: ${tab.url}`);
        return;
      }

      const url = new URL(tab.url);
      const hostname = url.hostname;

      console.log(`[recordTabTime] Updating usage data for hostname: ${hostname}`);
      if (!usageData[hostname]) usageData[hostname] = 0;
      usageData[hostname] += elapsedTime;

      await saveUsageData();

      await checkAndCloseTab(hostname, tabId);
    } catch (error) {
      console.error('Error processing tab time:', error);
    }
  }
}

// Listen for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab activated:', activeInfo);
  if (activeTabId !== null) {
    console.log(`Switching away from Tab ID: ${activeTabId}`);
    recordTabTime(activeTabId);
  }

  activeTabId = activeInfo.tabId;
  activeTabStartTime = Date.now();
  console.log(`New active Tab ID: ${activeTabId}`);
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log(`Tab updated: Tab ID: ${tabId}, Change Info:`, changeInfo);

  // When the active tab's URL changes, record time for the previous URL
  if (tabId === activeTabId && changeInfo.url) {
    console.log(`Active tab URL changed from previous to: ${changeInfo.url}`);
    recordTabTime(tabId);
    activeTabStartTime = Date.now();
    console.log(`Tab ID ${tabId} URL changed; start time reset.`);
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`Tab removed: Tab ID ${tabId}`);
  if (tabId === activeTabId) {
    recordTabTime(tabId);
    activeTabId = null;
    activeTabStartTime = null;
    console.log('Active tab cleared after removal.');
  }
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  console.log(`Window focus changed: Window ID ${windowId}`);
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log('No window in focus.');
    recordTabTime(activeTabId);
    activeTabId = null;
    activeTabStartTime = null;
  } else {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (tabs.length > 0) {
        activeTabId = tabs[0].id;
        activeTabStartTime = Date.now();
        console.log(`Window focus switched to Tab ID: ${activeTabId}`);
      }
    });
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[onMessage] Message received:', request);

  if (request.action === 'resetUsageData') {
    console.log('[onMessage] Resetting usage data...');
    resetAllUsageData();
    sendResponse({ status: 'success', message: 'Usage data reset successfully' });
  } else if (request.action === 'deleteLimit') {
    console.log('[onMessage] Deleting limit for:', request.hostname);
    chrome.storage.local.get(['limits'], (data) => {
      const limits = data.limits || {};
      delete limits[request.hostname];
      chrome.storage.local.set({ limits }, () => {
        console.log('[onMessage] Limit deleted for:', request.hostname);
        sendResponse({ status: 'success', message: 'Limit deleted successfully' });
      });
    });
    return true; // Keep the message channel open for async response
  }

  return true;
});
