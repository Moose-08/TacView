'use strict';

const APP_URL = chrome.runtime.getURL('app/index.html');

async function openApp() {
  const existing = await chrome.tabs.query({ url: APP_URL });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: APP_URL });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') openApp();
});

chrome.action.onClicked.addListener(openApp);
