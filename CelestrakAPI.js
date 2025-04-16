/**
 * CelestrakAPI.js
 * A module for fetching, processing and handling satellite data from Celestrak API
 */

class CelestrakAPI {
    constructor() {
        // Base URLs for Celestrak API
        this.baseUrl = 'https://celestrak.org/NORAD/elements/gp.php';
        this.satcatUrl = 'https://celestrak.org/pub/satcat.txt';
        
        // Common satellite groups
        this.satelliteGroups = {
            'stations': 'stations',
            'weather': 'weather',
            'noaa': 'noaa',
            'goes': 'goes',
            'resource': 'resource',
            'sarsat': 'sarsat',
            'dmc': 'dmc',
            'tdrss': 'tdrss',
            'argos': 'argos',
            'planet': 'planet',
            'spire': 'spire',
            'active': 'active',
            'starlink': 'starlink',
            'oneweb': 'oneweb',
            'gps-ops': 'gps-ops',
            'glo-ops': 'glo-ops',
            'galileo': 'galileo',
            'beidou': 'beidou',
            'sbas': 'sbas',
            'nnss': 'nnss',
            'musson': 'musson',
            'military': 'military'
        };
        
        // Define classifications for grouping
        this.satelliteClassifications = {
            'stations': 'Space Stations',
            'weather': 'Weather Satellites',
            'navigation': 'Navigation Satellites',
            'communication': 'Communication Satellites',
            'earth-observation': 'Earth Observation',
            'military': 'Military Satellites',
            'other': 'Other Satellites'
        };
        
        // Mapping between groups and classifications
        this.groupToClassification = {
            'stations': 'stations',
            'weather': 'weather',
            'noaa': 'weather',
            'goes': 'weather',
            'resource': 'earth-observation',
            'sarsat': 'earth-observation',
            'dmc': 'earth-observation',
            'tdrss': 'communication',
            'argos': 'communication',
            'planet': 'earth-observation',
            'spire': 'earth-observation',
            'active': 'other',
            'starlink': 'communication',
            'oneweb': 'communication',
            'gps-ops': 'navigation',
            'glo-ops': 'navigation',
            'galileo': 'navigation',
            'beidou': 'navigation',
            'sbas': 'navigation',
            'nnss': 'navigation',
            'musson': 'navigation',
            'military': 'military'
        };
    }
    
    /**
     * Fetch satellite data from Celestrak by group
     * @param {string} group - Name of the satellite group (e.g., 'stations', 'starlink')
     * @param {string} format - Return format ('json', 'tle', or '3le') 
     * @returns {Promise} - Promise containing the data
     */
    async fetchSatellitesByGroup(group, format = 'json') {
        if (!this.satelliteGroups[group.toLowerCase()]) {
            throw new Error(`Unknown satellite group: ${group}`);
        }
        
        const url = `${this.baseUrl}?GROUP=${group}&FORMAT=${format}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            if (format === 'json') {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error(`Error fetching ${group} satellites:`, error);
            throw error;
        }
    }
    
    /**
     * Fetch satellite data by NORAD ID
     * @param {string|number} id - NORAD catalog ID
     * @param {string} format - Return format ('json', 'tle', or '3le') 
     * @returns {Promise} - Promise containing the data
     */
    async fetchSatelliteById(id, format = 'json') {
        const url = `${this.baseUrl}?CATNR=${id}&FORMAT=${format}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            if (format === 'json') {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error(`Error fetching satellite ${id}:`, error);
            throw error;
        }
    }
    
    /**
     * Fetches and classifies satellites from multiple groups
     * @returns {Promise<Object>} - Promise containing classified satellite data
     */
    async fetchAndClassifySatellites() {
        const classifiedSatellites = {};
        
        // Initialize classifications
        Object.keys(this.satelliteClassifications).forEach(key => {
            classifiedSatellites[key] = {
                name: this.satelliteClassifications[key],
                satellites: []
            };
        });
        
        // Fetch data for each group
        const fetchPromises = [];
        for (const group of Object.keys(this.satelliteGroups)) {
            fetchPromises.push(
                this.fetchSatellitesByGroup(group, 'json')
                    .then(data => {
                        if (!Array.isArray(data)) {
                            data = [data];
                        }
                        
                        // Get the classification for this group
                        const classification = this.groupToClassification[group] || 'other';
                        
                        // Add each satellite to the appropriate classification
                        data.forEach(sat => {
                            if (sat && sat.OBJECT_NAME && sat.NORAD_CAT_ID) {
                                classifiedSatellites[classification].satellites.push({
                                    id: sat.NORAD_CAT_ID,
                                    name: sat.OBJECT_NAME,
                                    group: group,
                                    tle: {
                                        line1: sat.TLE_LINE1 || '',
                                        line2: sat.TLE_LINE2 || ''
                                    }
                                });
                            }
                        });
                    })
                    .catch(err => {
                        console.error(`Error fetching ${group} satellites:`, err);
                        return []; // Return empty array on error
                    })
            );
        }
        
        // Wait for all fetches to complete
        await Promise.allSettled(fetchPromises);
        
        return classifiedSatellites;
    }
    
    /**
     * Convert JSON satellite data from Celestrak to TLE format
     * @param {Object} satJson - Satellite data in JSON format 
     * @returns {Array} - Array containing two TLE strings
     */
    jsonToTLE(satJson) {
        // If it's an array, process the first item
        if (Array.isArray(satJson) && satJson.length > 0) {
            satJson = satJson[0];
        }
        
        // Ensure we have a valid object
        if (!satJson || typeof satJson !== 'object') {
            throw new Error('Invalid satellite JSON data');
        }
        
        // Extract required fields from JSON
        const {
            OBJECT_NAME,
            OBJECT_ID,
            EPOCH,
            MEAN_MOTION,
            ECCENTRICITY,
            INCLINATION,
            RA_OF_ASC_NODE,
            ARG_OF_PERICENTER,
            MEAN_ANOMALY,
            EPHEMERIS_TYPE,
            CLASSIFICATION_TYPE,
            NORAD_CAT_ID,
            ELEMENT_SET_NO,
            REV_AT_EPOCH,
            BSTAR,
            MEAN_MOTION_DOT,
            MEAN_MOTION_DDOT
        } = satJson;
        
        // Process international designator from OBJECT_ID (e.g., "1998-067A")
        const idMatch = OBJECT_ID ? OBJECT_ID.match(/(\d{4})-(\d+)(\w*)/) : null;
        const launchYear = idMatch ? idMatch[1].slice(-2) : '00';
        const launchNum = idMatch ? idMatch[2].padStart(3, '0') : '000';
        const launchPiece = idMatch ? idMatch[3].padEnd(3, ' ') : 'AAA';
        
        // Format TLE Line 1
        const noradIdString = String(satJson.NORAD_CAT_ID).padStart(5, '0');
        const line1 = [
            '1 ',
            noradIdString,
            CLASSIFICATION_TYPE || 'U',
            ' ',
            launchYear,
            launchNum,
            launchPiece,
            ' ',
            formatEpoch(EPOCH),
            ' ',
            formatScientific(MEAN_MOTION_DOT, 10, 8),
            ' ',
            formatScientific(MEAN_MOTION_DDOT, 8, 1),
            ' ',
            formatScientific(BSTAR, 8, 1),
            ' ',
            EPHEMERIS_TYPE || '0',
            String(ELEMENT_SET_NO).padStart(4, ' '),
            calculateChecksum(1, NORAD_CAT_ID, CLASSIFICATION_TYPE, launchYear, launchNum, launchPiece, 
                             EPOCH, MEAN_MOTION_DOT, MEAN_MOTION_DDOT, BSTAR, EPHEMERIS_TYPE, ELEMENT_SET_NO)
        ].join('');
        
        // Format TLE Line 2
        const line2 = [
            '2 ',
            String(NORAD_CAT_ID).padStart(5, '0'),
            ' ',
            formatDegrees(INCLINATION, 8, 4),
            ' ',
            formatDegrees(RA_OF_ASC_NODE, 8, 4),
            ' ',
            formatDecimal(ECCENTRICITY, 7),
            ' ',
            formatDegrees(ARG_OF_PERICENTER, 8, 4),
            ' ',
            formatDegrees(MEAN_ANOMALY, 8, 4),
            ' ',
            formatRevs(MEAN_MOTION, 11, 8),
            String(REV_AT_EPOCH).padStart(5, '0'),
            calculateChecksum(2, NORAD_CAT_ID, INCLINATION, RA_OF_ASC_NODE, ECCENTRICITY, 
                             ARG_OF_PERICENTER, MEAN_ANOMALY, MEAN_MOTION, REV_AT_EPOCH)
        ].join('');
        
        return [line1, line2];
    }
    
    /**
     * Parse raw TLE text data into an array of TLE pairs
     * @param {string} tleText - Raw TLE data as text
     * @returns {Array} - Array of TLE pairs [line1, line2]
     */
    parseTLEText(tleText) {
        const lines = tleText.trim().split('\n');
        const tles = [];
        
        for (let i = 0; i < lines.length; i += 3) {
            // Check if we have enough lines for a complete TLE set
            if (i + 2 < lines.length) {
                // Skip title line (if exists) and take the two TLE lines
                const titleLine = lines[i].startsWith('1 ') ? '' : lines[i];
                const line1 = lines[i].startsWith('1 ') ? lines[i] : lines[i+1];
                const line2 = lines[i].startsWith('1 ') ? lines[i+1] : lines[i+2];
                
                // Validate TLE lines
                if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
                    tles.push({
                        title: titleLine.trim(),
                        line1: line1.trim(),
                        line2: line2.trim()
                    });
                }
            }
        }
        
        return tles;
    }
    
    /**
     * Get a list of available satellite groups
     * @returns {Object} - Object containing group names and IDs
     */
    getAvailableGroups() {
        return {...this.satelliteGroups};
    }
    
    /**
     * Extract orbital parameters from TLE data
     * @param {string} line1 - TLE line 1
     * @param {string} line2 - TLE line 2
     * @returns {Object} - Object containing orbital parameters
     */
    static extractOrbitalParameters(line1, line2) {
        // Create a satellite record using satellite.js library
        const satrec = satellite.twoline2satrec(line1, line2);
        
        // Extract epoch
        const epochYear = parseInt(line1.substring(18, 20), 10);
        const year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
        const epochDay = parseFloat(line1.substring(20, 32));
        
        // Calculate date from day of year
        const date = new Date(Date.UTC(year, 0, 1));
        date.setUTCDate(date.getUTCDate() + Math.floor(epochDay));
        
        const hours = (epochDay % 1) * 24;
        const minutes = (hours % 1) * 60;
        const seconds = (minutes % 1) * 60;
        
        date.setUTCHours(Math.floor(hours));
        date.setUTCMinutes(Math.floor(minutes));
        date.setUTCSeconds(Math.floor(seconds));
        
        // Extract other parameters from line 2
        const incli = parseFloat(line2.substring(8, 16));
        const node = parseFloat(line2.substring(17, 25));
        const eccen = parseFloat("0." + line2.substring(26, 33));
        const omega = parseFloat(line2.substring(34, 42));
        const mnAnomaly = parseFloat(line2.substring(43, 51));
        const mnMotion = parseFloat(line2.substring(52, 63));
        const revNum = parseInt(line2.substring(63, 68));
        
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
            revNum: revNum,
            satrec: satrec
        };
    }

    async fetchSatelliteById(id) {
        try {
            // Fetch all Celestrak data
            const allSatellites = await this.loadAllCelestrakData();
            
            // Find the satellite by ID
            const satellite = allSatellites.find(sat => sat.NORAD_CAT_ID === id);
            
            if (satellite) {
                console.log(`Found satellite with ID ${id}:`, satellite);
                return satellite;
            } else {
                console.log(`Satellite with ID ${id} not found in Celestrak data`);
                return null;
            }
        } catch (error) {
            console.error("Error fetching satellite data:", error);
            // Fallback to default data source
            console.log("Falling back to default data source");
            return null;
        }
    }

    async loadAllCelestrakData() {
        const categories = Object.keys(this.satelliteGroups);
        const fetchPromises = categories.map(category => this.fetchSatellitesByGroup(category, 'json'));
    
        try {
            const results = await Promise.all(fetchPromises);
            // Flatten the array of arrays into a single array of satellites
            const allSatellites = results.flat();
            return allSatellites;
        } catch (error) {
            console.error('Error loading all Celestrak data:', error);
            return [];
        }
    }
}

// Helper functions for TLE formatting

/**
 * Format epoch date for TLE
 */
function formatEpoch(epochStr) {
    const date = new Date(epochStr);
    const year = date.getUTCFullYear().toString().substr(2, 2);
    
    // Calculate day of year
    const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const diff = date - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay) + 1;
    
    // Calculate fraction of day
    const fracDay = (date.getUTCHours() / 24) + 
                    (date.getUTCMinutes() / 1440) + 
                    (date.getUTCSeconds() / 86400);
    
    // Format as YY.DDDDDDDD with 8 decimal places
    const dayWithFraction = dayOfYear + fracDay;
    return year + dayWithFraction.toFixed(8).substr(1);
}

/**
 * Format scientific notation for TLE
 */
function formatScientific(value, width, decimals) {
    if (value === undefined || value === null) {
        return ''.padStart(width, ' ');
    }
    
    // Convert to string with appropriate format
    const absValue = Math.abs(value);
    let exponent = Math.floor(Math.log10(absValue));
    let mantissa = absValue / Math.pow(10, exponent);
    
    // Handle special cases
    if (isNaN(mantissa) || isNaN(exponent)) {
        return '00000-0'.padStart(width, ' ');
    }
    
    // Format the string with leading sign for exponent
    let sign = value < 0 ? '-' : ' ';
    let mantissaStr = (mantissa * Math.pow(10, decimals-1)).toFixed(0);
    let exponentSign = exponent < 0 ? '-' : '+';
    let exponentStr = Math.abs(exponent).toString().padStart(1, '0');
    
    return (sign + mantissaStr + exponentSign + exponentStr).padStart(width, ' ');
}

/**
 * Format decimal for TLE (e.g., eccentricity)
 */
function formatDecimal(value, width) {
    if (value === undefined || value === null) {
        return ''.padStart(width, '0');
    }
    
    // Format decimal without leading zero
    const valueStr = value.toFixed(7).substr(2);
    return valueStr.padStart(width, '0');
}

/**
 * Format degrees for TLE
 */
function formatDegrees(value, width, precision) {
    if (value === undefined || value === null) {
        return ''.padStart(width, ' ');
    }
    
    // Format with specified precision
    const valueStr = value.toFixed(precision);
    return valueStr.padStart(width, ' ');
}

/**
 * Format revolutions for TLE
 */
function formatRevs(value, width, precision) {
    if (value === undefined || value === null) {
        return ''.padStart(width, ' ');
    }
    
    // Format with specified precision
    const valueStr = value.toFixed(precision);
    return valueStr.padStart(width, ' ');
}

/**
 * Calculate checksum for TLE line
 */
function calculateChecksum() {
    // This is a placeholder for the checksum calculation
    // In a real implementation, this would calculate the proper checksum
    // based on the content of the TLE line
    return '0';  // Simplified for this example
}

// Make the API accessible globally
window.CelestrakAPI = new CelestrakAPI();