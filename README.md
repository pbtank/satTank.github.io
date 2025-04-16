# Satellite Tracker

A real-time satellite tracking application that visualizes satellite positions and orbits using TLE (Two-Line Element) data sets.

## Overview
This web application provides real-time tracking of satellites orbiting Earth. It allows users to track the International Space Station (ISS) and add custom satellites using Two-Line Element (TLE) data.

## Features
- Real-time tracking of the International Space Station (ISS)
- Custom satellite tracking with TLE data
- Visual ground trace projection
- 3D visualization of satellite positions
- Save and manage custom satellite data
- Import/Export functionality for custom satellites
- Responsive design for desktop and mobile devices

## Technologies Used
- HTML5, CSS3, JavaScript
- p5.js for visualization
- satellite.js for orbital calculations
- Bootstrap for responsive design
- LocalStorage for client-side data storage
- jQuery for DOM manipulation

## Getting Started
1. Clone the repository or download the files
2. Open `index.html` in your web browser
3. No server setup is required as the application runs entirely in the browser

## Usage
### Tracking the ISS
- Simply open the application and the ISS position will be displayed by default
- The map shows the current position and ground trace of the ISS

### Adding Custom Satellites
1. Navigate to the "Custom Satellites" section
2. Enter the satellite name and TLE data (Line 1 and Line 2)
3. Click "Add Satellite" to save it to your collection
4. View your custom satellite by clicking on its name in the list

### Importing/Exporting Satellites
- Click "Export Satellites" to download a JSON file of your collection
- Click "Import Satellites" to upload a previously saved collection

## How Data is Loaded

### Satellite Data Sources

The application uses multiple sources to retrieve satellite information:

1. **Default Satellites**: Loaded from `https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/satInfo.json`
2. **ISS Data**: Retrieved from Celestrak's JSON API at `https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json`
3. **Custom Satellites**: Stored in the browser's localStorage and cached as a local JSON file (`data/custom_satellites.json`)

### Data Loading Process

1. The application first attempts to load satellite data from localStorage for fast access
2. If localStorage data is unavailable, it falls back to loading from the JSON file
3. For the ISS, it tries to fetch the latest data from Celestrak's API
4. If the API request fails, it falls back to locally stored TLE data

### Custom Satellite Storage

Custom satellites are stored using the following methods:

1. **Browser's localStorage**: Primary storage for quick access
2. **Exported JSON Files**: Users can export and import satellite data using JSON files
3. **Optional IndexedDB**: For larger storage needs when available

## TLE Data and Orbit Calculation

### What are TLEs?

Two-Line Element sets (TLEs) are data formats that encode orbital elements of Earth-orbiting objects. A TLE consists of:

1. **Line 1**: Contains satellite identification, epoch, decay rate information
2. **Line 2**: Contains orbital elements (inclination, right ascension, eccentricity, etc.)

Example TLE format for ISS:
```
1 25544U 98067A   25105.53237150  .00014782  00000-0  27047-3 0  9994
2 25544  51.6375 257.3560 0005276  47.8113  31.7820 15.49569282505441
```

### Real-Time Orbit Calculation

The application uses the `satellite.js` library to perform accurate real-time orbit calculations:

1. **Position Calculation**: 
   - TLE data is parsed using `satellite.twoline2satrec()`
   - Current position is calculated with `satellite.propagate()`
   - Position is converted from ECI (Earth-Centered Inertial) to geographic coordinates

2. **Ground Trace Calculation**:
   - The application predicts future positions across one complete orbit
   - Orbital period is calculated from the mean motion parameter in the TLE
   - Points are plotted at regular intervals over one complete orbit

3. **Performance Optimization**:
   - Results are cached to improve performance
   - Memoization prevents redundant calculations
   - Position calculations use a 5-second cache expiry to balance accuracy and performance

### Visualization

The application visualizes satellite data using:

1. **Leaflet.js**: For the interactive map interface
2. **p5.js**: For additional canvas rendering capabilities
3. **Real-time updates**: Position data is refreshed every second

## File Structure
- `index.html` - Main entry point for the application
- `index.js` - JavaScript for the main page functionality
- `index.css` - Styling for the main page
- `satPage.html` - Satellite tracking visualization page
- `satPage.js` - JavaScript for satellite tracking calculations and visualization
- `ISSTracker.js` - Specific functionality for tracking the ISS
- `data/custom_satellites.json` - Local storage backup for custom satellites
- `library/` - Contains third-party libraries (p5.js, satellite.js, jQuery)
- `src/images/` - Contains images used in the application

## Browser Compatibility
This application works best in modern browsers that support HTML5, CSS3, and ES6 JavaScript features:
- Chrome (recommended)
- Firefox
- Edge
- Safari

## Performance Considerations
- Satellite position calculations are computationally intensive, especially when tracking multiple satellites
- The application uses caching mechanisms to optimize performance

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This project is open source and available under the MIT License.

## Future Enhancements
- Satellite pass predictions
- Multiple satellite comparative tracking
- Additional data visualization options
- Offline functionality improvements
- Mobile app version

## Contact
For questions or feedback, please create an issue in the repository.

## Data Privacy

All satellite data is stored locally in your browser. No data is sent to external servers.