const COUNTRY_LIST_API = "https://api.first.org/data/v1/countries?limit=300";
const COUNTRY_DETAILS_API = "https://countriesnow.space/api/v0.1/countries/info?returns=flag,unicodeFlag,dialCode,currency,iso2,iso3";
const COUNTRY_CITIES_API = "https://countriesnow.space/api/v0.1/countries";

// Generate this file with generate_holidays.py and upload it to the data folder.
const HOLIDAY_YEAR = 2026;
const HOLIDAY_DATA_URL = `./data/holidays-${HOLIDAY_YEAR}.json`;

const POPULAR_PLACES = {
  JP: [{ name: "Tokyo", query: "Tokyo skyline" }, { name: "Kyoto", query: "Kyoto" }, { name: "Mount Fuji", query: "Mount Fuji" }],
  FR: [{ name: "Paris", query: "Eiffel Tower" }, { name: "Nice", query: "Nice France coast" }, { name: "Lyon", query: "Lyon France" }],
  AU: [{ name: "Sydney", query: "Sydney Opera House" }, { name: "Melbourne", query: "Melbourne Australia skyline" }, { name: "Great Barrier Reef", query: "Great Barrier Reef" }],
  GR: [{ name: "Athens", query: "Acropolis Athens" }, { name: "Santorini", query: "Santorini" }, { name: "Crete", query: "Crete Greece coast" }],
  ZA: [{ name: "Cape Town", query: "Cape Town landscape" }, { name: "Kruger National Park", query: "Kruger National Park" }, { name: "Garden Route", query: "Garden Route South Africa" }],
  PE: [{ name: "Machu Picchu", query: "Machu Picchu" }, { name: "Cusco", query: "Cusco Peru" }, { name: "Lima", query: "Lima Peru skyline" }],
  US: [{ name: "New York City", query: "New York City skyline" }, { name: "Grand Canyon", query: "Grand Canyon" }, { name: "Yosemite", query: "Yosemite National Park" }],
  IN: [{ name: "Agra", query: "Taj Mahal Agra" }, { name: "Jaipur", query: "Jaipur India" }, { name: "Goa", query: "Goa India coast" }],
  IT: [{ name: "Rome", query: "Colosseum Rome" }, { name: "Venice", query: "Venice Italy" }, { name: "Florence", query: "Florence Italy" }],
  GB: [{ name: "London", query: "London skyline" }, { name: "Edinburgh", query: "Edinburgh Scotland" }, { name: "Lake District", query: "Lake District England" }]
};

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
  await loadCountries();
  bindEnhancements();
  populateEnhancedControls();
  initMap();
  registerServiceWorker();
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
    // Load the small essential datasets first so the interface is usable even
    // when the optional 1 MB city dataset is slow or temporarily unavailable.
    const [listResponse, detailResponse] = await Promise.all([
      fetchWithTimeout(COUNTRY_LIST_API, 15000),
      fetchWithTimeout(COUNTRY_DETAILS_API, 15000)
    ]);

    if (!listResponse.ok || !detailResponse.ok) {
      throw new Error("Country service returned an error.");
    }

    const [listPayload, detailPayload] = await Promise.all([
      listResponse.json(),
      detailResponse.json()
    ]);

    let citiesPayload = { data: [] };
    try {
      const citiesResponse = await fetchWithTimeout(COUNTRY_CITIES_API, 8000);
      if (citiesResponse.ok) citiesPayload = await citiesResponse.json();
    } catch (cityError) {
      console.warn("Optional city dataset unavailable:", cityError);
    }

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

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
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
    updateDatasetStatus();
  } catch (error) {
    console.warn("Local holiday data unavailable:", error);
    state.holidays = {};
    state.holidaysLoaded = false;
    updateDatasetStatus();
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
  recordRecentSearch(country);
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
  if (wikipediaImage) state.imageCache[countryName] = wikipediaImage;
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
  const popularPlaces = getPopularPlaces(country);
  const popularPlacesMarkup = popularPlaces.length
    ? popularPlaces.map((place) => `
        <article class="place-card" data-place-query="${escapeAttribute(place.query)}">
          <img class="place-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Crect width='800' height='500' fill='%23dfe8df'/%3E%3C/svg%3E" data-place-query="${escapeAttribute(place.query)}" alt="${escapeHTML(place.name)}" loading="lazy">
          <div class="place-card-body"><h5>${escapeHTML(place.name)}</h5><a class="place-credit" href="#" target="_blank" rel="noopener noreferrer" hidden>Image source</a></div>
        </article>`).join("")
    : `<p class="muted-text">Popular place images are not available for this destination yet.</p>`;

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
      <section class="popular-places-section" aria-labelledby="popular-places-title">
        <div class="places-heading"><div><p class="detail-kicker">See more nearby</p><h4 id="popular-places-title">Popular places</h4></div><span class="places-note">Landmarks and cities to explore</span></div>
        <div class="places-grid">${popularPlacesMarkup}</div>
      </section>
    </div>
  `;

  document
    .querySelector("#favorite-button")
    .addEventListener("click", () => toggleFavorite(country));
  hydratePopularPlaceImages(country);
}

function getPopularPlaces(country) {
  return POPULAR_PLACES[country.cca2] || (country.cities || []).slice(0, 3).map((name) => ({
    name,
    query: `${name} ${country.name.common}`
  }));
}

async function hydratePopularPlaceImages(country) {
  const requestId = state.selectionRequestId;
  const images = [...document.querySelectorAll(".place-image")];
  await Promise.all(images.map(async (image) => {
    let source = await loadDestinationImage(image.dataset.placeQuery);
    if (!source) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      source = await loadWikipediaImage(image.dataset.placeQuery);
    }
    if (requestId !== state.selectionRequestId || state.selectedCountry?.cca2 !== country.cca2) return;
    const credit = image.closest(".place-card")?.querySelector(".place-credit");
    if (source?.url) {
      image.src = source.url;
      if (credit) {
        credit.href = source.sourcePage || source.url;
        credit.textContent = `Image: ${source.sourceName || "Wikimedia"}`;
        credit.hidden = false;
      }
    } else {
      image.classList.add("image-fallback");
      if (credit) credit.hidden = true;
    }
  }));
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
  updateDashboard();
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
  document.querySelectorAll(".popular-card-button").forEach((button) => {
    button.addEventListener("click", () => selectPopularTrip(button.dataset.code));
  });
  document.querySelectorAll(".popular-card img").forEach((image) => {
    image.addEventListener("error", async () => {
      if (image.dataset.retried) return;
      image.dataset.retried = "true";
      const card = image.closest(".popular-card");
      const countryName = card?.querySelector("h3")?.textContent?.trim();
      if (!countryName) return;
      const fallback = await loadDestinationImage(countryName);
      if (fallback?.url) {
        image.src = fallback.url;
        image.dataset.sourcePage = fallback.sourcePage || "";
      } else {
        image.classList.add("image-fallback");
      }
    });
  });
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
  renderRecentSearches();
  document.querySelector("#add-template")?.addEventListener("click", addPackingTemplate);
  document.querySelector("#import-plan")?.addEventListener("click", () => document.querySelector("#import-file")?.click());
  document.querySelector("#import-file")?.addEventListener("change", importTripPlan);
  document.querySelector("#reset-plan")?.addEventListener("click", resetPlanner);
  updateDatasetStatus();
  updateDashboard();
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

async function hydratePopularImages() {
  const images = [...document.querySelectorAll(".popular-card img")];
  await Promise.all(images.map(async (image) => {
    const card = image.closest(".popular-card");
    const countryName = card?.querySelector("h3")?.textContent?.trim();
    if (!countryName) return;
    const source = await loadDestinationImage(countryName);
    if (source?.url) {
      image.src = source.url;
      image.dataset.sourcePage = source.sourcePage || "";
    }
  }));
}

function selectPopularTrip(code) {
  const country = state.countries.find((candidate) => candidate.cca2 === code);
  if (!country) {
    showToast("Destinations are still loading.");
    return;
  }
  elements.search.value = country.name.common;
  handleSearch({ target: elements.search });
  selectCountry(country);
  document.querySelector("#explore")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  updateDashboard();
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
  updateDashboard();
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
    loadWeather(position[0], position[1], country.name.common);
  } catch (error) {
    console.warn("Map location unavailable:", error);
    renderWeatherMessage("Weather location is unavailable right now.");
  }
}

async function loadWeather(latitude, longitude, countryName) {
  const weatherCard = document.querySelector("#weather-card");
  if (!weatherCard) return;
  weatherCard.classList.add("is-loading");
  weatherCard.querySelector("p").textContent = "Loading a current weather snapshot...";

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code,wind_speed_10m",
    timezone: "auto"
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error(`Weather returned HTTP ${response.status}.`);
    const payload = await response.json();
    const current = payload.current;
    const units = payload.current_units || {};
    const description = weatherDescription(current.weather_code);
    weatherCard.classList.remove("is-loading");
    weatherCard.innerHTML = `
      <span class="weather-icon" aria-hidden="true">${weatherIcon(current.weather_code)}</span>
      <div><strong>${escapeHTML(countryName)} weather</strong><p>${escapeHTML(description)} · ${current.temperature_2m}${escapeHTML(units.temperature_2m || "°C")} · Wind ${current.wind_speed_10m}${escapeHTML(units.wind_speed_10m || "km/h")}</p></div>
    `;
  } catch (error) {
    console.warn("Weather unavailable:", error);
    renderWeatherMessage("Weather data is unavailable right now.");
  }
}

function renderWeatherMessage(message) {
  const weatherCard = document.querySelector("#weather-card");
  if (!weatherCard) return;
  weatherCard.classList.remove("is-loading");
  weatherCard.innerHTML = `<span class="weather-icon" aria-hidden="true">☼</span><div><strong>Destination weather</strong><p>${escapeHTML(message)}</p></div>`;
}

function weatherDescription(code) {
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Mixed conditions";
}

function weatherIcon(code) {
  if (code === 0) return "☀";
  if ([71, 73, 75, 77].includes(code)) return "❄";
  if ([95, 96, 99].includes(code)) return "ϟ";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "☂";
  return "☼";
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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("Offline support could not be enabled:", error);
  });
}


function recordRecentSearch(country) {
  const recent = readStorage("wanderlist-recent-searches", []);
  const next = [
    { code: country.cca2, name: country.name.common },
    ...recent.filter((item) => item.code !== country.cca2)
  ].slice(0, 5);
  writeStorage("wanderlist-recent-searches", next);
  renderRecentSearches();
}

function renderRecentSearches() {
  const container = document.querySelector("#recent-searches");
  if (!container) return;
  const recent = readStorage("wanderlist-recent-searches", []);
  container.replaceChildren();
  if (!recent.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const label = document.createElement("span");
  label.className = "recent-searches-label";
  label.textContent = "Recent:";
  container.appendChild(label);
  recent.forEach((item) => {
    const button = document.createElement("button");
    button.className = "recent-search-button";
    button.type = "button";
    button.textContent = item.name;
    button.addEventListener("click", () => {
      const country = state.countries.find((candidate) => candidate.cca2 === item.code);
      if (!country) return;
      elements.search.value = country.name.common;
      handleSearch({ target: elements.search });
      selectCountry(country);
    });
    container.appendChild(button);
  });
}

function updateDatasetStatus() {
  const status = document.querySelector("#dataset-status");
  if (!status) return;
  status.classList.toggle("is-warning", !state.holidaysLoaded);
  status.textContent = state.holidaysLoaded
    ? `Holiday data: ${HOLIDAY_YEAR} local dataset ready`
    : `Holiday data: ${HOLIDAY_YEAR} file unavailable`;
}

function updateDashboard() {
  const destination = document.querySelector("#dashboard-destination");
  const dates = document.querySelector("#dashboard-dates");
  const budget = document.querySelector("#dashboard-budget");
  const progress = document.querySelector("#dashboard-progress");
  if (!destination || !dates || !budget || !progress) return;

  const start = document.querySelector("#start-date")?.value || "";
  const end = document.querySelector("#end-date")?.value || "";
  const total = [...document.querySelectorAll(".budget-input")]
    .reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
  const completed = state.checklist.filter((item) => item.done).length;
  const checklistProgress = state.checklist.length
    ? Math.round((completed / state.checklist.length) * 100)
    : 0;

  destination.textContent = state.selectedCountry?.name?.common || "Not selected";
  dates.textContent = start && end ? `${formatDate(start)} – ${formatDate(end)}` : "Choose dates";
  budget.textContent = formatCurrency(total);
  progress.textContent = `${checklistProgress}%`;
}

const PACKING_TEMPLATES = {
  beach: ["Swimwear", "Sunscreen", "Sunglasses", "Sandals", "Reusable water bottle"],
  winter: ["Warm coat", "Thermal layers", "Gloves and hat", "Waterproof shoes", "Lip balm"],
  hiking: ["Hiking shoes", "Daypack", "First-aid kit", "Headlamp", "Rain jacket"],
  business: ["Business outfits", "Laptop and charger", "Travel documents", "Notebook", "Smart shoes"],
  family: ["Snacks", "Travel games", "Medicine", "Spare clothes", "Child travel documents"]
};

function addPackingTemplate() {
  const key = document.querySelector("#packing-template")?.value;
  const items = PACKING_TEMPLATES[key];
  if (!items) {
    showToast("Choose a packing-list template first.");
    return;
  }
  const existing = new Set(state.checklist.map((item) => item.text.toLowerCase()));
  items.forEach((text) => {
    if (!existing.has(text.toLowerCase())) state.checklist.push({ id: createId(), text, done: false });
  });
  writeStorage(STORAGE_KEYS.checklist, state.checklist);
  renderChecklist();
  document.querySelector("#packing-template").value = "";
  showToast("Packing list added");
}

function resetPlanner() {
  if (!window.confirm("Reset your saved Wanderlist plan, including favorites, dates, budget, checklist, and notes?")) return;

  state.favorites = [];
  state.checklist = [
    { id: createId(), text: "Check passport validity", done: false },
    { id: createId(), text: "Research local customs", done: false },
    { id: createId(), text: "Make a packing list", done: false }
  ];
  elements.notes.value = "";
  ["#start-date", "#end-date", "#flight-cost", "#hotel-cost", "#food-cost", "#activity-cost"].forEach((selector) => {
    const input = document.querySelector(selector);
    if (input) input.value = "";
  });
  [STORAGE_KEYS.favorites, STORAGE_KEYS.checklist, STORAGE_KEYS.notes, "wanderlist-budget", "wanderlist-recent-searches"].forEach((key) => localStorage.removeItem(key));
  renderFavorites();
  renderChecklist();
  updateCharacterCount();
  updateBudget();
  updateHolidayOverlap();
  renderRecentSearches();
  showToast("Planner reset");
}

function importTripPlan(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const plan = JSON.parse(reader.result);
      if (!plan || typeof plan !== "object") throw new Error("Invalid plan");

      if (Array.isArray(plan.checklist)) {
        state.checklist = plan.checklist
          .filter((item) => item && typeof item.text === "string")
          .map((item) => ({ id: item.id || createId(), text: item.text.slice(0, 100), done: Boolean(item.done) }));
        writeStorage(STORAGE_KEYS.checklist, state.checklist);
        renderChecklist();
      }
      if (typeof plan.notes === "string") {
        elements.notes.value = plan.notes.slice(0, 2000);
        writeStorage(STORAGE_KEYS.notes, elements.notes.value);
        updateCharacterCount();
      }
      if (plan.budget && typeof plan.budget === "object") {
        Object.entries(plan.budget).forEach(([id, value]) => {
          const input = document.querySelector(`#${id}`);
          if (input) input.value = Math.max(0, Number(value) || 0);
        });
        updateBudget();
      }
      if (plan.departure) document.querySelector("#start-date").value = plan.departure;
      if (plan.returnDate) document.querySelector("#end-date").value = plan.returnDate;
      updateHolidayOverlap();

      if (plan.countryCode) {
        const country = state.countries.find((candidate) => candidate.cca2 === plan.countryCode);
        if (country) selectCountry(country);
      }
      showToast("Trip plan imported");
    } catch (error) {
      console.warn("Could not import trip plan:", error);
      showToast("That file is not a valid Wanderlist plan.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}
