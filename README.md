# Screen Time Tracker - Chrome Extension

A powerful Chrome extension that helps you track your daily website usage and set time limits to manage your screen time effectively. The extension automatically tracks how much time you spend on each website and can close tabs when you exceed your self-imposed limits.

## Features

### 📊 Time Tracking
- **Automatic tracking**: Tracks time spent on each website in real-time
- **Accurate monitoring**: Only tracks active tabs and pauses when you switch away
- **Daily statistics**: View your daily usage for all websites
- **Total time summary**: See your total browsing time for the day

### ⏰ Time Limits
- **Set custom limits**: Set daily time limits (in minutes) for any website
- **Auto-close tabs**: Tabs automatically close when time limit is exceeded
- **Warning notifications**: Get warnings at 80% and 90% of your limit
- **Easy management**: Edit or delete limits anytime through the popup

### 🎨 Beautiful UI
- **Progress bars**: Visual progress bars show usage vs. limits
- **Color-coded warnings**:
  - Green: Safe usage (< 50%)
  - Blue: Moderate usage (50-80%)
  - Yellow: High usage (80-90%)
  - Red: Critical/Exceeded (90%+)
- **Clean interface**: Built with Bulma CSS for a modern, responsive design
- **Intuitive controls**: Easy-to-use buttons for all actions

### 🔄 Daily Reset
- **Automatic reset**: Usage data automatically resets at midnight
- **Manual reset**: Reset usage data anytime with one click
- **Fresh start**: Start each day with a clean slate

### 🔔 Notifications
- **Limit warnings**: Notifications when you reach 80% and 90% of your limit
- **Tab closure alerts**: Get notified when a tab is closed due to limit exceeded
- **Non-intrusive**: Chrome's native notification system

## Installation

### From Source (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Hamza06710/HackCC-Extension-Project.git
   ```

2. Open Chrome and navigate to:
   ```
   chrome://extensions
   ```

3. Enable "Developer mode" (toggle in top right corner)

4. Click "Load unpacked"

5. Select the extension folder

6. The extension is now installed! Click the extension icon in your toolbar to get started.

## Usage

### Setting Time Limits

1. Click the extension icon in your Chrome toolbar
2. Click the "Add Limit" button
3. Enter the website URL or domain (e.g., `youtube.com` or `https://youtube.com`)
4. Enter the time limit in minutes
5. Click "Save Limit"

### Viewing Usage

- Click the extension icon to see all tracked websites
- Each website shows:
  - Website name
  - Time spent today
  - Progress bar (if limit is set)
  - Limit information (if set)
  - Warning badges (if approaching limit)

### Managing Limits

- **Edit a limit**: Click the "Edit" button next to any website with a limit
- **Delete a limit**: Click the "Delete" button to remove a limit
- **Set limit for tracked site**: Click "Set Limit" on any website without a limit

### Resetting Data

- Click "Reset Usage" to clear all usage data for today
- Limits are preserved when you reset usage data
- Usage data automatically resets daily at midnight

## How It Works

### Time Tracking
The extension uses Chrome's tabs API to track which tab is active and monitors:
- Tab activation (switching between tabs)
- Tab updates (navigating to new pages)
- Tab removal (closing tabs)
- Window focus changes (switching to other apps)

Time is only counted when:
- The tab is active (in focus)
- The window is in focus
- The URL is a supported protocol (http:// or https://)

### Data Storage
- **Usage data**: Stored in IndexedDB for fast access and large capacity
- **Limits**: Stored in Chrome's local storage (chrome.storage.local)
- **Daily reset info**: Stored in Chrome's local storage

### Background Processing
The extension runs a service worker (background.js) that:
- Monitors tab activity 24/7
- Saves usage data every minute
- Checks limits continuously
- Sends notifications when needed
- Handles daily reset at midnight

## Privacy

- **All data is local**: No data is sent to any server
- **No tracking**: Only tracks time spent on websites, not what you do on them
- **No ads**: Completely ad-free
- **Open source**: All code is available for review

## Technical Details

### Permissions Required
- `tabs`: To track which tab is active
- `storage`: To save usage data and limits
- `notifications`: To send limit warnings
- `activeTab`: To access current tab information
- `<all_urls>`: To track time on all websites

### Browser Compatibility
- Chrome (Manifest V3)
- Edge (Chromium-based)
- Other Chromium-based browsers

### Technologies Used
- Manifest V3 (latest Chrome extension format)
- IndexedDB (for usage data storage)
- Chrome Storage API (for limits and settings)
- Bulma CSS (for UI styling)
- Vanilla JavaScript (no external dependencies)

## Development

### Project Structure
```
.
├── manifest.json           # Extension configuration
├── background.js           # Service worker (time tracking logic)
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.js           # Popup logic
│   └── bulma.min.css      # CSS framework
├── img/
│   └── icon64.png         # Extension icon
└── README.md              # This file
```

### Key Files

#### `background.js`
- Service worker that runs in the background
- Tracks time spent on tabs
- Checks and enforces limits
- Manages IndexedDB for data persistence
- Handles daily reset logic

#### `popup/popup.js`
- Manages the popup UI
- Displays usage statistics
- Handles limit creation/editing/deletion
- Communicates with background script

#### `manifest.json`
- Extension configuration
- Permissions declaration
- Service worker registration

## Troubleshooting

### Extension not tracking time
- Make sure you're on http:// or https:// pages (not chrome:// pages)
- Check that the extension has the necessary permissions
- Try reloading the extension in chrome://extensions

### Limits not working
- Verify the limit is set correctly (check the popup)
- Ensure the domain name matches (e.g., `youtube.com` not `www.youtube.com`)
- Check the console for any errors

### Data not persisting
- Make sure Chrome has permission to store data
- Check if you're in Incognito mode (extensions may not work by default)

## Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## License

MIT License - See LICENSE file for details

## Author

Built with ❤️ to help people manage their screen time better

## Changelog

### Version 1.0 (Current)
- Initial release
- Time tracking for all websites
- Custom time limits with auto-close
- Warning notifications at 80% and 90%
- Daily auto-reset
- Manual reset functionality
- Progress bars and visual indicators
- Edit/delete limits
- Modern Bulma-based UI
