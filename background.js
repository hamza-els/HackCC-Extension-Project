// Manifest V3 service workers can terminate at any time
// We must persist state to storage, not keep in memory

const dbName = 'usageDataDB';
const storeName = 'usageStore';
let db = null;

// ============= DATABASE FUNCTIONS =============

// Open the IndexedDB database
async function openDatabase() {
  return new Promise((resolve, reject) => {
    console.log('[DB] Opening IndexedDB...');
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = (event) => {
      console.log('[DB] Upgrade needed, creating object store...');
      const database = event.target.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'hostname' });
        console.log('[DB] Object store created');
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('[DB] Database opened successfully');
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('[DB] Database error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Get usage time for a specific hostname from IndexedDB
async function getUsageTime(hostname) {
  if (!db) await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(hostname);

    request.onsuccess = (event) => {
      const result = event.target.result;
      resolve(result ? result.time : 0);
    };

    request.onerror = (event) => {
      console.error('[DB] Error getting usage time:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Save or update usage time for a hostname
async function saveUsageTime(hostname, timeInMinutes) {
  if (!db) await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const record = { hostname, time: timeInMinutes };
    const request = store.put(record);

    request.onsuccess = () => {
      console.log(`[DB] Saved: ${hostname} = ${timeInMinutes} minutes`);
      resolve();
    };

    request.onerror = (event) => {
      console.error('[DB] Error saving usage time:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Get all usage data from IndexedDB
async function getAllUsageData() {
  if (!db) await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('[DB] Error getting all usage data:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Clear all usage data
async function clearAllUsageData() {
  if (!db) await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => {
      console.log('[DB] All usage data cleared');
      resolve();
    };

    request.onerror = (event) => {
      console.error('[DB] Error clearing data:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ============= STATE MANAGEMENT =============

// Get current tracking state from chrome.storage.session
async function getTrackingState() {
  return new Promise((resolve) => {
    chrome.storage.session.get(['activeTabId', 'activeTabStartTime', 'activeTabUrl'], (data) => {
      resolve({
        activeTabId: data.activeTabId || null,
        activeTabStartTime: data.activeTabStartTime || null,
        activeTabUrl: data.activeTabUrl || null
      });
    });
  });
}

// Save tracking state to chrome.storage.session
async function saveTrackingState(activeTabId, activeTabStartTime, activeTabUrl) {
  return new Promise((resolve) => {
    chrome.storage.session.set({
      activeTabId,
      activeTabStartTime,
      activeTabUrl
    }, () => {
      console.log(`[STATE] Saved: Tab ${activeTabId}, URL: ${activeTabUrl}, Start: ${activeTabStartTime}`);
      resolve();
    });
  });
}

// Clear tracking state
async function clearTrackingState() {
  return new Promise((resolve) => {
    chrome.storage.session.remove(['activeTabId', 'activeTabStartTime', 'activeTabUrl'], () => {
      console.log('[STATE] Cleared tracking state');
      resolve();
    });
  });
}

// ============= UTILITY FUNCTIONS =============

// Check if a URL is supported (http or https only)
function isSupportedUrl(url) {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch (error) {
    return false;
  }
}

// Get hostname from URL
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    console.error('[UTIL] Error parsing URL:', error);
    return null;
  }
}

// Get limits from chrome.storage.local
async function getLimits() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['limits'], (data) => {
      resolve(data.limits || {});
    });
  });
}

// Get warning states from chrome.storage.session
async function getWarningStates() {
  return new Promise((resolve) => {
    chrome.storage.session.get(['warningStates'], (data) => {
      resolve(data.warningStates || {});
    });
  });
}

// Save warning states
async function saveWarningStates(warningStates) {
  return new Promise((resolve) => {
    chrome.storage.session.set({ warningStates }, () => {
      resolve();
    });
  });
}

// ============= NOTIFICATION FUNCTIONS =============

function notifyUser(hostname, type = 'limit') {
  const messages = {
    limit: `Your time limit for ${hostname} has been reached, and the tab has been closed.`,
    warning80: `You've used 80% of your time limit for ${hostname}. You have a few minutes remaining.`,
    warning90: `You've used 90% of your time limit for ${hostname}. The tab will close soon.`
  };

  const titles = {
    limit: 'Time Limit Reached',
    warning80: 'Time Limit Warning',
    warning90: 'Time Limit Warning'
  };

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'img/icon64.png',
    title: titles[type] || 'Screen Time Notification',
    message: messages[type] || `Notification for ${hostname}`,
  });
}

// ============= TIME TRACKING FUNCTIONS =============

// Record time for the currently tracked tab
async function recordCurrentTabTime() {
  const state = await getTrackingState();

  if (!state.activeTabId || !state.activeTabStartTime || !state.activeTabUrl) {
    console.log('[TRACK] No active tracking session');
    return;
  }

  // Calculate elapsed time in seconds
  const elapsedSeconds = Math.floor((Date.now() - state.activeTabStartTime) / 1000);

  if (elapsedSeconds < 1) {
    console.log('[TRACK] Less than 1 second elapsed, skipping');
    return;
  }

  const hostname = getHostname(state.activeTabUrl);
  if (!hostname) {
    console.log('[TRACK] Could not extract hostname');
    return;
  }

  // Get current usage time and add elapsed time
  const currentUsage = await getUsageTime(hostname);
  const elapsedMinutes = Math.ceil(elapsedSeconds / 60); // Round up to count partial minutes
  const newUsage = currentUsage + elapsedMinutes;

  console.log(`[TRACK] Recording: ${hostname} - ${elapsedMinutes} min (${elapsedSeconds}s), Total: ${newUsage} min`);

  // Save to database
  await saveUsageTime(hostname, newUsage);

  // Check limits
  await checkAndEnforceLimits(hostname, newUsage, state.activeTabId);

  // Reset start time to now (to avoid double-counting)
  await saveTrackingState(state.activeTabId, Date.now(), state.activeTabUrl);
}

// Check limits and close tab if exceeded
async function checkAndEnforceLimits(hostname, usedTime, tabId) {
  const limits = await getLimits();
  const limit = limits[hostname];

  if (!limit) {
    console.log(`[LIMIT] No limit set for ${hostname}`);
    return;
  }

  const percentage = (usedTime / limit) * 100;
  console.log(`[LIMIT] ${hostname}: ${usedTime}/${limit} min (${percentage.toFixed(1)}%)`);

  // Get warning states
  const warningStates = await getWarningStates();
  if (!warningStates[hostname]) {
    warningStates[hostname] = { warning80: false, warning90: false };
  }

  // Check if limit exceeded
  if (usedTime >= limit) {
    console.log(`[LIMIT] EXCEEDED for ${hostname}, closing tab ${tabId}`);

    try {
      await chrome.tabs.remove(tabId);
      notifyUser(hostname, 'limit');

      // Reset warnings
      warningStates[hostname] = { warning80: false, warning90: false };
      await saveWarningStates(warningStates);

      // Clear tracking state since tab is closed
      await clearTrackingState();
    } catch (error) {
      console.error('[LIMIT] Error closing tab:', error);
    }
  }
  // Check for 90% warning
  else if (percentage >= 90 && !warningStates[hostname].warning90) {
    console.log(`[LIMIT] 90% warning for ${hostname}`);
    notifyUser(hostname, 'warning90');
    warningStates[hostname].warning90 = true;
    await saveWarningStates(warningStates);
  }
  // Check for 80% warning
  else if (percentage >= 80 && !warningStates[hostname].warning80) {
    console.log(`[LIMIT] 80% warning for ${hostname}`);
    notifyUser(hostname, 'warning80');
    warningStates[hostname].warning80 = true;
    await saveWarningStates(warningStates);
  }
}

// Start tracking a new tab
async function startTrackingTab(tabId, url) {
  if (!isSupportedUrl(url)) {
    console.log(`[TRACK] Unsupported URL: ${url}`);
    await clearTrackingState();
    return;
  }

  console.log(`[TRACK] Starting tracking: Tab ${tabId}, URL: ${url}`);
  await saveTrackingState(tabId, Date.now(), url);
}

// Stop tracking current tab and record time
async function stopTrackingCurrentTab() {
  console.log('[TRACK] Stopping current tracking');
  await recordCurrentTabTime();
  await clearTrackingState();
}

// ============= EVENT LISTENERS =============

// When a tab becomes active
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log(`[EVENT] Tab activated: ${activeInfo.tabId}`);

  // Record time for previous tab
  await recordCurrentTabTime();

  // Start tracking new tab
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await startTrackingTab(tab.id, tab.url);
  } catch (error) {
    console.error('[EVENT] Error getting tab info:', error);
    await clearTrackingState();
  }
});

// When a tab is updated (URL change, page load, etc.)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only care about URL changes on the active tab
  if (changeInfo.url) {
    console.log(`[EVENT] Tab ${tabId} URL changed to: ${changeInfo.url}`);

    const state = await getTrackingState();

    // If this is the currently tracked tab, record time and start tracking new URL
    if (state.activeTabId === tabId) {
      await recordCurrentTabTime();
      await startTrackingTab(tabId, changeInfo.url);
    }
  }
});

// When a tab is removed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  console.log(`[EVENT] Tab removed: ${tabId}`);

  const state = await getTrackingState();

  // If this was the tracked tab, record time
  if (state.activeTabId === tabId) {
    await recordCurrentTabTime();
    await clearTrackingState();
  }
});

// When window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  console.log(`[EVENT] Window focus changed: ${windowId}`);

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Lost focus, stop tracking
    console.log('[EVENT] Browser lost focus');
    await stopTrackingCurrentTab();
  } else {
    // Gained focus, find active tab
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs.length > 0) {
        await startTrackingTab(tabs[0].id, tabs[0].url);
      }
    } catch (error) {
      console.error('[EVENT] Error querying tabs:', error);
    }
  }
});

// ============= PERIODIC TRACKING =============

// Create alarm for periodic tracking (every 30 seconds)
chrome.alarms.create('trackTime', { periodInMinutes: 0.5 }); // 30 seconds

// Store last alarm time to detect sleep/suspend
let lastAlarmTime = Date.now();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'trackTime') {
    const now = Date.now();
    const timeSinceLastAlarm = Math.floor((now - lastAlarmTime) / 1000);

    // If more than 2 minutes since last alarm, computer was likely asleep
    if (timeSinceLastAlarm > 120) {
      console.log(`[ALARM] WARNING: ${timeSinceLastAlarm}s since last alarm. Computer was likely asleep. Clearing tracking state.`);
      await clearTrackingState();
    } else {
      console.log('[ALARM] Periodic time recording');
      await recordCurrentTabTime();
    }

    lastAlarmTime = now;
  } else if (alarm.name === 'checkDailyReset') {
    await checkDailyReset();
  }
});

// ============= DAILY RESET =============

// Check if we need to reset daily data
async function checkDailyReset() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['lastResetDate'], async (data) => {
      const today = new Date().toDateString();
      const lastResetDate = data.lastResetDate;

      if (lastResetDate !== today) {
        console.log('[RESET] Performing daily reset...');
        await clearAllUsageData();

        // Clear warning states
        await chrome.storage.session.remove(['warningStates']);

        chrome.storage.local.set({ lastResetDate: today });
      }
      resolve();
    });
  });
}

// Check for daily reset every hour
chrome.alarms.create('checkDailyReset', { periodInMinutes: 60 });

// ============= MESSAGE HANDLERS =============

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[MESSAGE] Received:', request);

  if (request.action === 'resetUsageData') {
    clearAllUsageData()
      .then(async () => {
        await chrome.storage.session.remove(['warningStates']);
        sendResponse({ status: 'success', message: 'Usage data reset successfully' });
      })
      .catch((error) => {
        sendResponse({ status: 'error', message: error.message });
      });
    return true;
  }
  else if (request.action === 'deleteLimit') {
    chrome.storage.local.get(['limits'], (data) => {
      const limits = data.limits || {};
      delete limits[request.hostname];
      chrome.storage.local.set({ limits }, () => {
        sendResponse({ status: 'success', message: 'Limit deleted successfully' });
      });
    });
    return true;
  }
  else if (request.action === 'getDebugInfo') {
    // For debugging
    Promise.all([
      getTrackingState(),
      getAllUsageData(),
      getLimits()
    ]).then(([state, usage, limits]) => {
      sendResponse({ state, usage, limits });
    });
    return true;
  }

  return true;
});

// ============= INITIALIZATION =============

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[INIT] Extension installed/updated');

  // Open database
  await openDatabase();

  // Check for daily reset
  await checkDailyReset();

  // Start tracking current tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      await startTrackingTab(tabs[0].id, tabs[0].url);
    }
  } catch (error) {
    console.error('[INIT] Error starting initial tracking:', error);
  }
});

// Initialize on service worker startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[STARTUP] Browser started');

  // Open database
  await openDatabase();

  // Check for daily reset
  await checkDailyReset();

  // Start tracking current tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      await startTrackingTab(tabs[0].id, tabs[0].url);
    }
  } catch (error) {
    console.error('[STARTUP] Error starting initial tracking:', error);
  }
});

// Detect when service worker is about to suspend
chrome.runtime.onSuspend.addListener(async () => {
  console.log('[SUSPEND] Service worker suspending, recording current time...');
  await recordCurrentTabTime();
  console.log('[SUSPEND] Time recorded before suspension');
});

// Detect when computer goes idle/locked
chrome.idle.onStateChanged.addListener(async (newState) => {
  console.log(`[IDLE] State changed to: ${newState}`);

  if (newState === 'locked' || newState === 'idle') {
    console.log('[IDLE] Computer locked/idle, stopping tracking');
    await recordCurrentTabTime();
    await clearTrackingState();
  } else if (newState === 'active') {
    console.log('[IDLE] Computer active again, resuming tracking');
    // Find and start tracking active tab
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        await startTrackingTab(tabs[0].id, tabs[0].url);
      }
    } catch (error) {
      console.error('[IDLE] Error resuming tracking:', error);
    }
  }
});

// Set idle detection to 60 seconds
chrome.idle.setDetectionInterval(60);

// Initialize database immediately
console.log('[INIT] Service worker started');
openDatabase().then(() => {
  console.log('[INIT] Database ready');

  // Start tracking if there's an active tab
  chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs.length > 0) {
      startTrackingTab(tabs[0].id, tabs[0].url);
    }
  });
});
