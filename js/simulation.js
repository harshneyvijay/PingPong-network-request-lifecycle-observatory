/* simulation.js — async lifecycle engine, optional live fetch(), terminal log */
PF.simulation = (() => {
  let run = 0,
    t0 = 0,
    ctl = null;
  const timers = new Set();
  const S = () => PF.state,
    D = () => PF.data;
  const rnd = (a, b) => Math.floor(a + Math.random() * (b - a));
  const sleep = (ms) =>
    new Promise((res) => {
      const t = setTimeout(() => {
        timers.delete(t);
        res();
      }, ms);
      timers.add(t);
    });
  const SIM = '<span class="tag sim">SIMULATED</span>',
    OBS = '<span class="tag live">OBSERVED</span>';
  const kv = (rows) =>
    "<dl>" +
    rows.map((r) => "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>").join("") +
    "</dl>";

  function log(msg) {
    const e = performance.now() - t0,
      term = PF.$("#term");
    const ts =
      String(Math.floor(e / 1000)).padStart(2, "0") +
      ":" +
      String(Math.round(e % 1000)).padStart(3, "0");
    term.textContent +=
      "\n" + (msg.startsWith("$") ? msg : "[" + ts + "] " + msg);
    term.scrollTop = term.scrollHeight;
  }
  function genSim(req) {
    const h = [...new URL(req.url).hostname].reduce(
      (a, c) => (a * 31 + c.charCodeAt(0)) >>> 0,
      7,
    );
    const seq = rnd(1e8, 4e9);
    return {
      ip:
        (h % 190) +
        11 +
        "." +
        ((h >> 8) & 255) +
        "." +
        ((h >> 16) & 255) +
        "." +
        (((h >> 24) & 253) + 1),
      seq,
      ack: seq + 1,
    };
  }
  function renderNodes() {
    PF.$("#nodes").innerHTML = D()
      .stages.map(
        (s) =>
          '<div class="node" data-stage="' +
          s.id +
          '" data-state="idle"><button class="main" aria-label="' +
          s.name +
          ' details"><span>' +
          s.icon +
          "</span> <b>" +
          s.name +
          '</b><br><em class="st">idle</em> <small class="ms"></small></button><button class="why" aria-label="Why ' +
          s.name +
          '?">?</button></div>',
      )
      .join("");
    PF.$$(".node").forEach((n) => {
      n.querySelector(".main").onclick = () => {
        PF.$("#stageInfo").innerHTML = stageInfo(n.dataset.stage, true);
      };
      n.querySelector(".why").onclick = () => PF.education.why(n.dataset.stage);
    });
  }
  function setNode(id, state, ms) {
    const n = PF.$(".node[data-stage=" + id + "]");
    if (!n) return;
    n.dataset.state = state;
    n.querySelector(".st").textContent = state;
    n.querySelector(".ms").textContent = ms ? ms + " ms" : "";
  }
  function stageInfo(id, done) {
    const r = S().request,
      sim = S().sim;
    if (!r || !sim) return '<span class="muted">Run a request first.</span>';
    const u = new URL(r.url),
      secure = u.protocol === "https:",
      port = u.port || (secure ? 443 : 80);
    const T = S().timings[id] ? S().timings[id].dur + " ms" : "…";
    switch (id) {
      case "dns":
        return (
          kv([
            ["Domain", u.hostname],
            ["Record", "A (IPv4) " + SIM],
            ["Resolved IP", "not exposed to JavaScript"],
            ["Lookup", T + " " + (S().timingSource === "observed" ? OBS : SIM)],
          ]) +
          '<p class="muted small">DNS translates human-readable domain names into IP addresses. Raw DNS packets are not exposed to the browser.</p>'
        );
      case "tcp":
        return kv([
          ["Protocol", "TCP"],
          ["Port", port],
          [
            "State",
            (done || S().timings.tcp ? "ESTABLISHED" : "SYN_SENT") + " " + SIM,
          ],
          ["Seq / Ack", "ISN x → x+1 (illustrative)"],
          ["Flags", "SYN → SYN,ACK → ACK " + SIM],
          ["Window", "not observable"],
        ]);
      case "tls":
        return secure
          ? kv([
              ["Protocol", "TLS (version not exposed)"],
              ["Certificate", "not inspectable from JavaScript"],
            ]) +
              '<p class="muted small">Conceptual simulation: JavaScript cannot inspect the real TLS handshake.</p>'
          : "<p>HTTP detected.<br>TLS is not used because this request does not use HTTPS.</p>";
      case "http":
        return (
          '<pre class="code">' +
          PF.esc(
            r.method +
              " " +
              u.pathname +
              u.search +
              " HTTP/1.1\nHost: " +
              u.host,
          ) +
          "</pre>"
        );
      case "server":
        return "<b>SIMULATED SERVER PROCESSING</b>";
      default:
        return S().response && S().response.status
          ? kv([
              [
                "Status",
                S().response.status +
                  " " +
                  (S().response.statusText ||
                    PF.statusInfo(S().response.status).name),
              ],
              ["Class", PF.statusInfo(S().response.status).label],
              ["Meaning", PF.statusInfo(S().response.status).msg],
              ["Source", "OBSERVED via fetch()"],
            ])
          : '<span class="muted">No real response received.</span>';
    }
  }
  /* Resource Timing: real phase timings, only exposed for same-origin or Timing-Allow-Origin responses.
     Without it the browser zeroes requestStart/responseStart etc., so we return null and keep the simulation. */
  function readTiming(url, since, secure) {
    const e = performance
      .getEntriesByType("resource")
      .filter((x) => x.name === url && x.startTime >= since - 1)
      .pop();
    if (!e || !(e.requestStart > 0) || !(e.responseStart > 0)) return null;
    const r = (x) => Math.max(0, Math.round(x * 10) / 10),
      b = e.startTime,
      tlsOn = secure && e.secureConnectionStart > 0;
    const stages = {
      dns: {
        start: r(e.domainLookupStart - b),
        dur: r(e.domainLookupEnd - e.domainLookupStart),
      },
      tcp: {
        start: r(e.connectStart - b),
        dur: r(
          (tlsOn ? e.secureConnectionStart : e.connectEnd) - e.connectStart,
        ),
      },
      server: {
        start: r(e.requestStart - b),
        dur: r(e.responseStart - e.requestStart),
      },
      response: {
        start: r(e.responseStart - b),
        dur: r(e.responseEnd - e.responseStart),
      },
    };
    if (secure)
      stages.tls = {
        start: r((tlsOn ? e.secureConnectionStart : e.connectEnd) - b),
        dur: tlsOn ? r(e.connectEnd - e.secureConnectionStart) : 0,
      };
    return { stages, protocol: e.nextHopProtocol || "" };
  }
  /* no-cors probe: resolves if the host answered at all (response is opaque), rejects on DNS/connection/TLS failure.
     Sends a plain GET to the same URL with no headers or body. Used only to tell "blocked by CORS" from "unreachable". */
  async function probe(url) {
    const c = new AbortController(),
      t = setTimeout(() => c.abort(), 5000);
    try {
      await fetch(url, {
        mode: "no-cors",
        cache: "no-store",
        signal: c.signal,
      });
      return true;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(t);
    }
  }
  async function liveFetch(req) {
    ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000),
      t = performance.now();
    try {
      const o = {
        method: req.method,
        headers: req.headers,
        signal: ctl.signal,
      };
      if (req.bodyText && req.method !== "GET") o.body = req.bodyText;
      const r = await fetch(req.url, o),
        text = await r.text(),
        duration = Math.round(performance.now() - t);
      await new Promise((res) => setTimeout(res, 50)); // let the browser publish the resource entry
      return {
        live: true,
        status: r.status,
        statusText: r.statusText || "",
        redirected: r.redirected,
        finalUrl: r.url,
        headers: [...r.headers.entries()],
        body: text,
        size: new Blob([text]).size,
        duration,
        timing: readTiming(req.url, t, req.url.startsWith("https:")),
      };
    } catch (e) {
      if (e.name === "AbortError")
        return { live: false, kind: "timeout", reachable: false };
      if (!navigator.onLine)
        return { live: false, kind: "offline", reachable: false };
      const reachable = await probe(req.url);
      return {
        live: false,
        kind: reachable ? "blocked" : "unreachable",
        reachable,
      };
    } finally {
      clearTimeout(to);
    }
  }
  const noResponse = (kind) => ({
    live: false,
    kind,
    status: 0,
    statusText: "",
    headers: [],
    body: "",
    size: 0,
    duration: 0,
  });
  const NOTES = {
    blocked:
      "LIVE REQUEST BLOCKED\n\nThe server answered, but the browser will not let this page read the response (CORS). The real status code is not visible to JavaScript, so none is shown.\n\nThe stage animation is an educational illustration only.",
    unreachable:
      "REQUEST FAILED\n\nThe browser could not reach this URL. The host may not exist (DNS failure), be offline, refuse the connection, have an invalid TLS certificate, or the request was blocked (e.g. mixed content). Browsers do not say which.\n\nNo response was received, so no status code is shown.",
    timeout:
      "REQUEST TIMED OUT\n\nNo response within 8 seconds. No status code is shown.",
    offline:
      "NETWORK ERROR\n\nYour browser appears to be offline. No response was received.",
    simulated:
      'SIMULATION ONLY\n\nNo request was sent, so no status, headers or body are shown. Enable "Try live fetch()" to make a real request.',
  };
  function conclude(req) {
    const st = S(),
      r = st.response,
      real = r.live,
      si = real ? PF.statusInfo(r.status) : null;
    st.running = false;
    st.currentStage = null;
    st.total = real ? r.duration : 0;
    if (!real) {
      st.timings = {};
      st.timingSource = "simulated";
      PF.notice(NOTES[r.kind], r.kind === "simulated" ? "" : "err");
    } else {
      const bad = si.kind === "client" || si.kind === "server",
        note = r.redirected
          ? "\n\nRedirects were followed automatically. Final URL: " +
            r.finalUrl
          : "";
      PF.notice(
        si.kind === "success" && !r.redirected
          ? ""
          : r.status +
              " " +
              (r.statusText || si.name) +
              " — " +
              si.label +
              "\n\n" +
              si.msg +
              (bad ? "\n" + si.hint : "") +
              (si.example ? "\nTypical example: " + si.example : "") +
              note,
        bad ? "err" : si.kind === "success" ? "ok" : "",
      );
    }
    if (real && r.timing) {
      st.timings = r.timing.stages;
      st.timingSource = "observed";
      D().stages.forEach(
        (x) =>
          st.timings[x.id] && setNode(x.id, "complete", st.timings[x.id].dur),
      );
      const t = st.timings;
      log(
        "Resource Timing (OBSERVED): DNS " +
          t.dns.dur +
          " ms, TCP " +
          t.tcp.dur +
          " ms" +
          (t.tls ? ", TLS " + t.tls.dur + " ms" : "") +
          ", TTFB " +
          t.server.dur +
          " ms, Transfer " +
          t.response.dur +
          " ms",
      );
    } else if (real)
      log(
        "Resource Timing unavailable (no Timing-Allow-Origin) — stage timings remain SIMULATED",
      );
    log(
      real
        ? "HTTP " +
            r.status +
            " " +
            (r.statusText || si.name) +
            " (OBSERVED) — " +
            si.label
        : "NO RESPONSE (" + r.kind + ")",
    );
    if (real && si.kind !== "success") log("→ " + si.msg);
    if (real) log("Response received (" + r.size + " bytes)");
    log("$ request " + (real ? "complete" : "ended without a response"));
    const b = PF.$("#modeBadge");
    b.textContent = real
      ? "LIVE"
      : r.kind === "simulated"
        ? "SIMULATION"
        : "NO RESPONSE";
    b.className =
      "tag " + (real ? "live" : r.kind === "simulated" ? "sim" : "s4");
    const bad = real && (si.kind === "client" || si.kind === "server");
    PF.setStatus(
      real
        ? si.kind === "success"
          ? "COMPLETE · " + r.status
          : si.label + " · " + r.status + " " + (r.statusText || si.name)
        : r.kind === "simulated"
          ? "SIMULATION COMPLETE"
          : "ERROR",
      real
        ? si.kind === "success"
          ? "ok"
          : bad
            ? "err"
            : "warn"
        : r.kind === "simulated"
          ? ""
          : "err",
    );
    if (real)
      setNode(
        "response",
        bad ? "error" : "complete",
        st.timings.response && st.timings.response.dur,
      );
    setButtons(false);
    PF.education.onStage(null);
    PF.inspector.render();
    PF.inspector.timeline();
    if (real) PF.history.add(req, r, st.total);
  }
  function setButtons(running) {
    PF.$("#stop").disabled = !running;
    PF.$("#send").disabled = running;
    PF.$("#replay").disabled = running;
  }

  async function start() {
    const st = S(),
      req = st.request,
      id = ++run;
    if (!req) return;
    timers.forEach(clearTimeout);
    timers.clear();
    PF.network.cancel();
    st.running = true;
    st.response = null;
    st.timings = {};
    st.timingSource = "simulated";
    st.startedAt = new Date().toISOString();
    st.total = 0;
    st.sim = genSim(req);
    t0 = performance.now();
    const secure = new URL(req.url).protocol === "https:";
    PF.network.build(req);
    renderNodes();
    PF.inspector.clear();
    PF.$("#term").textContent = "";
    PF.$("#empty").hidden = true;
    PF.$("#srvNote").innerHTML = "";
    setButtons(true);
    PF.setStatus("INITIALIZING", "run");
    log("$ PingPong start");
    log("Request initialized: " + req.method + " " + req.url);
    const wantLive = PF.$("#liveToggle").checked,
      livePromise = wantLive ? liveFetch(req) : null;
    let result = null,
      off = 0;
    if (livePromise)
      livePromise.then((res) => {
        if (id !== run || res.live || res.reachable !== false) return; // only hard failures stop the animation
        run++;
        timers.forEach((t) => {
          clearTimeout(t);
          clearInterval(t);
        });
        timers.clear();
        PF.network.cancel();
        PF.$$(".node[data-state=active]").forEach((n) => {
          n.dataset.state = "error";
          n.querySelector(".st").textContent = "failed";
        });
        st.response = noResponse(res.kind);
        conclude(req);
      });
    for (const s of D().stages) {
      if (s.id === "tls" && !secure) {
        log("HTTP detected — TLS skipped");
        setNode("tls", "skipped");
        continue;
      }
      const dur = Math.round(s.base * (0.7 + Math.random() * 0.6));
      st.currentStage = s.id;
      PF.setStatus(s.status, "run");
      setNode(s.id, "active");
      PF.education.onStage(s.id);
      PF.$("#stageInfo").innerHTML = stageInfo(s.id);
      log(
        s.name +
          " stage started (" +
          (s.id === "server" ? "SIMULATED" : "timing SIMULATED") +
          ")",
      );
      if (s.id === "server") {
        const steps = D().serverSteps;
        let i = 0;
        const draw = () => {
          PF.$("#srvNote").innerHTML =
            "<b>SIMULATED SERVER PROCESSING</b><br>" +
            steps.slice(0, ++i).join("<br>");
        };
        draw();
        const iv = setInterval(() => {
          if (i < steps.length) draw();
        }, dur / steps.length);
        timers.add(iv);
      }
      if (s.id === "response") {
        PF.setStatus("WAITING FOR RESPONSE", "run");
        result = livePromise ? await livePromise : null;
        if (id !== run) return;
        st.response =
          result && result.live
            ? result
            : noResponse(result ? result.kind : "simulated");
        {
          const rr = st.response,
            si = rr.live ? PF.statusInfo(rr.status) : null;
          PF.network.label(
            "response",
            0,
            rr.live
              ? "HTTP " + rr.status + " " + (rr.statusText || si.name)
              : rr.kind === "simulated"
                ? "no real response"
                : "response unreadable (CORS)",
            si
              ? si.kind === "client" || si.kind === "server"
                ? "error"
                : si.kind
              : rr.kind === "simulated"
                ? ""
                : "error",
          );
        }
        PF.setStatus("RECEIVING RESPONSE", "run");
      }
      await PF.network.play(s.id, dur);
      if (id !== run) return;
      st.timings[s.id] = { start: off, dur };
      off += dur;
      setNode(s.id, "complete", dur);
      if (s.id === "dns")
        log("DNS stage animation finished (SIMULATED illustration)");
      if (s.id === "tcp")
        log("TCP handshake animation finished (SIMULATED illustration)");
      if (s.id === "tls")
        log("TLS handshake animation finished (SIMULATED illustration)");
      PF.$("#stageInfo").innerHTML = stageInfo(s.id, true);
    }
    conclude(req);
  }
  function stop(silent) {
    run++;
    timers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    timers.clear();
    if (ctl) ctl.abort();
    PF.network.cancel();
    const was = S().running;
    S().running = false;
    S().currentStage = null;
    setButtons(false);
    PF.$$(".node[data-state=active]").forEach((n) => {
      n.dataset.state = "idle";
      n.querySelector(".st").textContent = "idle";
    });
    if (was && !silent) {
      PF.setStatus("SIMULATION STOPPED", "err");
      PF.notice("SIMULATION STOPPED");
      log("SIMULATION STOPPED");
    }
  }
  return { start, stop, renderNodes };
})();
