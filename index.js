var url = 'https://raw.githubusercontent.com/pbtank/ISSTracker/master/data/satInfo.json';
var satInfo;
var customSatellites = [];

// New function to load and classify satellites
async function loadClassifiedSatellites() {
  try {
    const classifiedData = await celestrakAPI.fetchAndClassifySatellites();
    displaySatelliteTable(classifiedData);
  } catch (error) {
    console.error('Failed to load and classify satellites:', error);
    // Display error message on the page
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
				// Add navigation numbers below the table
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

function displaySatelliteTable(classifiedData) {
  const tableContainer = document.getElementById('satelliteTableContainer');
  tableContainer.innerHTML = ''; // Clear loading message

  let table = document.createElement('table');
  table.className = 'satelliteTable';

  // Create table header
  let thead = table.createTHead();
  let headerRow = thead.insertRow();
  let headers = ['Classification', 'Satellite Name', 'Actions'];
  headers.forEach(headerText => {
    let header = document.createElement('th');
    header.textContent = headerText;
    headerRow.appendChild(header);
  });

  // Create table body
  let tbody = table.createTBody();

  // Populate table with satellite data
  for (const classification in classifiedData) {
    const satClass = classifiedData[classification];

    // Add a row for each satellite
    satClass.satellites.forEach(sat => {
      let row = tbody.insertRow();

      // Classification cell
      let classCell = row.insertCell();
      classCell.textContent = satClass.name;

      // Satellite Name cell
      let nameCell = row.insertCell();
      nameCell.textContent = sat.name;

      // Actions cell (link to satellite page)
      let actionsCell = row.insertCell();
      let satLink = document.createElement('a');
      satLink.href = `satPage.html?id=${sat.id}&name=${encodeURIComponent(sat.name)}`;
      satLink.textContent = 'View Details';
      actionsCell.appendChild(satLink);
    });
  }

  tableContainer.appendChild(table);
}