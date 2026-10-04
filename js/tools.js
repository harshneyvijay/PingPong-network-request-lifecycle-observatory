/* tools.js — export (cURL / fetch / HAR), security-header audit, run comparison */
PF.tools = (() => {
  const S = () => PF.state,
    esc = (s) => PF.esc(s);
  const SENSITIVE = /authorization|token|api[-_]?key|secret|cookie|password/i;
  const SIM = '<span class="tag sim">SIMULATED</span>',
    OBS = '<span class="tag live">OBSERVED</span>';
  const safeHeaders = (h) =>
    Object.entries(h).map(([k, v]) => [
      k,
      SENSITIVE.test(k) ? "<REDACTED>" : v,
    ]);
  const sh = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

  const curl = (r) =>
    ["curl -X " + r.method + " " + sh(r.url)]
      .concat(
        safeHeaders(r.headers).map(([k, v]) => "  -H " + sh(k + ": " + v)),
        r.bodyText
          ? ["  --data " + sh(r.bodyText.replace(/\s*\n\s*/g, " "))]
          : [],
      )
      .join(" \\\n");

  const snippet = (r) => {
    const o = { method: r.method },
      h = Object.fromEntries(safeHeaders(r.headers));
    if (Object.keys(h).length) o.headers = h;
    let opts = JSON.stringify(o, null, 2);
    if (r.bodyText)
      opts = opts.replace(
        /\n\}$/,
        ",\n  body: JSON.stringify(" +
          r.bodyText.replace(/\n/g, "\n  ") +
          ")\n}",
      );
    return (
      "const res = await fetch(" +
      JSON.stringify(r.url) +
      ", " +
      opts +
      ");\nconsole.log(res.status, await res.text());"
    );
  };

  const har = (r, resp) => {
    const st = S(),
      u = new URL(r.url),
      obs = st.timingSource === "observed",
      g = (k) => (obs && st.timings[k] ? st.timings[k].dur : -1);
    const ct = (resp.headers.find((h) => h[0] === "content-type") || [
      0,
      "",
    ])[1];
    return {
      log: {
        version: "1.2",
        creator: { name: "PingPong", version: "1.0" },
        entries: [
          {
            startedDateTime: st.startedAt || new Date().toISOString(),
            time: st.total,
            request: Object.assign(
              {
                method: r.method,
                url: r.url,
                httpVersion: "HTTP/1.1",
                cookies: [],
                headers: safeHeaders(r.headers).map(([name, value]) => ({
                  name,
                  value,
                })),
                queryString: [...u.searchParams].map(([name, value]) => ({
                  name,
                  value,
                })),
                headersSize: -1,
                bodySize: r.bodyText ? new Blob([r.bodyText]).size : 0,
              },
              r.bodyText
                ? {
                    postData: {
                      mimeType: "application/json",
                      text: r.bodyText,
                    },
                  }
                : {},
            ),
            response: {
              status: resp.status,
              statusText: resp.statusText,
              httpVersion: "HTTP/1.1",
              cookies: [],
              headers: resp.headers.map(([name, value]) => ({ name, value })),
              content: { size: resp.size, mimeType: ct, text: resp.body },
              redirectURL: "",
              headersSize: -1,
              bodySize: resp.size,
            },
            cache: {},
            timings: {
              blocked: -1,
              dns: g("dns"),
              connect: g("tcp"),
              ssl: g("tls"),
              send: 0,
              wait: g("server"),
              receive: g("response"),
            },
            _PingPong: {
              source: resp.live ? "live" : "simulated",
              timingSource: st.timingSource,
            },
          },
        ],
      },
    };
  };
  const download = (name, text) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* security-header audit (live responses only) */
  const CHECKS = [
    [
      "Strict-Transport-Security",
      (v) => /max-age=\d+/i.test(v) && !/max-age=0\b/i.test(v),
      "Forces HTTPS on future visits.",
    ],
    [
      "Content-Security-Policy",
      (v) => !!v,
      "Restricts where scripts and resources may load from.",
    ],
    [
      "X-Content-Type-Options",
      (v) => /nosniff/i.test(v),
      "Stops MIME-type sniffing.",
    ],
    [
      "X-Frame-Options",
      (v) => /deny|sameorigin/i.test(v),
      "Clickjacking protection (or CSP frame-ancestors).",
    ],
    [
      "Referrer-Policy",
      (v) => !!v,
      "Controls how much referrer info is leaked.",
    ],
    ["Permissions-Policy", (v) => !!v, "Limits powerful browser features."],
  ];
  function audit(r, resp) {
    const map = Object.fromEntries(resp.headers),
      https = new URL(r.url).protocol === "https:";
    let cross = true;
    try {
      cross = new URL(r.url).origin !== location.origin;
    } catch (e) {
      /* keep cross */
    }
    const rows = [
      [
        "Transport (HTTPS)",
        https ? "pass" : "fail",
        https ? "https" : "http",
        "Traffic is encrypted in transit.",
      ],
    ];
    CHECKS.forEach(([name, ok, why]) => {
      const key = name.toLowerCase();
      let v = map[key];
      if (
        key === "x-frame-options" &&
        v === undefined &&
        /frame-ancestors/i.test(map["content-security-policy"] || "")
      )
        v = "via CSP frame-ancestors";
      if (key === "strict-transport-security" && !https)
        return rows.push([name, "na", "n/a for http", why]);
      rows.push([
        name,
        v === undefined
          ? cross
            ? "hidden"
            : "fail"
          : ok(v) || /CSP/.test(v)
            ? "pass"
            : "weak",
        v === undefined ? "—" : v,
        why,
      ]);
    });
    const scored = rows.filter((x) => ["pass", "weak", "fail"].includes(x[1])),
      pass = scored.filter((x) => x[1] === "pass").length;
    const cls = {
        pass: "s2",
        weak: "s3",
        fail: "s4",
        hidden: "muted",
        na: "muted",
      },
      lab = {
        pass: "PASS",
        weak: "WEAK",
        fail: "MISSING",
        hidden: "NOT VISIBLE",
        na: "N/A",
      };
    return (
      "<p><b>" +
      pass +
      " / " +
      scored.length +
      "</b> visible checks pass " +
      OBS +
      "</p><table>" +
      rows
        .map(
          (x) =>
            "<tr><th>" +
            x[0] +
            '</th><td class="' +
            cls[x[1]] +
            '">' +
            lab[x[1]] +
            "</td><td>" +
            esc(x[2]) +
            '<br><span class="muted">' +
            x[3] +
            "</span></td></tr>",
        )
        .join("") +
      "</table>" +
      (cross
        ? '<p class="muted small">Cross-origin: JavaScript only sees headers the server lists in Access-Control-Expose-Headers (plus a safelist). "Not visible" does not mean the header is absent. Checks are a heuristic, not a full security scan.</p>'
        : "")
    );
  }

  /* comparison */
  let base = null;
  const snap = () => {
    const st = S(),
      r = st.request,
      resp = st.response;
    if (!r || !resp || !resp.status || st.running) return null;
    const t = st.timings,
      g = (k) => (t[k] ? t[k].dur : null),
      u = new URL(r.url);
    return {
      label: r.method + " " + u.host + u.pathname,
      status: resp.status,
      total: st.total,
      size: resp.size,
      dns: g("dns"),
      tcp: g("tcp"),
      tls: g("tls"),
      ttfb: g("server"),
      transfer: g("response"),
      obs: st.timingSource === "observed",
      live: resp.live,
    };
  };
  function compare() {
    const cur = snap();
    const btns =
      '<button class="sm" data-act="pin"' +
      (cur ? "" : " disabled") +
      ">Pin current run as baseline</button>" +
      (base
        ? '<button class="sm" data-act="unpin">Clear baseline</button>'
        : "");
    if (!base)
      return (
        btns +
        '<p class="muted">Pin a completed run, change something (URL, headers, method), run again, then compare.</p>'
      );
    if (!cur)
      return (
        btns +
        '<p class="muted">Baseline: ' +
        esc(base.label) +
        ". Complete another run to compare.</p>"
      );
    const rows = [
      ["Status", "status"],
      ["Total (ms)", "total"],
      ["Size (B)", "size"],
      ["DNS (ms)", "dns"],
      ["TCP (ms)", "tcp"],
      ["TLS (ms)", "tls"],
      ["TTFB (ms)", "ttfb"],
      ["Transfer (ms)", "transfer"],
    ];
    const f = (v) => (v === null || v === undefined ? "—" : v);
    const d = (a, b, k) =>
      k === "status"
        ? a === b
          ? "same"
          : "changed"
        : a == null || b == null
          ? "—"
          : '<span class="' +
            (b - a < 0 ? "s2" : b - a > 0 ? "s4" : "") +
            '">' +
            (b - a > 0 ? "+" : "") +
            Math.round((b - a) * 10) / 10 +
            "</span>";
    const sim = !(base.live && base.obs && cur.live && cur.obs);
    return (
      btns +
      "<table><tr><th></th><th>Baseline</th><th>Current</th><th>Δ</th></tr><tr><th></th><td>" +
      esc(base.label) +
      "</td><td>" +
      esc(cur.label) +
      "</td><td></td></tr>" +
      rows
        .map(
          ([n, k]) =>
            "<tr><th>" +
            n +
            "</th><td>" +
            f(base[k]) +
            "</td><td>" +
            f(cur[k]) +
            "</td><td>" +
            d(base[k], cur[k], k) +
            "</td></tr>",
        )
        .join("") +
      "</table>" +
      '<p class="muted small">' +
      (sim
        ? "At least one run includes " +
          SIM +
          " values; those deltas are not meaningful. Only live runs with observed Resource Timing are directly comparable."
        : "Both runs are live with observed timings (green = faster).") +
      " Single runs are noisy; repeat for a fair comparison.</p>"
    );
  }

  const views = {
    export: (r, resp) =>
      '<p class="muted small">Authorization, token, key and cookie headers are redacted in exports.</p>' +
      '<h2>cURL</h2><pre class="code" id="x-curl">' +
      esc(curl(r)) +
      '</pre><button class="sm" data-act="copy" data-target="x-curl">Copy cURL</button>' +
      '<h2>fetch()</h2><pre class="code" id="x-fetch">' +
      esc(snippet(r)) +
      '</pre><button class="sm" data-act="copy" data-target="x-fetch">Copy fetch()</button>' +
      '<h2>HAR 1.2</h2><button class="sm" data-act="har"' +
      (resp && resp.live ? "" : " disabled") +
      '>Download .har</button> <span class="muted small">Opens in Chrome DevTools or other HAR viewers. Unobserved timings are exported as -1.</span>',
    security: (r, resp) =>
      !resp
        ? '<p class="muted">Waiting for response…</p>'
        : resp.live
          ? audit(r, resp)
          : '<p class="muted">The audit needs a real ' +
            OBS +
            " response. No real response was received in this run, so there are no headers to audit.</p>",
    compare: () => compare(),
  };
  const bind = (box) => {
    const act = (a, fn) =>
      PF.$$("[data-act=" + a + "]", box).forEach(
        (b) => (b.onclick = () => fn(b)),
      );
    act("copy", (b) =>
      PF.copy(PF.$("#" + b.dataset.target, box).textContent, b),
    );
    act("har", () =>
      download(
        "PingPong-" + Date.now() + ".har",
        JSON.stringify(har(S().request, S().response), null, 2),
      ),
    );
    act("pin", () => {
      base = snap();
      PF.inspector.render();
    });
    act("unpin", () => {
      base = null;
      PF.inspector.render();
    });
  };
  return { views, bind, curl, snippet, har, audit };
})();
