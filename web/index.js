const your_service_uuid = '711661ab-a17a-4c7f-bc9f-de1f070a66f4';
const your_characteristic_uuid = '4d4bc742-f257-41e5-b268-6bc4f3d1ea73';
const DATABASENAME = "BlackDeLaJackClimate";
// Define the default structure of the data
const defaultDataStructure = {
  temperature: Math.random(),
  humidity: Math.random(),
  co2: Math.random(),
  mq2: Math.random(),
  // pm2_5: Math.random(),
  // pm10: Math.random(),
};

globalThis.offset = 0;
var currentSortField = null;
var currentSortOrder = 'asc';
var loadingIndicator = LoadingIndicatorElement();
var ResetDB = ResetDBButtonElement();
/** @type {HTMLTableSectionElement} */
var tbody = document.querySelector('#TABLE tbody');
/** @type {HTMLTableSectionElement} */
var thead = document.querySelector('#TABLE thead');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');
  if (!tbody || !thead) return;
  document.querySelector('#TABLE').after(loadingIndicator);
  document.querySelector('#DATA_VIEW').after(ExportAsCSVButtonElement());
  document.body.querySelector('main').appendChild(ResetDB);


  /** @type { HTMLButtonElement} */
  const loadMore = document.querySelector('button#loadMore');
  if (!loadMore) {
    console.log("no load more btn");
  }

  // Load existing data on startup
  loadFromIndexedDB();

  // Infinite scrolling / "Load More" functionality (not directly related to filtering/sorting on new data)
  if (!globalThis.offset) globalThis.offset = 0;
  const limit = globalThis.offset;


  document.getElementById('select_device').addEventListener('click', async () => {
    if (!("bluetooth" in navigator)) {
      console.log("Bluetooth API not supported");
      return;
    }

    const bluetooth = navigator.bluetooth;

    if (!bluetooth.getAvailability()) {
      console.log("Bluetooth not available");
      return;
    }

    try {
      const [device, deviceError] = await tryCatch(bluetooth.requestDevice({
        acceptAllDevices: false,
        filters: [{ name: "BlackDeLaJack" }],
        optionalServices: [your_service_uuid]
      }));
      if (deviceError) {
        alert('Error: ' + deviceError + '\nData: ' + JSON.stringify(device));
        console.error('Error:', deviceError, device);
        return;
      }
      console.log('Got device:', device);

      if (!device.gatt) {
        alert('Error: device.gatt is undefined\nData: ' + JSON.stringify(device));
        console.error('Error: device.gatt is undefined', device);
        return;
      }
      if (!device.gatt.connected) {
        await device.gatt.connect();
      }

      const [gattServer, gattError] = await tryCatch(device.gatt.connect());
      if (gattError) {
        alert('Error: ' + gattError + '\nData: ' + JSON.stringify(device));
        console.error('Error:', gattError, device);
        return;
      }
      const [service, serviceError] = await tryCatch(gattServer.getPrimaryService(your_service_uuid));
      if (serviceError) {
        alert('Error: ' + serviceError + '\nData: ' + JSON.stringify(gattServer));
        console.error('Error:', serviceError, gattServer);
        return;
      }
      const [characteristic, characteristicError] = await tryCatch(service.getCharacteristic(your_characteristic_uuid));
      if (characteristicError) {
        alert('Error: ' + characteristicError + '\nData: ' + JSON.stringify(service));
        console.error('Error:', characteristicError, service);
        return;
      }

      // Add a buffer to accumulate incoming chunks
      let bluetoothChunkBuffer = '';

      // Handler for incoming data chunks
      async function handleBluetoothChunk(value) {
        const decoder = new TextDecoder();
        const chunk = decoder.decode(value);
        bluetoothChunkBuffer += chunk;

        let parsed = false;
        while (bluetoothChunkBuffer.length > 0) {
          try {
            const start = bluetoothChunkBuffer.indexOf('{');
            const end = bluetoothChunkBuffer.lastIndexOf('}');
            if (start === -1 || end === -1 || end <= start) break;
            const jsonString = bluetoothChunkBuffer.slice(start, end + 1);
            /** @type {{[key: string]: any} | typeof defaultDataStructure} */
            const data = JSON.parse(jsonString);
            data["date"] = new Date().toISOString();
            bluetoothChunkBuffer = bluetoothChunkBuffer.slice(end + 1);
            parsed = true;

            // ...existing code for handling data...
            if (data) {
              console.log('Received data:', data);
              // alert('Received data:' + JSON.stringify(data));
              try {
                await saveToDB(data);
              } catch (e) {
                alert("Error: cannot save to DB\nError: " + e + "\nData: " + JSON.stringify(data));
              }
              console.log('Saved data to IndexedDB:', data);
              try {
                // if (!thead.hasChildNodes()) {
                //   createTableHeaders(data);
                //   createFilterControls(data);
                // }
                // applyFiltersAndSort(true);
                loadFromIndexedDB();
              } catch (e) {
                alert('Error: table dont work right\nError: ' + e + '\nData: ' + JSON.stringify(data));
              }
            }
          } catch (err) {
            alert('Error: failed to parse JSON\nError: ' + err + '\nBuffer: ' + bluetoothChunkBuffer);
            console.error('Error: failed to parse JSON', err, bluetoothChunkBuffer);
            break;
          }
        }
        if (!parsed) {
          // alert('Controller sent malformed or incomplete data: ' + bluetoothChunkBuffer);
          console.error('Controller sent malformed or incomplete data:', bluetoothChunkBuffer);
        }
      }

      // Prefer notifications if supported, otherwise fallback to polling
      if ('addEventListener' in characteristic && 'startNotifications' in characteristic) {
        characteristic.addEventListener('characteristicvaluechanged', async (event) => {
          try {
            await handleBluetoothChunk(event.target.value);
          } catch (err) {
            alert('Error: ' + err + '\nData: ' + JSON.stringify(event));
            console.error('Error:', err, event);
          }
        });
        try {
          await characteristic.startNotifications();
          console.log('Started notifications');
        } catch (err) {
          alert('Error: ' + err + '\nData: ' + JSON.stringify(characteristic));
          console.error('Error:', err, characteristic);
        }
      } else if ('readValue' in characteristic) {
        alert('Notifications not supported, falling back to polling...');
        setInterval(async () => {
          try {
            const value = await characteristic.readValue();
            await handleBluetoothChunk(value);
          } catch (e) {
            alert('Polling read error: ' + e + '\nData: ' + JSON.stringify(characteristic));
            console.error('Polling read error:', e, characteristic);
          }
        }, 2000);
      } else {
        alert('Bluetooth GATT characteristic does not support notifications or reading on this device/browser.\nData: ' + JSON.stringify(characteristic));
        console.error('Bluetooth GATT characteristic does not support notifications or reading on this device/browser.', characteristic);
      }

      // If connected, remove attention effect and update label
      if (btBtn) {
        btBtn.classList.remove('attention');
        btBtn.innerHTML = `<span style="font-size:1.2em;vertical-align:middle;line-height:1;">&#128246;</span> Connected`;
        btBtn.disabled = true;
        setTimeout(() => {
          btBtn.innerHTML = `<span style="font-size:1.2em;vertical-align:middle;line-height:1;">&#128246;</span> Connected`;
        }, 1000);
      }

    } catch (error) {
      alert('Error: ' + error + '\nData: ' + JSON.stringify(error));
      console.error('Error:', error);
      // If failed, restore attention effect
      if (btBtn) {
        btBtn.classList.add('attention');
        btBtn.innerHTML = `<span style="font-size:1.2em;vertical-align:middle;line-height:1;">&#128246;</span> Connect to Bluetooth`;
        btBtn.disabled = false;
      }
    }

  });

  document.getElementById('install')?.addEventListener('click', async () => {
    if (!installPrompt) {
      // If installPrompt is null, try triggering install through standalone mode check
      if (window.matchMedia('(display-mode: standalone)').matches) {
        alert('Application is already installed!');
        return;
      }
      // For Safari on iOS
      if (navigator.standalone) {
        alert('Application is already installed!');
        return;
      }
      alert('Installation not available. Try using a supported browser.');
      return;
    }

    try {
      // Show the installation prompt
      const result = await installPrompt.prompt();
      console.log(`Install prompt result: ${result}`);

      // Wait for the user to respond to the prompt
      const { outcome } = await installPrompt.userChoice;
      console.log(`User choice: ${outcome}`);

      if (outcome === 'accepted') {
        console.log('PWA installation accepted');
        installPrompt = null;
        document.getElementById('install').hidden = true;
      } else {
        console.log('PWA installation rejected');
      }
    } catch (error) {
      alert('Error during installation: ' + error + '\nData: ' + JSON.stringify(error));
      console.error('Error during installation:', error);
    }
  });

  // Enhance install button with icon and label
  const installBtn = document.getElementById('install');
  if (installBtn) {
    installBtn.innerHTML = `<span style="font-size:1.2em;vertical-align:middle;line-height:1;">&#x2B50;</span> Install App`;
    installBtn.setAttribute('aria-label', 'Install this app to your device');
    installBtn.title = 'Install this app for offline use and quick access';
  }

  // Enhance Bluetooth button with icon, label, and attention effect
  const btBtn = document.getElementById('select_device');
  if (btBtn) {
    btBtn.classList.add('attention');
  }

  // document.querySelector('#makeFakeData').addEventListener('click', saveRandomData);
});

let installPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  // Show the install button
  const installButton = document.getElementById('install');
  if (installButton) {
    installButton.hidden = false;
  }
});

// Add this to detect when the PWA is successfully installed
window.addEventListener('appinstalled', (e) => {
  console.log('PWA successfully installed');
  // Hide the install button
  document.getElementById('install').hidden = true;
  // Clear the install prompt
  installPrompt = null;
});


// Number.isNumber = (v) => parseFloat(v) == v;
/**
 * Try-catch helper function
 * @template T
 * @param {Promise<T>|Function} input
 * @returns {[T|null, Error|null] | Promise<[T|null, Error|null]>}
 */
function tryCatch(input) {
  if (typeof input === "function") {
    try {
      return [input(), null];
    }
    catch (error) {
      return [null, error];
    }
  }
  else if (input instanceof Promise) {
    return input
      .then((data) => [data, null])
      .catch((error) => [null, error]);
  }
  else {
    throw new Error("Input must be a function or a promise.");
  }
}


/**
 * Save data to IndexedDB and resolve with the stored data
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function saveToDB(data) {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASENAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("sensorData")) {
        db.createObjectStore("sensorData", { keyPath: "date" });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("sensorData", "readwrite");
      const store = transaction.objectStore("sensorData");
      const record = { ...data, date: data.date || new Date().toISOString() };
      const addReq = store.add(record);

      addReq.onsuccess = () => resolve(record);
      addReq.onerror = (e) => reject(e.target?.error || e);
    };

    request.onerror = (event) => {
      alert("Error opening database: " + event.target.error + "\nData: " + JSON.stringify(event));
      reject(event.target.error);
    };
  });
}

// Function to save new sensor data
async function saveRandomData() {
  const data = {
    temperature: Math.random(),
    humidity: Math.random(),
    co2: Math.random(),
    mq2: Math.random(),
    // pm2_5: Math.random(),
    // pm10: Math.random(),
    date: new Date().toISOString(),
  };

  await saveToDB(data);
}

/**
 * Get all sensor data with optional query, limit, and offset.
 * @param {string} dbName
 * @param {Object} [query] - { field, operator, value }
 * @param {number} [limit]
 * @param {number} [offset]
 * @returns {Promise<Object[]>}
 */
async function getAllSensorData(dbName = DATABASENAME, query = null, limit = null, offset = 0) {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("sensorData")) {
        db.createObjectStore("sensorData", { keyPath: "date" });
      }
    };

    request.onsuccess = (event) => {
      /** @type {IDBDatabase} */
      const db = event.target.result;
      const transaction = db.transaction("sensorData", "readonly");
      const store = transaction.objectStore("sensorData");
      const results = [];
      let skipped = 0;

      // Use a cursor for filtering, offset, and limit
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          let match = true;
          if (query && query.field && query.operator) {
            let value = cursor.value[query.field];
            let filterValue = query.value;
            if (query.field === 'date') {
              value = new Date(value);
              filterValue = new Date(filterValue);
            } else if (typeof value === 'number') {
              value = Number(value);
              filterValue = Number(filterValue);
            }
            switch (query.operator) {
              case 'eq': match = value == filterValue; break;
              case 'gt': match = value > filterValue; break;
              case 'lt': match = value < filterValue; break;
              case 'gte': match = value >= filterValue; break;
              case 'lte': match = value <= filterValue; break;
              case 'contains': match = String(value).includes(filterValue); break;
              default: match = true;
            }
          }
          if (match) {
            if (skipped < offset) {
              skipped++;
            } else {
              results.push(cursor.value);
              if (limit && results.length >= limit) {
                resolve(results);
                return;
              }
            }
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      cursorRequest.onerror = (e) => reject(e.target?.error || e);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
    request.onblocked = (event) => {
      reject(event.target.error);
    };
  });
}


function LoadingIndicatorElement() {
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'loading';
  loadingIndicator.textContent = 'Loading more...';
  loadingIndicator.style.display = 'none';

  loadingIndicator.addEventListener('waiting', (ev) => {
    loadingIndicator.style.display = 'block';
  });
  loadingIndicator.addEventListener('ended', (ev) => {
    loadingIndicator.style.display = 'none';
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        applyFiltersAndSort(true); // Pass true to load more
      }
    });
  }, { threshold: 0.1 });

  observer.observe(loadingIndicator);

  return loadingIndicator;
}


/**
 * Load all data from IndexedDB and initialize table and filters
 */
async function loadFromIndexedDB() {
  // Use new getAllSensorData signature (no filter, no limit, no offset)
  const records = await getAllSensorData();
  createTableHeaders(records[0] || defaultDataStructure);
  createFilterControls(records[0] || defaultDataStructure);
  applyFiltersAndSort(false);
  if (records.length > 0) {
    globalThis.offset = 0; // Reset offset when loading fresh data
  }
}


// Add export button at the top
/**
 * @returns {HTMLButtonElement}
 */
function ExportAsCSVButtonElement() {
  const exportButton = document.createElement('button');
  exportButton.textContent = 'Export CSV';
  exportButton.type = 'button';
  exportButton.className = 'export-btn';
  exportButton.addEventListener('click', exportToCSV);
  // Add these new functions for CSV export
  async function exportToCSV() {
    const filterForm = document.getElementById('filterForm');
    if (!filterForm) return;

    // Use new getAllSensorData signature (no filter, no limit, no offset)
    const records = await getAllSensorData(DATABASENAME);
    // Apply current filters to the export
    const formData = new FormData(filterForm);
    const filters = {};
    for (const [key, value] of formData.entries()) {
      const [field, type] = key.split('_');
      if (!filters[field]) filters[field] = {};
      filters[field][type] = value;
    }

    const filteredRecords = applyFilters(records, filters);
    const sortedRecords = sortData(filteredRecords, currentSortField);

    // Convert to CSV
    const headers = Object.keys(sortedRecords[0] || {});
    const csv = [
      headers.join(','), // Header row
      ...sortedRecords.map(row =>
        headers.map(field => {
          const value = row[field];
          // Format dates and numbers
          if (field === 'date' || value instanceof Date) {
            return `"${new Date(value).toLocaleString("et-EE")}"`;
          }
          if (typeof value === 'number') {
            return value.toFixed(2);
          }
          return `"${value}"`;
        }).join(',')
      )
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sensor_data_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  return exportButton;
}



/**
 * Create table headers from object keys
 * @param {Object} data
 */
function createTableHeaders(data) {
  thead.innerHTML = ''; // Clear existing headers
  const headerRow = thead.insertRow(0);
  Object.keys(data).forEach(key => {
    const th = document.createElement('th');
    th.textContent = key.charAt(0).toUpperCase() + key.slice(1);
    headerRow.appendChild(th);
  });
  console.log('Created table headers', data);
}

/**
 * Create filter controls for each column
 * @param {Object} data
 */
function createFilterControls(data) {
  console.log('Creating filter controls', data);

  // Remove old label if present
  let oldLabel = document.getElementById('filterDropdownLabel');
  if (oldLabel) oldLabel.remove();

  // Add a label for accessibility and clarity
  const filterLabel = document.createElement('label');
  filterLabel.id = 'filterDropdownLabel';
  filterLabel.htmlFor = 'filterDropdown';
  filterLabel.textContent = 'Show/Hide Filters:';
  filterLabel.style.display = 'block';
  filterLabel.style.fontWeight = '600';
  filterLabel.style.marginBottom = '0.3em';
  filterLabel.style.color = '#188038';
  filterLabel.title = 'Select which columns to show filters for';

  // Remove old dropdown if present
  /** @type {HTMLSelectElement} */
  let filterDropdown = document.getElementById('filterDropdown');
  if (filterDropdown) filterDropdown.remove();

  filterDropdown = document.createElement('select');
  filterDropdown.id = 'filterDropdown';
  filterDropdown.multiple = true;
  filterDropdown.ariaMultiSelectable = true;
  filterDropdown.setAttribute('aria-labelledby', 'filterDropdownLabel');
  filterDropdown.setAttribute('title', 'Toggle which filters are visible');
  filterDropdown.size = Math.min(Object.keys(data).length, 8);
  filterDropdown.style.marginBottom = "1em";
  filterDropdown.style.display = "block";

  Object.keys(data).forEach((key, idx) => {
    const option = document.createElement('option');
    option.value = key;
    option.selected = idx === 0; // All filters visible by default
    option.textContent = key.charAt(0).toUpperCase() + key.slice(1);
    filterDropdown.appendChild(option);
  });

  // Handler to show/hide filter fieldsets
  filterDropdown.addEventListener('change', () => {
    const selected = Array.from(filterDropdown.selectedOptions).map(opt => opt.value);
    document.querySelectorAll('#filterForm fieldset').forEach(fs => {
      fs.style.display = selected.includes(fs.dataset.key) ? '' : 'none';
    });
  });

  document.querySelectorAll('#filterDropdown option').forEach((el => {
    el.checked = false;
    el.selected = false;
  }));

  // Insert filtersWrapper before the scrollable table container
  const tableScrollContainer = document.querySelector('.table-scroll-x');
  // --- FILTER FORM WRAPPER ---
  let filtersWrapper = document.getElementById('filtersWrapper');

  // // --- FILTER FORM ---
  let filterForm = document.getElementById('filterForm');
  if (filterForm) filterForm.remove();

  filterForm = document.createElement('form');
  filterForm.id = 'filterForm';
  filterForm.className = 'filters';

  Object.keys(data).forEach((key, idx) => {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.key = key;
    const legend = document.createElement('legend');
    legend.textContent = key.charAt(0).toUpperCase() + key.slice(1);
    // Expand the first filter by default
    if (idx === 0) {
      fieldset.classList.remove('collapsed');
    }
    else {
      fieldset.classList.add('collapsed');
    }

    legend.addEventListener('click', (e) => {
      fieldset.classList.toggle('collapsed');
    });

    // Create operator select
    const operatorSelect = document.createElement('select');
    operatorSelect.addEventListener('change', () => applyFiltersAndSort(false));
    operatorSelect.addEventListener('input', () => applyFiltersAndSort(false));
    operatorSelect.name = `${key}_operator`;
    let operators = [];
    console.log(key, data[key]);
    if (key === 'date') {
      operators = getOperatorsForType('object');
    } else {
      operators = getOperatorsForType(typeof data[key]);
    }
    console.log(operators);
    operators.forEach(op => {
      const option = document.createElement('option');
      option.value = op.value;
      option.textContent = op.label;
      operatorSelect.appendChild(option);
    });

    // Create value input
    const valueInput = document.createElement('input');
    valueInput.name = `${key}_value`;
    valueInput.type = getInputTypeForValue(data[key], key);
    valueInput.placeholder = `Filter by ${key}`;
    valueInput.addEventListener('change', () => applyFiltersAndSort(false));
    valueInput.addEventListener('input', () => applyFiltersAndSort(false));


    // Replace sort button with sort select
    const sortSelect = document.createElement('select');
    sortSelect.name = `${key}_sort`;
    sortSelect.title = "Sort order for this column";
    sortSelect.style.width = "auto";
    [
      { value: '', label: '⇳ None' },
      { value: 'asc', label: '↓ Asc' },
      { value: 'desc', label: '↑ Desc' }
    ].forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      sortSelect.appendChild(option);
    });
    sortSelect.addEventListener('change', (e) => {
      const direction = e.target.value;
      if (!direction) {
        currentSortField = null;
        currentSortOrder = 'asc';
      } else {
        currentSortField = key;
        currentSortOrder = direction;
      }
      // Reset other sort selects
      filterForm.querySelectorAll('select[name$="_sort"]').forEach(sel => {
        if (sel !== e.target) sel.value = '';
      });
      applyFiltersAndSort(false);
    });

    fieldset.appendChild(legend);
    fieldset.appendChild(operatorSelect);

    const div = document.createElement('div');
    div.classList.add("flex", "flex-row");
    div.appendChild(valueInput);
    div.appendChild(sortSelect);  // Add sort select instead of button

    fieldset.appendChild(div);
    filterForm.appendChild(fieldset);
  });

  // Insert form after the dropdown, before the table scroll container
  filterDropdown.insertAdjacentElement('afterend', filterForm);

  // Add filter form handler (though we'll trigger applyFiltersAndSort on input change)
  filterForm.addEventListener('submit', (e) => e.preventDefault());

  // Initial visibility sync
  filterDropdown.dispatchEvent(new Event('change'));

  // Insert label, dropdown, and filter form into the filtersWrapper
  filtersWrapper.appendChild(filterLabel);
  filtersWrapper.appendChild(filterDropdown);
  filtersWrapper.appendChild(filterForm);

}



/**
 * Get appropriate operators based on data type
 * @param {string} type
 * @returns {Array<{value: string, label: string}>}
 */
function getOperatorsForType(type) {

  const operators = {
    string: [
      { value: 'eq', label: 'Equals' },
      { value: 'contains', label: 'Contains' }
    ],
    number: [
      { value: 'eq', label: 'Equals' },
      { value: 'gt', label: 'Greater Than' },
      { value: 'lt', label: 'Less Than' },
      { value: 'gte', label: 'Greater or Equal' },
      { value: 'lte', label: 'Less or Equal' }
    ],
    object: [
      { value: 'gt', label: 'After' },
      { value: 'lt', label: 'Before' }
    ]
  };
  return operators[type] || operators.string;
}

/**
 * Get appropriate input type based on value
 * @param {any} value
 */
function getInputTypeForValue(value, key) {
  if (value instanceof Date || key === "date") return 'datetime-local';
  if (typeof value === 'number') return 'number';
  return 'text';
}

/**
 * Apply filters to the data
 * @param {Array<Object>} records
 * @param {Object} filters
 * @returns {Array<Object>}
 */
function applyFilters(records, filters) {
  let filteredRecords = records;
  Object.entries(filters).forEach(([field, conditions]) => {
    if (!conditions.value) return;

    filteredRecords = filteredRecords.filter(record => {
      let value = record[field];
      let filterValue = conditions.value;

      // Handle type conversions
      if (field === 'date' || value instanceof Date) {
        value = new Date(value);
        filterValue = new Date(filterValue);
      } else if (typeof record[field] === 'number') {
        value = Number(value);
        filterValue = Number(filterValue);
      } else {
        value = String(value);
        filterValue = String(filterValue);
      }

      switch (conditions.operator) {
        case 'eq': return value == filterValue;
        case 'gt': return value > filterValue;
        case 'lt': return value < filterValue;
        case 'gte': return value >= filterValue;
        case 'lte': return value <= filterValue;
        case 'contains': return String(value).includes(filterValue);
        default: return true;
      }
    });
  });
  return filteredRecords;
}

/**
 * Sort the data
 * @param {Array<Object>} records
 * @param {string|null} field
 * @returns {Array<Object>}
 */
function sortData(records, field) {
  if (!field) return records;

  const ascending = !(currentSortField === field && currentSortOrder === 'asc');
  currentSortField = field;
  currentSortOrder = ascending ? 'asc' : 'desc';

  return records.sort((a, b) => {
    const aValue = a[field];
    const bValue = b[field];

    if (aValue instanceof Date || isDate(aValue)) {
      return ascending ?
        new Date(aValue) - new Date(bValue) :
        new Date(bValue) - new Date(aValue);
    }
    if (typeof aValue === "number" || parseFloat(aValue) == aValue) {
      return ascending ? aValue - bValue : bValue - aValue;
    }
    return ascending ?
      aValue.localeCompare(bValue) :
      bValue.localeCompare(aValue);
  });
}

/**
 * Handle filter and sort
 * @param {boolean} [loadMore=false] - Whether to load more data or reset
 */
async function applyFiltersAndSort(loadMore = false) {
  const filterForm = document.getElementById('filterForm');
  if (!filterForm) return;

  if (!loadMore) {
    globalThis.offset = 0;
    tbody.innerHTML = ''; // Clear only when reloading
  }

  const formData = new FormData(filterForm);
  const filters = {};
  for (const [key, value] of formData.entries()) {
    const [field, type] = key.split('_');
    if (!filters[field]) filters[field] = {};
    filters[field][type] = value;
  }

  // Only support a single query for IndexedDB cursor filtering
  let query = null;
  for (const [field, cond] of Object.entries(filters)) {
    if (cond.value && cond.operator) {
      query = { field, operator: cond.operator, value: cond.value };
      break; // Only one filter for IndexedDB-level filtering
    }
  }

  const limit = 20;
  const offset = globalThis.offset || 0;
  // Use new getAllSensorData signature
  const records = await getAllSensorData(DATABASENAME, query, limit, offset);

  // Apply any remaining filters in-memory (if more than one filter)
  let filteredRecords = records;
  if (Object.keys(filters).length > 1) {
    filteredRecords = applyFilters(records, filters);
  }

  const sortedAndFilteredRecords = sortData(filteredRecords, currentSortField);

  // Only increment offset if we have more records to show
  if (sortedAndFilteredRecords.length > 0) {
    globalThis.offset = offset + sortedAndFilteredRecords.length;
    loadingIndicator.dispatchEvent(new Event(sortedAndFilteredRecords.length >= limit ? 'ended' : 'waiting'));

    sortedAndFilteredRecords.forEach(record => addRow(tbody, record));
  } else {
    loadingIndicator.dispatchEvent(new Event('ended'));
    // loadingIndicator.style.display = 'none';
  }

  // Show/hide placeholder based on table content
  const placeholder = document.getElementById('table-placeholder');
  if (!tbody.querySelector('td')) {
    if (placeholder) placeholder.style.display = 'block';
  } else {
    if (placeholder) placeholder.style.display = 'none';
  }
}

function isDate(dateVal) {
  var d = new Date(dateVal);
  return d.toString() === 'Invalid Date' ? false : true;
}

/**
 * Sort table by column (triggered by button click)
 * @param {string} field
 */
function sortTable(field) {
  if (currentSortField === field) {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortField = field;
    currentSortOrder = 'asc';
  }
  applyFiltersAndSort();
}

/**
 * Add a row to the table
 * @param {HTMLTableSectionElement} table
 * @param {Object} data
 */
function addRow(table, data) {
  const row = table.insertRow(0);
  row.id = data.id || (data.date || new Date()); // Use date as fallback ID
  for (const key in data) {
    const cell = row.insertCell();
    /** @type {Date | number | string} */
    const value = data[key];
    row.dataset[key] = value;
    if (key === 'date') {
      // Handle ISO string date
      let dateObj = value instanceof Date ? value : new Date(value);
      cell.textContent = isNaN(dateObj.getTime()) ? value : dateObj.toLocaleString("et-EE");
    } else if (typeof value === 'number') {
      cell.textContent = value.toFixed(2);
    } else {
      cell.textContent = value;
    }
  }
}


function ResetDBButtonElement() {

  const resetDB = document.createElement('button');
  resetDB.id = 'resetDB';
  resetDB.textContent = 'Reset DB';
  resetDB.addEventListener('click', async () => {
    alert('Resetting DB...');
    // Open the database
    const request = window.indexedDB.open(DATABASENAME, 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("sensorData", "readwrite");
      const store = transaction.objectStore("sensorData");
      store.clear(); // Clear all data in the object store
      console.log("Database cleared successfully.");
      location.reload();
    };

    request.onerror = (event) => {
      alert("Error opening database: " + event.target.error + "\nData: " + JSON.stringify(event));
      console.error("Error opening database:", event.target.error);
      location.reload();
    };
  });
  resetDB.className = 'btn btn-primary';
  return resetDB;
}
