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
  } catch (error) {
    console.error(error);
    setSearchStatus(
      "Could not load countries. Check your connection and refresh the page.",
      true
    );
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

      return searchable.includes(query);
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
  state.selectedCountry = country;
  renderCountryLoading(country);
  elements.countryDetail.scrollIntoView({ behavior: "smooth", block: "center" });

  if (state.holidayDataPromise) {
    await state.holidayDataPromise;
  }

  renderCountryDetail(country, loadHolidays(country.cca2));
}

function loadHolidays(countryCode) {
  return state.holidays[countryCode.toUpperCase()] || [];
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

  elements.countryDetail.className = "country-detail";
  elements.countryDetail.innerHTML = `
    <div class="detail-grid">
      <img class="detail-flag" src="${country.flags?.svg || country.flags?.png || ""}" alt="${escapeHTML(country.name.common)} flag">
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
    renderCountryDetail(country, loadHolidays(country.cca2));
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
