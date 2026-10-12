// Extra route for the phone remote through ntfy.sh on the normal HTTPS port 443.
// Some networks (school Wi-Fi) block the MQTT ports 8084/8884; port 443 is almost never blocked.
// Same interface as an mqtt.js client: connected, on(), subscribe(), publish().
// ntfy.sh limits how many messages one network may send, so this route skips repeats.
(function () {
  window.ntfyConnect = function () {
    var self = { connected: false }, handlers = {}, subs = [], ws = null, opened = 0, lastState = { n: null, at: 0 };
    function emit(ev) { var a = [].slice.call(arguments, 1); (handlers[ev] || []).forEach(function (f) { try { f.apply(null, a); } catch (e) {} }); }
    function name(t) { return 'hny_' + t.replace(/[^A-Za-z0-9_-]/g, '_'); }
    function open() {
      if (!subs.length) return;
      var id = ++opened;
      try { if (ws) { ws.onclose = null; ws.close(); } } catch (e) {}
      try { ws = new WebSocket('wss://ntfy.sh/' + subs.map(name).join(',') + '/ws'); } catch (e) { return setTimeout(open, 3000); }
      ws.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.event === 'open') { if (!self.connected) { self.connected = true; emit('connect'); } return; }
        if (m.event !== 'message') return;
        for (var i = 0; i < subs.length; i++) if (name(subs[i]) === m.topic) {
          var body = m.message; emit('message', subs[i], { toString: function () { return body; } });
        }
      };
      ws.onclose = function () { if (id !== opened) return; var was = self.connected; self.connected = false; if (was) emit('close'); setTimeout(open, 3000); };
      ws.onerror = function () {};
    }
    self.on = function (ev, f) { (handlers[ev] = handlers[ev] || []).push(f); return self; };
    self.subscribe = function (t) { if (subs.indexOf(t) < 0) { subs.push(t); open(); } return self; };
    self.publish = function (t, msg) {
      msg = String(msg);
      if (/\/cmd$/.test(t) && /"a":"ping"/.test(msg)) return self;             // keep-alive pings: not needed here
      if (/\/state$/.test(t)) {                                                 // the same slide again within 10 s: skip
        var n = null; try { n = JSON.parse(msg).n; } catch (e) {}
        if (n === lastState.n && Date.now() - lastState.at < 10000) return self;
        lastState = { n: n, at: Date.now() };
      }
      try { fetch('https://ntfy.sh/' + name(t), { method: 'POST', body: msg, mode: 'cors', keepalive: true }).catch(function () {}); } catch (e) {}
      return self;
    };
    setTimeout(function () { emit('connect'); }, 0);   // lets the page subscribe; real "connected" comes when the socket opens
    return self;
  };
})();
