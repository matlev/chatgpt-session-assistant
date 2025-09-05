document.getElementById("badge").addEventListener("click", async () => {
  await chrome.action.setBadgeText({ text: "OK" });
  await chrome.action.setBadgeBackgroundColor({ color: "#4caf50" });
});


document.getElementById("clear").addEventListener("click", async () => {
  await chrome.action.setBadgeText({ text: "" });
});


const lastNInput = document.getElementById("lastN");
chrome.storage.sync.get({ lastN: 20 }, (data) => {
  lastNInput.value = data.lastN;
});


lastNInput.addEventListener("change", () => {
  chrome.storage.sync.set({ lastN: Number(lastNInput.value) });
});