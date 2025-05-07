const your_service_uuid = '711661ab-a17a-4c7f-bc9f-de1f070a66f4';
const your_characteristic_uuid = '4d4bc742-f257-41e5-b268-6bc4f3d1ea73';
const DATABASENAME = "BlackDeLaJackClimate";
globalThis.offset = 0;

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

// Function to save new sensor data
async function saveRandomData() {
  const data = {
    temperature: 0,
    humidity: 0,
    co2: 0,
    mq2: 0,
    pm2_5: 0,
    pm10: 0,
    location: 0,
    date: new Date().toISOString(),
  };

  // Open the database
  const request = window.indexedDB.open(DATABASENAME, 1);

  // Handle database setup or upgrade
  request.onupgradeneeded = function (event) {
    const db = event.target?.result;

    // Create an object store if it doesn't exist
    if (!db.objectStoreNames.contains("sensorData")) {
      db.createObjectStore("sensorData", { keyPath: "date" });
    }
  };

  // Handle success or errors
  request.onsuccess = function (event) {
    const db = event.target.result;

    // Start a transaction
    const transaction = db.transaction("sensorData", "readwrite");
    const store = transaction.objectStore("sensorData");

    // Add the new data
    const addRequest = store.add(data);

    addRequest.onsuccess = function () {
      console.log("Data saved successfully:", data);
    };

    addRequest.onerror = function (error) {
      console.error("Error saving data:", error);
    };
  };

  request.onerror = function (error) {
    console.error("Error opening database:", error);
  };
}


document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');
  /** @type {HTMLTableSectionElement} */
  const tbody = document.querySelector('#TABLE tbody');
  /** @type {HTMLTableSectionElement} */
  const thead = document.querySelector('#TABLE thead');
  if (!tbody || !thead) return;

  // Define the default structure of the data
  const defaultDataStructure = {
    temperature: 0,
    humidity: 0,
    co2: 0,
    mq2: 0,
    pm2_5: 0,
    pm10: 0,
    location: 0,
    date: new Date().toISOString(),
  };

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
    const filterForm = document.createElement('form');
    filterForm.id = 'filterForm';
    filterForm.className = 'filters';

    Object.keys(data).forEach(key => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = key.charAt(0).toUpperCase() + key.slice(1);
      fieldset.classList.add('collapsed'); // Start collapsed

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
      valueInput.addEventListener('change', () => applyFiltersAndSort(false));
      valueInput.addEventListener('input', () => applyFiltersAndSort(false));


      // Replace sort button with sort select
      const sortSelect = document.createElement('select');
      sortSelect.name = `${key}_sort`;
      sortSelect.title = "Sort order";
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

    // Insert form before table
    document.querySelector('#TABLE').insertAdjacentElement('beforebegin', filterForm);

    // Add filter form handler (though we'll trigger applyFiltersAndSort on input change)
    filterForm.addEventListener('submit', (e) => e.preventDefault());
  }

  // Add these new functions for CSV export
  function exportToCSV() {
    const filterForm = document.getElementById('filterForm');
    if (!filterForm) return;

    const request = window.indexedDB.open(DATABASENAME, 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("sensorData", "readonly");
      const store = transaction.objectStore("sensorData");
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        let records = getAllRequest.result;
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
      };
    };
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

  let currentSortField = null;
  let currentSortOrder = 'asc';

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

    const request = window.indexedDB.open(DATABASENAME, 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("sensorData", "readonly");
      const store = transaction.objectStore("sensorData");
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        let records = getAllRequest.result;
        const filteredRecords = applyFilters(records, filters);
        const sortedAndFilteredRecords = sortData(filteredRecords, currentSortField);

        const limit = 50; // Show 50 records at a time
        const offset = globalThis.offset || 0;
        const paginatedRecords = sortedAndFilteredRecords.slice(offset, offset + limit);

        // Only increment offset if we have more records to show
        if (paginatedRecords.length > 0) {
          globalThis.offset = offset + limit;
          loadingIndicator.style.display =
            paginatedRecords.length >= limit &&
              globalThis.offset < sortedAndFilteredRecords.length ? 'block' : 'none';

          paginatedRecords.forEach(record => addRow(tbody, record));
        } else {
          loadingIndicator.style.display = 'none';
        }
      };
    };
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
      if (value instanceof Date || key === 'date') {
        cell.textContent = value.toLocaleString("et-EE");
      } else if (typeof value === 'number') {
        cell.textContent = value.toFixed(2);
      } else {
        cell.textContent = value;
      }
    }
  }

  /**
   * Save data to IndexedDB
   * @param {Object} data
   */
  async function saveToIndexedDB(data) {
    const request = window.indexedDB.open(DATABASENAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Ensure the object store is created
      if (!db.objectStoreNames.contains("sensorData")) {
        db.createObjectStore("sensorData", { keyPath: "date" });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("sensorData", "readwrite");
      const store = transaction.objectStore("sensorData");
      store.add({ ...data, date: new Date().toISOString() });
    };

    request.onerror = (event) => {
      console.error("Error opening database:", event.target.error);
    };
  }

  /**
   * Load all data from IndexedDB and initialize table and filters
   */
  async function loadFromIndexedDB() {
    const request = window.indexedDB.open(DATABASENAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Ensure the object store is created
      if (!db.objectStoreNames.contains("sensorData")) {
        db.createObjectStore("sensorData", { keyPath: "date" });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("sensorData", "readonly");
      const store = transaction.objectStore("sensorData");
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const records = getAllRequest.result;
        if (records.length > 0) {
          createTableHeaders(records[0]);
          createFilterControls(records[0]);
          globalThis.offset = 0; // Reset offset when loading fresh data
          applyFiltersAndSort();
        } else {
          // Create headers and filters even if no data exists
          createTableHeaders(defaultDataStructure);
          createFilterControls(defaultDataStructure);
          applyFiltersAndSort();

        }
      };
    };

    request.onerror = (event) => {
      console.error("Error opening database:", event.target.error);
    };
  }


  // Add export button at the top
  const exportButton = document.createElement('button');
  exportButton.textContent = 'Export CSV';
  exportButton.type = 'button';
  exportButton.className = 'export-btn';
  exportButton.addEventListener('click', exportToCSV);
  document.querySelector('#TABLE').after(exportButton);


  // Add intersection observer for infinite scrolling
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'loading';
  loadingIndicator.textContent = 'Loading more...';
  loadingIndicator.style.display = 'none';
  document.querySelector('#TABLE').after(loadingIndicator);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        applyFiltersAndSort(true); // Pass true to load more
      }
    });
  }, { threshold: 0.5 });

  observer.observe(loadingIndicator);

  // Load existing data on startup
  loadFromIndexedDB();

  // Infinite scrolling / "Load More" functionality (not directly related to filtering/sorting on new data)
  if (!globalThis.offset) globalThis.offset = 0;
  const limit = globalThis.offset;

  /** @type { HTMLButtonElement} */
  const loadMore = document.querySelector('button#loadMore');
  if (!loadMore) {

  }
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
        optionalServices: [your_service_uuid] // Add service UUIDs here
      }));
      if (deviceError) {
        console.error('Error:', deviceError);
        return;
      }
      console.log('Got device:', device);

      if (!device.gatt.connected) {
        await device.gatt.connect();
      }

      const [gattServer, gattError] = await tryCatch(device.gatt.connect());
      if (gattError) {
        console.error('Error:', gattError);
        return;
      }
      const [service, serviceError] = await tryCatch(gattServer.getPrimaryService(your_service_uuid));
      if (serviceError) {
        console.error('Error:', serviceError);
        return;
      }
      const [characteristic, characteristicError] = await tryCatch(service.getCharacteristic(your_characteristic_uuid));
      if (characteristicError) {
        console.error('Error:', characteristicError);
        return;
      }

      function DecodeBufferIntoObject(buffer) {
        try {
          // Assume the buffer contains JSON string
          const decoder = new TextDecoder();
          const jsonString = decoder.decode(buffer);
          const data = JSON.parse(jsonString);
          data["date"] = new Date().toISOString();
          console.log('Decoded data:', data);
          return data;
        } catch (error) {
          console.error('Error decoding data:', error);
          return null;
        }
      }

      characteristic.addEventListener('characteristicvaluechanged', async (event) => {
        const value = event.target.value;
        const data = DecodeBufferIntoObject(value.buffer);

        if (data) {
          console.log('Received data:', data);
          if (!thead.hasChildNodes()) {
            createTableHeaders(data);
            createFilterControls(data);
          }
          await saveToIndexedDB(data);
          console.log('Saved data to IndexedDB:', data);
          applyFiltersAndSort(false); // Pass false to reload
        }
      });

      await characteristic.startNotifications();
      console.log('Started notifications');
    } catch (error) {
      console.error('Error:', error);
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
      console.error('Error during installation:', error);
    }
  });
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
      console.error("Error opening database:", event.target.error);
      location.reload();
    };
  });
  resetDB.className = 'btn btn-primary';
  document.body.querySelector('main').appendChild(resetDB);

  // document.querySelector('#makeFakeData').addEventListener('click', saveRandomData);
});

let installPrompt = null;
// const installButton = document.createElement('button');
// installButton.id = 'install';
// installButton.textContent = 'Install PWA';
// // installButton.hidden = true;
// document.body.appendChild(installButton);

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