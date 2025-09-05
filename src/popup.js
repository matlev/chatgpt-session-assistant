document.getElementById("badge").addEventListener("click", async () => {
  await chrome.action.setBadgeText({ text: "HI" });
  await chrome.action.setBadgeBackgroundColor({ color: "#4caf50" });
});
document.getElementById("clear").addEventListener("click", async () => {
  await chrome.action.setBadgeText({ text: "" });
});
