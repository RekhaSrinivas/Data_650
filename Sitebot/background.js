// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "includeImage",
        title: "Include image",
        contexts: ["image"]
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "includeImage") {
        // Send message to content script with image details
        chrome.tabs.sendMessage(tab.id, {
            action: "includeImage",
            imageUrl: info.srcUrl
        });

        // Send message to side panel to add image
        chrome.runtime.sendMessage({
            action: "addImageToChat",
            imageUrl: info.srcUrl
        });
    }
});

// Existing background.js code
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "closeSidePanel") {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
        chrome.action.setPopup({ popup: '' });
    } else if (request.action === "forwardToSidePanel") {
        chrome.runtime.sendMessage(request);
    }
});


  
