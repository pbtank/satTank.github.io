# 🛰️ SatTank

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen)](https://carbform.github.io/carbsat)
[![License](https://img.shields.io/badge/License-Unlicense-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.1%20Beta-orange)](https://github.com/carbform/carbsat/releases)

A modern, minimalistic web application for real-time satellite tracking with interactive orbit visualization and pass prediction capabilities.

## ✨ Features

- 🌍 **Real-time Satellite Tracking** - Track hundreds of satellites on an interactive world map
- 🛰️ **Orbit Visualization** - Display satellite orbits, ground tracks, and sensor footprints
- 📊 **Pass Prediction** - Calculate upcoming passes with polar plot visualizations
- 🔍 **Smart Filtering** - Search and categorize satellites with advanced filtering
- 📡 **Custom TLE Support** - Add your own Two-Line Element sets for custom tracking
- 🌙 **Dark/Light Theme** - Responsive design with theme switching
- ⏰ **Live UTC Clock** - Real-time UTC display for accurate timing

## 🚀 Live Demo

**[Launch SatTank →](https://carbform.github.io/carbsat)**

## 🖥️ Screenshots

### Main Satellite List
Interactive table with sorting and filtering capabilities.

### Satellite Tracking Page
Real-time position tracking with orbital data and pass predictions.

## 🛠️ Tech Stack & Dependencies

### Core Libraries
- **[satellite.js](https://github.com/shashwatak/satellite-js)** - SGP4 orbital propagation
- **[Leaflet](https://leafletjs.com/)** - Interactive mapping
- **[Plotly.js](https://plotly.com/javascript/)** - Polar plot visualizations
- **[DataTables](https://datatables.net/)** - Enhanced table functionality

### Map Providers
- **[OpenStreetMap](https://www.openstreetmap.org/)** - Default map tiles
- **[CartoDB](https://carto.com/)** - Dark theme tiles
- **[Esri](https://www.esri.com/)** - Satellite imagery
- **[OpenTopoMap](https://opentopomap.org/)** - Topographic maps

### UI Components
- **[Font Awesome](https://fontawesome.com/)** - Icons and symbols
- **[IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono)** - Monospace typography

### Data Sources
- **[CelesTrak](https://celestrak.org/)** - Two-Line Element (TLE) data by Dr. T.S. Kelso
- **[NORAD](https://www.space-track.org/)** - Official satellite catalog data

## 📋 Usage

### Basic Tracking
1. Browse the satellite list on the main page
2. Use filters to find specific satellite categories
3. Click any satellite name to view its tracking page

### Pass Prediction
1. Navigate to a satellite's tracking page
2. Enter your observer coordinates (latitude/longitude)
3. Click **"Predict Passes"** to generate pass forecasts
4. View upcoming passes with elevation, azimuth, and timing data
5. Analyze pass geometry using the interactive polar plot

### Map Controls
- **Map Type**: Switch between street, satellite, dark, and topographic views
- **Overlays**: Toggle orbit paths, ground tracks, and sensor footprints
- **Real-time Updates**: Satellite positions update automatically

## 🔧 Local Development

```bash
# Clone the repository
git clone https://github.com/carbform/carbsat.git

# Navigate to project directory
cd carbsat

# Serve locally (Python 3)
python -m http.server 8000

# Or with Node.js
npx serve .

# Access at http://localhost:8000
```

## 📁 Project Structure

```
carbsat/
├── index.html              # Main satellite list page
├── js/
│   ├── main.js             # Main page functionality
│   ├── satPage.js          # Satellite tracking page
│   └── lib/                # Third-party libraries
├── css/
│   ├── style.css           # Main page styles
│   └── satpage.css         # Tracking page styles
├── src/                    # Fonts and assets
└── data/                   # TLE data files
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the Unlicense License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Dr. T.S. Kelso** and **[CelesTrak](https://celestrak.org/)** for providing accurate TLE data
- **David A. Vallado** for SGP4 orbital mechanics algorithms
- **NASA** and **NORAD** for satellite tracking standards
- Open source community for the excellent libraries used in this project

## 👨‍💻 Authors

- **[Priyansu Tank](https://pbtank.github.io/Tank_Priyansu/)**
- **[Carbform](https://github.com/carbform)**

---

<div align="center">
  <strong>Made with ❤️ in India 🇮🇳</strong><br>
  <em>Version 0.2 (Beta) | Star ⭐ this repo if you find it useful!</em>
</div>