
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Set up SSE connection for real-time updates
  const eS = new EventSource('/events');
  eS.onopen = () => console.log('SSE Connection established');
  eS.onmessage = (event) => {
    console.log('New SSE event:', event.data);
    const data = JSON.parse(event.data);
    const table = document.querySelector('#TABLE tbody');
    const row = table.insertRow(0);
    row.insertCell(0).innerHTML = new Date(data.date).toLocaleString();
    row.insertCell(1).innerHTML = data.temperature.toFixed(2);
    row.insertCell(2).innerHTML = data.humidity.toFixed(2);
    row.insertCell(3).innerHTML = data.other;
  };
  eS.onerror = () => {
    console.error("SSE error occurred");
    eS.close();
  };

  // Infinite scrolling / "Load More" functionality
  const limit = globalThis.offset;
  document.getElementById('loadMore').addEventListener('click', async () => {
    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;
    const search = document.getElementById('search').value;
    const params = new URLSearchParams({ offset: globalThis.offset, limit, from, to, search });
    const response = await fetch('/api/records?' + params.toString());
    if (response.ok) {
      const newRecords = await response.json();
      const tbody = document.querySelector('#TABLE tbody');
      newRecords.forEach(record => {
        const tr = tbody.insertRow();
        tr.insertCell(0).textContent = new Date(record.date).toLocaleString();
        tr.insertCell(1).textContent = parseFloat(record.temperature).toFixed(2);
        tr.insertCell(2).textContent = parseFloat(record.humidity).toFixed(2);
        tr.insertCell(3).textContent = record.other || 'N/A';
      });
      globalThis.offset += newRecords.length;
    }
  });

  // Handle search form submission: reload page with query parameters
  document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const params = new URLSearchParams(new FormData(e.target));

    // Convert local datetime to UTC
    const from = new Date(document.querySelector('input[name="from"]')?.value)??"";
    const to = new Date(document.querySelector('input[name="to"]')?.value)??"";
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