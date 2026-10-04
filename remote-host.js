// Phone remote, laptop side: shows a QR code and follows commands from remote.html.
// Both sides talk through two public MQTT brokers at once, so one blocked broker is not a problem.
(function () {
  if (!window.DECK || !window.mqtt) return;
  var ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var room = null;
  try { room = localStorage.getItem('honyarRoom'); } catch (e) {}
  if (!room || !/^[A-Z0-9]{6}$/.test(room)) {
    var b = new Uint8Array(6); crypto.getRandomValues(b);
    room = Array.prototype.map.call(b, function (x) { return ALPH[x % ALPH.length]; }).join('');
    try { localStorage.setItem('honyarRoom', room); } catch (e) {}
  }
  var BASE = 'honyar-deck/v1/' + room + '/';
  var BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
  // From the offline copy (file://) the phone cannot open a local file, so use the live remote page.
  var remoteURL = (location.protocol === 'file:' ? 'https://cpamukcu.github.io/honyar-turkey/remote.html'
    : new URL('remote.html', location.href).href.split('#')[0]) + '#' + room;
  var clients = [], seen = {}, lastPhone = 0;

  function publishState() {
    var msg = JSON.stringify({ n: DECK.cur, N: DECK.N, t: Date.now() });
    clients.forEach(function (c) { if (c.connected) c.publish(BASE + 'state', msg, { qos: 0, retain: true }); });
  }
  function onCmd(m) {
    if (!m || !m.id || seen[m.id]) return;
    seen[m.id] = 1;
    var first = Date.now() - lastPhone > 60000;
    lastPhone = Date.now();
    if (m.a === 'next') DECK.next();
    else if (m.a === 'prev') DECK.prev();
    else if (m.a === 'go' && typeof m.n === 'number') DECK.show(m.n);
    else publishState();
    if (first && !ov.hidden) setTimeout(function () { ov.hidden = true; }, 1200);
    setStatus();
  }
  BROKERS.forEach(function (url) {
    try {
      var c = mqtt.connect(url, { clientId: 'deck_' + room + '_' + Math.random().toString(16).slice(2, 8), reconnectPeriod: 3000, connectTimeout: 8000, keepalive: 30 });
      c.on('connect', function () { c.subscribe(BASE + 'cmd'); publishState(); setStatus(); });
      c.on('close', setStatus);
      c.on('error', function () {});
      c.on('message', function (t, p) { try { onCmd(JSON.parse(p.toString())); } catch (e) {} });
      clients.push(c);
    } catch (e) {}
  });
  window.addEventListener('slidechange', publishState);
  setInterval(publishState, 15000);
  setInterval(setStatus, 5000);

  // Overlay with the QR code
  var ov = document.createElement('div');
  ov.id = 'phoneOv'; ov.hidden = true;
  ov.innerHTML =
    '<div class="pcard" role="dialog" aria-label="Control from your phone">' +
    '<button class="px" aria-label="Close">&#215;</button>' +
    '<p class="pk">Phone remote</p><h2>Scan to control the slides</h2>' +
    '<div class="pqr"></div>' +
    '<p class="pcode">Code <b>' + room + '</b></p>' +
    '<p class="purl"></p>' +
    '<p class="pstat"><i></i><span>Connecting&#8230;</span></p></div>';
  document.body.appendChild(ov);
  try {
    var qr = qrcode(0, 'M'); qr.addData(remoteURL); qr.make();
    ov.querySelector('.pqr').innerHTML = qr.createSvgTag(6, 2);
  } catch (e) {}
  ov.querySelector('.purl').textContent = remoteURL;
  ov.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === ov) ov.hidden = true; });
  ov.querySelector('.px').onclick = function () { ov.hidden = true; };

  function setStatus() {
    var up = clients.filter(function (c) { return c.connected; }).length;
    var phone = Date.now() - lastPhone < 45000;
    var s = ov.querySelector('.pstat'), btn = document.getElementById('phoneBtn');
    s.className = 'pstat ' + (phone ? 'ok' : up ? 'wait' : 'off');
    s.querySelector('span').textContent = phone ? 'Phone connected' : up ? 'Waiting for your phone' : 'No connection to the remote server';
    if (btn) btn.classList.toggle('on', phone);
  }

  var bar = document.getElementById('bar');
  if (bar) {
    var btn = document.createElement('button');
    btn.id = 'phoneBtn'; btn.textContent = 'Phone';
    btn.onclick = function (e) { e.stopPropagation(); ov.hidden = !ov.hidden; };
    bar.appendChild(btn);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'p' || e.key === 'P') ov.hidden = !ov.hidden;
    else if (e.key === 'Escape') ov.hidden = true;
  });
  setStatus();
})();
