// Popup UI logic

import type { ConnectionStatus, RecordedAction } from './types';

const statusDot = document.getElementById('statusDot')!;
const tabList = document.getElementById('tabList')!;
const exportBtn = document.getElementById('exportBtn')!;
const shareAllBtn = document.getElementById('shareAllBtn')!;
const unshareAllBtn = document.getElementById('unshareAllBtn')!;
const statusText = document.getElementById('statusText')!;
const gatewayUrl = document.getElementById('gatewayUrl')!;
const tabCountEl = document.getElementById('tabCount')!;
const versionText = document.getElementById('versionText')!;

interface TabListItem {
  tabId: number;
  url: string;
  title: string;
  shared: boolean;
}

// Update connection status
async function updateConnectionStatus() {
  try {
    const status: ConnectionStatus = await chrome.runtime.sendMessage({
      type: 'get_connection_status',
    });

    statusDot.classList.remove('connected', 'connecting', 'disconnected');
    const state = status.state ?? (status.connected ? 'connected' : 'disconnected');
    statusDot.classList.add(state);

    statusText.classList.remove('connected', 'disconnected');
    if (state === 'connected') {
      statusText.textContent = 'Connected to gateway';
      statusText.classList.add('connected');
    } else if (state === 'connecting') {
      statusText.textContent = 'Connecting...';
    } else {
      statusText.textContent = 'Disconnected';
      statusText.classList.add('disconnected');
    }

    gatewayUrl.textContent = status.gatewayUrl?.replace('ws://', '').replace('/ext', '') || 'localhost:3500';
  } catch (err) {
    console.error('[Popup] Error getting connection status:', err);
    statusDot.classList.remove('connected', 'connecting');
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
    statusText.classList.add('disconnected');
  }

  // Show version
  try {
    const manifest = chrome.runtime.getManifest();
    versionText.textContent = `v${manifest.version}`;
  } catch { /* ignore */ }
}

// Load and render tab list
async function loadTabs() {
  try {
    const [allTabs, sharedTabsState] = await Promise.all([
      chrome.tabs.query({}),
      chrome.runtime.sendMessage({ type: 'get_shared_tabs' }),
    ]);
    
    const tabs: TabListItem[] = allTabs
      .filter(tab => tab.id !== undefined && tab.url && !tab.url.startsWith('chrome://'))
      .map(tab => ({
        tabId: tab.id!,
        url: tab.url!,
        title: tab.title || 'Untitled',
        shared: tab.id! in sharedTabsState,
      }));
    
    renderTabs(tabs);

    const sharedCount = tabs.filter(t => t.shared).length;
    tabCountEl.textContent = `${sharedCount} tab${sharedCount !== 1 ? 's' : ''} shared`;
  } catch (err) {
    console.error('[Popup] Error loading tabs:', err);
    tabList.innerHTML = '<div class="info-text">Error loading tabs</div>';
  }
}

function renderTabs(tabs: TabListItem[]) {
  if (tabs.length === 0) {
    tabList.innerHTML = '<div class="info-text">No tabs available</div>';
    return;
  }
  
  tabList.innerHTML = '';
  
  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';
    
    const info = document.createElement('div');
    info.className = 'tab-info';
    
    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title;
    
    const url = document.createElement('div');
    url.className = 'tab-url';
    url.textContent = tab.url;
    
    const deviceId = document.createElement('div');
    deviceId.className = 'device-id';
    deviceId.textContent = tab.shared ? `chrome-${tab.tabId}` : '';
    
    info.appendChild(title);
    info.appendChild(url);
    if (tab.shared) {
      info.appendChild(deviceId);
    }
    
    const toggle = document.createElement('div');
    toggle.className = 'toggle';
    if (tab.shared) {
      toggle.classList.add('active');
    }
    
    toggle.addEventListener('click', async () => {
      const newState = !tab.shared;
      
      if (newState) {
        await chrome.runtime.sendMessage({
          type: 'share_tab',
          tabId: tab.tabId,
        });
      } else {
        await chrome.runtime.sendMessage({
          type: 'unshare_tab',
          tabId: tab.tabId,
        });
      }
      
      // Reload tabs
      await loadTabs();
    });
    
    item.appendChild(info);
    item.appendChild(toggle);
    tabList.appendChild(item);
  });
}

async function shareAllVisibleTabs() {
  const [allTabs] = await Promise.all([chrome.tabs.query({})]);
  const eligible = allTabs.filter((t) => t.id !== undefined && t.url && !t.url.startsWith('chrome://'));
  for (const tab of eligible) {
    await chrome.runtime.sendMessage({ type: 'share_tab', tabId: tab.id! });
  }
  await loadTabs();
}

async function unshareAllTabs() {
  const shared = await chrome.runtime.sendMessage({ type: 'get_shared_tabs' });
  const ids = Object.keys(shared).map((k) => Number.parseInt(k, 10)).filter((n) => Number.isFinite(n));
  for (const tabId of ids) {
    await chrome.runtime.sendMessage({ type: 'unshare_tab', tabId });
  }
  await loadTabs();
}

shareAllBtn.addEventListener('click', () => {
  void shareAllVisibleTabs();
});

unshareAllBtn.addEventListener('click', () => {
  void unshareAllTabs();
});

// Export recorded actions as defineSite() format
exportBtn.addEventListener('click', async () => {
  try {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!currentTab.id) {
      alert('No active tab');
      return;
    }
    
    const actions: RecordedAction[] = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'get_recorded_actions',
    });
    
    if (actions.length === 0) {
      alert('No recorded actions');
      return;
    }
    
    const pingAppCode = generatePingAppCode(currentTab.url || '', actions);
    
    // Copy to clipboard
    await navigator.clipboard.writeText(pingAppCode);
    
    // Show feedback
    const originalText = exportBtn.textContent;
    exportBtn.textContent = '✓ Copied to clipboard!';
    setTimeout(() => {
      exportBtn.textContent = originalText;
    }, 2000);
  } catch (err) {
    console.error('[Popup] Error exporting actions:', err);
    alert('Error exporting actions: ' + (err instanceof Error ? err.message : 'Unknown'));
  }
});

function generatePingAppCode(url: string, actions: RecordedAction[]): string {
  const domain = new URL(url).hostname;
  const appName = domain.replace(/\./g, '_');
  
  let code = `import { defineSite } from '@pingdev/std';\n\n`;
  code += `export default defineSite({\n`;
  code += `  name: '${appName}',\n`;
  code += `  domains: ['${domain}'],\n`;
  code += `  async actions(browser) {\n`;
  
  actions.forEach((action, i) => {
    if (action.type === 'click') {
      code += `    await browser.click('${action.selector}'); // ${i + 1}\n`;
    } else if (action.type === 'type') {
      code += `    await browser.type('${action.selector}', '${action.text?.replace(/'/g, "\\'")}'); // ${i + 1}\n`;
    } else if (action.type === 'navigate') {
      code += `    await browser.navigate('${action.url}'); // ${i + 1}\n`;
    }
  });
  
  code += `  },\n`;
  code += `});\n`;
  
  return code;
}

// Initialize
updateConnectionStatus();
loadTabs();

// Refresh every 2 seconds
setInterval(() => {
  updateConnectionStatus();
  loadTabs();
}, 2000);
