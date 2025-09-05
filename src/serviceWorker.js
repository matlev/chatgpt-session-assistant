chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "Hi" });
  chrome.action.setBadgeBackgroundColor({ color: "#2196f3" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
});
