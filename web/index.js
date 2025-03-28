const your_service_uuid = '711661ab-a17a-4c7f-bc9f-de1f070a66f4';
const your_characteristic_uuid = '4d4bc742-f257-41e5-b268-6bc4f3d1ea73';
const DATABASENAME = "BlackDeLaJackClimate";

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
async function saveData() {
  const data = {
    date: new Date().toISOString(),
    temperature: (Math.random() * 30 + 0),
    humidity: (Math.random() * 70 + 50),
    particles: (Math.random() * 70 + 20),
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
  /** @type {HTMLTableSectionElement} */
  const tbody = document.querySelector('#TABLE tbody');
  /** @type {HTMLTableSectionElement} */
  const thead = document.querySelector('#TABLE thead');
  if (!tbody || !thead) return;

  // Define the default structure of the data
  const defaultDataStructure = {
    date: "2025-03-28T00:00:00.000Z",
    temperature: 0,
    humidity: 0,
    particles: 0,
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
  }

  /**
   * Create filter controls for each column
   * @param {Object} data 
   */
  function createFilterControls(data) {
    const filterForm = document.createElement('form');
    filterForm.id = 'filterForm';
    filterForm.className = 'filters';

    Object.keys(data).forEach(key => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = key.charAt(0).toUpperCase() + key.slice(1);

      // Create operator select
      const operatorSelect = document.createElement('select');
      operatorSelect.addEventListener('change', handleFilter);
      operatorSelect.name = `${key}_operator`;
      const operators = getOperatorsForType(typeof data[key]);
      operators.forEach(op => {
        const option = document.createElement('option');
        option.value = op.value;
        option.textContent = op.label;
        operatorSelect.appendChild(option);
      });

      // Create value input
      const valueInput = document.createElement('input');
      valueInput.name = `${key}_value`;
      valueInput.type = getInputTypeForValue(data[key]);
      valueInput.addEventListener('change', handleFilter);


      // Create sort button
      const sortBtn = document.createElement('button');
      sortBtn.type = 'button';
      sortBtn.textContent = '↕';
      sortBtn.onclick = () => sortTable(key);

      fieldset.appendChild(legend);
      fieldset.appendChild(operatorSelect);

      const div = document.createElement('div');
      div.classList.add("flex", "flex-row");
      div.appendChild(valueInput);
      div.appendChild(sortBtn);

      fieldset.appendChild(div);
      filterForm.appendChild(fieldset);
  });

    // // Add filter button
    // const filterBtn = document.createElement('button');
    // filterBtn.type = 'submit';
    // filterBtn.textContent = 'Apply Filters';
    // filterForm.appendChild(filterBtn);

    // Insert form before table
    document.querySelector('#TABLE').insertAdjacentElement('beforebegin', filterForm);

    // Add filter form handler
    filterForm.addEventListener('submit', handleFilter);
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
  function getInputTypeForValue(value) {
    if (value instanceof Date) return 'datetime-local';
    if (typeof value === 'number') return 'number';
    return 'text';
  }

  /**
   * Handle filter form submission
   * @param {Event} e 
   */
  async function handleFilter(e) {
    e.preventDefault();
    const formData = new FormData(e.target.form);
    const filters = [];

    // Group form data by field
    for (const [key, value] of formData.entries()) {
      const [field, type] = key.split('_');
      if (!filters[field]) filters[field] = {};
      filters[field][type] = value;
    }

    // Apply filters to IndexedDB data
    const request = window.indexedDB.open(DATABASENAME, 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction("sensorData", "readonly");
      const store = transaction.objectStore("sensorData");
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        let filteredRecords = getAllRequest.result;

        // Apply each filter
        Object.entries(filters).forEach(([field, conditions]) => {
          if (!conditions.value) return;

          filteredRecords = filteredRecords.filter(record => {
            const value = record[field];
            const filterValue = conditions.value;

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

        // Update table with filtered results
        tbody.innerHTML = '';
        filteredRecords.forEach(record => addRow(tbody, record));
      };
    };
  }

  function isDate(dateVal) {
    var d = new Date(dateVal);
    return d.toString() === 'Invalid Date'? false: true;
  }

  /**
   * Sort table by column
   * @param {string} field 
   */
  function sortTable(field) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const ascending = tbody.dataset.sortField === field &&
      tbody.dataset.sortOrder === 'asc';

    rows.sort((a, b) => {
      const fieldset = rows[0].dataset;
      const aValue = a.dataset[field];
      const bValue = b.dataset[field];
      if (fieldset[field] instanceof Date || isDate(aValue)) {
        return ascending ? new Date(aValue) - new Date(bValue) : new Date(bValue) - new Date(aValue);
      }
      if (typeof fieldset[field] === "number" || parseFloat(aValue) == aValue) {
        return ascending ? bValue - aValue : aValue - bValue;
      }
      return ascending ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
    });

    tbody.dataset.sortField = field;
    tbody.dataset.sortOrder = ascending ? 'desc' : 'asc';

    rows.forEach(row => tbody.appendChild(row));
  }

  /**
   * Add a row to the table
   * @param {HTMLTableSectionElement} table
   * @param {Object} data 
   */
  function addRow(table, data) {
    const row = table.insertRow(0);
    row.id = data.id || data.date; // Use date as fallback ID
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
   * Load all data from IndexedDB
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
          records.forEach(record => addRow(tbody, record));
        } else {
          // Create headers and filters even if no data exists
          createTableHeaders(defaultDataStructure);
          createFilterControls(defaultDataStructure);
        }
      };
    };

    request.onerror = (event) => {
      console.error("Error opening database:", event.target.error);
    };
  }

  // Load existing data on startup
  loadFromIndexedDB();

  // Infinite scrolling / "Load More" functionality
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
          // Create headers if they don't exist
          if (!thead.hasChildNodes()) {
            createTableHeaders(data);
          }
          // Add to table and save to IndexedDB
          addRow(tbody, data);
          await saveToIndexedDB(data);
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

  document.querySelector('#makeFakeData').addEventListener('click', saveData);
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


