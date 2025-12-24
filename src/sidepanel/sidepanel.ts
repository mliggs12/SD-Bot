const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

// Open sidepanel on action click
chrome.action.onClicked.addListener(() => {
    chrome.sidePanel.open({ tabId: tab.id });
});