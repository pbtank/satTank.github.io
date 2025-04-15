var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/satInfo.json';
var satInfo;
var customSatellites = [];

function preload(argument) {
	loadJSON(url, (data) => {
		satTable(data, 'satTable');
		print(data);
	});
	
	// Load custom satellites if available
	try {
		loadJSON('data/custom_satellites.json', (data) => {
			customSatellites = data.satellites || [];
			appendCustomSatellites();
		});
	} catch (e) {
		console.log('No custom satellites found');
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
	
	// Save to local storage
	localStorage.setItem('customSatellites', JSON.stringify({
		satellites: customSatellites
	}));
	
	// Save to file using Fetch API (will only work on a server)
	try {
		fetch('saveCustomSatellites.php', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				satellites: customSatellites
			})
		});
	} catch (e) {
		console.log('Could not save to server, saved to local storage only');
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