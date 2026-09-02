const COUNTRY_LIST_API = "https://api.first.org/data/v1/countries?limit=300";
const COUNTRY_DETAILS_API = "https://countriesnow.space/api/v0.1/countries/info?returns=flag,unicodeFlag,dialCode,currency,iso2,iso3";
const COUNTRY_CITIES_API = "https://countriesnow.space/api/v0.1/countries";

// Generate this file with generate_holidays.py and upload it to the data folder.
const HOLIDAY_YEAR = 2026;
const HOLIDAY_DATA_URL = `./data/holidays-${HOLIDAY_YEAR}.json`;

const STORAGE_KEYS = {
  favorites: "wanderlist-favorites",
  checklist: "wanderlist-checklist",
  notes: "wanderlist-notes"
};

const state = {
  countries: [],
  holidays: {},
  holidaysLoaded: false,
  selectedCountry: null,
  imageCache: {},
  selectionRequestId: 0,
  holidayDataPromise: null,
  favorites: readStorage(STORAGE_KEYS.favorites, []),
  checklist: readStorage(STORAGE_KEYS.checklist, [
    { id: createId(), text: "Check passport validity", done: false },
    { id: createId(), text: "Research local customs", done: false },
    { id: createId(), text: "Make a packing list", done: false }
  ])
};

const elements = {
  search: document.querySelector("#country-search"),
  clearSearch: document.querySelector("#clear-search"),
  searchStatus: document.querySelector("#search-status"),
  countryResults: document.querySelector("#country-results"),
  countryDetail: document.querySelector("#country-detail"),
  favoritesList: document.querySelector("#favorites-list"),
  favoriteCount: document.querySelector("#favorite-count"),
  checklistForm: document.querySelector("#checklist-form"),
  checklistInput: document.querySelector("#checklist-input"),
  checklist: document.querySelector("#checklist"),
  clearChecklist: document.querySelector("#clear-checklist"),
  notes: document.querySelector("#notes"),
  characterCount: document.querySelector("#character-count"),
  saveIndicator: document.querySelector("#save-indicator"),
  countryTemplate: document.querySelector("#country-result-template")
};

init();

async function init() {
  elements.notes.value = readStorage(STORAGE_KEYS.notes, "");
  updateCharacterCount();
  renderFavorites();
  renderChecklist();
  bindEvents();

  state.holidayDataPromise = loadHolidayData();
  await Promise.all([loadCountries(), state.holidayDataPromise]);
  bindEnhancements();
  populateEnhancedControls();
  initMap();
}

function bindEvents() {
  elements.search.addEventListener("input", handleSearch);
  elements.clearSearch.addEventListener("click", clearSearch);
  elements.checklistForm.addEventListener("submit", addChecklistItem);
  elements.checklist.addEventListener("change", handleChecklistChange);
  elements.checklist.addEventListener("click", handleChecklistClick);
  elements.clearChecklist.addEventListener("click", clearCompletedTasks);
  elements.notes.addEventListener("input", saveNotes);
  elements.favoritesList.addEventListener("click", handleFavoriteClick);
}

async function loadCountries() {
  setSearchStatus("Loading countries...");

  try {
    const [listResponse, detailResponse, citiesResponse] = await Promise.all([
      fetch(COUNTRY_LIST_API),
      fetch(COUNTRY_DETAILS_API),
      fetch(COUNTRY_CITIES_API)
    ]);

    if (!listResponse.ok || !detailResponse.ok || !citiesResponse.ok) {
      throw new Error("Country service returned an error.");
    }

    const [listPayload, detailPayload, citiesPayload] = await Promise.all([
      listResponse.json(),
      detailResponse.json(),
      citiesResponse.json()
    ]);

    const detailsByCode = new Map(
      (detailPayload.data || []).map((country) => [country.iso2, country])
    );
    const citiesByCode = new Map(
      (citiesPayload.data || []).map((country) => [country.iso2, country])
    );

    state.countries = Object.entries(listPayload.data || {})
      .map(([code, country]) => {
        const details = detailsByCode.get(code) || {};
        const cityData = citiesByCode.get(code) || {};

        return {
          name: {
            common: country.country,
            official: country.country
          },
          cca2: code,
          region: country.region || "Destination",
          flags: {
            svg: details.flag || "",
            png: details.flag || ""
          },
          currency: details.currency || "Not available",
          dialCode: details.dialCode || "Not available",
          cities: Array.isArray(cityData.cities) ? cityData.cities : []
        };
      })
      .filter((country) => country.name.common && country.cca2)
      .sort((a, b) => a.name.common.localeCompare(b.name.common));

    setSearchStatus(
      `${state.countries.length} destinations ready. Start typing to search.`
    );
    const retryButton = document.querySelector("#retry-countries");
    if (retryButton) retryButton.hidden = true;
  } catch (error) {
    console.error(error);
    setSearchStatus(
      "Could not load countries. Check your connection and refresh the page.",
      true
    );
    const retryButton = document.querySelector("#retry-countries");
    if (retryButton) retryButton.hidden = false;
  }
}

async function loadHolidayData() {
  try {
    const response = await fetch(HOLIDAY_DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Holiday file returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const rawData = payload.data || payload;

    state.holidays = Object.fromEntries(
      Object.entries(rawData).map(([countryCode, holidays]) => [
        countryCode.toUpperCase(),
        Array.isArray(holidays) ? holidays : []
      ])
    );
    state.holidaysLoaded = true;
  } catch (error) {
    console.warn("Local holiday data unavailable:", error);
    state.holidays = {};
    state.holidaysLoaded = false;
  }
}

function handleSearch(event) {
  const query = event.target.value.trim().toLowerCase();
  elements.clearSearch.hidden = query.length === 0;

  if (!query) {
    elements.countryResults.replaceChildren();
    setSearchStatus(
      `${state.countries.length || "Many"} destinations ready. Start typing to search.`
    );
    return;
  }

  const matches = state.countries
    .filter((country) => {
      const searchable = [
        country.name.common,
        country.name.official,
        country.region,
        ...(country.cities || []).slice(0, 20)
      ]
        .join(" ")
        .toLowerCase();

      const selectedRegion = document.querySelector("#region-filter")?.value || "";
      const matchesQuery = !query || searchable.includes(query);
      const matchesRegion = !selectedRegion || country.region === selectedRegion;
      return matchesQuery && matchesRegion;
    })
    .slice(0, 12);

  renderSearchResults(matches);
  setSearchStatus(
    matches.length
      ? `${matches.length} matching destination${matches.length === 1 ? "" : "s"}.`
      : "No matching countries found."
  );
}

function renderSearchResults(countries) {
  elements.countryResults.replaceChildren();

  countries.forEach((country) => {
    const fragment = elements.countryTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".country-result");
    const flag = fragment.querySelector(".result-flag");
    const name = fragment.querySelector(".result-name");
    const region = fragment.querySelector(".result-region");

    button.dataset.countryCode = country.cca2;
    button.addEventListener("click", () => selectCountry(country));
    flag.src = country.flags?.svg || country.flags?.png || "";
    flag.alt = `${country.name.common} flag`;
    name.textContent = country.name.common;
    region.textContent = country.region || "Destination";
    elements.countryResults.appendChild(fragment);
  });
}

async function selectCountry(country) {
  const requestId = ++state.selectionRequestId;
  state.selectedCountry = country;
  renderCountryLoading(country);
  elements.countryDetail.scrollIntoView({ behavior: "smooth", block: "center" });

  if (state.holidayDataPromise) {
    await state.holidayDataPromise;
  }

  const image = await loadDestinationImage(country.name.common);
  if (requestId !== state.selectionRequestId) return;

  const countryWithImage = { ...country, image };
  state.selectedCountry = countryWithImage;
  renderCountryDetail(countryWithImage, loadHolidays(country.cca2));
  updateHolidayOverlap();
  updateMap(countryWithImage);
  renderComparison();
}

function loadHolidays(countryCode) {
  return state.holidays[countryCode.toUpperCase()] || [];
}

async function loadDestinationImage(countryName) {
  if (Object.prototype.hasOwnProperty.call(state.imageCache, countryName)) {
    return state.imageCache[countryName];
  }

  // Commons is searched first because a country’s Wikipedia thumbnail can be
  // a flag, map, or coat of arms instead of a destination photograph.
  const commonsImage = await loadCommonsImage(countryName);
  if (commonsImage) {
    state.imageCache[countryName] = commonsImage;
    return commonsImage;
  }

  // Wikipedia remains a useful fallback when Commons has no suitable result.
  const wikipediaImage = await loadWikipediaImage(countryName);
  state.imageCache[countryName] = wikipediaImage;
  return wikipediaImage;
}

async function loadCommonsImage(countryName) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${countryName} landscape`,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1200",
    format: "json",
    origin: "*"
  });
  const endpoint = `https://commons.wikimedia.org/w/api.php?${params}`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Commons returned HTTP ${response.status}.`);

    const payload = await response.json();
    const pages = Object.values(payload.query?.pages || {});
    const candidate = pages
      .map((page) => {
        const info = page.imageinfo?.[0];
        return {
          page,
          info,
          title: page.title?.replace(/^File:/i, "") || countryName
        };
      })
      .filter(({ page, info }) => {
        const title = page.title?.toLowerCase() || "";
        const mime = info?.mime || "";
        const excluded = /flag|map|coat of arms|logo|icon|symbol|diagram|seal/.test(title);
        return !excluded && mime.startsWith("image/") && (info.thumburl || info.url);
      })[0];

    if (!candidate) return null;

    const pageTitle = candidate.page.title.replace(/ /g, "_");
    const sourcePage = `https://commons.wikimedia.org/wiki/${encodeURIComponent(pageTitle)}`;
    return {
      url: candidate.info.thumburl || candidate.info.url,
      sourcePage,
      sourceTitle: candidate.title,
      sourceName: "Wikimedia Commons"
    };
  } catch (error) {
    console.warn(`Commons image unavailable for ${countryName}:`, error);
    return null;
  }
}

async function loadWikipediaImage(countryName) {
  const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(countryName)}`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}.`);

    const page = await response.json();
    const source = page.thumbnail?.source || "";
    const sourcePage = page.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(countryName)}`;
    return source && source.startsWith("https://")
      ? {
          url: source,
          sourcePage,
          sourceTitle: page.title || countryName,
          sourceName: "Wikipedia"
        }
      : null;
  } catch (error) {
    console.warn(`Wikipedia image unavailable for ${countryName}:`, error);
    return null;
  }
}

function renderCountryLoading(country) {
  elements.countryDetail.className = "country-detail";
  elements.countryDetail.innerHTML = `<div class="loading-detail">Loading details for ${escapeHTML(country.name.common)}...</div>`;
}

function renderCountryDetail(country, holidays) {
  const cityPreview = country.cities?.slice(0, 3).join(", ") || "No city list available";
  const cityCount = country.cities?.length
    ? `${formatNumber(country.cities.length)} listed`
    : "Not available";
  const saved = isFavorite(country.cca2);
  const holidayMarkup = holidays.length
    ? holidays
        .slice(0, 8)
        .map((holiday) => {
          const date = holiday.date || holiday.startDate;
          const name = getHolidayName(holiday);
          return `<span class="holiday-pill"><strong>${formatDate(date)}</strong> ${escapeHTML(name)}</span>`;
        })
        .join("")
    : `<span class="muted-text">No local holiday entries were found for this destination in the ${HOLIDAY_YEAR} dataset.</span>`;

  const imageMarkup = country.image?.url
    ? `
      <figure class="destination-figure">
        <img class="destination-image" src="${escapeAttribute(country.image.url)}" alt="Travel view of ${escapeHTML(country.name.common)}">
        <figcaption class="image-credit">
          Image: <a href="${escapeAttribute(country.image.sourcePage)}" target="_blank" rel="noopener noreferrer">${escapeHTML(country.image.sourceTitle || country.name.common)}</a>
          · Source: <a href="${escapeAttribute(country.image.sourcePage)}" target="_blank" rel="noopener noreferrer">${escapeHTML(country.image.sourceName || "Wikipedia")}</a>
        </figcaption>
      </figure>
    `
    : `
      <div class="destination-image destination-image-fallback" role="img" aria-label="No destination image available">
        <span>No destination image available</span>
      </div>
    `;

  elements.countryDetail.className = "country-detail";
  elements.countryDetail.innerHTML = `
    <div class="detail-grid">
      ${imageMarkup}
      <img class="detail-flag" src="${escapeAttribute(country.flags?.svg || country.flags?.png || "")}" alt="${escapeHTML(country.name.common)} flag">
      <div class="detail-copy">
        <p class="detail-kicker">${escapeHTML(country.region || "Destination")}</p>
        <h3 class="detail-name">${escapeHTML(country.name.common)}</h3>
        <p class="detail-subtitle">${escapeHTML(country.name.official || country.name.common)}</p>
        <div class="detail-stats">
          <div class="detail-stat"><span>Currency</span><span>${escapeHTML(country.currency || "Not available")}</span></div>
          <div class="detail-stat"><span>Dial code</span><span>${escapeHTML(country.dialCode || "Not available")}</span></div>
          <div class="detail-stat"><span>Example cities</span><span>${escapeHTML(cityPreview)}</span></div>
          <div class="detail-stat"><span>City coverage</span><span>${escapeHTML(cityCount)}</span></div>
          <div class="detail-stat"><span>Country code</span><span>${escapeHTML(country.cca2)}</span></div>
          <div class="detail-stat"><span>Data source</span><span>Local ${HOLIDAY_YEAR} dataset</span></div>
        </div>
      </div>
      <button class="favorite-button ${saved ? "is-saved" : ""}" id="favorite-button" type="button" aria-pressed="${saved}">
        <span aria-hidden="true">${saved ? "♥" : "♡"}</span> ${saved ? "Saved" : "Save destination"}
      </button>
      <div class="holiday-section">
        <h4>Public holidays · ${HOLIDAY_YEAR}</h4>
        <div class="holiday-list">${holidayMarkup}</div>
      </div>
    </div>
  `;

  document
    .querySelector("#favorite-button")
    .addEventListener("click", () => toggleFavorite(country));
}

function getHolidayName(holiday) {
  if (typeof holiday.name === "string") return holiday.name;
  if (Array.isArray(holiday.name)) {
    return holiday.name[0]?.text || holiday.name[0] || "Public holiday";
  }
  if (holiday.localName) return holiday.localName;
  return "Public holiday";
}

function toggleFavorite(country) {
  if (isFavorite(country.cca2)) {
    state.favorites = state.favorites.filter((item) => item.cca2 !== country.cca2);
  } else {
    state.favorites = [country, ...state.favorites];
  }

  writeStorage(STORAGE_KEYS.favorites, state.favorites);
  renderFavorites();

  if (state.selectedCountry?.cca2 === country.cca2) {
    const selected = { ...country, image: state.selectedCountry.image };
    state.selectedCountry = selected;
    renderCountryDetail(selected, loadHolidays(selected.cca2));
    updateHolidayOverlap();
  }
}

function renderFavorites() {
  elements.favoriteCount.textContent = state.favorites.length;
  elements.favoritesList.replaceChildren();

  if (!state.favorites.length) {
    elements.favoritesList.innerHTML = `<p class="muted-text">Save a country to see it here.</p>`;
    return;
  }

  state.favorites.forEach((country) => {
    const button = document.createElement("button");
    button.className = "favorite-item";
    button.type = "button";
    button.dataset.countryCode = country.cca2;
    button.innerHTML = `
      <img src="${country.flags?.svg || country.flags?.png || ""}" alt="">
      <span>${escapeHTML(country.name.common)}</span>
      <span class="remove-favorite" aria-label="Remove ${escapeHTML(country.name.common)}">×</span>
    `;
    elements.favoritesList.appendChild(button);
  });
}

function handleFavoriteClick(event) {
  const button = event.target.closest(".favorite-item");
  if (!button) return;

  const country = state.favorites.find(
    (item) => item.cca2 === button.dataset.countryCode
  );
  if (!country) return;

  if (event.target.closest(".remove-favorite")) {
    toggleFavorite(country);
    return;
  }

  selectCountry(country);
}

function isFavorite(countryCode) {
  return state.favorites.some((country) => country.cca2 === countryCode);
}

function addChecklistItem(event) {
  event.preventDefault();
  const text = elements.checklistInput.value.trim();
  if (!text) return;

  state.checklist.push({ id: createId(), text, done: false });
  writeStorage(STORAGE_KEYS.checklist, state.checklist);
  elements.checklistInput.value = "";
  renderChecklist();
}

function renderChecklist() {
  elements.checklist.replaceChildren();

  state.checklist.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.className = item.done ? "done" : "";
    listItem.dataset.id = item.id;
    listItem.innerHTML = `
      <input type="checkbox" id="task-${item.id}" ${item.done ? "checked" : ""}>
      <label for="task-${item.id}">${escapeHTML(item.text)}</label>
      <button class="delete-task" type="button" aria-label="Delete ${escapeHTML(item.text)}">×</button>
    `;
    elements.checklist.appendChild(listItem);
  });
  updateChecklistProgress();
}

function updateChecklistProgress() {
  const total = state.checklist.length;
  const completed = state.checklist.filter((item) => item.done).length;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  const text = document.querySelector("#progress-text");
  const bar = document.querySelector("#progress-bar");
  if (text) text.textContent = `${percentage}%`;
  if (bar) bar.style.width = `${percentage}%`;
}

function handleChecklistChange(event) {
  if (event.target.type !== "checkbox") return;

  const item = state.checklist.find(
    (task) => task.id === event.target.closest("li").dataset.id
  );
  if (!item) return;

  item.done = event.target.checked;
  writeStorage(STORAGE_KEYS.checklist, state.checklist);
  renderChecklist();
}

function handleChecklistClick(event) {
  const deleteButton = event.target.closest(".delete-task");
  if (!deleteButton) return;

  const item = event.target.closest("li");
  state.checklist = state.checklist.filter(
    (task) => task.id !== item.dataset.id
  );
  writeStorage(STORAGE_KEYS.checklist, state.checklist);
  renderChecklist();
}

function clearCompletedTasks() {
  state.checklist = state.checklist.filter((task) => !task.done);
  writeStorage(STORAGE_KEYS.checklist, state.checklist);
  renderChecklist();
}

function saveNotes() {
  writeStorage(STORAGE_KEYS.notes, elements.notes.value);
  updateCharacterCount();
  elements.saveIndicator.textContent = "Saved just now";
  window.clearTimeout(saveNotes.timer);
  saveNotes.timer = window.setTimeout(() => {
    elements.saveIndicator.textContent = "Saved locally";
  }, 1200);
}

function updateCharacterCount() {
  elements.characterCount.textContent = elements.notes.value.length;
}

function clearSearch() {
  elements.search.value = "";
  elements.search.focus();
  handleSearch({ target: elements.search });
}

function setSearchStatus(message, isError = false) {
  elements.searchStatus.textContent = message;
  elements.searchStatus.classList.toggle("error-message", isError);
}

function formatNumber(value) {
  return typeof value === "number"
    ? new Intl.NumberFormat().format(value)
    : "Not available";
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric"
      }).format(date);
}

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `task-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;"
  }[character]));
}

function escapeAttribute(value = "") {
  return escapeHTML(value);
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key} from local storage.`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key} to local storage.`, error);
  }
}


/* Interactive upgrade layer */
let mapInstance = null;
let mapMarker = null;
let toastTimer = null;

function bindEnhancements() {
  const themeToggle = document.querySelector("#theme-toggle");
  const regionFilter = document.querySelector("#region-filter");
  const randomButtons = [document.querySelector("#random-country"), document.querySelector("#hero-random")].filter(Boolean);
  const retry = document.querySelector("#retry-countries");
  const dateInputs = [document.querySelector("#start-date"), document.querySelector("#end-date")].filter(Boolean);
  const budgetInputs = [...document.querySelectorAll(".budget-input")];

  applySavedTheme();
  themeToggle?.addEventListener("click", toggleTheme);
  regionFilter?.addEventListener("change", handleSearch);
  randomButtons.forEach((button) => button.addEventListener("click", chooseRandomCountry));
  retry?.addEventListener("click", async () => {
    retry.hidden = true;
    await loadCountries();
    populateEnhancedControls();
  });
  dateInputs.forEach((input) => input.addEventListener("change", updateHolidayOverlap));
  budgetInputs.forEach((input) => input.addEventListener("input", updateBudget));
  document.querySelector("#compare-one")?.addEventListener("change", renderComparison);
  document.querySelector("#compare-two")?.addEventListener("change", renderComparison);
  document.querySelector("#export-plan")?.addEventListener("click", downloadTripPlan);
  document.querySelector("#copy-plan")?.addEventListener("click", copyTripSummary);

  loadSavedBudget();
  updateBudget();
}

function populateEnhancedControls() {
  const regions = [...new Set(state.countries.map((country) => country.region).filter(Boolean))].sort();
  const regionSelect = document.querySelector("#region-filter");
  if (regionSelect) {
    regionSelect.replaceChildren(new Option("All regions", ""));
    regions.forEach((region) => regionSelect.add(new Option(region, region)));
  }

  ["#compare-one", "#compare-two"].forEach((selector) => {
    const select = document.querySelector(selector);
    if (!select) return;
    const current = select.value;
    select.replaceChildren(new Option("Choose a country", ""));
    state.countries.forEach((country) => select.add(new Option(country.name.common, country.cca2)));
    select.value = current;
  });
}

function applySavedTheme() {
  const theme = readStorage("wanderlist-theme", "light");
  document.body.classList.toggle("dark-theme", theme === "dark");
  updateThemeButton();
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark-theme");
  writeStorage("wanderlist-theme", isDark ? "dark" : "light");
  updateThemeButton();
  showToast(isDark ? "Dark mode enabled" : "Light mode enabled");
}

function updateThemeButton() {
  const button = document.querySelector("#theme-toggle");
  if (!button) return;
  const isDark = document.body.classList.contains("dark-theme");
  button.innerHTML = `${isDark ? "☀" : "◐"} <span>${isDark ? "Light" : "Theme"}</span>`;
  button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
}

function chooseRandomCountry() {
  if (!state.countries.length) {
    showToast("Countries are still loading.");
    return;
  }
  const country = state.countries[Math.floor(Math.random() * state.countries.length)];
  elements.search.value = country.name.common;
  handleSearch({ target: elements.search });
  selectCountry(country);
}

function updateBudget() {
  const inputs = [...document.querySelectorAll(".budget-input")];
  const total = inputs.reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
  const totalElement = document.querySelector("#budget-total");
  if (totalElement) totalElement.textContent = formatCurrency(total);
  writeStorage("wanderlist-budget", Object.fromEntries(inputs.map((input) => [input.id, input.value])));
}

function loadSavedBudget() {
  const budget = readStorage("wanderlist-budget", {});
  Object.entries(budget).forEach(([id, value]) => {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = value;
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function updateHolidayOverlap() {
  const notice = document.querySelector("#holiday-overlap");
  const dateStatus = document.querySelector("#date-status");
  if (!notice || !dateStatus) return;

  const start = document.querySelector("#start-date")?.value || "";
  const end = document.querySelector("#end-date")?.value || "";
  if (!start || !end) {
    dateStatus.textContent = "No dates selected";
    notice.className = "notice";
    notice.textContent = "Select a destination and travel dates to check holidays.";
    return;
  }
  if (end < start) {
    dateStatus.textContent = "Check your dates";
    notice.className = "notice is-warning";
    notice.textContent = "Your return date must be after your departure date.";
    return;
  }

  const country = state.selectedCountry;
  if (!country) {
    dateStatus.textContent = "Choose a destination";
    notice.className = "notice";
    notice.textContent = "Select a destination to check its public holidays.";
    return;
  }

  const overlaps = loadHolidays(country.cca2).filter((holiday) => {
    const date = holiday.date || holiday.startDate;
    return date && date >= start && date <= end;
  });
  dateStatus.textContent = `${daysBetween(start, end)} days`;
  notice.className = overlaps.length ? "notice is-warning" : "notice";
  notice.textContent = overlaps.length
    ? `Your trip overlaps with ${overlaps.length} public holiday${overlaps.length === 1 ? "" : "s"}: ${overlaps.slice(0, 3).map(getHolidayName).join(", ")}.`
    : "No local public holidays overlap with these dates.";
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1);
}

function renderComparison() {
  const grid = document.querySelector("#comparison-grid");
  const one = state.countries.find((country) => country.cca2 === document.querySelector("#compare-one")?.value);
  const two = state.countries.find((country) => country.cca2 === document.querySelector("#compare-two")?.value);
  if (!grid) return;
  const selected = [one, two].filter(Boolean);
  if (selected.length < 2) {
    grid.innerHTML = `<p class="muted-text">Choose two destinations to compare them.</p>`;
    return;
  }
  grid.innerHTML = selected.map((country) => `
    <article class="comparison-card">
      <img class="result-flag" src="${escapeAttribute(country.flags?.svg || country.flags?.png || "")}" alt="${escapeHTML(country.name.common)} flag">
      <h3>${escapeHTML(country.name.common)}</h3>
      <div class="comparison-stat"><span>Region</span><strong>${escapeHTML(country.region || "Not available")}</strong></div>
      <div class="comparison-stat"><span>Currency</span><strong>${escapeHTML(country.currency || "Not available")}</strong></div>
      <div class="comparison-stat"><span>Dial code</span><strong>${escapeHTML(country.dialCode || "Not available")}</strong></div>
      <div class="comparison-stat"><span>Listed cities</span><strong>${formatNumber(country.cities?.length || 0)}</strong></div>
      <div class="comparison-stat"><span>2026 holidays</span><strong>${formatNumber(loadHolidays(country.cca2).length)}</strong></div>
    </article>
  `).join("");
}

function initMap() {
  const container = document.querySelector("#map");
  if (!container || typeof L === "undefined") return;
  mapInstance = L.map(container, { scrollWheelZoom: false }).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(mapInstance);
}

async function updateMap(country) {
  if (!mapInstance || !country) return;
  const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&country=${encodeURIComponent(country.name.common)}`;
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Geocoder returned HTTP ${response.status}.`);
    const results = await response.json();
    const result = results[0];
    if (!result) return;
    const position = [Number(result.lat), Number(result.lon)];
    mapInstance.setView(position, 5, { animate: true });
    if (mapMarker) mapMarker.remove();
    mapMarker = L.marker(position).addTo(mapInstance).bindPopup(`<strong>${escapeHTML(country.name.common)}</strong>`).openPopup();
  } catch (error) {
    console.warn("Map location unavailable:", error);
  }
}

function makeTripPlan() {
  const country = state.selectedCountry;
  const budget = Object.fromEntries([...document.querySelectorAll(".budget-input")].map((input) => [input.id, Number(input.value) || 0]));
  return {
    destination: country?.name?.common || null,
    countryCode: country?.cca2 || null,
    departure: document.querySelector("#start-date")?.value || null,
    returnDate: document.querySelector("#end-date")?.value || null,
    budget,
    budgetTotal: Object.values(budget).reduce((sum, value) => sum + value, 0),
    checklist: state.checklist,
    notes: elements.notes.value,
    exportedAt: new Date().toISOString()
  };
}

function downloadTripPlan() {
  const blob = new Blob([JSON.stringify(makeTripPlan(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "wanderlist-trip-plan.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Trip plan downloaded");
}

async function copyTripSummary() {
  const plan = makeTripPlan();
  const summary = [
    `Wanderlist trip plan`,
    `Destination: ${plan.destination || "Not selected"}`,
    `Dates: ${plan.departure || "—"} to ${plan.returnDate || "—"}`,
    `Budget: ${formatCurrency(plan.budgetTotal)}`,
    `Checklist: ${plan.checklist.filter((item) => item.done).length}/${plan.checklist.length} complete`,
    `Notes: ${plan.notes || "None"}`
  ].join("\n");
  try {
    await navigator.clipboard.writeText(summary);
    showToast("Trip summary copied");
  } catch (error) {
    showToast("Copy is unavailable in this browser; use Download plan instead.");
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}
