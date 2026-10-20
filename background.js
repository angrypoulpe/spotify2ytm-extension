import { spotifyToYtm } from "./converter.js";

const MENU_ID = "spotify-to-ytm";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Ouvrir dans YouTube Music",
    contexts: ["link"],
    targetUrlPatterns: [
      "https://open.spotify.com/*",
      "https://spotify.link/*",
      "https://spotify.app.link/*",
    ],
  });
});

function flashError() {
  chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  chrome.action.setBadgeText({ text: "!" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
  try {
    const { ytm } = await spotifyToYtm(info.linkUrl);
    await chrome.tabs.create({
      url: ytm,
      index: tab ? tab.index + 1 : undefined,
    });
  } catch (err) {
    console.error("Conversion Spotify → YouTube Music impossible :", err);
    flashError();
  }
});
