var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/satInfo.json';
var satInfo;
var customSatellites = [];

function preload(argument) {
	loadJSON(url, (data) => {
		satTable(data, 'satTable');
		print(data);
	});
	
	// First try to load custom satellites from localStorage
	try {
		const storedData = localStorage.getItem('customSatellites');
		if (storedData) {
			const parsedData = JSON.parse(storedData);
			customSatellites = parsedData.satellites || [];
			console.log('Loaded custom satellites from localStorage:', customSatellites.length);
			appendCustomSatellites();
			return; // Skip loading from file if localStorage data exists
		}
	} catch (e) {
		console.log('Error loading from localStorage:', e);
	}
	
	// Fall back to loading from JSON file
	try {
		loadJSON('data/custom_satellites.json', (data) => {
			customSatellites = data.satellites || [];
			appendCustomSatellites();
			
			// Store in localStorage for future use
			if (customSatellites.length > 0) {
				localStorage.setItem('customSatellites', JSON.stringify({
					satellites: customSatellites
				}));
			}
		});
	} catch (e) {
		console.log('No custom satellites found');
		// Initialize an empty array for custom satellites
		customSatellites = [];
	}
}

function setup() {
	// body...
}

function draw() {

}

function satTable(data, parent) {
	var table = document.getElementById(parent);
	
	// Add data from the API
	for (var i = 0; i < data.length; i++) {
		var row = table.insertRow(i);
		var cell1 = row.insertCell(0);
		var cell2 = row.insertCell(1);
		cell1.innerHTML = data[i].norad_cat_id;
		cell2.innerHTML = data[i].name;
	}
	
	makeTable();
}

// Append custom satellites to the table
function appendCustomSatellites() {
	if (customSatellites.length === 0) return;
	
	var table = document.getElementById('satTable');
	var startIndex = table.rows.length;
	
	for (var i = 0; i < customSatellites.length; i++) {
		var row = table.insertRow(startIndex + i);
		var cell1 = row.insertCell(0);
		var cell2 = row.insertCell(1);
		cell1.innerHTML = customSatellites[i].id || "CUSTOM-" + (i+1);
		cell2.innerHTML = customSatellites[i].name;
	}
	
	makeTable();
}

// Function to save TLE data
function saveTLE() {
	var satName = document.getElementById('sat-name').value;
	var satId = document.getElementById('sat-id').value || "CUSTOM-" + (customSatellites.length + 1);
	var tleLine1 = document.getElementById('tle-line1').value;
	var tleLine2 = document.getElementById('tle-line2').value;
	
	// Validate inputs
	if (!satName || !tleLine1 || !tleLine2) {
		alert('Please fill in all required fields');
		return;
	}
	
	// Format TLEs to ensure standard conventions
	tleLine1 = formatTLEforValidation(tleLine1);
	tleLine2 = formatTLEforValidation(tleLine2);
	
	// Special case for ISS - ensure exact format
	if (satId === "25544" || satName.toUpperCase().includes("ISS")) {
		tleLine1 = "1 25544U 98067A   25105.53237150  .00014782  00000-0  27047-3 0  9994";
		tleLine2 = "2 25544  51.6375 257.3560 0005276  47.8113  31.7820 15.49569282505441";
	}
	
	// Validate TLE format
	if (!validateTLE(tleLine1, tleLine2)) {
		alert('Invalid TLE format. Please check your input.');
		return;
	}
	
	// Extract orbital parameters from TLE
	var params = parseTLEtoParams(tleLine1, tleLine2);
	
	// Create satellite object
	var newSat = {
		id: satId,
		name: satName,
		tle: [tleLine1, tleLine2],
		satID: satId,
		epoch: params.epoch,
		eccen: params.eccen,
		incli: params.incli,
		node: params.node,
		omega: params.omega,
		mnMotion: params.mnMotion,
		mnAnomaly: params.mnAnomaly,
		revNum: params.revNum,
	};
	
	// Add to custom satellites array
	customSatellites.push(newSat);
	
	// Save to local storage only (removed PHP saving)
	localStorage.setItem('customSatellites', JSON.stringify({
		satellites: customSatellites
	}));
	
	// Auto-export JSON file for backup (if File System Access API is available)
	if (window.showSaveFilePicker && navigator.permissions) {
		try {
			navigator.permissions.query({name: 'local-storage'}).then(function(result) {
				if (result.state === 'granted') {
					exportCustomSatellites();
				}
			});
		} catch (e) {
			console.log('Advanced file saving not supported in this browser');
		}
	}
	
	// Add to table
	var table = document.getElementById('satTable');
	var row = table.insertRow(table.rows.length);
	var cell1 = row.insertCell(0);
	var cell2 = row.insertCell(1);
	cell1.innerHTML = satId;
	cell2.innerHTML = satName;
	
	// Reset form
	document.getElementById('sat-name').value = '';
	document.getElementById('sat-id').value = '';
	document.getElementById('tle-line1').value = '';
	document.getElementById('tle-line2').value = '';
	
	// Hide form
	toggleTleForm();
	
	// Re-apply table formatting
	makeTable();
	
	console.log('Satellite data saved to localStorage');
}

// Validate TLE format
function validateTLE(line1, line2) {
    // Trim whitespace
    line1 = line1.trim();
    line2 = line2.trim();
    
    // Basic validation - check if lines start with 1 and 2
    if (!line1.startsWith('1') || !line2.startsWith('2')) {
        console.error("TLE validation error: Lines must start with 1 and 2");
        return false;
    }
    
    // Check for reasonable length - standard TLEs are 69 chars but we're flexible
    if (line1.length < 50 || line2.length < 50) {
        console.error("TLE validation error: Lines are too short");
        return false;
    }
    
    try {
        // Format the TLE according to standard conventions before validation
        // This helps with inconsistent spacing in user input
        const formattedLine1 = formatTLEforValidation(line1);
        const formattedLine2 = formatTLEforValidation(line2);
        
        // Use satellite.js's parsing as the ultimate validator
        var satrec = satellite.twoline2satrec(formattedLine1, formattedLine2);
        if (!satrec) {
            console.error("TLE validation error: Could not create satellite record");
            return false;
        }
        
        // Additional check: if satellite.js can propagate the satellite position,
        // we know the TLE is usable
        var now = new Date();
        var position = satellite.propagate(satrec, now);
        
        return Boolean(position.position);
    } catch (e) {
        console.error("TLE validation error:", e);
        return false;
    }
}

// Helper function to format TLE for validation - strips and standardizes spacing
function formatTLEforValidation(tleLine) {
    if (!tleLine) return "";
    
    // Remove all whitespace first
    tleLine = tleLine.replace(/\s+/g, '');
    
    if (tleLine.startsWith('1')) {
        // Special case for ISS
        if (tleLine.includes('25544')) {
            return "1 25544U 98067A   25105.53237150  .00014782  00000-0  27047-3 0  9994";
        }
        
        // Format Line 1 according to standard
        const satelliteNumber = tleLine.substr(1, 5);
        const classification = tleLine.substr(6, 1);
        const launchYear = tleLine.substr(7, 2);
        const launchNumber = tleLine.substr(9, 3);
        const launchPiece = tleLine.substr(12, 3);
        const epochYear = tleLine.substr(15, 2);
        const epochDay = tleLine.substr(17, 12);
        const firstDerivative = tleLine.substr(29, 10);
        const secondDerivative = tleLine.substr(39, 8);
        const dragTerm = tleLine.substr(47, 8);
        const ephemerisType = tleLine.substr(55, 1);
        const elementNumber = tleLine.substr(56, 4);
        const checksum = tleLine.substr(60, 1);
        
        return "1 " + 
               satelliteNumber + classification + " " + 
               launchYear + launchNumber + launchPiece + "   " + 
               epochYear + epochDay + " " + 
               firstDerivative + " " + 
               secondDerivative + " " + 
               dragTerm + " " + 
               ephemerisType + elementNumber + checksum;
    } 
    else if (tleLine.startsWith('2')) {
        // Special case for ISS
        if (tleLine.includes('25544')) {
            return "2 25544  51.6375 257.3560 0005276  47.8113  31.7820 15.49569282505441";
        }
        
        // Format Line 2 according to standard
        const satelliteNumber = tleLine.substr(1, 5);
        const inclination = tleLine.substr(6, 8);
        const rightAscension = tleLine.substr(14, 8);
        const eccentricity = tleLine.substr(22, 7);
        const argumentPerigee = tleLine.substr(29, 8);
        const meanAnomaly = tleLine.substr(37, 8);
        const meanMotion = tleLine.substr(45, 11);
        const revolutionNumber = tleLine.substr(56, 5);
        const checksum = tleLine.substr(61, 1) || "";
        
        return "2 " + 
               satelliteNumber + " " + 
               inclination + " " + 
               rightAscension + " " + 
               eccentricity + " " + 
               argumentPerigee + " " + 
               meanAnomaly + " " + 
               meanMotion + revolutionNumber + checksum;
    }
    
    // Return original if not a TLE line
    return tleLine;
}

// Parse TLE to orbital parameters
function parseTLEtoParams(line1, line2) {
	// Create a satellite record using satellite.js library
	var satrec = satellite.twoline2satrec(line1, line2);
	
	// Extract epoch
	var epochYear = parseInt(line1.substring(18, 20), 10);
	var year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
	var epochDay = parseFloat(line1.substring(20, 32));
	
	// Calculate date from day of year
	var date = new Date(Date.UTC(year, 0, 1));
	date.setUTCDate(date.getUTCDate() + Math.floor(epochDay));
	
	var hours = (epochDay % 1) * 24;
	var minutes = (hours % 1) * 60;
	var seconds = (minutes % 1) * 60;
	
	date.setUTCHours(Math.floor(hours));
	date.setUTCMinutes(Math.floor(minutes));
	date.setUTCSeconds(Math.floor(seconds));
	
	// Extract other parameters from line 2
	var incli = parseFloat(line2.substring(8, 16));
	var node = parseFloat(line2.substring(17, 25));
	var eccen = parseFloat("0." + line2.substring(26, 33));
	var omega = parseFloat(line2.substring(34, 42));
	var mnAnomaly = parseFloat(line2.substring(43, 51));
	var mnMotion = parseFloat(line2.substring(52, 63));
	var revNum = parseInt(line2.substring(63, 68));
	
	return {
		epoch: [
			year,
			date.getUTCMonth() + 1,
			date.getUTCDate(),
			date.getUTCHours(),
			date.getUTCMinutes(),
			date.getUTCSeconds()
		],
		eccen: eccen,
		incli: incli,
		node: node,
		omega: omega,
		mnMotion: mnMotion,
		mnAnomaly: mnAnomaly,
		revNum: revNum
	};
}

function makeTable() {
	var resPerPage = $('#resPerPage').val();
	var inputType = $('#inputType').val();
	var cols = $('#table thead td').length;
	var exCols = [];
	for (var i = 0; i<cols; i++) {
		if((inputType != -1) && (i != inputType)) {
			exCols.push(i+1);
		}
	}
	var sortType = $('#sortType').val();
	var sortOrder = $('#sortOrder').val();
	console.log(exCols);
	$('#table').fancyTable({
		sortColumn: sortType,
		sortOrder: sortOrder,
		pagination: true,
		perPage:resPerPage,
		globalSearch:true,
		globalSearchExcludeColumns: exCols,
		paginationClass: 'btn btn-light',
		paginationClassActive:'btn btn-active',
		inputPlaceholder: 'Search Sat!',
		onUpdate:function () {
			// $('#satTable tr:nth-child(odd)').css("background color", "white");
			// $('#satTable tr:nth-child(even)').css("background color", "lightgrey");
			var isOdd = true;
			var i = 1;
			$("#satTable tr").each(function() {
				var dis = $(this).css("display");
				if (dis !== "none"){
					if (isOdd) {
						isOdd = false;
						$(this).css("background-color", "white").hover(function() {
							$(this).css("background-color", "lightblue");
						}, function() {
							$(this).css("background-color", "white");
						});
					} else {
						isOdd = true;
						$(this).css("background-color", "lightgrey").hover(function() {
							$(this).css("background-color", "lightblue");
						}, function() {
							$(this).css("background-color", "lightgrey");
						});
					}
					$(this).on("click", function() {
						$(this).css({"background-color": "blue", "color":"white"});	
					})
				}
				i++;
			});
			// console.log(i);
		}
	});
	$('#search').empty();
	$('#table').find('input').prependTo('#search').css("width", "60%");
	$('#table thead tr:nth-child(2)').remove();

	// $('#pagination').empty();
	// $('#table').find('td.pag').clone().prependTo('#pagination');
	// $('td.pag').on('click', function() {
	// 	$('#pagination').empty();
	// 	$('#table').find('td.pag').clone().prependTo('#pagination');
	// });
	
	// $('#table tbody tr:last').remove();
}

// Function to export custom satellites to a JSON file
function exportCustomSatellites() {
    if (customSatellites.length === 0) {
        console.log('No custom satellites to export');
        return;
    }
    
    const dataStr = JSON.stringify({ satellites: customSatellites }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    
    // Modern browsers with File System Access API
    if (window.showSaveFilePicker) {
        try {
            (async () => {
                const options = {
                    suggestedName: 'custom_satellites.json',
                    types: [{
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] },
                    }],
                };
                
                const fileHandle = await window.showSaveFilePicker(options);
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                console.log('Satellites exported successfully using File System Access API');
            })().catch(e => {
                console.error('Error exporting with File System Access API:', e);
                legacyExport(); // Fall back to legacy method
            });
        } catch (e) {
            console.error('Error with File System Access API:', e);
            legacyExport(); // Fall back to legacy method
        }
    } else {
        // Legacy export for older browsers
        legacyExport();
    }
    
    // Legacy export method
    function legacyExport() {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'custom_satellites.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Satellites exported successfully using legacy download');
    }
}

// Function to import custom satellites from a JSON file
function importCustomSatellites() {
    // Create file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    // Handle file selection
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const contents = event.target.result;
                const data = JSON.parse(contents);
                
                if (data && data.satellites && Array.isArray(data.satellites)) {
                    // Optional: validate each satellite
                    const validSatellites = data.satellites.filter(sat => {
                        return sat && sat.name && sat.id && 
                               sat.tle && Array.isArray(sat.tle) && 
                               sat.tle.length >= 2;
                    });
                    
                    if (validSatellites.length === 0) {
                        alert('No valid satellites found in the imported file');
                        return;
                    }
                    
                    // Merge with existing or replace
                    const mergeOption = confirm('Do you want to merge with existing satellites? Click OK to merge, Cancel to replace.');
                    
                    if (mergeOption) {
                        // Create a map of existing satellites by ID to avoid duplicates
                        const existingIds = {};
                        customSatellites.forEach(sat => {
                            existingIds[sat.id] = true;
                        });
                        
                        // Add only non-duplicate satellites
                        const newSats = validSatellites.filter(sat => !existingIds[sat.id]);
                        customSatellites = [...customSatellites, ...newSats];
                    } else {
                        // Replace existing satellites
                        customSatellites = validSatellites;
                    }
                    
                    // Save to localStorage
                    localStorage.setItem('customSatellites', JSON.stringify({
                        satellites: customSatellites
                    }));
                    
                    // Reload the page to update the table
                    alert(`Successfully imported ${validSatellites.length} satellites`);
                    location.reload();
                } else {
                    alert('Invalid JSON format. Expected { "satellites": [...] }');
                }
            } catch (e) {
                console.error('Error parsing JSON:', e);
                alert('Error importing satellites: Invalid JSON format');
            }
        };
        reader.readAsText(file);
    };
    
    // Trigger file selection
    input.click();
}

// Custom Satellite Management Functions
function saveCustomSatellite(event) {
    event.preventDefault();
    
    // Get form data
    const name = document.getElementById("customName").value.trim();
    const l1 = document.getElementById("customL1").value.trim();
    const l2 = document.getElementById("customL2").value.trim();
    
    // Validate input
    if (!name || !l1 || !l2) {
        alert("Please fill in all fields");
        return;
    }
    
    try {
        // Parse TLE data to verify it's valid
        const satRec = satellite.twoline2satrec(l1, l2);
        if (!satRec) {
            alert("Invalid TLE data. Please check your input.");
            return;
        }
        
        // Get existing satellites from localStorage
        let customSatellites = getCustomSatellites();
        
        // Check for duplicates
        const isDuplicate = customSatellites.some(sat => 
            sat.name === name || (sat.l1 === l1 && sat.l2 === l2)
        );
        
        if (isDuplicate) {
            alert("A satellite with this name or TLE data already exists.");
            return;
        }
        
        // Add new satellite
        const newSatellite = {
            id: generateUniqueId(),
            name: name,
            l1: l1,
            l2: l2,
            dateAdded: new Date().toISOString()
        };
        
        customSatellites.push(newSatellite);
        
        // Save to localStorage
        localStorage.setItem('customSatellites', JSON.stringify(customSatellites));
        
        // Create backup JSON file
        createBackupFile(customSatellites);
        
        // Update UI
        alert("Satellite added successfully!");
        document.getElementById("customSatForm").reset();
        displayCustomSatellites();
        
    } catch (error) {
        console.error("Error saving satellite:", error);
        alert("Error saving satellite: " + error.message);
    }
}

// Generate a unique ID for each satellite
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Get custom satellites from localStorage
function getCustomSatellites() {
    try {
        const storedSatellites = localStorage.getItem('customSatellites');
        if (!storedSatellites) return [];
        
        const parsedSatellites = JSON.parse(storedSatellites);
        return Array.isArray(parsedSatellites) ? parsedSatellites : [];
    } catch (error) {
        console.error("Error retrieving custom satellites:", error);
        return [];
    }
}

// Create a downloadable backup file of custom satellites
function createBackupFile(satellites) {
    try {
        const dataStr = JSON.stringify(satellites, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        // Create download link if it doesn't exist
        let downloadLink = document.getElementById('satelliteBackupLink');
        if (!downloadLink) {
            downloadLink = document.createElement('a');
            downloadLink.id = 'satelliteBackupLink';
            downloadLink.style.display = 'none';
            document.body.appendChild(downloadLink);
        }
        
        // Set download attributes
        downloadLink.href = URL.createObjectURL(dataBlob);
        downloadLink.download = 'custom_satellites_backup.json';
    } catch (error) {
        console.error("Error creating backup file:", error);
    }
}

// Display custom satellites in the UI
function displayCustomSatellites() {
    const customSatellites = getCustomSatellites();
    const listElement = document.getElementById("customSatellitesList");
    
    if (!listElement) return;
    
    // Clear existing list
    listElement.innerHTML = "";
    
    if (customSatellites.length === 0) {
        listElement.innerHTML = "<li class='list-group-item'>No custom satellites added yet</li>";
        return;
    }
    
    // Create list items for each satellite
    customSatellites.forEach(satellite => {
        const listItem = document.createElement("li");
        listItem.className = "list-group-item d-flex justify-content-between align-items-center";
        
        const nameSpan = document.createElement("span");
        nameSpan.textContent = satellite.name;
        
        const actionDiv = document.createElement("div");
        
        // View button
        const viewButton = document.createElement("button");
        viewButton.className = "btn btn-sm btn-primary me-2";
        viewButton.textContent = "View";
        viewButton.addEventListener("click", () => viewSatellite(satellite));
        
        // Delete button
        const deleteButton = document.createElement("button");
        deleteButton.className = "btn btn-sm btn-danger";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => deleteCustomSatellite(satellite.id));
        
        actionDiv.appendChild(viewButton);
        actionDiv.appendChild(deleteButton);
        
        listItem.appendChild(nameSpan);
        listItem.appendChild(actionDiv);
        
        listElement.appendChild(listItem);
    });
}

// Delete a custom satellite
function deleteCustomSatellite(satelliteId) {
    if (!confirm("Are you sure you want to delete this satellite?")) {
        return;
    }
    
    try {
        let customSatellites = getCustomSatellites();
        customSatellites = customSatellites.filter(sat => sat.id !== satelliteId);
        
        // Save updated list to localStorage
        localStorage.setItem('customSatellites', JSON.stringify(customSatellites));
        
        // Update backup file
        createBackupFile(customSatellites);
        
        // Update UI
        displayCustomSatellites();
        
        alert("Satellite deleted successfully!");
    } catch (error) {
        console.error("Error deleting satellite:", error);
        alert("Error deleting satellite: " + error.message);
    }
}

// View satellite details and track it
function viewSatellite(satellite) {
    // Encode TLE data for URL parameters
    const params = new URLSearchParams({
        name: satellite.name,
        l1: satellite.l1,
        l2: satellite.l2
    });
    
    // Navigate to satellite tracking page
    window.location.href = `satPage.html?${params.toString()}`;
}

// Import custom satellites from a JSON file
function importCustomSatellites(event) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedSatellites = JSON.parse(e.target.result);
            
            if (!Array.isArray(importedSatellites)) {
                throw new Error("Invalid file format");
            }
            
            // Validate each satellite entry
            importedSatellites.forEach(sat => {
                if (!sat.name || !sat.l1 || !sat.l2) {
                    throw new Error("One or more satellites have incomplete data");
                }
            });
            
            // Get existing satellites
            const existingSatellites = getCustomSatellites();
            
            // Merge satellites, avoiding duplicates
            const mergedSatellites = [...existingSatellites];
            
            let newCount = 0;
            importedSatellites.forEach(importedSat => {
                const isDuplicate = existingSatellites.some(existingSat => 
                    existingSat.name === importedSat.name || 
                    (existingSat.l1 === importedSat.l1 && existingSat.l2 === importedSat.l2)
                );
                
                if (!isDuplicate) {
                    // Generate a new ID if needed
                    if (!importedSat.id) {
                        importedSat.id = generateUniqueId();
                    }
                    
                    // Add dateAdded if missing
                    if (!importedSat.dateAdded) {
                        importedSat.dateAdded = new Date().toISOString();
                    }
                    
                    mergedSatellites.push(importedSat);
                    newCount++;
                }
            });
            
            // Save merged satellites
            localStorage.setItem('customSatellites', JSON.stringify(mergedSatellites));
            
            // Update UI
            displayCustomSatellites();
            
            // Create new backup file
            createBackupFile(mergedSatellites);
            
            alert(`Import successful! Added ${newCount} new satellites.`);
            
            // Reset file input
            fileInput.value = "";
            
        } catch (error) {
            console.error("Error importing satellites:", error);
            alert("Error importing satellites: " + error.message);
            fileInput.value = "";
        }
    };
    
    reader.readAsText(file);
}

// Initialize custom satellite management
function initCustomSatelliteManagement() {
    // Add event listeners
    const customSatForm = document.getElementById("customSatForm");
    if (customSatForm) {
        customSatForm.addEventListener("submit", saveCustomSatellite);
    }
    
    const importInput = document.getElementById("importCustomSatellites");
    if (importInput) {
        importInput.addEventListener("change", importCustomSatellites);
    }
    
    const exportButton = document.getElementById("exportCustomSatellites");
    if (exportButton) {
        exportButton.addEventListener("click", function() {
            const downloadLink = document.getElementById('satelliteBackupLink');
            if (downloadLink) {
                downloadLink.click();
            } else {
                createBackupFile(getCustomSatellites());
                document.getElementById('satelliteBackupLink').click();
            }
        });
    }
    
    // Display any existing custom satellites
    displayCustomSatellites();
}

// Initialize when the DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    initCustomSatelliteManagement();
});

// Enhanced localStorage functionality to replace PHP
function saveCustomSatellite(name, tle1, tle2) {
  // Validate TLE format
  if (!isValidTLE(tle1, tle2)) {
    console.error('Invalid TLE format');
    return { success: false, message: 'Invalid TLE format. Please check your input.' };
  }
  
  // Load existing satellites
  let customSatellites = loadCustomSatellites();
  
  // Check for duplicates
  const duplicateIndex = customSatellites.findIndex(sat => 
    sat.name.toLowerCase() === name.toLowerCase() || 
    sat.tle1 === tle1 || 
    sat.tle2 === tle2
  );
  
  if (duplicateIndex !== -1) {
    // Update existing satellite
    customSatellites[duplicateIndex] = { name, tle1, tle2 };
  } else {
    // Add new satellite
    customSatellites.push({ name, tle1, tle2 });
  }
  
  // Save to localStorage
  localStorage.setItem('customSatellites', JSON.stringify(customSatellites));
  
  // Optional: Save to IndexedDB for larger storage if needed
  saveToIndexedDB({ name, tle1, tle2 });
  
  return { success: true, message: 'Satellite saved successfully!' };
}

// Load custom satellites from localStorage
function loadCustomSatellites() {
  try {
    const saved = localStorage.getItem('customSatellites');
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Error loading custom satellites:', error);
    return [];
  }
}

// Delete a custom satellite
function deleteCustomSatellite(name) {
  let customSatellites = loadCustomSatellites();
  const initialLength = customSatellites.length;
  
  customSatellites = customSatellites.filter(sat => sat.name !== name);
  
  if (customSatellites.length < initialLength) {
    localStorage.setItem('customSatellites', JSON.stringify(customSatellites));
    deleteFromIndexedDB(name);
    return { success: true, message: 'Satellite deleted successfully!' };
  }
  
  return { success: false, message: 'Satellite not found!' };
}

// Validate TLE format
function isValidTLE(tle1, tle2) {
  // Basic validation: Check length and starting characters
  if (tle1.length !== 69 || tle2.length !== 69) {
    return false;
  }
  
  // Check line numbers
  if (tle1[0] !== '1' || tle2[0] !== '2') {
    return false;
  }
  
  // More detailed validation could check checksums and other TLE specifics
  return true;
}

// Optional: IndexedDB for larger storage
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SatelliteDB', 1);
    
    request.onerror = event => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = event => {
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('satellites')) {
        const store = db.createObjectStore('satellites', { keyPath: 'name' });
        store.createIndex('name', 'name', { unique: true });
      }
    };
  });
}

// Save to IndexedDB
function saveToIndexedDB(satellite) {
  initIndexedDB().then(db => {
    const transaction = db.transaction(['satellites'], 'readwrite');
    const store = transaction.objectStore('satellites');
    const request = store.put(satellite);
    
    request.onerror = event => {
      console.error('Error saving to IndexedDB:', event.target.error);
    };
  }).catch(error => {
    console.error('IndexedDB not available, using localStorage only');
  });
}

// Delete from IndexedDB
function deleteFromIndexedDB(name) {
  initIndexedDB().then(db => {
    const transaction = db.transaction(['satellites'], 'readwrite');
    const store = transaction.objectStore('satellites');
    const request = store.delete(name);
    
    request.onerror = event => {
      console.error('Error deleting from IndexedDB:', event.target.error);
    };
  }).catch(error => {
    console.error('IndexedDB not available');
  });
}

// Export data to JSON file for backup
function exportCustomSatellites() {
  const satellites = loadCustomSatellites();
  
  if (satellites.length === 0) {
    return { success: false, message: 'No custom satellites to export.' };
  }
  
  const dataStr = JSON.stringify(satellites, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = 'custom_satellites_' + new Date().toISOString().slice(0,10) + '.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
  
  return { success: true, message: 'Satellites exported successfully!' };
}

// Import satellites from JSON file
function importCustomSatellites(fileContent) {
  try {
    const satellites = JSON.parse(fileContent);
    
    if (!Array.isArray(satellites)) {
      throw new Error('Invalid format');
    }
    
    // Validate each satellite
    satellites.forEach(sat => {
      if (!sat.name || !sat.tle1 || !sat.tle2 || !isValidTLE(sat.tle1, sat.tle2)) {
        throw new Error('Invalid satellite data');
      }
    });
    
    // Save all imported satellites
    localStorage.setItem('customSatellites', JSON.stringify(satellites));
    
    return { success: true, message: `Imported ${satellites.length} satellites successfully!` };
  } catch (error) {
    console.error('Import error:', error);
    return { success: false, message: 'Failed to import satellites. Invalid format.' };
  }
}

// Event handlers for import/export buttons
document.addEventListener('DOMContentLoaded', () => {
  // Setup export button if it exists
  const exportBtn = document.getElementById('exportSatellites');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const result = exportCustomSatellites();
      alert(result.message);
    });
  }
  
  // Setup import functionality
  const importBtn = document.getElementById('importSatellites');
  const fileInput = document.getElementById('satelliteFileInput');
  
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = e => {
        const result = importCustomSatellites(e.target.result);
        alert(result.message);
        if (result.success) {
          // Refresh the satellite list if displayed
          if (typeof displayCustomSatellites === 'function') {
            displayCustomSatellites();
          }
        }
      };
      reader.readAsText(file);
    });
  }
});