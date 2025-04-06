// (A) CREATE/INSTALL CACHE
self.addEventListener("install", evt => {
	self.skipWaiting();
	evt.waitUntil(
		caches.open("Demo")
			.then(cache => cache.addAll([
				"index.html",
				"static/site.webmanifest",
				"static/Black de la Jack.svg",
				"static/index.js"
			]))
			.catch(err => console.error(err))
	);
});

// (B) CLAIM CONTROL INSTANTLY
self.addEventListener("activate", evt => self.clients.claim());

// (C) LOAD FROM CACHE FIRST, FALLBACK TO NETWORK IF NOT FOUND
self.addEventListener("fetch", evt => evt.respondWith(
	caches.match(evt.request).then(res => res || fetch(evt.request))
));

// (C) LOAD WITH NETWORK FIRST, FALLBACK TO CACHE IF OFFLINE
self.addEventListener("fetch", evt => evt.respondWith(
	fetch(evt.request).catch(() => caches.match(evt.request))
));

self.addEventListener("message", evt => {
	if (evt.data.action == "skipWaiting") {
		self.skipWaiting();
	}
	if (evt.data.action == "clearCache") {
		caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
	}
	if (evt.data.action == "enterData") {
		self.localStorage.setItem("data-entries", evt.data.entries);
	}
	if (evt.data.action == "addData") {
		const data = JSON.parse(self.localStorage.getItem("data-entries")) || [];
		data.push(evt.data.entry);
		self.localStorage.setItem("data-entries", JSON.stringify(data));
	}
	if (evt.data.action == "getData") {
    evt.ports[0].postMessage(JSON.parse(self.localStorage.getItem("data-entries")) || []);
  }
});

