const dbName = 'usageDataDB';
const storeName = 'usageStore';
let db = null;
let currentEditingHostname = null; // Track which hostname is being edited

// Open the IndexedDB database
function openDatabase() {
  console.log("[openDatabase] Initializing IndexedDB...");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = (event) => {
      console.log("[openDatabase] Upgrade needed, setting up database schema...");
      db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'hostname' });
        console.log("[openDatabase] Object store created:", storeName);
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("[openDatabase] IndexedDB opened successfully:", db);
      resolve(db);
    };

    request.onerror = (event) => {
      console.error("[openDatabase] Error opening IndexedDB:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Fetch usage data from IndexedDB
function fetchUsageData() {
  console.log("[fetchUsageData] Starting fetch from IndexedDB...");
  return new Promise((resolve, reject) => {
    if (!db) {
      console.error("[fetchUsageData] Database is not initialized!");
      reject("Database not initialized");
      return;
    }

    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = (event) => {
      console.log("[fetchUsageData] Data fetched successfully:", event.target.result);
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error("[fetchUsageData] Error fetching data:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Fetch limits from chrome.storage.local
function getLimits() {
  console.log("[getLimits] Fetching limits from chrome.storage.local...");
  return new Promise((resolve) => {
    chrome.storage.local.get(["limits"], (data) => {
      console.log("[getLimits] Limits fetched:", data.limits || {});
      resolve(data.limits || {});
    });
  });
}

// Format time in a human-readable way
function formatTime(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Create a usage item with progress bar
function createUsageItem(hostname, usedTime, limit) {
  const item = document.createElement('div');
  item.className = 'usage-item';

  const header = document.createElement('div');
  header.className = 'usage-header';

  const info = document.createElement('div');
  info.className = 'usage-info';

  const websiteName = document.createElement('strong');
  websiteName.textContent = hostname;

  const timeText = document.createElement('span');
  timeText.textContent = formatTime(usedTime);

  info.appendChild(websiteName);
  info.appendChild(timeText);

  // Add warning badge if limit is set
  if (limit) {
    const percentage = (usedTime / limit) * 100;
    const limitText = document.createElement('span');
    limitText.className = 'tag is-info is-light';
    limitText.textContent = `Limit: ${formatTime(limit)}`;
    info.appendChild(limitText);

    if (percentage >= 90) {
      const warningBadge = document.createElement('span');
      warningBadge.className = 'warning-badge high';
      warningBadge.textContent = '⚠ 90%+';
      info.appendChild(warningBadge);
    } else if (percentage >= 80) {
      const warningBadge = document.createElement('span');
      warningBadge.className = 'warning-badge medium';
      warningBadge.textContent = '⚠ 80%+';
      info.appendChild(warningBadge);
    }
  }

  // Add action buttons
  const actions = document.createElement('div');
  actions.className = 'limit-actions';

  if (limit) {
    const editBtn = document.createElement('button');
    editBtn.className = 'button is-small is-info';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => openEditModal(hostname, limit);
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'button is-small is-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => deleteLimit(hostname);
    actions.appendChild(deleteBtn);
  } else {
    const addLimitBtn = document.createElement('button');
    addLimitBtn.className = 'button is-small is-success';
    addLimitBtn.textContent = 'Set Limit';
    addLimitBtn.onclick = () => openEditModal(hostname, null);
    actions.appendChild(addLimitBtn);
  }

  header.appendChild(info);
  header.appendChild(actions);
  item.appendChild(header);

  // Add progress bar if limit is set
  if (limit) {
    const progressContainer = document.createElement('div');
    const progress = document.createElement('progress');
    progress.className = 'progress';
    progress.max = limit;
    progress.value = Math.min(usedTime, limit);

    // Color the progress bar based on usage percentage
    const percentage = (usedTime / limit) * 100;
    if (percentage >= 100) {
      progress.className = 'progress is-danger';
    } else if (percentage >= 90) {
      progress.className = 'progress is-danger';
    } else if (percentage >= 80) {
      progress.className = 'progress is-warning';
    } else if (percentage >= 50) {
      progress.className = 'progress is-info';
    } else {
      progress.className = 'progress is-success';
    }

    const percentageText = document.createElement('p');
    percentageText.className = 'help';
    percentageText.textContent = `${Math.min(percentage, 100).toFixed(0)}% of daily limit used`;

    progressContainer.appendChild(progress);
    progressContainer.appendChild(percentageText);
    item.appendChild(progressContainer);
  }

  return item;
}

// Display usage data with limits
async function displayUsageData() {
  console.log("[displayUsageData] Starting to display usage data...");
  const usageListElement = document.getElementById("usage-list");
  usageListElement.innerHTML = '';

  try {
    const usageData = await fetchUsageData();
    const limits = await getLimits();

    if (usageData.length === 0 && Object.keys(limits).length === 0) {
      usageListElement.innerHTML = '<p class="help">No usage data yet. Start browsing to track your time!</p>';
      return;
    }

    // Create a map of all websites (from usage and limits)
    const allWebsites = new Set();
    usageData.forEach(record => allWebsites.add(record.hostname));
    Object.keys(limits).forEach(hostname => allWebsites.add(hostname));

    // Convert to array and sort by usage time (descending)
    const websiteList = Array.from(allWebsites).map(hostname => {
      const usageRecord = usageData.find(r => r.hostname === hostname);
      const usedTime = usageRecord ? usageRecord.time : 0;
      const limit = limits[hostname] || null;
      return { hostname, usedTime, limit };
    });

    // Sort by used time (highest first)
    websiteList.sort((a, b) => b.usedTime - a.usedTime);

    // Create usage items
    if (websiteList.length === 0) {
      usageListElement.innerHTML = '<p class="help">No usage data yet. Start browsing to track your time!</p>';
    } else {
      websiteList.forEach(({ hostname, usedTime, limit }) => {
        const item = createUsageItem(hostname, usedTime, limit);
        usageListElement.appendChild(item);
      });

      // Add total time
      const totalTime = websiteList.reduce((sum, w) => sum + w.usedTime, 0);
      const totalElement = document.createElement('div');
      totalElement.className = 'box has-background-info-light mt-3';
      totalElement.innerHTML = `<strong>Total Time Today:</strong> ${formatTime(totalTime)}`;
      usageListElement.appendChild(totalElement);
    }
  } catch (error) {
    console.error("[displayUsageData] Error displaying data:", error);
    usageListElement.innerHTML = '<p class="has-text-danger">Error loading usage data</p>';
  }
}

// Modal functions
function openModal() {
  document.getElementById("limit-modal").classList.add("is-active");
  document.getElementById("modal-title").textContent = "Set Website Limit";
  document.getElementById("website-url").value = '';
  document.getElementById("time-limit").value = '';
  document.getElementById("website-url").disabled = false;
  currentEditingHostname = null;
}

function openEditModal(hostname, currentLimit) {
  document.getElementById("limit-modal").classList.add("is-active");
  document.getElementById("modal-title").textContent = currentLimit ? "Edit Website Limit" : "Set Website Limit";
  document.getElementById("website-url").value = hostname;
  document.getElementById("time-limit").value = currentLimit || '';
  document.getElementById("website-url").disabled = !!currentLimit; // Disable if editing
  currentEditingHostname = hostname;
}

function closeModal() {
  document.getElementById("limit-modal").classList.remove("is-active");
  currentEditingHostname = null;
}

// Save or update limit
async function saveLimit() {
  const websiteUrl = document.getElementById("website-url").value.trim();
  const timeLimit = parseInt(document.getElementById("time-limit").value.trim(), 10);

  if (!websiteUrl || isNaN(timeLimit) || timeLimit <= 0) {
    alert("Please enter a valid URL and time limit.");
    return;
  }

  let domain;
  try {
    // Try to parse as URL first
    try {
      domain = new URL(websiteUrl.startsWith('http') ? websiteUrl : 'https://' + websiteUrl).hostname;
    } catch {
      // If that fails, assume it's already a hostname
      domain = websiteUrl;
    }
  } catch (error) {
    alert("Invalid URL format. Please enter a valid URL or domain name.");
    return;
  }

  // Save the limit in chrome.storage.local
  chrome.storage.local.get(["limits"], (data) => {
    const limits = data.limits || {};
    limits[domain] = timeLimit;

    chrome.storage.local.set({ limits }, () => {
      console.log(`[saveLimit] Limit set: ${domain} - ${timeLimit} minutes`);
      closeModal();
      displayUsageData(); // Refresh the display
    });
  });
}

// Delete a limit
function deleteLimit(hostname) {
  if (!confirm(`Are you sure you want to delete the limit for ${hostname}?`)) {
    return;
  }

  chrome.runtime.sendMessage({ action: 'deleteLimit', hostname }, (response) => {
    if (response && response.status === 'success') {
      console.log(`[deleteLimit] Limit deleted for ${hostname}`);
      displayUsageData(); // Refresh the display
    }
  });
}

// Reset all usage data
function resetUsageData() {
  if (!confirm("Are you sure you want to reset all usage data? This cannot be undone.")) {
    return;
  }

  chrome.runtime.sendMessage({ action: 'resetUsageData' }, (response) => {
    if (response && response.status === 'success') {
      console.log("[resetUsageData] Usage data reset successfully");
      displayUsageData(); // Refresh the display
    }
  });
}

// Debug functions
function toggleDebugSection() {
  const debugSection = document.getElementById("debug-section");
  if (debugSection.style.display === "none") {
    debugSection.style.display = "block";
    loadDebugInfo();
  } else {
    debugSection.style.display = "none";
  }
}

function loadDebugInfo() {
  chrome.runtime.sendMessage({ action: 'getDebugInfo' }, (response) => {
    const debugDiv = document.getElementById("debug-info");
    if (response) {
      const info = {
        "Current Tracking State": response.state,
        "Usage Data": response.usage,
        "Limits": response.limits,
        "Timestamp": new Date().toLocaleString()
      };
      debugDiv.textContent = JSON.stringify(info, null, 2);
    } else {
      debugDiv.textContent = "Error loading debug info";
    }
  });
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("[DOMContentLoaded] Popup loaded. Initializing...");

  // Set up event listeners
  document.getElementById("add-limit-button").addEventListener("click", openModal);
  document.getElementById("reset-usage-button").addEventListener("click", resetUsageData);
  document.getElementById("modal-background").addEventListener("click", closeModal);
  document.getElementById("cancel-modal").addEventListener("click", closeModal);
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("save-limit").addEventListener("click", saveLimit);
  document.getElementById("debug-toggle-button").addEventListener("click", toggleDebugSection);
  document.getElementById("refresh-debug-button").addEventListener("click", loadDebugInfo);

  // Open database and display data
  openDatabase()
    .then(() => {
      console.log("[DOMContentLoaded] Database initialized successfully.");
      return displayUsageData();
    })
    .catch((error) => {
      console.error("[DOMContentLoaded] Error initializing:", error);
      document.getElementById("usage-list").innerHTML = '<p class="has-text-danger">Error initializing extension</p>';
    });
});
