
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
  function addRow(table, rowData) {
    const row = table.insertRow(0);
    row.id = data.id;
    row.insertCell(0).textContent = new Date(rowData.date).toLocaleString("et-EE");
    row.insertCell(1).textContent = parseFloat(rowData.temperature).toFixed(2);
    row.insertCell(2).textContent = parseFloat(rowData.humidity).toFixed(2);
    row.insertCell(3).textContent = rowData.other || 'N/A';
  }
  // Set up SSE connection for real-time updates
  const params = new URLSearchParams(window.location.search);
  const eS = new EventSource('/events' + (params.toString().length > 0 ? '?' + params.toString() : ''));
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
  };

  // Infinite scrolling / "Load More" functionality
  const limit = globalThis.offset;

  const loadMoreEvent = async () => {
    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;
    const search = document.getElementById('search').value;
    const params = new URLSearchParams({ offset: globalThis.offset, limit, from, to, search });
    const response = await fetch('/api/records?' + params.toString());
    if (response.ok) {
      const newRecords = await response.json();
      const tbody = document.querySelector('#TABLE tbody');
      newRecords.forEach(record => {
        if (document.getElementById(record.id) !== null) return;
        addRow(tbody, record);
      });
      globalThis.offset += newRecords.length;
    }
  };
  const loadMore = document.getElementById('loadMore');
  loadMore.addEventListener('click', loadMoreEvent);
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= loadMore.offsetTop) {
      loadMoreEvent();
    }
  });

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
});

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  document.getElementById('install').hidden = false;
});

document.getElementById('install')?.addEventListener('click', async (ev) => {
  if (!installPrompt) {
    return;
  }
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  if (outcome === 'accepted') {
    installPrompt = null;
  }
});