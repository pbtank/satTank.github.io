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

function setup() {
  createCanvas(canWidth, canHeight);
  
  // Initialize with the default group
  //loadSatellites(selectedGroup);
  
  // Load classified satellites instead
  loadClassifiedSatellites();

  // Create UI controls
  createUI();
  
  // Update time every second
  setInterval(() => { d = new Date(); }, 1000);
}

function draw() {

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
      const table = document.querySelector('.satelliteTable');
      const tableContainer = document.getElementById('satelliteTableContainer');
      const navigationDiv = document.createElement('div');
      navigationDiv.className = 'navigation';
      const numRows = table.rows.length;
      const perPage = $('#resPerPage').val();
      const numPages = Math.ceil(numRows / perPage);

      for (let i = 0; i < numPages; i++) {
        const pageNumber = i + 1;
        const numberLink = document.createElement('a');
        numberLink.href = '#';
        numberLink.textContent = pageNumber;
        numberLink.addEventListener('click', (event) => {
          event.preventDefault();
          // Trigger page navigation by manually triggering the click event on the corresponding pagination link
          const paginationLinks = document.querySelectorAll('.fancyTable-pagination a');
          paginationLinks[i].click();

          // Scroll to the first row on the page
          const firstRowIndex = i * perPage;
          table.rows[firstRowIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        });
        navigationDiv.appendChild(numberLink);
      }
      tableContainer.appendChild(navigationDiv);
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
    satLink.textContent = 'View Details';
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

document.addEventListener('DOMContentLoaded', function() {
    loadClassifiedSatellites();
});