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

// Global variable to store active satellite IDs
let activeSatelliteIds = new Set();

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

// Function to fetch and store active satellite IDs
async function loadActiveSatelliteIds() {
    try {
        const response = await fetch('data/active.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const activeSatellites = await response.json();
        if (Array.isArray(activeSatellites)) {
            activeSatellites.forEach(sat => {
                if (sat.NORAD_CAT_ID) {
                    activeSatelliteIds.add(parseInt(sat.NORAD_CAT_ID, 10)); // Store IDs as numbers
                }
            });
            console.log(`Loaded ${activeSatelliteIds.size} active satellite IDs.`);
        } else {
            console.error("active.json did not contain a valid array.");
        }
    } catch (error) {
        console.error('Error loading active satellite IDs:', error);
        // Optionally display an error to the user
    }
}

function displaySatelliteTable(satellites) {
  const tableContainer = document.getElementById('satelliteTableContainer');
  tableContainer.innerHTML = '';
  let table = document.createElement('table');
  table.className = 'satelliteTable';
  table.id = 'satTable';
  let thead = table.createTHead();
  let headerRow = thead.insertRow();
  // Add Launch Year header back
  let headers = ['Name', 'NORAD ID', 'Status', 'Launch Year'];
  headers.forEach((headerText, index) => { // Add index
    let header = document.createElement('th');
    header.textContent = headerText;
    // Add data attribute for sorting if needed, or rely on DataTables index
    header.setAttribute('data-column-index', index);
    headerRow.appendChild(header);
  });
  let tbody = table.createTBody();
  satellites.forEach(sat => {
    let row = tbody.insertRow();
    // Name
    row.insertCell().textContent = sat.OBJECT_NAME || sat.name || '';
    // NORAD ID
    const noradId = parseInt(sat.NORAD_CAT_ID || sat.id, 10);
    row.insertCell().textContent = noradId || '';

    // Tracking Link/Status Cell
    let trackingCell = row.insertCell();
    if (activeSatelliteIds.has(noradId)) {
        // Active: Create the link
        let satLink = document.createElement('a');
        satLink.href = `satPage.html?ID=${encodeURIComponent(noradId)}&name=${encodeURIComponent(sat.OBJECT_NAME || sat.name)}`;
        satLink.innerHTML = 'Active<br>(Track it!)';
        trackingCell.appendChild(satLink);
    } else {
        // Inactive: Display text
        trackingCell.textContent = 'Inactive';
        trackingCell.classList.add('inactive-satellite');
    }

    // Launch Year
    row.insertCell().textContent = sat.LAUNCH_YEAR || 'N/A';
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
            pageLength: 10,
            lengthMenu: [10, 25, 50, 100],
            searching: true,
            ordering: true,
            responsive: true,
            columnDefs: [
                { type: 'string', targets: 0 }, // Name
                { type: 'num', targets: 1 },    // NORAD ID
                { orderable: false, targets: 2 }, // Tracking link/status
                { type: 'num', targets: 3 }     // Launch Year
            ],
            order: [[0, 'asc']],
            initComplete: function() {
                // Remove existing filter logic first if it exists to avoid duplicates
                $.fn.dataTable.ext.search.pop(); 

                // Add the corrected custom filtering function
                $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
                    // Check if the filter should be active
                    const showActiveOnly = $('#showActiveOnly').is(':checked');
                    if (!showActiveOnly) {
                        return true; // Show all rows if checkbox is not checked
                    }

                    // If checkbox is checked, filter based on activeSatelliteIds
                    const noradIdString = data[1]; // Get NORAD ID string from column 1 data
                    const noradId = parseInt(noradIdString, 10);
                    
                    if (isNaN(noradId)) {
                        // console.warn(`Row ${dataIndex}: Could not parse NORAD ID: ${noradIdString}`);
                        return false; // Hide rows where ID cannot be parsed
                    }

                    // Check if the ID is in the globally loaded Set
                    return activeSatelliteIds.has(noradId); 
                });

                // Ensure change handler is attached only once
                $('#showActiveOnly').off('change').on('change', function() {
                    console.log("Checkbox changed, redrawing table...");
                    dataTable.draw(); // Redraw table to apply the filter
                });

                 // Initial draw to apply filter if checkbox is checked on load
                 // dataTable.draw(); 
            }
        });
        console.log("DataTables initialized.");

        // Function to apply sorting based on dropdowns
        const applySorting = () => {
            const columnIndex = parseInt($('#sortColumn').val()); // Ensure value is correct index (0, 1, 3)
            const sortOrder = $('#sortOrder').val(); // 'asc' or 'desc'
            console.log(`Applying sorting by column index: ${columnIndex}, order: ${sortOrder}`);
            if (dataTable && columnIndex !== null && sortOrder) {
                // Check if the column index is valid and sortable
                if (columnIndex === 2) { // Don't sort by Tracking column
                     console.warn("Sorting by 'Tracking' column is disabled.");
                     return;
                }
                dataTable.order([columnIndex, sortOrder]).draw();
                console.log("Table sorted and redrawn.");
            } else {
                console.error("DataTable instance not found or invalid sort parameters.");
            }
        };

        // Add change listeners to dropdowns for auto-sorting
        $('#sortColumn, #sortOrder').off('change').on('change', applySorting);

        // Initial sort based on dropdown defaults after table is drawn
        // Ensure dropdowns have correct initial values corresponding to Launch Year
        // Example: Set dropdowns to sort by Launch Year descending initially
        // $('#sortColumn').val('3'); // Assuming Launch Year is index 3
        // $('#sortOrder').val('desc');
        // applySorting(); // Apply initial sort

    } else {
        console.error("jQuery or DataTables not loaded.");
    }
  } catch (e) {
    console.error("Error initializing DataTables:", e);
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
    const form = document.getElementById("tle-form");
    form.classList.toggle('visible');
    const btn = document.getElementById("add-tle-btn");
    btn.innerText = form.classList.contains('visible') ? "Hide Form" : "Add Custom TLE";
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

// Function to handle form submission and save custom satellite
async function handleFormSubmission() {
    try {
        // console.log('Starting handleFormSubmission...');
        
        // Get form elements
        const nameInput = document.getElementById('customSatName');
        const tle1Input = document.getElementById('customTleLine1');
        const tle2Input = document.getElementById('customTleLine2');

        // console.log('Form elements:', {
        //     nameInput: nameInput ? 'found' : 'not found',
        //     tle1Input: tle1Input ? 'found' : 'not found',
        //     tle2Input: tle2Input ? 'found' : 'not found'
        // });

        if (!nameInput || !tle1Input || !tle2Input) {
            console.error('Missing form elements:', { nameInput, tle1Input, tle2Input });
            alert("Error: Form elements not found. Please refresh the page and try again.");
            return;
        }

        // Get and trim input values
        const name = nameInput.value.trim();
        const tle1 = tle1Input.value.trim();
        const tle2 = tle2Input.value.trim();

        // Log the trimmed values right before the check
        // console.log('Trimmed values for validation:', {
        //     name: `"${name}"`,
        //     tle1: `"${tle1}"`,
        //     tle2: `"${tle2}"`
        // });

        if (!name || !tle1 || !tle2) {
            alert("Please fill in all fields.");
            return;
        }

        // First validate the TLE format
        // console.log('Validating TLE...');
        if (!validateTLE(tle1, tle2)) {
            alert("Invalid TLE format. Please check the TLE data and try again.");
            return;
        }

        // Parse the TLE data
        // console.log('Parsing TLE...');
        const satelliteData = parseTLE(name, tle1, tle2);
        if (!satelliteData) {
            alert("Failed to parse TLE data. Please check the format and try again.");
            return;
        }

        // console.log('Parsed satellite data:', satelliteData);

        // Save to localStorage using the customSat.js function
        if (!window.saveCustomSatellite(satelliteData)) {
            alert("Failed to save satellite data. Please try again.");
            return;
        }

        // Update in-memory data for the 'Custom' category
        categoryData['Custom'] = getCustomSatellitesFromStorage();

        // Clear form and hide
        nameInput.value = '';
        tle1Input.value = '';
        tle2Input.value = '';
        toggleTleForm();

        // Redirect to satPage.html with the new satellite's data
        window.location.href = `satPage.html?ID=${encodeURIComponent(satelliteData.NORAD_CAT_ID)}&name=${encodeURIComponent(name)}`;

    } catch (error) {
        console.error("Error saving satellite:", error);
        alert(`Error saving satellite: ${error.message}`);
    }
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
            // Combine file data (if any) and stored data, ensuring no duplicates
            const combined = [...loadedData, ...storedCustomSats];
            const uniqueSats = Array.from(new Map(combined.map(sat => [sat.NORAD_CAT_ID || sat.id, sat])).values());
            categoryData[cat] = uniqueSats;
             // Add FILE property and ensure LAUNCH_YEAR is set
            categoryData[cat].forEach(sat => {
                sat.FILE = 'custom'; // Mark as custom
                if (!sat.LAUNCH_YEAR) sat.LAUNCH_YEAR = getEpochYearFromTLE(sat.TLE_LINE1);
            });
        } else {
            categoryData[cat] = loadedData;
             // Add launch year and FILE property to each satellite object for sorting/filtering
            categoryData[cat].forEach(sat => {
                sat.LAUNCH_YEAR = getLaunchYear(sat);
                sat.FILE = file; // Store the source file path
            });
        }
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

// Function to populate the category dropdown
function populateCategoryDropdown(categories) {
    const dropdownContainer = document.getElementById('categorySelectContainer');
    if (!dropdownContainer) return; // Guard clause

    let dropdownHTML = '<select id="categorySelect" class="form-control-sm">';
    // Add 'All' option first, not selected by default
    dropdownHTML += '<option value="all">All Satellites</option>';

    categories.forEach(category => {
        // Set NOAA as the default selected option
        const selected = category === 'NOAA' ? ' selected' : '';
        dropdownHTML += `<option value="${category}"${selected}>${category}</option>`;
    });

    dropdownHTML += '</select>';
    dropdownContainer.innerHTML = dropdownHTML;

    // Add event listener to the dropdown
    const categorySelect = document.getElementById('categorySelect');
    if (categorySelect) {
        categorySelect.addEventListener('change', function() {
            const selectedCategory = this.value;
            loadAndDisplaySatellites(selectedCategory);
        });
    }
}

// Function to load satellite data for all categories (used for filtering 'All')
async function loadAllSatelliteData() {
    // This function should fetch and combine data from all relevant sources
    // Assuming it combines data from categoryData or fetches directly
    let allSats = [];
    for (const category in categoryData) {
        allSats = allSats.concat(categoryData[category]);
    }
    // Remove duplicates if necessary
    allSats = Array.from(new Map(allSats.map(sat => [sat.NORAD_CAT_ID || sat.id, sat])).values());
    return allSats;
}

// Function to get category name from filename (simple example)
function getCategoryFromFile(filePath) {
    if (!filePath) return 'Unknown';
    const parts = filePath.split('/');
    const filename = parts[parts.length - 1];
    const categoryName = filename.replace('.json', '');
    // Capitalize first letter
    return categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
}

// Function to load and display satellites based on category
async function loadAndDisplaySatellites(category) {
    // Ensure category is provided, default to 'NOAA' if needed (though should be set by caller)
    const currentCategory = category || document.getElementById('categorySelect')?.value || 'NOAA';
    showLoading(`Loading ${currentCategory} satellite data...`);
    try {
        let satellitesToDisplay = [];
        if (currentCategory === 'all') {
            // If 'all' is selected, load data from all categories
            satellitesToDisplay = await loadAllSatelliteData();
        } else {
            // Otherwise, use the preloaded data for the specific category
            // Ensure custom data is up-to-date from localStorage if category is 'Custom'
            if (currentCategory === 'Custom') {
                 categoryData['Custom'] = getCustomSatellitesFromStorage();
                 // Ensure LAUNCH_YEAR is set for custom sats
                 categoryData['Custom'].forEach(sat => {
                    if (!sat.LAUNCH_YEAR) sat.LAUNCH_YEAR = getEpochYearFromTLE(sat.TLE_LINE1);
                    sat.FILE = 'custom'; // Ensure FILE property is set
                 });
            }
            satellitesToDisplay = categoryData[currentCategory] || [];
        }

        // Store the currently displayed satellites globally
        window.currentSatellites = satellitesToDisplay;

        displaySatelliteTable(satellitesToDisplay); // This function initializes/updates DataTable
        hideLoading();
    } catch (error) {
        console.error(`Error loading or displaying ${currentCategory} satellites:`, error);
        showError(`Failed to load ${currentCategory} satellite data.`);
        hideLoading();
    }
}

// --- Consolidated Initialization --- //
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM loaded, starting initialization...");

    // Initialize UTC Clock
    updateUtcClock();
    setInterval(updateUtcClock, 1000);

    // --- Theme Setup (Consolidated) ---
    const themeToggle = document.getElementById('theme-toggle');
    const pageBody = document.getElementById('pageBody');
    const currentTheme = localStorage.getItem('theme') || 'light'; // Default to light for index
    setTheme(currentTheme); // Apply theme on load

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            let newTheme = (pageBody && pageBody.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }

    // Setup Add TLE button listeners
    const addTleBtn = document.getElementById('add-tle-btn');
    if (addTleBtn) {
        addTleBtn.addEventListener('click', toggleTleForm);
    }

    // Setup Save TLE button listener
    const saveTleBtn = document.getElementById('save-tle-btn');
    if (saveTleBtn) {
        saveTleBtn.addEventListener('click', handleFormSubmission);
    }

    // --- Load Categories and Initial Data ---
    try {
        showLoading('Initializing categories...');
        await loadActiveSatelliteIds(); // Load active IDs first
        await preloadAllCategories(); // Load data for all categories into categoryData
        console.log("All category data preloaded.");

        const categories = Object.keys(categoryMap); // Get categories from the map
        populateCategoryDropdown(categories);
        console.log("Category dropdown populated, default should be NOAA.");

        // Explicitly load and display the default category (NOAA) initially
        await loadAndDisplaySatellites('NOAA');
        console.log("Initial satellite data loaded for NOAA.");

        // Setup sorting controls listener (assuming this function exists)
        if (typeof setupSortingControls === 'function') {
            setupSortingControls();
        }

        hideLoading();

    } catch (error) {
        console.error("Initialization error:", error);
        showError("Failed to initialize the page.");
        hideLoading();
    }
});

// Function to update UTC Clock
function updateUtcClock() {
    const clockElement = document.getElementById('utc-clock');
    if (clockElement) {
        const now = new Date();
        clockElement.textContent = now.toUTCString().substring(17, 25); // HH:MM:SS
    }
}

// Consolidated theme setting function
function setTheme(theme) {
    const pageBody = document.getElementById('pageBody');
    if (!pageBody) return;

    // Update body attribute
    pageBody.setAttribute('data-theme', theme);
    
    // Update localStorage
    localStorage.setItem('theme', theme);
    
    // Update theme toggle icon
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.innerHTML = theme === 'dark' 
            ? '<i class="fas fa-sun"></i>'
            : '<i class="fas fa-moon"></i>';
    }
}

// Utility function to escape HTML special characters
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Loading and Error Message Functions
function showLoading(message) {
    const loadingElement = document.createElement('div');
    loadingElement.id = 'loading-message';
    loadingElement.className = 'message-overlay';
    loadingElement.setAttribute('role', 'alert');
    loadingElement.setAttribute('aria-live', 'polite');
    
    loadingElement.innerHTML = `
        <div class="message-content">
            <div class="spinner"></div>
            <span class="message-text">${escapeHTML(message || 'Loading...')}</span>
        </div>
    `;
    
    // Remove any existing loading message
    const existingLoading = document.getElementById('loading-message');
    if (existingLoading) {
        existingLoading.remove();
    }
    
    document.body.appendChild(loadingElement);
}

function hideLoading() {
    const loadingElement = document.getElementById('loading-message');
    if (loadingElement) {
        loadingElement.remove();
    }
}

function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.id = 'error-message';
    errorElement.className = 'message-overlay';
    errorElement.setAttribute('role', 'alert');
    errorElement.setAttribute('aria-live', 'assertive');
    
    errorElement.innerHTML = `
        <div class="message-content">
            <i class="fas fa-exclamation-circle"></i>
            <span class="message-text">${escapeHTML(message)}</span>
            <button class="close-message" aria-label="Close error message" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Remove any existing error message
    const existingError = document.getElementById('error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Hide loading if it's showing
    hideLoading();
    
    document.body.appendChild(errorElement);
}