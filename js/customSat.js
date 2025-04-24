// customSat.js - Handles custom satellite functionality

// Parse TLE data and extract orbital parameters
function parseTLE(name, line1, line2) {
    try {
        // Basic format validation
        if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
            throw new Error('TLE lines must start with "1 " and "2 "');
        }
        if (line1.length !== 69 || line2.length !== 69) {
            throw new Error('TLE lines must be exactly 69 characters long');
        }

        // Extract satellite number from both lines and verify they match
        const satNum1 = line1.substring(2, 7).trim();
        const satNum2 = line2.substring(2, 7).trim();
        if (satNum1 !== satNum2) {
            throw new Error('Satellite numbers in TLE lines do not match');
        }

        // Parse line 1
        const classification = line1.charAt(7);
        const intlDes = line1.substring(9, 17).trim();
        const epochYear = parseInt(line1.substring(18, 20));
        const epochDay = parseFloat(line1.substring(20, 32));
        const meanMotionDot = parseFloat(line1.substring(33, 43));
        const meanMotionDDot = parseFloat(line1.substring(44, 52));
        const bstar = parseFloat(line1.substring(53, 61));
        const elementSetNo = parseInt(line1.substring(64, 68));

        // Parse line 2
        const inclination = parseFloat(line2.substring(8, 16));
        const raan = parseFloat(line2.substring(17, 25));
        const eccentricity = parseFloat('0.' + line2.substring(26, 33));
        const argPerigee = parseFloat(line2.substring(34, 42));
        const meanAnomaly = parseFloat(line2.substring(43, 51));
        const meanMotion = parseFloat(line2.substring(52, 63));
        const revNum = parseInt(line2.substring(63, 68));

        // Calculate epoch date
        const year = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
        const epochDate = new Date(year, 0, 1);
        epochDate.setDate(epochDate.getDate() + Math.floor(epochDay) - 1);
        const hours = (epochDay % 1) * 24;
        epochDate.setHours(hours);
        epochDate.setMinutes((hours % 1) * 60);
        epochDate.setSeconds(((hours % 1) * 60 % 1) * 60);

        return {
            NORAD_CAT_ID: satNum1,
            OBJECT_NAME: name,
            TLE_LINE1: line1,
            TLE_LINE2: line2,
            EPOCH: epochDate.toISOString(),
            MEAN_MOTION: meanMotion,
            ECCENTRICITY: eccentricity,
            INCLINATION: inclination,
            RA_OF_ASC_NODE: raan,
            ARG_OF_PERICENTER: argPerigee,
            MEAN_ANOMALY: meanAnomaly,
            MEAN_MOTION_DOT: meanMotionDot,
            MEAN_MOTION_DDOT: meanMotionDDot,
            BSTAR: bstar,
            CLASSIFICATION_TYPE: classification,
            ELEMENT_SET_NO: elementSetNo,
            REV_AT_EPOCH: revNum
        };
    } catch (error) {
        // console.error('Error parsing TLE:', error);
        throw new Error(`Invalid TLE format: ${error.message}`);
    }
}

// Validate TLE format and checksum
function validateTLE(line1, line2) {
    // console.log('Validating TLE lines:', { line1, line2 });
    // console.log('Line types:', { line1Type: typeof line1, line2Type: typeof line2 });
    try {
        if (!line1 || !line2 || typeof line1 !== 'string' || typeof line2 !== 'string') {
            console.error('Invalid TLE input: lines must be non-empty strings');
            return false;
        }
        
        // Basic format checks
        if (!line1.startsWith('1 ') || line1.length !== 69) {
             console.error(`Invalid TLE line 1 format or length (${line1.length}): ${line1}`);
            return false;
        }
        if (!line2.startsWith('2 ') || line2.length !== 69) {
             console.error(`Invalid TLE line 2 format or length (${line2.length}): ${line2}`);
            return false;
        }
        
        // Verify satellite numbers match
        const satNum1 = line1.substring(2, 7).trim();
        const satNum2 = line2.substring(2, 7).trim();
        if (satNum1 !== satNum2) {
            console.error('Satellite numbers in TLE lines do not match');
            return false;
        }

        // Validate checksums
        if (!validateChecksum(line1)) {
             console.error('Invalid checksum for TLE line 1');
            return false;
        }
        if (!validateChecksum(line2)) {
             console.error('Invalid checksum for TLE line 2');
            return false;
        }

        // console.log('TLE validation successful');
        return true;
    } catch (error) {
         console.error('Error during TLE validation:', error);
        return false;
    }
}

// Validate TLE checksum
function validateChecksum(line) {
    try {
        const checksum = parseInt(line.charAt(68));
        if (isNaN(checksum)) {
            // console.error('Invalid checksum character');
            return false;
        }

        let sum = 0;
        for (let i = 0; i < 68; i++) {
            const c = line.charAt(i);
            if (c === '-') {
                sum += 1;
            } else if (c >= '0' && c <= '9') {
                sum += parseInt(c);
            }
        }
        return (sum % 10) === checksum;
    } catch (error) {
        // console.error('Error validating checksum:', error);
        return false;
    }
}

// Load custom satellite data from localStorage
function loadCustomSatellite(satId) {
    try {
        const customSatellites = JSON.parse(localStorage.getItem('customSatellites') || '[]');
        const customSat = customSatellites.find(sat => sat.NORAD_CAT_ID === satId);
        
        if (customSat) {
            // Validate the stored TLE data
            if (!validateTLE(customSat.TLE_LINE1, customSat.TLE_LINE2)) {
                // console.error('Invalid TLE data found in localStorage for satellite', satId);
                // Optionally remove the invalid entry from storage here
                return null; // Return null if stored data is invalid
            }
            return customSat;
        }
        return null;
    } catch (error) {
        // console.error('Error loading custom satellite:', error);
        return null;
    }
}

// Save custom satellite to localStorage
function saveCustomSatellite(satelliteData) {
    try {
        // Validate TLE data before saving
        if (!validateTLE(satelliteData.TLE_LINE1, satelliteData.TLE_LINE2)) {
            throw new Error('Invalid TLE data');
        }

        // Ensure we always have an array, even if localStorage is empty or invalid
        let customSatellites = [];
        try {
            const storedData = localStorage.getItem('customSatellites');
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                if (Array.isArray(parsedData)) {
                    customSatellites = parsedData;
                }
            }
        } catch (e) {
            // console.warn('Error parsing stored custom satellites, starting fresh:', e);
        }

        const existingIndex = customSatellites.findIndex(sat => sat.NORAD_CAT_ID === satelliteData.NORAD_CAT_ID);
        
        if (existingIndex > -1) {
            customSatellites[existingIndex] = satelliteData;
        } else {
            customSatellites.push(satelliteData);
        }
        
        localStorage.setItem('customSatellites', JSON.stringify(customSatellites));
        return true;
    } catch (error) {
        // console.error('Error saving custom satellite:', error);
        return false;
    }
}

// Check if a satellite is a custom satellite
function isCustomSatellite(satId) {
    try {
        const customSatellites = JSON.parse(localStorage.getItem('customSatellites') || '[]');
        return customSatellites.some(sat => sat.NORAD_CAT_ID === satId);
    } catch (error) {
        // console.error('Error checking custom satellite:', error);
        return false;
    }
}

// Export functions to global scope
window.loadCustomSatellite = loadCustomSatellite;
window.saveCustomSatellite = saveCustomSatellite;
window.isCustomSatellite = isCustomSatellite;
window.parseTLE = parseTLE;
window.validateTLE = validateTLE; 