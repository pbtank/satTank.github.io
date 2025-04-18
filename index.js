// List of local JSON files for satellite categories
const localJsonFiles = [
    'data/active.json',
    'data/stations.json',
    'data/weather.json',
    'data/noaa.json',
    'data/goes.json',
    'data/resource.json',
    'data/amateur.json',
    'data/starlink.json',
    'data/custom_satellites.json'
];

// Helper to load all local JSON files and merge them
async function loadAllLocalSatellites() {
    let allSats = [];
    for (const file of localJsonFiles) {
        try {
            const res = await fetch(file);
            if (res.ok) {
                const data = await res.json();
                // custom_satellites.json may have a 'satellites' array
                if (Array.isArray(data)) {
                    allSats = allSats.concat(data);
                } else if (Array.isArray(data.satellites)) {
                    allSats = allSats.concat(data.satellites);
                } else if (data && typeof data === 'object') {
                    // Some files may be objects with satellite arrays as values
                    Object.values(data).forEach(arr => {
                        if (Array.isArray(arr)) allSats = allSats.concat(arr);
                    });
                }
            }
        } catch (e) {
            console.warn('Could not load', file, e);
        }
    }
    return allSats;
}

// New function to load and classify satellites
async function loadClassifiedSatellites() {
  try {
    const allSats = await loadAllLocalSatellites();
    displaySatelliteTable(allSats);
  } catch (error) {
    console.error('Failed to load satellite data:', error);
    document.getElementById('satelliteTableContainer').innerHTML = '<p>Failed to load satellite data.</p>';
  }
}

// Remove p5.js setup and draw functions
/*
function setup() {
  createCanvas(canWidth, canHeight);
  // ... rest of setup ...
}

function draw() {

}
*/

// Remove the entire makeTable function as it uses fancyTable which conflicts with DataTables
/*
function makeTable() {
	var resPerPage = $('#resPerPage').val();
    // ... rest of the fancyTable initialization code ...
}
*/

// Remove custom satellite management functions

// Event handlers for import/export buttons
document.addEventListener('DOMContentLoaded', () => {
});

function displaySatelliteTable(satellites) {
  const tableContainer = document.getElementById('satelliteTableContainer');
  tableContainer.innerHTML = '';
  let table = document.createElement('table');
  table.className = 'satelliteTable';
  table.id = 'satTable';
  let thead = table.createTHead();
  let headerRow = thead.insertRow();
  let headers = ['Name', 'NORAD ID', 'Details'];
  headers.forEach(headerText => {
    let header = document.createElement('th');
    header.textContent = headerText;
    headerRow.appendChild(header);
  });
  let tbody = table.createTBody();
  satellites.forEach(sat => {
    let row = tbody.insertRow();
    let nameCell = row.insertCell();
    nameCell.textContent = sat.OBJECT_NAME || sat.name || '';
    let idCell = row.insertCell();
    idCell.textContent = sat.NORAD_CAT_ID || sat.id || '';
    let detailsCell = row.insertCell();
    let satLink = document.createElement('a');
    satLink.href = `satPage.html?ID=${encodeURIComponent(sat.NORAD_CAT_ID || sat.id)}&name=${encodeURIComponent(sat.OBJECT_NAME || sat.name)}`;
    satLink.textContent = 'Track it!';
    detailsCell.appendChild(satLink);
  });
  tableContainer.appendChild(table);
  // Initialize DataTables if available
  if (window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable) {
    $(table).DataTable({
      pageLength: 25,
      lengthMenu: [10, 25, 50, 100],
      searching: true,
      ordering: true
    });
  }
}

// Map categories to their JSON files
const categoryMap = {
    'Active': 'data/active.json',
    'Stations': 'data/stations.json',
    'Weather': 'data/weather.json',
    'NOAA': 'data/noaa.json',
    'GOES': 'data/goes.json',
    'Resource': 'data/resource.json',
    'Amateur': 'data/amateur.json',
    'Starlink': 'data/starlink.json',
    'Custom': 'data/custom_satellites.json'
};

// Store loaded data for each category
const categoryData = {};

// --- Custom TLE Functions ---

// Function to toggle TLE form visibility
function toggleTleForm() {
    var form = document.getElementById("tle-form");
    form.style.display = form.style.display === "none" ? "block" : "none";
    var btn = document.getElementById("add-tle-btn");
    btn.innerText = form.style.display === "none" ? "Add Custom TLE" : "Hide Form";
}

// Function to get custom satellites from localStorage - Ensure it always returns an array
function getCustomSatellitesFromStorage() {
    const storedData = localStorage.getItem('customSatellites');
    if (!storedData) {
        return []; // Return empty array if nothing is stored
    }
    try {
        const parsedData = JSON.parse(storedData);
        // Ensure the result is an array
        return Array.isArray(parsedData) ? parsedData : [];
    } catch (e) {
        console.error("Error parsing custom satellites from localStorage:", e);
        return []; // Return empty array on error
    }
}

// Function to save custom satellite
function saveCustomSatellite() {
    const name = document.getElementById('customSatName').value.trim();
    const tle1 = document.getElementById('customTleLine1').value.trim();
    const tle2 = document.getElementById('customTleLine2').value.trim();

    if (!name || !tle1 || !tle2) {
        alert("Please fill in all fields.");
        return;
    }

    // Basic TLE validation (can be improved)
    if (!tle1.startsWith('1 ') || !tle2.startsWith('2 ') || tle1.length < 69 || tle2.length < 69) {
        alert("Invalid TLE format.");
        return;
    }

    const customSatellites = getCustomSatellitesFromStorage();
    const newSatId = `CUSTOM-${Date.now()}`; // Simple unique ID

    // Attempt to parse TLE to get NORAD ID if possible, otherwise use custom ID
    let noradId = newSatId;
    try {
        const satrec = satellite.twoline2satrec(tle1, tle2);
        noradId = satrec.satnum || newSatId;
    } catch (e) {
        console.warn("Could not parse NORAD ID from TLE, using generated ID.");
    }

    const newSat = {
        id: newSatId, // Internal custom ID
        NORAD_CAT_ID: noradId, // Use parsed or generated
        OBJECT_NAME: name,
        TLE_LINE1: tle1, // Store TLE lines directly
        TLE_LINE2: tle2,
        // Add epoch derived from TLE for sorting
        EPOCH: getEpochFromTLE(tle1)
    };

    customSatellites.push(newSat);
    localStorage.setItem('customSatellites', JSON.stringify(customSatellites));

    // Update in-memory data and refresh table if 'Custom' is selected
    categoryData['Custom'] = (categoryData['Custom'] || []).concat([newSat]); // Add to existing custom data
    const currentCategory = document.getElementById('categoryDropdown')?.value;
    if (currentCategory === 'Custom') {
        displaySatelliteTableForCategory('Custom');
    }

    // Clear form and hide
    document.getElementById('customSatName').value = '';
    document.getElementById('customTleLine1').value = '';
    document.getElementById('customTleLine2').value = '';
    toggleTleForm();
    alert("Custom satellite saved!");
}

// Helper to get Epoch Year from TLE Line 1
function getEpochFromTLE(tleLine1) {
    if (!tleLine1 || tleLine1.length < 20) return null;
    try {
        const epochYearDigits = parseInt(tleLine1.substring(18, 20), 10);
        const year = epochYearDigits < 57 ? 2000 + epochYearDigits : 1900 + epochYearDigits;
        // Just return year for simplicity, can be expanded to full date
        return year;
    } catch (e) {
        return null;
    }
}

// Load all categories' data at startup
async function preloadAllCategories() {
    for (const [cat, file] of Object.entries(categoryMap)) {
        let loadedData = [];
        try {
            const res = await fetch(file);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    loadedData = data;
                } else if (Array.isArray(data.satellites)) { // Handle custom_satellites.json structure
                    loadedData = data.satellites;
                } else if (data && typeof data === 'object') {
                    Object.values(data).forEach(arr => {
                        if (Array.isArray(arr)) loadedData = loadedData.concat(arr);
                    });
                }
            } else if (res.status !== 404) { // Don't warn for missing custom file initially
                 console.warn(`Failed to fetch ${file}: ${res.status}`);
            }
        } catch (e) {
             if (file !== 'data/custom_satellites.json') { // Don't warn if custom file doesn't exist
                console.warn('Could not load or parse', file, e);
             }
        }

        // If category is 'Custom', merge with localStorage
        if (cat === 'Custom') {
            const storedCustomSats = getCustomSatellitesFromStorage();
            // Combine and remove duplicates based on id or NORAD_CAT_ID
            const combined = [...loadedData, ...storedCustomSats];
            const uniqueSats = Array.from(new Map(combined.map(sat => [sat.id || sat.NORAD_CAT_ID, sat])).values());
            categoryData[cat] = uniqueSats;
        } else {
            categoryData[cat] = loadedData;
        }
         // Add launch year to each satellite object for sorting
        categoryData[cat].forEach(sat => {
            sat.LAUNCH_YEAR = getLaunchYear(sat);
        });
    }
}

// Helper to get Launch Year
function getLaunchYear(sat) {
    if (sat.LAUNCH_YEAR) return sat.LAUNCH_YEAR; // Already calculated

    let year = null;
    // 1. Try OBJECT_ID (e.g., "1998-067A")
    if (sat.OBJECT_ID && typeof sat.OBJECT_ID === 'string' && sat.OBJECT_ID.length >= 4) {
        const yearStr = sat.OBJECT_ID.substring(0, 4);
        const parsedYear = parseInt(yearStr, 10);
        if (!isNaN(parsedYear) && parsedYear > 1900 && parsedYear < 2100) {
            year = parsedYear;
        }
    }

    // 2. Try INTLDES (e.g., "98067A") if OBJECT_ID didn't work
    if (year === null && sat.INTLDES && typeof sat.INTLDES === 'string' && sat.INTLDES.length >= 2) {
        const yearDigits = parseInt(sat.INTLDES.substring(0, 2), 10);
        if (!isNaN(yearDigits)) {
            year = yearDigits < 57 ? 2000 + yearDigits : 1900 + yearDigits;
        }
    }

    // 3. Try TLE Epoch Year if others failed
    if (year === null && sat.TLE_LINE1) {
        year = getEpochYearFromTLE(sat.TLE_LINE1);
    }

    // 4. Try EPOCH string year if others failed
    if (year === null && sat.EPOCH && typeof sat.EPOCH === 'string' && sat.EPOCH.length >= 4) {
        const epochYearStr = sat.EPOCH.substring(0, 4);
        const parsedEpochYear = parseInt(epochYearStr, 10);
         if (!isNaN(parsedEpochYear) && parsedEpochYear > 1900 && parsedEpochYear < 2100) {
            year = parsedEpochYear;
        }
    }

    // Cache the result
    sat.LAUNCH_YEAR = year;
    return year;
}

// Renamed helper function for clarity
function getEpochYearFromTLE(tleLine1) {
    if (!tleLine1 || tleLine1.length < 20) return null;
    try {
        const epochYearDigits = parseInt(tleLine1.substring(18, 20), 10);
        const year = epochYearDigits < 57 ? 2000 + epochYearDigits : 1900 + epochYearDigits;
        // Just return year for simplicity, can be expanded to full date
        return year;
    } catch (e) {
        return null;
    }
}

// Create dropdown for categories
function createCategoryDropdown() {
    const container = document.getElementById('categoryDropdownContainer');
    if (!container) {
        console.error('Dropdown container not found!');
        return null; // Exit if container doesn't exist
    }
    container.innerHTML = ''; // Clear previous content
    const select = document.createElement('select');
    select.id = 'categoryDropdown';
    select.className = 'form-control mb-2'; // Add some basic styling

    // Add a label for the dropdown
    const label = document.createElement('label');
    label.htmlFor = 'categoryDropdown';
    label.textContent = 'Select Satellite Category: ';
    container.appendChild(label);

    for (const cat of Object.keys(categoryMap)) {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    }
    container.appendChild(select);
    return select;
}

// Display satellites for a given category
function displaySatelliteTableForCategory(category) {
    const satellites = categoryData[category] || [];
    const tableContainer = document.getElementById('satelliteTableContainer');
    if (!tableContainer) {
        console.error("Table container not found!");
        return;
    }
    tableContainer.innerHTML = ''; // Clear previous table/message
    let table = document.createElement('table');
    // Use DataTables default classes for styling
    table.className = 'display compact stripe hover order-column'; 
    table.id = 'satTable';
    table.style.width = '100%'; // Ensure table takes width

    // ... (thead and tbody creation remains the same) ...
    let thead = table.createTHead();
    let headerRow = thead.insertRow();
    // Add Launch Year header
    let headers = ['Name', 'NORAD ID', 'Tracking', 'Launch Year'];
    headers.forEach(headerText => {
        let header = document.createElement('th');
        header.textContent = headerText;
        headerRow.appendChild(header);
    });
    let tbody = table.createTBody();
    satellites.forEach(sat => {
        let row = tbody.insertRow();
        // Name
        row.insertCell().textContent = sat.OBJECT_NAME || sat.name || '';
        // NORAD ID
        row.insertCell().textContent = sat.NORAD_CAT_ID || sat.id || '';
        // Details Link
        let detailsCell = row.insertCell();
        let satLink = document.createElement('a');
        satLink.href = `satPage.html?ID=${encodeURIComponent(sat.NORAD_CAT_ID || sat.id)}&name=${encodeURIComponent(sat.OBJECT_NAME || sat.name)}`;
        satLink.textContent = 'Track it!';
        detailsCell.appendChild(satLink);
        // Launch Year
        row.insertCell().textContent = sat.LAUNCH_YEAR || 'N/A'; // Display launch year
    });

    tableContainer.appendChild(table);

    // Initialize DataTables
    try {
        if (window.jQuery && window.jQuery.fn.dataTable) {
             // Check if DataTable is already initialized
            if ($.fn.dataTable.isDataTable('#satTable')) {
                $('#satTable').DataTable().destroy(); // Destroy existing instance first
            }
            const dataTable = $('#satTable').DataTable({
                pageLength: 10, // Set default page length to 10
                lengthMenu: [10, 25, 50, 100],
                searching: true,
                ordering: true,
                responsive: true, // Add responsiveness
                // destroy: true // Already handled above
            });
            console.log("DataTables initialized.");

            // Remove previous sort button listener
            // $('#sortTableBtn').off('click'); // No longer needed

            // Function to apply sorting based on dropdowns
            const applySorting = () => {
                const columnIndex = parseInt($('#sortColumn').val());
                const sortOrder = $('#sortOrder').val();
                console.log(`Auto-sorting by column index: ${columnIndex}, order: ${sortOrder}`);
                if (dataTable) {
                    dataTable.order([columnIndex, sortOrder]).draw();
                    console.log("Table auto-sorted and redrawn.");
                } else {
                    console.error("DataTable instance not found for auto-sorting.");
                }
            };

            // Add change listeners to dropdowns for auto-sorting
            // Use .off().on() to prevent duplicate listeners if function is called multiple times
            $('#sortColumn, #sortOrder').off('change').on('change', applySorting);

        } else {
            console.error("jQuery or DataTables not loaded.");
        }
    } catch (e) {
        console.error("Error initializing DataTables:", e);
    }
}

// Main initialization
async function mainInit() {
    console.log("Initializing..."); // Add log
    await preloadAllCategories();
    console.log("Categories preloaded."); // Add log
    const select = createCategoryDropdown();
    if (select) { // Check if dropdown was created
        console.log("Dropdown created."); // Add log
        // Display default category (Active)
        displaySatelliteTableForCategory(select.value);
        select.addEventListener('change', function() {
            console.log("Category changed to:", this.value); // Add log
            displaySatelliteTableForCategory(this.value);
        });
    } else {
        console.error("Failed to create dropdown.");
    }
}

// Function to update UTC Clock
function updateUtcClock() {
    const clockElement = document.getElementById('utc-clock');
    if (clockElement) {
        const now = new Date();
        clockElement.textContent = now.toUTCString().substring(17, 25); // HH:MM:SS
    }
}

// --- Dark Mode Logic ---
function applyDarkModePreference() {
    const isDarkMode = localStorage.getItem('darkMode') === 'enabled';
    const toggleButton = document.getElementById('darkModeToggle');
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        if (toggleButton) toggleButton.textContent = '🌙'; // Moon icon
    } else {
        document.body.classList.remove('dark-mode');
        if (toggleButton) toggleButton.textContent = '☀️'; // Sun icon
    }
}

function toggleDarkMode() {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    const toggleButton = document.getElementById('darkModeToggle');
    if (isDarkMode) {
        localStorage.setItem('darkMode', 'enabled');
        if (toggleButton) toggleButton.textContent = '🌙';
    } else {
        localStorage.setItem('darkMode', 'disabled');
        if (toggleButton) toggleButton.textContent = '☀️';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, running mainInit."); // Add log
    mainInit();

    // Initialize and update UTC Clock
    updateUtcClock();
    setInterval(updateUtcClock, 1000); // Update every second

    // Add listener for TLE button
    const addTleBtn = document.getElementById('add-tle-btn');
    if (addTleBtn) {
        addTleBtn.addEventListener('click', toggleTleForm);
    }

    // Add listener for Save TLE button
    const saveTleBtn = document.getElementById('save-tle-btn');
    if (saveTleBtn) {
        saveTleBtn.addEventListener('click', saveCustomSatellite);
    }

    // Apply saved dark mode preference on load
    applyDarkModePreference();

    // Add listener for Dark Mode Toggle
    const darkModeButton = document.getElementById('darkModeToggle');
    if (darkModeButton) {
        darkModeButton.addEventListener('click', toggleDarkMode);
    }
    
    // Remove map initialization code
});

// Modify the document ready function to select weather satellites by default
$(document).ready(function() {
    // Initialize the category dropdown
    initializeCategoryDropdown();
    
    // Set default category to Weather
    $('#categoryDropdown').val('Weather').trigger('change');
});

function initializeCategoryDropdown() {
    // After populating the dropdown, make sure to select Weather by default
    if (!$('#categoryDropdown').val()) {
        $('#categoryDropdown').val('Weather');
    }
}

function populateSatelliteTable(category = 'Weather') {
    // Default category parameter to 'Weather' if not specified
}