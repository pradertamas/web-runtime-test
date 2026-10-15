/* Dependency-free diagnostic PoC. Runtime conditions are changed manually. */
(function () {
  'use strict';
  var LIMIT = 500, logs = [], epoch = Date.now(), ticks = 0, frames = 0;
  var canvasFrames = 0, glFrames = 0, fps = 0, canvasFps = 0, glFps = 0;
  var lastFrame = null, lastFrameWall = null, sampleTime = null, sampleFrames = 0, sampleCanvas = 0, sampleGl = 0;
  var maxFrameGap = 0, maxTimerGap = 0, lastTick = epoch, lastFpsLog = 0, previousLoggedFps = null;
  var ctx = null, gl = null, glKind = 'NOT AVAILABLE', glInfo = {}, glLost = false;
  var canvasState = 'NOT AVAILABLE', glState = 'NOT AVAILABLE', storageState = 'WAITING';
  var touch = { last: '—', x: null, y: null, count: 0 }, continuity = null, socket = null;
  var rafAvailable = typeof window.requestAnimationFrame === 'function';
  var timerId = null, measurementGeneration = 0;
  function el(id) { return document.getElementById(id); }
  function put(id, value) { el(id).textContent = String(value); }
  function errorText(error) { return error && error.message ? error.message : String(error); }
  function stamp(date) { return date.toTimeString().slice(0, 8) + '.' + ('00' + date.getMilliseconds()).slice(-3); }
  function log(message) {
    logs.push(stamp(new Date()) + ' ' + String(message).slice(0, 1500));
    if (logs.length > LIMIT) { logs.shift(); }
    put('log-count', logs.length + ' / ' + LIMIT);
    put('log', logs.join('\n'));
  }
  window.addEventListener('error', function (event) { log('ERROR ' + event.message); });
  window.addEventListener('unhandledrejection', function (event) { log('UNHANDLED_REJECTION ' + errorText(event.reason)); });
  function duration(ms) { var s = Math.max(0, Math.floor(ms / 1000)), minutes = Math.floor(s / 60); return (minutes < 10 ? '0' : '') + minutes + ':' + ('0' + s % 60).slice(-2); }
  function focus() { try { return typeof document.hasFocus === 'function' ? document.hasFocus() : null; } catch (error) { return null; } }
  function visibility() { return document.visibilityState || 'NOT AVAILABLE'; }
  function pageState() {
    put('visibility', visibility()); put('focus', focus() === null ? 'NOT AVAILABLE' : (focus() ? 'YES' : 'NO'));
    put('online', typeof navigator.onLine === 'boolean' ? navigator.onLine : 'NOT AVAILABLE');
  }
  function browserInfo() {
    // A missing/blocked information property must not prevent timer initialization.
    function read(id, getter) {
      try { var value = getter(); put(id, value === undefined || value === null || value === '' ? 'NOT AVAILABLE' : value); }
      catch (error) { put(id, 'NOT AVAILABLE'); log('BROWSER_INFO_ERROR ' + id + ' ' + errorText(error)); }
    }
    read('ua', function () { return navigator.userAgent; });
    read('viewport', function () { return typeof window.innerWidth === 'number' && typeof window.innerHeight === 'number' ? window.innerWidth + ' × ' + window.innerHeight : 'NOT AVAILABLE'; });
    read('screen', function () { return window.screen && typeof window.screen.width === 'number' && typeof window.screen.height === 'number' ? window.screen.width + ' × ' + window.screen.height : 'NOT AVAILABLE'; });
    read('dpr', function () { return window.devicePixelRatio; });
    read('language', function () { return navigator.language; }); read('platform', function () { return navigator.platform; });
  }
  function testStorage() {
    var key = '__browser_runtime_probe_' + Date.now() + '_' + Math.random(), store;
    try {
      store = window.localStorage; store.setItem(key, 'probe');
      storageState = store.getItem(key) === 'probe' ? 'PASS' : 'FAIL';
      if (storageState === 'FAIL') { log('LOCALSTORAGE_FAIL readback mismatch'); }
    } catch (error) { storageState = 'FAIL'; log('LOCALSTORAGE_FAIL ' + errorText(error)); }
    finally { if (store) { try { store.removeItem(key); } catch (error) { storageState = 'FAIL'; log('LOCALSTORAGE_CLEANUP_FAIL ' + errorText(error)); } } }
    put('storage', storageState); log('LOCALSTORAGE ' + storageState);
  }
  function setupCanvas() {
    try { ctx = el('canvas2d').getContext('2d'); canvasState = ctx ? (rafAvailable ? 'RUNNING' : 'NOT AVAILABLE (requestAnimationFrame)') : 'NOT AVAILABLE'; }
    catch (error) { canvasState = 'FAILED'; log('CANVAS_ERROR ' + errorText(error)); }
    put('canvas-status', canvasState); log('CANVAS ' + canvasState);
  }
  function setupGl() {
    try { gl = el('webgl').getContext('webgl2'); } catch (error) { log('WEBGL2_CONTEXT_ERROR ' + errorText(error)); }
    if (gl) { glKind = 'WebGL2'; }
    else {
      try { gl = el('webgl').getContext('webgl'); } catch (error) { log('WEBGL1_CONTEXT_ERROR ' + errorText(error)); }
      if (gl) { glKind = 'WebGL1'; }
    }
    if (gl) {
      glState = rafAvailable ? 'RUNNING' : 'NOT AVAILABLE (requestAnimationFrame)';
      try { glLost = gl.isContextLost(); if (glLost) { glState = 'CONTEXT LOST'; } }
      catch (error) { log('WEBGL_CONTEXT_STATE_ERROR ' + errorText(error)); }
      ['version', 'renderer', 'vendor'].forEach(function (name) {
        try { glInfo[name] = gl.getParameter(gl[name.toUpperCase()]); }
        catch (error) { glInfo[name] = 'NOT AVAILABLE'; log('WEBGL_INFO_ERROR ' + name + ' ' + errorText(error)); }
      });
      put('gl-info', 'Version: ' + glInfo.version + ' | Renderer: ' + glInfo.renderer + ' | Vendor: ' + glInfo.vendor);
    } else { put('gl-info', ''); }
    put('gl-status', glKind + ' · ' + glState); log('WEBGL ' + glKind + ' ' + glState);
  }
  el('webgl').addEventListener('webglcontextlost', function (event) { event.preventDefault(); glLost = true; glState = 'CONTEXT LOST'; put('gl-status', glKind + ' · ' + glState); log('WEBGL_CONTEXT_LOST'); });
  el('webgl').addEventListener('webglcontextrestored', function () { glLost = false; setupGl(); log('WEBGL_CONTEXT_RESTORED'); });
  function updateCounters() {
    // FPS samples use RAF timestamps; this only invalidates a stale sample.
    // If JS itself is suspended, this becomes visible when callbacks resume.
    var frameAge = lastFrameWall === null ? 0 : Date.now() - lastFrameWall;
    if (frameAge > 2000) { fps = canvasFps = glFps = 0; }
    put('elapsed', duration(Date.now() - epoch)); put('ticks', ticks); put('frames', frames);
    put('fps', rafAvailable ? fps.toFixed(1) : 'NOT AVAILABLE');
    put('canvas-frames', canvasFrames); put('canvas-fps', canvasState === 'RUNNING' ? canvasFps.toFixed(1) : '—');
    put('gl-frames', glFrames); put('gl-fps', glState === 'RUNNING' ? glFps.toFixed(1) : '—');
  }
  function animate(time) {
    // Each renderer is isolated so one failed API cannot stop the other counters.
    frames++;
    if (lastFrame !== null) { var gap = time - lastFrame; maxFrameGap = Math.max(maxFrameGap, gap); if (continuity && !continuity.stop) { continuity.maxFrameGap = Math.max(continuity.maxFrameGap, Math.min(gap, Math.max(0, Date.now() - continuity.start.ms))); } if (gap > 1000) { log('RAF_GAP ' + gap.toFixed(0) + 'ms'); } }
    lastFrame = time; lastFrameWall = Date.now();
    if (ctx && canvasState === 'RUNNING') {
      try {
        var c = el('canvas2d'); ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#65c8ff'; ctx.beginPath(); ctx.arc(25 + (Math.sin(time / 700) + 1) * (c.width - 50) / 2, 65, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = '18px monospace'; ctx.fillText('Frame ' + (canvasFrames + 1), 12, 125); canvasFrames++;
      } catch (error) { canvasState = 'FAILED'; put('canvas-status', canvasState); log('CANVAS_FAILED ' + errorText(error)); }
    }
    if (gl && !glLost && glState === 'RUNNING') {
      try { gl.viewport(0, 0, gl.canvas.width, gl.canvas.height); gl.clearColor((Math.sin(time / 700) + 1) / 2, .2, (Math.cos(time / 1100) + 1) / 2, 1); gl.clear(gl.COLOR_BUFFER_BIT); glFrames++; }
      catch (error) { glState = 'FAILED'; put('gl-status', glKind + ' · ' + glState); log('WEBGL_FAILED ' + errorText(error)); }
    }
    if (sampleTime === null) { sampleTime = time; sampleFrames = frames; sampleCanvas = canvasFrames; sampleGl = glFrames; }
    if (time - sampleTime >= 1000) {
      var seconds = (time - sampleTime) / 1000;
      fps = (frames - sampleFrames) / seconds; canvasFps = (canvasFrames - sampleCanvas) / seconds; glFps = (glFrames - sampleGl) / seconds;
      sampleTime = time; sampleFrames = frames; sampleCanvas = canvasFrames; sampleGl = glFrames;
      if (time - lastFpsLog >= 15000 || (time - lastFpsLog >= 5000 && previousLoggedFps !== null && Math.abs(fps - previousLoggedFps) >= 15)) { log('FPS ' + fps.toFixed(1)); lastFpsLog = time; previousLoggedFps = fps; }
      updateCounters();
    }
    window.requestAnimationFrame(animate);
  }
  ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach(function (type) {
    el('touch-area').addEventListener(type, function (event) {
      var point = event.changedTouches && event.changedTouches.length ? event.changedTouches[0] : event;
      touch = { last: type, x: typeof point.clientX === 'number' ? Math.round(point.clientX) : null, y: typeof point.clientY === 'number' ? Math.round(point.clientY) : null, count: touch.count + 1 };
      put('touch-last', type); put('touch-x', touch.x); put('touch-y', touch.y); put('touch-count', touch.count);
      log('TOUCH ' + type + ' x=' + touch.x + ' y=' + touch.y);
    }, false);
  });
  document.addEventListener('visibilitychange', function () { if (continuity && !continuity.stop) { continuity.visibilityEvents++; } pageState(); log('VISIBILITY ' + visibility()); });
  ['focus', 'blur', 'pageshow', 'pagehide', 'online', 'offline'].forEach(function (type) {
    window.addEventListener(type, function (event) { if (continuity && !continuity.stop && (type === 'focus' || type === 'blur')) { continuity.focusEvents++; } pageState(); log(type.toUpperCase() + ' visibility=' + visibility() + ' focus=' + focus() + ' online=' + navigator.onLine + (typeof event.persisted === 'boolean' ? ' persisted=' + event.persisted : '')); });
  });
  window.addEventListener('resize', function () { browserInfo(); log('RESIZE ' + window.innerWidth + 'x' + window.innerHeight); });
  function snapshot() { return { timestamp: new Date().toISOString(), ms: Date.now(), ticks: ticks, animationFrames: frames, canvasFrames: canvasFrames, webglFrames: glFrames, visibility: visibility(), focus: focus() }; }
  function continuityReport() {
    if (!continuity) { return 'Nincs még mérés.'; }
    var end = continuity.stop || snapshot(), start = continuity.start;
    var seconds = Math.max(0, (end.ms - start.ms) / 1000);
    return 'Continuity Test interval\nStart: ' + start.timestamp + '\nStop: ' + (continuity.stop ? end.timestamp : 'RUNNING') + '\nElapsed: ' + seconds.toFixed(1) + ' s\n' +
      'Counters (start → stop/current; delta):\n' + ['ticks', 'animationFrames', 'canvasFrames', 'webglFrames'].map(function (key) { return key + ': ' + start[key] + ' → ' + end[key] + '; +' + (end[key] - start[key]); }).join('\n') +
      '\nAverage callback/render rates: ' + ['ticks', 'animationFrames', 'canvasFrames', 'webglFrames'].map(function (key) { return key + '=' + (seconds > 0 ? ((end[key] - start[key]) / seconds).toFixed(1) : '0.0') + '/s'; }).join('; ') +
      '\nVisibility: ' + start.visibility + ' → ' + end.visibility + ' | Focus: ' + start.focus + ' → ' + end.focus + '\nEvents in interval: visibility=' + continuity.visibilityEvents + '; focus/blur=' + continuity.focusEvents + '\nMax observed gaps: RAF ' + continuity.maxFrameGap.toFixed(0) + ' ms; timer ' + continuity.maxTimerGap.toFixed(0) + ' ms\nA delta nem bizonyít folyamatos működést a teljes intervallumban. A körülmények változásának időpontja és a CSS megállása manuális megfigyelés.';
  }
  el('continuity-start').addEventListener('click', function () { continuity = { start: snapshot(), stop: null, maxFrameGap: 0, maxTimerGap: 0, visibilityEvents: 0, focusEvents: 0 }; put('continuity-status', 'RUNNING'); el('continuity-start').disabled = true; el('continuity-stop').disabled = false; log('CONTINUITY_TEST_START ' + JSON.stringify(continuity.start)); put('continuity-summary', continuityReport()); });
  el('continuity-stop').addEventListener('click', function () {
    if (!continuity || continuity.stop) { return; }
    // Include an outstanding pause even if STOP runs before the next RAF/timer.
    continuity.maxTimerGap = Math.max(continuity.maxTimerGap, Date.now() - Math.max(lastTick, continuity.start.ms));
    if (rafAvailable) { continuity.maxFrameGap = Math.max(continuity.maxFrameGap, Date.now() - Math.max(lastFrameWall === null ? continuity.start.ms : lastFrameWall, continuity.start.ms)); }
    continuity.stop = snapshot(); put('continuity-status', 'STOPPED'); el('continuity-start').disabled = false; el('continuity-stop').disabled = true; log('CONTINUITY_TEST_STOP ' + JSON.stringify(continuity.stop)); put('continuity-summary', continuityReport());
  });
  function wsStatus(value) { put('ws-status', value); el('ws-send').disabled = !socket || socket.readyState !== 1; el('ws-disconnect').disabled = !socket || socket.readyState > 1; }
  function disconnect() { if (socket) { var old = socket; socket = null; try { old.close(1000, 'User disconnected'); } catch (error) { log('WEBSOCKET_CLOSE_ERROR ' + errorText(error)); } } wsStatus('closed'); }
  el('ws-connect').addEventListener('click', function () {
    disconnect();
    try {
      var url = el('ws-url').value.trim(); if (!/^wss?:\/\//i.test(url)) { throw new Error('ws:// vagy wss:// URL szükséges'); }
      var current = new WebSocket(url); socket = current; wsStatus('connecting'); log('WEBSOCKET connecting');
      current.onopen = function () { if (socket === current) { wsStatus('open'); log('WEBSOCKET open'); } };
      current.onclose = function (event) { if (socket === current) { socket = null; wsStatus('closed'); log('WEBSOCKET closed code=' + event.code + ' clean=' + event.wasClean); } };
      current.onerror = function () { if (socket === current) { wsStatus('error'); log('WEBSOCKET error (browser does not expose details)'); } };
      current.onmessage = function (event) { if (socket === current) { var message = typeof event.data === 'string' ? event.data.slice(0, 1000) : '[binary message]'; put('ws-message', message); log('WEBSOCKET received message ' + message); } };
    } catch (error) { wsStatus('error'); log('WEBSOCKET_ERROR ' + errorText(error)); }
  });
  el('ws-disconnect').addEventListener('click', function () { disconnect(); log('WEBSOCKET manual disconnect'); });
  el('ws-send').addEventListener('click', function () { try { if (!socket || socket.readyState !== 1) { throw new Error('Connection is not open'); } socket.send('Browser Runtime Test ' + new Date().toISOString()); log('WEBSOCKET sent test'); } catch (error) { log('WEBSOCKET_SEND_ERROR ' + errorText(error)); } });
  function results() {
    browserInfo(); updateCounters();
    return 'Browser Runtime Test\nTimestamp: ' + new Date().toISOString() + '\nUser Agent: ' + el('ua').textContent + '\nViewport: ' + el('viewport').textContent + '\nScreen: ' + el('screen').textContent + '\ndevicePixelRatio: ' + el('dpr').textContent + '\nLanguage: ' + el('language').textContent + '\nPlatform: ' + el('platform').textContent +
      '\n\nJavaScript: RUNNING\nElapsed: ' + ((Date.now() - epoch) / 1000).toFixed(1) + ' s\nTimer ticks: ' + ticks + '\nAnimation frames: ' + frames + '\nrequestAnimationFrame: ' + (rafAvailable ? 'AVAILABLE' : 'NOT AVAILABLE') + '\nFPS: ' + fps.toFixed(1) + '\nMax gaps: RAF ' + maxFrameGap.toFixed(0) + ' ms; timer ' + maxTimerGap.toFixed(0) + ' ms' +
      '\nCSS Animation: configured; continuity requires visual observation\nCanvas 2D: ' + canvasState + '; frames=' + canvasFrames + '; FPS=' + canvasFps.toFixed(1) + '\nWebGL: ' + glKind + '; ' + glState + '; frames=' + glFrames + '; FPS=' + glFps.toFixed(1) + '\nWebGL info: ' + JSON.stringify(glInfo) +
      '\nTouch: ' + JSON.stringify(touch) + '\nPointer API: ' + (typeof window.PointerEvent !== 'undefined' ? 'AVAILABLE' : 'NOT AVAILABLE') + '\nTouch API: ' + ('ontouchstart' in window ? 'AVAILABLE' : 'NOT AVAILABLE') + '\nWebSocket API: ' + el('ws-api').textContent + '\nWebSocket state: ' + el('ws-status').textContent + '\nReceived message: ' + el('ws-message').textContent + '\nlocalStorage: ' + storageState + '\nVisibility: ' + visibility() + '\nWindow focus: ' + focus() + '\nOnline status: ' + navigator.onLine +
      '\n\nContinuity Test\n' + continuityReport() + '\n\nDiagnostic Log (last ' + LIMIT + ' events; local timestamps)\n' + logs.join('\n');
  }
  function fallback(text) { el('copy-fallback').hidden = false; el('results').value = text; el('results').focus(); el('results').select(); put('copy-status', 'Az eredmények a kijelölhető szövegmezőben vannak.'); }
  el('copy').addEventListener('click', function () {
    var text = results(), generation = measurementGeneration;
    try { if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') { fallback(text); return; } navigator.clipboard.writeText(text).then(function () { if (generation === measurementGeneration) { put('copy-status', 'Eredmények a vágólapra másolva.'); } }, function (error) { if (generation === measurementGeneration) { log('CLIPBOARD_ERROR ' + errorText(error)); fallback(text); } }); }
    catch (error) { log('CLIPBOARD_ERROR ' + errorText(error)); fallback(text); }
  });
  el('reset').addEventListener('click', function () {
    measurementGeneration++; window.clearInterval(timerId);
    disconnect(); epoch = Date.now(); lastTick = epoch; ticks = frames = canvasFrames = glFrames = 0; fps = canvasFps = glFps = 0;
    lastFrame = lastFrameWall = sampleTime = null; sampleFrames = sampleCanvas = sampleGl = 0; maxFrameGap = maxTimerGap = lastFpsLog = 0; previousLoggedFps = null;
    logs = []; continuity = null; touch = { last: '—', x: null, y: null, count: 0 };
    ['touch-last', 'touch-x', 'touch-y'].forEach(function (id) { put(id, '—'); }); put('touch-count', 0);
    put('continuity-status', 'IDLE'); put('continuity-summary', continuityReport()); el('continuity-start').disabled = false; el('continuity-stop').disabled = true;
    el('copy-fallback').hidden = true; el('results').value = ''; put('copy-status', ''); put('ws-message', '—');
    log('RESET_TEST'); setupCanvas(); gl = null; glKind = 'NOT AVAILABLE'; glInfo = {}; glState = 'NOT AVAILABLE'; setupGl(); testStorage(); pageState(); browserInfo(); updateCounters(); startTimer();
  });
  log('PAGE_LOADED'); put('js-status', 'RUNNING'); log('JAVASCRIPT_STARTED');
  put('ws-api', typeof window.WebSocket !== 'undefined' ? 'AVAILABLE' : 'NOT AVAILABLE');
  if (typeof window.WebSocket === 'undefined') { el('ws-connect').disabled = true; }
  setupCanvas(); setupGl(); testStorage(); pageState(); browserInfo(); updateCounters();
  function startTimer() { timerId = window.setInterval(function () {
    var now = Date.now(), gap = now - lastTick; maxTimerGap = Math.max(maxTimerGap, gap);
    if (continuity && !continuity.stop) { continuity.maxTimerGap = Math.max(continuity.maxTimerGap, Math.min(gap, Math.max(0, now - continuity.start.ms))); }
    if (gap > 2500) { log('TIMER_GAP ' + gap + 'ms'); }
    lastTick = now; ticks++; updateCounters(); if (continuity && !continuity.stop) { put('continuity-summary', continuityReport()); }
  }, 1000); }
  startTimer();
  if (rafAvailable) { window.requestAnimationFrame(animate); } else { log('RAF_NOT_AVAILABLE'); }
}());
