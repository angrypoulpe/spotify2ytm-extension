import { spotifyToYtm, isSpotifyUrl } from "./converter.js";

const $ = (id) => document.getElementById(id);
const input = $("url");
const convertBtn = $("convert");
const resultBox = $("result");
const nameEl = $("name");
const errorEl = $("error");
const openBtn = $("open");
const copyBtn = $("copy");

let currentLink = null;

async function convert() {
  const value = input.value.trim();
  resultBox.hidden = true;
  errorEl.hidden = true;

  if (!isSpotifyUrl(value)) {
    errorEl.textContent = "This is not a valid Spotify link.";
    errorEl.hidden = false;
    return;
  }

  convertBtn.disabled = true;
  convertBtn.textContent = "…";
  try {
    const { title, artist, ytm } = await spotifyToYtm(value);
    currentLink = ytm;
    nameEl.textContent = artist ? `${artist} – ${title}` : title;
    resultBox.hidden = false;
  } catch (err) {
    errorEl.textContent = `Error : ${err.message}`;
    errorEl.hidden = false;
  } finally {
    convertBtn.disabled = false;
    convertBtn.textContent = "Convert";
  }
}

convertBtn.addEventListener("click", convert);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") convert();
});

openBtn.addEventListener("click", () => {
  if (currentLink) chrome.tabs.create({ url: currentLink });
});

copyBtn.addEventListener("click", async () => {
  if (!currentLink) return;
  await navigator.clipboard.writeText(currentLink);
  copyBtn.textContent = "Copied ✓";
  setTimeout(() => (copyBtn.textContent = "Copier le lien"), 1500);
});

// If spotify tab detected, converts
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && isSpotifyUrl(tab.url)) {
      input.value = tab.url;
      convert();
    }
  } catch {
    /* not exploitable tab: field stay empty */
  }
})();
