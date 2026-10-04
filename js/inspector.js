/* inspector.js — request/response inspector, raw HTTP view, waterfall */
PF.inspector = (() => {
  let tab = "overview",
    select;
  const S = () => PF.state;
  const SIM = '<span class="tag sim">SIMULATED</span>',
    OBS = '<span class="tag live">OBSERVED</span>';
  const why = (r) =>
    ({
      simulated: "simulation only — nothing was requested",
      blocked: "server reachable, but the response is blocked by CORS",
      unreachable:
        "host unreachable or request failed (DNS, connection, TLS or browser block)",
      timeout: "timed out after 8 s",
      offline: "browser offline",
    })[r.kind] || "none";
  const cls = (c) => "s" + String(c)[0];
  const tbl = (rows) =>
    "<table>" +
    rows
      .map((r) => "<tr><th>" + r[0] + "</th><td>" + r[1] + "</td></tr>")
      .join("") +
    "</table>";
  const copyBtn = (id, label) =>
    '<button class="sm" data-copy="' + id + '">Copy ' + label + "</button>";
  const pretty = (t) => {
    try {
      return JSON.stringify(JSON.parse(t), null, 2);
    } catch (e) {
      return t;
    }
  };

  function hl(raw) {
    return PF.esc(raw)
      .split("\n")
      .map((l, i) => {
        if (i === 0)
          return (
            '<span class="k">' + l.replace(/^(\S+)/, "<b>$1</b>") + "</span>"
          );
        return l.replace(/^([\w-]+):/, '<span class="k">$1</span>:');
      })
      .join("\n");
  }
  function rawRequest(r) {
    const u = new URL(r.url);
    const h = Object.assign(
      {
        Host: u.host,
        Accept: "*/*",
        "User-Agent": navigator.userAgent.slice(0, 40) + "…",
      },
      r.headers,
    );
    let s =
      r.method +
      " " +
      u.pathname +
      u.search +
      " HTTP/1.1\n" +
      Object.entries(h)
        .map(([k, v]) => k + ": " + v)
        .join("\n");
    return s + (r.bodyText ? "\n\n" + r.bodyText : "");
  }
  function hdrTable(list, empty) {
    if (!list.length) return '<p class="muted">' + empty + "</p>";
    return (
      "<table><tr><th>HEADER</th><th>VALUE</th></tr>" +
      list
        .map(
          ([k, v]) =>
            "<tr><td>" +
            PF.esc(k) +
            "</td><td>" +
            PF.esc(v) +
            ' <button class="sm" data-val="' +
            PF.esc(v) +
            '">Copy</button></td></tr>',
        )
        .join("") +
      "</table>"
    );
  }
  function timeline() {
    const t = S().timings,
      box = PF.$("#timeline"),
      total = S().total;
    if (!total) {
      box.innerHTML =
        '<p class="muted small">' +
        (S().response && !S().response.status
          ? "No timing: no response was received."
          : "Run a request to see the waterfall.") +
        "</p>";
      return;
    }
    const rows = [
      ["DNS", "dns"],
      ["TCP", "tcp"],
      ["TLS", "tls"],
      ["TTFB", "server"],
      ["Transfer", "response"],
    ];
    const obs = S().timingSource === "observed";
    const span = Math.max(...Object.values(t).map((x) => x.start + x.dur));
    box.innerHTML =
      '<div class="wf">' +
      rows
        .map(([n, k]) => {
          const x = t[k];
          if (!x)
            return (
              "<span>" +
              n +
              '</span><span class="muted">skipped</span><span></span>'
            );
          return (
            "<span>" +
            n +
            '</span><div class="bar"><i style="left:' +
            (x.start / span) * 100 +
            "%;width:" +
            Math.max(1, (x.dur / span) * 100) +
            '%"></i></div><span>' +
            x.dur +
            " ms</span>"
          );
        })
        .join("") +
      '<b>Total</b><span class="muted">' +
      (S().response && S().response.live
        ? "fetch() duration " + OBS
        : "sum of stages " + SIM) +
      "</span><b>" +
      total +
      " ms</b></div>" +
      (obs
        ? '<p class="muted small">Stage breakdown ' +
          OBS +
          " from the Resource Timing API (server exposed Timing-Allow-Origin). 0 ms DNS/connect usually means a cached lookup or reused connection. TTFB = requestStart → responseStart.</p>"
        : '<p class="muted small">Stage breakdown is ' +
          SIM +
          " — this server did not expose Resource Timing (needs Timing-Allow-Origin), and fetch() alone cannot see DNS/TCP/TLS.</p>");
  }

  function render() {
    const body = PF.$("#inspBody"),
      r = S().request,
      resp = S().response;
    if (!r) {
      body.innerHTML = '<p class="muted">No request yet.</p>';
      return;
    }
    const u = new URL(r.url),
      port = u.port || (u.protocol === "https:" ? 443 : 80);
    let h = "";
    if (tab === "overview") {
      h = tbl([
        ["URL", PF.esc(r.url)],
        ["Method", r.method],
        [
          "Protocol",
          resp && resp.timing && resp.timing.protocol
            ? PF.esc(resp.timing.protocol) + " " + OBS
            : "not exposed (needs Timing-Allow-Origin)",
        ],
        [
          "Status",
          resp
            ? resp.status
              ? '<b class="' +
                cls(resp.status) +
                '">' +
                resp.status +
                " " +
                PF.esc(resp.statusText || PF.statusInfo(resp.status).name) +
                "</b> " +
                OBS
              : '<b class="s4">NO RESPONSE</b> ' + PF.esc(why(resp))
            : "…",
        ],
        [
          "Meaning",
          resp && resp.status
            ? PF.esc(
                PF.statusInfo(resp.status).label +
                  " — " +
                  PF.statusInfo(resp.status).msg,
              )
            : "—",
        ],
        ["Remote IP", "not exposed to JavaScript"],
        ["Port", port],
        ["Duration", resp ? (resp.live ? S().total + " ms " + OBS : "—") : "…"],
      ]);
    } else if (tab === "request") {
      h =
        tbl([
          ["Request URL", PF.esc(r.url)],
          ["Method", r.method],
        ]) +
        copyBtn("url", "URL") +
        copyBtn("reqbody", "body") +
        '<h2>Raw HTTP (reconstructed)</h2><pre class="code">' +
        hl(rawRequest(r)) +
        "</pre>" +
        hdrTable(Object.entries(r.headers), "No custom headers.") +
        '<h2>Body</h2><pre class="code">' +
        PF.esc(r.bodyText || "(none)") +
        "</pre>";
    } else if (tab === "response") {
      h = !resp
        ? '<p class="muted">Waiting…</p>'
        : !resp.status
          ? '<p class="s4"><b>NO RESPONSE</b></p><p class="muted">' +
            PF.esc(why(resp)) +
            ". No status, headers or body are shown because none were received.</p>"
          : '<p><span class="' +
            cls(resp.status) +
            '">HTTP ' +
            resp.status +
            " " +
            PF.esc(resp.statusText || PF.statusInfo(resp.status).name) +
            "</span> " +
            OBS +
            '</p><p class="muted small">' +
            PF.esc(
              PF.statusInfo(resp.status).label +
                " — " +
                PF.statusInfo(resp.status).msg,
            ) +
            "</p>" +
            copyBtn("resbody", "body") +
            '<pre class="code">' +
            PF.esc(pretty(resp.body).slice(0, 20000) || "(empty)") +
            "</pre>";
    } else if (tab === "headers") {
      h =
        "<h2>Request</h2>" +
        hdrTable(Object.entries(r.headers), "No custom headers.") +
        "<h2>Response " +
        (resp ? (resp.live ? OBS : SIM) : "") +
        "</h2>" +
        hdrTable(resp ? resp.headers : [], "Waiting…") +
        (resp && resp.live
          ? '<p class="muted small">Cross-origin responses only expose CORS-safelisted or explicitly exposed headers.</p>'
          : "");
    } else if (PF.tools.views[tab]) {
      h = PF.tools.views[tab](r, resp);
    } else {
      h = '<div id="tl2"></div>';
    }
    body.innerHTML = h;
    PF.$$("[data-val]", body).forEach(
      (b) => (b.onclick = () => PF.copy(b.dataset.val, b)),
    );
    const map = {
      url: r.url,
      reqbody: r.bodyText || "",
      resbody: resp ? resp.body : "",
    };
    PF.$$("[data-copy]", body).forEach(
      (b) => (b.onclick = () => PF.copy(map[b.dataset.copy], b)),
    );
    if (PF.tools.views[tab]) PF.tools.bind(body);
    if (tab === "timing") {
      PF.$("#tl2").innerHTML = PF.$("#timeline").innerHTML;
    }
  }
  return {
    init() {
      select = PF.tabs(PF.$("#inspTabs"), (t) => {
        tab = t;
        render();
      });
      timeline();
    },
    render,
    timeline,
    clear() {
      S().total = 0;
      render();
      timeline();
    },
  };
})();
