var canvas;
const canWidth = 800;
const canHeight = 400;

var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/tle.json';

var satlist = [];
var d;

function preload() {
	loadJSON(url, (data) => {
	initSat(data);
});
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

// L.marker([51.5, -0.09]).addTo(myMap)
//     .bindPopup('A pretty CSS3 popup.<br> Easily customizable.')
//     .openPopup();

	setInterval(() => {
		d = new Date();
		var hr = d.getUTCHours().toString();
		var min = d.getUTCMinutes().toString();
		var sec = d.getUTCSeconds().toString();
		document.getElementById("UTC").innerHTML = (hr + ':' + min + ':' + sec);

		satlist[ID].groundTrace(d, 60);
	}, 1000);

}

function draw() {

}

function onMapClick(e) {

}

class Satellite {
	constructor(_id, _satJson, _layerMarkerGrp) {
		this.satID = _satJson.satID;		//satellite id
		this.epoch = _satJson.epoch;		//array of epoch [year, mon, day, hr,min, sec]
		this.eccen = _satJson.eccen;		//eccentricity
		this.incli = _satJson.incli;		//inclination
		this.node = _satJson.node;			//RA of ascending node
		this.aop = _satJson.omega;			//AOP
		this.mnMotn = _satJson.mnMotion;	//rev/day
		this.mnAnom = _satJson.mnAnomaly;	//mean anomaly
		this.revNum = _satJson.revNum;		//rev num at epoch
		this.path = _satJson.path;			//array containing jsonObject of path info at each epoch
		this.satName = satName[_id];
		this.layerMarkerGrp = L.layerGroup();
	}

	groundTrace(_currentUTC, _span) {		//_span in int min
		let hr = _currentUTC.getUTCHours();
		let min = _currentUTC.getUTCMinutes();
		let sec = _currentUTC.getUTCSeconds();
		let t = ((hr*60) + min) - ((this.epoch[3]*60) + this.epoch[4]);

		let start = max((t-_span), 0);
		let stop = Math.min((t+_span), (this.path.length-1));

		if (myMap.hasLayer(this.layerMarkerGrp)) {
			myMap.removeLayer(this.layerMarkerGrp);
			this.layerMarkerGrp.clearLayers();
			// console.log('g');
		}
		var trace = [];
		var tracePoly = new L.Geodesic(trace, {
			color: '#00ffff',
			weight: 3,
			opacity: 1,
			wrap: true,
		});
		for (let i = start; i <= stop; i++) {
			tracePoly.addLatLng(L.latLng(this.path[i].lat, this.path[i].long));
		}
		this.layerMarkerGrp.addLayer(tracePoly);

		let intLong, intLat, intHeight, intXpos, intYpos, intZpos;
		let d1 = new Date(this.epoch[0], this.epoch[1]-1, this.epoch[2], this.epoch[3], this.epoch[4], this.epoch[5]);

		if (t<this.path.length-1) {
			intLong = interpolate(this.path[t].long, this.path[t+1].long, sec);
			intLat = interpolate(this.path[t].lat, this.path[t+1].lat, sec);
			intHeight = interpolate(this.path[t].height, this.path[t+1].height, sec);
			intXpos = interpolate(this.path[t].x, this.path[t+1].x, sec);
			intYpos = interpolate(this.path[t].y, this.path[t+1].y, sec);
			intZpos = interpolate(this.path[t].z, this.path[t+1].z, sec);

			var satImage = L.icon({
				iconUrl: 'src/images/satImage.png',

				iconSize:     [38, 38], 
			    iconAnchor:   [19, 19], 
			    popupAnchor:  [0, -19],
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

			var radius = acos(6371/(6371+intHeight)) * 6371;

			var node = new L.GeodesicCircle([intLat, intLong], {
				radius: radius*1000,
				color: '#000000',
				fill: true,
				fillOpacity: 0.1,
				weight: 1,
			});
			//⦾
// &olcir;
// &#x029BE;
// &#10686;
			
			this.layerMarkerGrp.addLayer(node);
			myMap.addLayer(this.layerMarkerGrp);
			myMap.panTo([intLat, intLong]);	
		}

		// document.getElementById("satName").innerHTML = this.satName;
		document.getElementById("epochTime").innerHTML = d1.toUTCString();
		document.getElementById("lat").innerHTML = nfc(intLat, 3);
		document.getElementById("long").innerHTML = nfc(intLong, 3);
		document.getElementById("height").innerHTML = nfc(intHeight, 3);
		document.getElementById("xPos").innerHTML = nfc(intXpos, 3);
		document.getElementById("yPos").innerHTML = nfc(intYpos, 3);
		document.getElementById("zPos").innerHTML = nfc(intZpos, 3);
		document.getElementById("eccen").innerHTML = nfc(this.eccen, 6);
		// document.getElementById("per").innerHTML = nfc(this., 3);
		// document.getElementById("apg").innerHTML = nfc(this., 3);
		document.getElementById("node").innerHTML = nfc(this.node, 3);
		document.getElementById("aop").innerHTML = nfc(this.aop, 3);
		document.getElementById("mnm").innerHTML = nfc(this.mnMotn, 3);
		document.getElementById("mna").innerHTML = nfc(this.mnAnom, 3);
		document.getElementById("revNum").innerHTML = int(this.revNum);

	}

}

function interpolate(_to, _td, _sec) {
	let x = _to + ((_td - _to)/60) * _sec;
	return x;
}

function initSat(data) {
	let i = 0;
	print(data);
	// for (let key in data) {
		var nodes = L.layerGroup();
		print(data[key]);
		satlist[ID] = new Satellite(ID, data[ID], nodes);
		i++;
	// }
	print(satlist);
}


