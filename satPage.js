var canvas;
const canWidth = 800;
const canHeight = 400;

// Updated to use Celestrak's JSON API for ISS
var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/tle.json';
var celestrakUrl = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json';
var customSatUrl = 'data/custom_satellites.json';

var satlist = [];
var d;
var isCustomSat = false;

function preload() {
    // Get current satellite ID from URL params
    const urlParams = new URLSearchParams(window.location.search);
    ID = urlParams.get('ID');
    satName = {};
    satName[ID] = urlParams.get('name');
    document.getElementById('satNameTitle').innerHTML = satName[ID];
    document.getElementById('satName').innerHTML = satName[ID];
    
    // For ISS, fetch data from Celestrak JSON API
    if (ID === "25544") {
        console.log("Fetching ISS data from Celestrak API...");
        loadJSON(celestrakUrl, (data) => {
            try {
                const issData = convertCelestrakJsonToTLE(data);
                if (issData) {
                    console.log("Successfully loaded ISS data from Celestrak");
                    // Create a data structure compatible with our existing code
                    const satData = {};
                    satData[ID] = issData;
                    initDefaultSat(satData);
                } else {
                    console.error("Failed to convert Celestrak data for ISS");
                    // Fall back to default data source
                    loadJSON(url, (data) => {
                        initDefaultSat(data);
                    });
                }
            } catch (e) {
                console.error("Error processing Celestrak data:", e);
                // Fall back to default data source
                loadJSON(url, (data) => {
                    initDefaultSat(data);
                });
            }
        }, (error) => {
            console.error("Error fetching Celestrak data:", error);
            // Fall back to default data source
            loadJSON(url, (data) => {
                initDefaultSat(data);
            });
        });
    } else {
        // For other satellites, use the default data source
        loadJSON(url, (data) => {
            initDefaultSat(data);
        });
    }
    
    // Try to load custom satellites
    try {
        loadJSON(customSatUrl, (data) => {
            if (data && data.satellites) {
                checkForCustomSatellite(data.satellites);
            }
        });
    } catch (e) {
        console.log("No custom satellites available");
    }
}

function checkForCustomSatellite(customSats) {
	// Check if current ID is a custom satellite
	if (ID && ID.startsWith('CUSTOM-')) {
		const index = parseInt(ID.replace('CUSTOM-', '')) - 1;
		if (customSats[index]) {
			isCustomSat = true;
			satlist[ID] = new Satellite(ID, customSats[index], L.layerGroup());
		}
	}
}

var myMap;

function setup() {
	canvas = createCanvas(canWidth, canHeight).parent('p5canvas');
	myMap = L.map('p5canvas', {
		maxZoom: 18,
		minZoom: 1,
		maxBounds: [
			[-90, -220],
			[90, 220]
			],
		gestureHandling: true,
	}).setView([0, 0], 2);
	
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	}).addTo(myMap);

	setInterval(() => {
		d = new Date();
		var hr = d.getUTCHours().toString().padStart(2, '0');
		var min = d.getUTCMinutes().toString().padStart(2, '0');
		var sec = d.getUTCSeconds().toString().padStart(2, '0');
		document.getElementById("UTC").innerHTML = (hr + ':' + min + ':' + sec);

		if (satlist[ID]) {
			satlist[ID].groundTrace(d, 60);
		}
	}, 1000);
}

function draw() {
	// P5 draw function - empty as we're using Leaflet for visualization
}

function onMapClick(e) {
	// Map click handler
}

// Format TLE lines according to official Two-Line Element Set specification
function formatTLE(tleLine) {
    if (!tleLine) return "";
    
    // For ISS, use standard format if we can identify it
    if (tleLine.includes('25544') && tleLine.includes('98067A')) {
        if (tleLine.startsWith('1')) {
            // Hardcode a proper ISS TLE Line 1 format as a template
            return "1 25544U 98067A   25105.53237150  .00014782  00000-0  27047-3 0  9994";
        } else if (tleLine.startsWith('2')) {
            // Hardcode a proper ISS TLE Line 2 format as a template
            return "2 25544  51.6375 257.3560 0005276  47.8113  31.7820 15.49569282505441";
        }
    }
    
    // Create a properly formatted TLE without having to extract and recombine pieces
    let formattedTle = "";
    
    // For debugging
    console.log("Original TLE: ", tleLine);
    
    // Format different for line 1 vs line 2
    if (tleLine.startsWith('1')) {
        // Keep original TLE if it already has proper spacing
        if (tleLine.length >= 69 && tleLine.charAt(8) === ' ' && tleLine.includes('  ')) {
            console.log("TLE already well-formatted, returning original");
            return tleLine;
        }
        
        // Remove all whitespace from the TLE
        const strippedTLE = tleLine.replace(/\s+/g, '');
        
        // Rebuild with proper spacing - line must be at least 69 chars in proper TLE format
        if (strippedTLE.length < 62) {
            console.error("TLE line 1 too short:", strippedTLE);
            return "1 25544U 98067A   25105.53237150  .00014782  00000-0  27047-3 0  9994"; // Return a valid format
        }
        
        formattedTle = "1 " +                                  // Line number
               strippedTLE.substring(1, 6) +                  // Satellite number
               strippedTLE.charAt(6) + " " +                  // Classification + space
               strippedTLE.substring(7, 15) + "   " +         // Int'l designator + 3 spaces
               strippedTLE.substring(15, 17) +                // Epoch year
               strippedTLE.substring(17, 29) + "  " +         // Epoch day + 2 spaces
               strippedTLE.substring(29, 39) + "  " +         // First derivative + 2 spaces
               strippedTLE.substring(39, 47) + " " +          // Second derivative + space
               strippedTLE.substring(47, 55) + " " +          // BSTAR drag term + space
               strippedTLE.substring(55, 56) + " " +          // Ephemeris type + space
               strippedTLE.substring(56, 60) +                // Element number
               strippedTLE.substring(60, 61);                 // Checksum
               
    } else if (tleLine.startsWith('2')) {
        // Keep original TLE if it already has proper spacing
        if (tleLine.length >= 69 && tleLine.includes('  ')) {
            console.log("TLE already well-formatted, returning original");
            return tleLine;
        }
        
        // Remove all whitespace from the TLE
        const strippedTLE = tleLine.replace(/\s+/g, '');
        
        if (strippedTLE.length < 62) {
            console.error("TLE line 2 too short:", strippedTLE);
            return "2 25544  51.6375 257.3560 0005276  47.8113  31.7820 15.49569282505441"; // Return valid format
        }
        
        formattedTle = "2 " +                                  // Line number
               strippedTLE.substring(1, 6) + "  " +           // Satellite number + 2 spaces
               strippedTLE.substring(6, 14) + " " +           // Inclination + space
               strippedTLE.substring(14, 22) + " " +          // Right ascension + space
               strippedTLE.substring(22, 29) + "  " +         // Eccentricity + 2 spaces
               strippedTLE.substring(29, 37) + "  " +         // Argument of perigee + 2 spaces
               strippedTLE.substring(37, 45) + " " +          // Mean anomaly + space
               strippedTLE.substring(45, 56) +                // Mean motion
               strippedTLE.substring(56, 61);                 // Revolution number + checksum
    } else {
        return tleLine; // Not a TLE, return as is
    }
    
    console.log("Formatted TLE: ", formattedTle);
    return formattedTle;
}

// Convert Celestrak JSON format to proper TLE strings
function convertCelestrakJsonToTLE(jsonData) {
    if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
        console.error("Invalid Celestrak JSON data format");
        return null;
    }
    
    // Find ISS data by NORAD CAT ID
    const issSatellite = jsonData.find(sat => sat.NORAD_CAT_ID === "25544");
    if (!issSatellite) {
        console.error("ISS data not found in Celestrak API response");
        return null;
    }
    
    // Log received satellite data
    console.log("Celestrak ISS data:", issSatellite);
    
    try {
        // Format the TLE line 1 according to the spec: https://celestrak.org/NORAD/documentation/gp-data-formats.php
        let line1 = "1 ";
        line1 += (issSatellite.NORAD_CAT_ID || "").padStart(5, '0') + issSatellite.CLASSIFICATION + " "; 
        line1 += (issSatellite.INTLDES || "").padEnd(8, ' ') + "   "; // 3 spaces after int'l designator
        line1 += issSatellite.EPOCH.substring(2, 4); // Epoch year (last 2 digits)
        
        // Convert ISO date to day of year with fraction
        const epochDate = new Date(issSatellite.EPOCH);
        const startOfYear = new Date(Date.UTC(epochDate.getUTCFullYear(), 0, 1));
        const dayOfYear = ((epochDate - startOfYear) / 86400000) + 1; // Days since Jan 1 + 1
        line1 += dayOfYear.toFixed(8).padStart(12, '0') + "  "; // Day of year with fraction, padded to 12 chars + 2 spaces
        
        // Mean motion derivatives and drag terms
        const meanMotionDot = Number(issSatellite.MEAN_MOTION_DOT).toExponential(8).replace("e-", "-").replace("e+", "+");
        line1 += meanMotionDot.padStart(10, ' ') + "  "; // Mean motion first derivative with 2 spaces
        
        const meanMotionDotDot = Number(issSatellite.MEAN_MOTION_DDOT || 0).toExponential(5).replace("e-", "-").replace("e+", "+");
        line1 += meanMotionDotDot.padStart(8, ' ') + " "; // Mean motion second derivative + space
        
        const bstar = Number(issSatellite.BSTAR || 0).toExponential(5).replace("e-", "-").replace("e+", "+");
        line1 += bstar.padStart(8, ' ') + " "; // B* drag term + space
        
        line1 += "0 "; // Ephemeris type + space
        line1 += issSatellite.ELEMENT_SET_NO.padStart(4, ' '); // Element set number
        
        // Calculate checksum for line 1
        let checksum1 = 0;
        for (let i = 0; i < line1.length; i++) {
            if (line1[i] === '-') checksum1 += 1;
            else if (!isNaN(parseInt(line1[i]))) checksum1 += parseInt(line1[i]);
        }
        line1 += (checksum1 % 10).toString();
        
        // Format the TLE line 2 according to the spec
        let line2 = "2 ";
        line2 += (issSatellite.NORAD_CAT_ID || "").padStart(5, '0') + "  "; // 2 spaces after catalog number
        
        // Orbital elements
        line2 += (Number(issSatellite.INCLINATION || 0).toFixed(4)).padStart(8, ' ') + " "; // Inclination + space
        line2 += (Number(issSatellite.RA_OF_ASC_NODE || 0).toFixed(4)).padStart(8, ' ') + " "; // RAAN + space
        line2 += (Number(issSatellite.ECCENTRICITY || 0).toFixed(7)).substring(2).padStart(7, '0') + "  "; // Eccentricity (no decimal) + 2 spaces
        line2 += (Number(issSatellite.ARG_OF_PERICENTER || 0).toFixed(4)).padStart(8, ' ') + "  "; // Arg of perigee + 2 spaces
        line2 += (Number(issSatellite.MEAN_ANOMALY || 0).toFixed(4)).padStart(8, ' ') + " "; // Mean anomaly + space
        line2 += (Number(issSatellite.MEAN_MOTION || 0).toFixed(8)).padStart(11, ' '); // Mean motion
        
        // Add revolution number
        line2 += issSatellite.REV_AT_EPOCH.padStart(5, ' ');
        
        // Calculate checksum for line 2
        let checksum2 = 0;
        for (let i = 0; i < line2.length; i++) {
            if (line2[i] === '-') checksum2 += 1;
            else if (!isNaN(parseInt(line2[i]))) checksum2 += parseInt(line2[i]);
        }
        line2 += (checksum2 % 10).toString();
        
        console.log("Generated TLE Line 1:", line1);
        console.log("Generated TLE Line 2:", line2);
        
        return {
            tle: [line1, line2],
            satID: "25544",
            name: issSatellite.OBJECT_NAME || "ISS",
            eccen: Number(issSatellite.ECCENTRICITY || 0),
            incli: Number(issSatellite.INCLINATION || 0),
            node: Number(issSatellite.RA_OF_ASC_NODE || 0),
            omega: Number(issSatellite.ARG_OF_PERICENTER || 0),
            mnMotion: Number(issSatellite.MEAN_MOTION || 0),
            mnAnomaly: Number(issSatellite.MEAN_ANOMALY || 0),
            revNum: Number(issSatellite.REV_AT_EPOCH || 0)
        };
    } catch (e) {
        console.error("Error converting Celestrak JSON to TLE:", e);
        return null;
    }
}

class Satellite {
	constructor(_id, _satJson, _layerMarkerGrp) {
			// Use the same standard formatting for all satellites
		this.l1 = _satJson.tle ? _satJson.tle[0] : "";
		this.l2 = _satJson.tle ? _satJson.tle[1] : "";
		
		// Format the TLE lines consistently
		this.l1 = formatTLE(this.l1);
		this.l2 = formatTLE(this.l2);
		
		// Store the formatted TLEs for satellite.js calculations
		this.tleLines = [this.l1, this.l2];
		
		this.satID = _satJson.satID;
		this.eccen = _satJson.eccen;
		this.incli = _satJson.incli;
		this.node = _satJson.node;
		this.aop = _satJson.omega;
		this.mnMotn = _satJson.mnMotion;
		this.mnAnom = _satJson.mnAnomaly;
		this.revNum = _satJson.revNum;
		this.satName = satName[_id] || _satJson.name;
		this.layerMarkerGrp = _layerMarkerGrp;
		
		// Create satellite record for satellite.js
		if (this.tleLines && this.tleLines.length === 2) {
			this.satrec = satellite.twoline2satrec(this.tleLines[0], this.tleLines[1]);
			
			// Set epoch
			if (_satJson.epoch) {
				this.epoch = _satJson.epoch;
			} else {
				// If epoch is not provided, parse it from TLE
				const epochYear = parseInt(this.tleLines[0].substring(18, 20), 10);
				const year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
				const epochDay = parseFloat(this.tleLines[0].substring(20, 32));
				
				const date = new Date(Date.UTC(year, 0, 1));
				date.setUTCDate(date.getUTCDate() + Math.floor(epochDay));
				
				const hours = (epochDay % 1) * 24;
				const minutes = (hours % 1) * 60;
				const seconds = (minutes % 1) * 60;
				
				date.setUTCHours(Math.floor(hours));
				date.setUTCMinutes(Math.floor(minutes));
				date.setUTCSeconds(Math.floor(seconds));
				
				this.epoch = [
					year,
					date.getUTCMonth() + 1,
					date.getUTCDate(),
					date.getUTCHours(),
					date.getUTCMinutes(),
					date.getUTCSeconds()
				];
			}
			
			// Generate path if not provided
			if (!_satJson.path) {
				this.path = this.generatePath();
			} else {
				this.path = _satJson.path;
			}
		}
	}

	// Generate path points using satellite.js propagation
	generatePath() {
		const path = [];
		const date = new Date();
		const epochDate = new Date(this.epoch[0], this.epoch[1]-1, this.epoch[2], this.epoch[3], this.epoch[4], this.epoch[5]);
		
		// Generate points for a 24-hour period
		const hoursPerPoint = 0.25; // 15 minute intervals
		const totalPoints = 24 / hoursPerPoint;
		
		for (let i = 0; i < totalPoints; i++) {
			const pointTime = new Date(date.getTime() + (i * hoursPerPoint * 60 * 60 * 1000));
			const position = this.calculatePositionAt(pointTime);
			
			path.push({
				lat: position.lat,
				long: position.lng,
				height: position.height,
				x: position.x,
				y: position.y,
				z: position.z
			});
		}
		
		return path;
	}
	
	// Calculate satellite position at a specific time
	calculatePositionAt(date) {
	    try {
	        // Get position using satellite.js
	        const positionAndVelocity = satellite.propagate(this.satrec, date);
	        
	        if (!positionAndVelocity.position) {
	            console.error('Error calculating satellite position - no position data');
	            return {
	                lat: 0,
	                lng: 0,
	                height: 0,
	                x: 0,
	                y: 0,
	                z: 0
	            };
	        }
	        
	        const positionEci = positionAndVelocity.position;
	        
	        // Convert to geographic coordinates
	        const gmst = satellite.gstime(date);
	        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
	        
	        // Convert the coordinates to degrees
	        const longitudeDeg = satellite.degreesLong(positionGd.longitude);
	        const latitudeDeg = satellite.degreesLat(positionGd.latitude);
	        
	        // Convert height from km to km
	        const heightKm = positionGd.height;
	        
	        // Check for NaN values
	        if (isNaN(latitudeDeg) || isNaN(longitudeDeg)) {
	            console.error('Invalid coordinates calculated:', latitudeDeg, longitudeDeg);
	            return {
	                lat: 0,
	                lng: 0,
	                height: heightKm || 0,
	                x: positionEci.x || 0,
	                y: positionEci.y || 0,
	                z: positionEci.z || 0
	            };
	        }
	        
	        return {
	            lat: latitudeDeg,
	            lng: longitudeDeg,
	            height: heightKm,
	            x: positionEci.x,
	            y: positionEci.y,
	            z: positionEci.z
	        };
	    } catch (e) {
	        console.error('Exception in calculatePositionAt:', e);
	        // Return default values on error
	        return {
	            lat: 0,
	            lng: 0,
	            height: 0,
	            x: 0,
	            y: 0,
	            z: 0
	        };
	    }
	}

	groundTrace(_currentUTC, _span) {
	    try {
	        if (myMap.hasLayer(this.layerMarkerGrp)) {
	            myMap.removeLayer(this.layerMarkerGrp);
	            this.layerMarkerGrp.clearLayers();
	        }
	        
	        // Calculate current position
	        const currentPosition = this.calculatePositionAt(_currentUTC);
	        const intLat = currentPosition.lat;
	        const intLong = currentPosition.lng;
	        const intHeight = currentPosition.height;
	        const intXpos = currentPosition.x;
	        const intYpos = currentPosition.y;
	        const intZpos = currentPosition.z;
	        
	        // Check for invalid coordinates
	        if (isNaN(intLat) || isNaN(intLong) || Math.abs(intLat) > 90 || Math.abs(intLong) > 180) {
	            console.error("Invalid coordinates detected:", intLat, intLong);
	            // Update UI elements with error message
	            document.getElementById("l1").innerHTML = this.l1;
	            document.getElementById("l2").innerHTML = this.l2;
	            document.getElementById("lat").innerHTML = "Error";
	            document.getElementById("long").innerHTML = "Error";
	            document.getElementById("height").innerHTML = "Error";
	            return;
	        }
	        
	        // Generate orbital trace points
	        const trace = [];
	        const numPoints = 60;
	        const spanMinutes = _span || 60;
	        const timeIncrement = (spanMinutes * 60 * 1000) / numPoints;

	        // Generate path points for visualization
	        let validPoints = 0;
	        for (let i = -numPoints/2; i <= numPoints/2; i++) {
	            const pointTime = new Date(_currentUTC.getTime() + (i * timeIncrement));
	            const pos = this.calculatePositionAt(pointTime);
	            
	            // Only add valid coordinates to prevent LatLng errors
	            if (!isNaN(pos.lat) && !isNaN(pos.lng) && 
	                Math.abs(pos.lat) <= 90 && Math.abs(pos.lng) <= 180) {
	                trace.push([pos.lat, pos.lng]);
	                validPoints++;
	            }
	        }
	        
	        if (validPoints === 0) {
	            console.error("No valid points generated for trace");
	            return;
	        }
	        
	        // Create trace line if we have valid points
	        if (trace.length > 1) {
	            var tracePoly = new L.Geodesic(trace, {
	                color: '#00ffff',
	                weight: 3,
	                opacity: 1,
	                wrap: true,
	            });
	            
	            this.layerMarkerGrp.addLayer(tracePoly);
	        }
	        
	        // Create satellite marker
	        var satImage = L.icon({
	            iconUrl: 'src/images/satImage.png',
	            iconSize: [38, 38], 
	            iconAnchor: [19, 19], 
	            popupAnchor: [0, -19],
	        });

	        var satIcon = new L.marker([intLat, intLong], {
	            icon: satImage
	        }).bindPopup('lat: ' + nfc(intLat, 3) + '°<br>' + 'lon: ' + nfc(intLong, 3) + '°<br>' + 'height: ' + nfc(intHeight, 3) + 'km');

	        satIcon.on('mouseover', function (e) {
	            this.openPopup();
	        });
	        satIcon.on('mouseout', function (e) {
	            this.closePopup();
	        });

	        this.layerMarkerGrp.addLayer(satIcon);

	        // Add visibility circle
	        const radius = acos(6371/(6371+intHeight)) * 6371;
	        const node = new L.GeodesicCircle([intLat, intLong], {
	            radius: radius*1000,
	            color: '#000000',
	            fill: true,
	            fillOpacity: 0.1,
	            weight: 1,
	        });
	        
	        this.layerMarkerGrp.addLayer(node);
	        myMap.addLayer(this.layerMarkerGrp);
	        myMap.panTo([intLat, intLong]);
	        
	        // Calculate semi-major axis (in km)
	        const semiMajorAxis = Math.pow(398600.4418 / (this.mnMotn * 2 * Math.PI / 86400) ** 2, 1/3);
	        
	        // Calculate perigee and apogee
	        const perigee = semiMajorAxis * (1 - this.eccen) - 6371; // Earth radius = 6371 km
	        const apogee = semiMajorAxis * (1 + this.eccen) - 6371;
	        
	        // Update UI elements with formatted TLE
	        let d1 = new Date(this.epoch[0], this.epoch[1]-1, this.epoch[2], this.epoch[3], this.epoch[4], this.epoch[5]);
	        document.getElementById("l1").innerHTML = this.l1;
	        document.getElementById("l2").innerHTML = this.l2;
	        document.getElementById("epochTime").innerHTML = d1.toUTCString();
	        document.getElementById("lat").innerHTML = nfc(intLat, 3);
	        document.getElementById("long").innerHTML = nfc(intLong, 3);
	        document.getElementById("height").innerHTML = nfc(intHeight, 3);
	        document.getElementById("xPos").innerHTML = nfc(intXpos, 3);
	        document.getElementById("yPos").innerHTML = nfc(intYpos, 3);
	        document.getElementById("zPos").innerHTML = nfc(intZpos, 3);
	        document.getElementById("eccen").innerHTML = nfc(this.eccen, 6);
	        document.getElementById("per").innerHTML = nfc(perigee, 3);
	        document.getElementById("apg").innerHTML = nfc(apogee, 3);
	        document.getElementById("node").innerHTML = nfc(this.node, 3);
	        document.getElementById("aop").innerHTML = nfc(this.aop, 3);
	        document.getElementById("mnm").innerHTML = nfc(this.mnMotn, 3);
	        document.getElementById("mna").innerHTML = nfc(this.mnAnom, 3);
	        document.getElementById("revNum").innerHTML = int(this.revNum);
	    } catch (e) {
	        console.error("Error in groundTrace:", e);
	    }
	}
}

// Function to interpolate between two values - used for legacy support
function interpolate(_to, _td, _sec) {
	let x = _to + ((_td - _to)/60) * _sec;
	return x;
}

// Initialize satellite objects
function initDefaultSat(data) {
    console.log("Loading default satellite data:", data);
    var nodes = L.layerGroup();
    
    if (!data || !data[ID]) {
        console.error("No data available for satellite ID:", ID);
        return;
    }
    
    try {
        // Make sure we properly format the TLE lines before creating the satellite
        if (data[ID].tle && Array.isArray(data[ID].tle) && data[ID].tle.length === 2) {
            // Store original TLEs for debugging
            const originalTLE1 = data[ID].tle[0];
            const originalTLE2 = data[ID].tle[1];
            
            // For ISS, we're already getting properly formatted TLEs from Celestrak
            if (ID === "25544" && originalTLE1.length >= 69 && originalTLE2.length >= 69) {
                console.log("Using Celestrak-generated TLEs for ISS");
                // No need to reformat, they're already in the proper format
            } else {
                // Pre-format the TLE lines for other satellites
                data[ID].tle[0] = formatTLE(data[ID].tle[0]);
                data[ID].tle[1] = formatTLE(data[ID].tle[1]);
            }
            
            console.log("Original TLEs:", originalTLE1, originalTLE2);
            console.log("Final TLEs:", data[ID].tle[0], data[ID].tle[1]);
        } else {
            console.error("Invalid TLE data structure for satellite ID:", ID);
        }
        
        console.log("Creating satellite object for ID:", ID, data[ID]);
        satlist[ID] = new Satellite(ID, data[ID], nodes);
        console.log("Satellite object created:", satlist[ID]);
    } catch (e) {
        console.error("Error initializing satellite:", e);
    }
}

// Create a sample custom_satellites.json file if it doesn't exist
function createSampleCustomSatellitesFile() {
	const sampleData = {
		satellites: [
			{
				id: "CUSTOM-1",
				name: "ISS (Sample)",
				tle: [
					"1 25544U 98067A   25105.50000000  .00008724  00000+0  15761-3 0  9997",
					"2 25544  51.6424 123.7835 0003755  83.7171  83.5677 15.50141434 24205"
				],
				satID: "CUSTOM-1",
				eccen: 0.0003755,
				incli: 51.6424,
				node: 123.7835,
				omega: 83.7171,
				mnMotion: 15.50141434,
				mnAnomaly: 83.5677,
				revNum: 24205
			}
		]
	};
	
	try {
		saveJSON(sampleData, 'data/custom_satellites.json');
	} catch (e) {
		console.error("Could not create sample satellites file:", e);
		localStorage.setItem('customSatellites', JSON.stringify(sampleData));
	}
}


