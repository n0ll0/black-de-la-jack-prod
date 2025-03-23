const your_service_uuid = '711661ab-a17a-4c7f-bc9f-de1f070a66f4';
const your_characteristic_uuid = '4d4bc742-f257-41e5-b268-6bc4f3d1ea73';
/**
 * Try-catch helper function
 * @template T
 * @param {Promise<T>|Function} input
 * @returns {[T|null, Error|null]}
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

// Function to send new sensor data
async function sendData() {
  const data = {
    date: new Date().toISOString(),
    temperature: (Math.random() * 50 + 20),
    humidity: (Math.random() * 70 + 50),
    other: "Test Data"
  };

  await fetch('/json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem("_S_BDLJ_")// || cookieStorage.getItem("_S_BDLJ_")
    },
    body: JSON.stringify(data)
  });
}

document.addEventListener('DOMContentLoaded', () => {
  /** @type {HTMLTableSectionElement} */
  const tbody = document.querySelector('#TABLE tbody');
  if (!tbody) { }
  /**
   * 
   * @param {HTMLTableSectionElement} table
   * @param {{date:string|Date,temperature:number|string,humidity:number|string,other:string|null,id:string}} data 
   */
  function addRow(table, data) {
    const row = table.insertRow(0);
    row.id = data.id;
    row.insertCell(0).textContent = new Date(data.date).toLocaleString("et-EE");
    row.insertCell(1).textContent = parseFloat(data.temperature).toFixed(2);
    row.insertCell(2).textContent = parseFloat(data.humidity).toFixed(2);
    row.insertCell(3).textContent = data.other || 'N/A';
  }
  // Set up SSE connection for real-time updates
  const params = new URLSearchParams(window.location.search);
  /*const eS = new EventSource('/events' + (params.toString().length > 0 ? '?' + params.toString() : ''));
  eS.onopen = () => console.log('SSE Connection established');
  eS.onmessage = (event) => {
  console.log('New SSE event:', event.data);
  const data = JSON.parse(event.data);
  if (document.getElementById(data.id) !== null) return;
  addRow(document.querySelector('#TABLE tbody'), data);
  };
  eS.onerror = () => {
  console.error("SSE error occurred");
  eS.close();
  };*/

  // Infinite scrolling / "Load More" functionality
  const limit = globalThis.offset;

  /** @type { HTMLButtonElement} */
  const loadMore = document.querySelector('button#loadMore');

  if (!loadMore) { }

  loadMore.addEventListener('click', loadMoreEvent);
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= loadMore.offsetTop) {
      loadMoreEvent();
    }
  });

  async function loadMoreEvent() {
    // if (!loadMore) return;
    if (loadMore.disabled) return;
    /** @type {HTMLInputElement | null} */
    const from = document.querySelector('input#from')?.value;
    const to = document.getElementById('to')?.value;
    const search = document.getElementById('search')?.value;
    /**@type{Record<string,any>}*/
    const paramsObject = { offset: globalThis.offset, limit, from, to, search };
    const params = new URLSearchParams(paramsObject);
    const response = await fetch('/api/records?' + params.toString());
    if (response.ok) {
      const newRecords = await response.json();
      if (newRecords.length === 0) {
        loadMore.disabled = true;
        loadMore.hidden = true;
        return;
      }
      /** @type {HTMLTableElement} */
      newRecords.forEach(record => {
        if (document.getElementById(record.id) !== null) return;
        addRow(tbody, record);
      });
      globalThis.offset += newRecords.length;
      // sort the table
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const dateA = a.id;
        const dateB = b.id;
        return dateB < dateA;
      });
      rows.forEach(row => tbody.appendChild(row));
    }
  };

  // Handle search form submission: reload page with query parameters
  document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const params = new URLSearchParams(new FormData(e.target));

    // Convert local datetime to UTC
    const from = new Date(document.querySelector('input[name="from"]')?.value) ?? "";
    const to = new Date(document.querySelector('input[name="to"]')?.value) ?? "";
    if (from?.length > 0) params.set('from', from.toISOString());
    if (to?.length > 0) params.set('to', to.toISOString());

    window.location = '/?' + params.toString();
  });
  document.getElementById('select_device').addEventListener('click', async () => {
    if (!("bluetooth" in navigator)) {
      console.log("Bluetooth API not supported");
      return;
    }

    if (!navigator.bluetooth.getAvailability()) {
      console.log("Bluetooth not available");
      return;
    }

    try {
      const [device, deviceError] = await tryCatch(navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
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
        const data = new Uint8Array(buffer);
        const obj = {};
        obj.temperature = parseFloat(data[0]);
        obj.humidity = parseFloat(data[1]);
        obj.other = `Received from Bluetooth (${device.id})`;
        return obj;
      }

      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = event.target.value;

        const data = DecodeBufferIntoObject(value.buffer);
        console.log('Received data:', data);
        // Process the received data and update your PWA UI accordingly
        addRow(tbody, data);
      });

      await characteristic.startNotifications();
      console.log('Started notifications');
    } catch (error) {
      console.error('Error:', error);
    }
  });
  

  document.getElementById('install')?.addEventListener('click', async (ev) => {
    if (!installPrompt) {
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      installPrompt = null;
      document.getElementById('install').hidden = true;

    }
  });
});



let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    document.getElementById('install').hidden = false;
  });