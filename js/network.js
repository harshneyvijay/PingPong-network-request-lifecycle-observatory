/* network.js — SVG sequence diagram and packet animation */
PF.network = (() => {
  const NS = "http://www.w3.org/2000/svg",
    X = { c: 90, d: 360, s: 630 },
    H = 460;
  let svg,
    tok = 0,
    groups = {},
    heads = {};
  const el = (n, a = {}, p) => {
    const e = document.createElementNS(NS, n);
    for (const k in a) e.setAttribute(k, a[k]);
    if (p) p.appendChild(e);
    return e;
  };

  function messages(req) {
    let host = "host",
      path = "/",
      m = "GET";
    if (req) {
      const u = new URL(req.url);
      host = u.hostname;
      path = u.pathname + u.search;
      m = req.method;
    }
    return [
      [
        "dns",
        [
          ["c", "d", "DNS query: A " + host.slice(0, 18)],
          ["d", "c", "A record → IP"],
        ],
      ],
      [
        "tcp",
        [
          ["c", "s", "SYN"],
          ["s", "c", "SYN-ACK"],
          ["c", "s", "ACK"],
        ],
      ],
      [
        "tls",
        [
          ["c", "s", "ClientHello"],
          ["s", "c", "ServerHello + Cert"],
          ["c", "s", "Key Exchange"],
          ["s", "c", "Finished"],
        ],
      ],
      ["http", [["c", "s", (m + " " + path).slice(0, 26)]]],
      ["server", []],
      ["response", [["s", "c", "HTTP response"]]],
    ];
  }

  function build(req) {
    tok++;
    groups = {};
    heads = {};
    svg = PF.$("#diagram");
    svg.innerHTML = "";
    const secure = !req || new URL(req.url).protocol === "https:";
    const defs = el("defs", {}, svg);
    el(
      "path",
      { d: "M0,0L8,4L0,8z", fill: "currentColor" },
      el(
        "marker",
        {
          id: "arr",
          markerWidth: 8,
          markerHeight: 8,
          refX: 7,
          refY: 4,
          orient: "auto",
          markerUnits: "userSpaceOnUse",
        },
        defs,
      ),
    );
    [
      ["c", "CLIENT", "Browser"],
      ["d", "DNS RESOLVER", "simulated"],
      ["s", "SERVER", "Origin"],
    ].forEach(([k, t, s]) => {
      el(
        "line",
        { x1: X[k], x2: X[k], y1: 48, y2: H - 10, class: "life" },
        svg,
      );
      const g = el("g", { class: "head" }, svg);
      heads[k] = g;
      el("rect", { x: X[k] - 60, y: 8, width: 120, height: 40, rx: 3 }, g);
      el(
        "text",
        { x: X[k], y: 25, "text-anchor": "middle", class: "t1" },
        g,
      ).textContent = t;
      el(
        "text",
        { x: X[k], y: 40, "text-anchor": "middle", class: "t2" },
        g,
      ).textContent = s;
    });
    let y = 80;
    messages(req).forEach(([st, list]) => {
      groups[st] = [];
      if (st === "tls" && !secure) return;
      if (st === "server") {
        const g = el("g", { class: "msg" }, svg);
        el(
          "rect",
          {
            x: X.s - 70,
            y: y - 13,
            width: 140,
            height: 26,
            rx: 3,
            class: "proc",
          },
          g,
        );
        el("text", { x: X.s, y: y + 4, class: "lab" }, g).textContent =
          "processing (SIMULATED)";
        groups.server.push({ g });
        y += 36;
        return;
      }
      list.forEach(([f, t, l]) => {
        const g = el("g", { class: "msg" }, svg),
          x1 = X[f],
          x2 = X[t],
          sg = x2 > x1 ? 1 : -1;
        el(
          "line",
          { x1, y1: y, x2: x2 - sg * 8, y2: y, "marker-end": "url(#arr)" },
          g,
        );
        const lab = el("text", { x: (x1 + x2) / 2, y: y - 6, class: "lab" }, g);
        lab.textContent = l;
        const dot = el("circle", { r: 5, cx: x1, cy: y, class: "pkt" }, g);
        groups[st].push({ g, dot, lab, x1, x2 });
        y += 30;
      });
    });
  }

  function animate(item, d, my) {
    return new Promise((res) => {
      item.g.classList.add("on");
      const t0 = performance.now();
      const f = (now) => {
        if (my !== tok) return; // cancelled
        const p = Math.min(1, (now - t0) / d);
        if (item.dot)
          item.dot.setAttribute("cx", item.x1 + (item.x2 - item.x1) * p);
        if (p < 1) requestAnimationFrame(f);
        else res();
      };
      requestAnimationFrame(f);
    });
  }

  async function play(stage, dur) {
    const my = tok,
      list = groups[stage] || [];
    Object.values(heads).forEach((h) => h.classList.remove("active"));
    (stage === "dns" ? ["c", "d"] : ["c", "s"]).forEach((k) =>
      heads[k].classList.add("active"),
    );
    if (!list.length) return;
    for (const it of list) {
      await animate(it, dur / list.length, my);
      if (my !== tok) return;
    }
  }

  return {
    build,
    play,
    reset: () => build(null),
    cancel: () => {
      tok++;
      Object.values(heads).forEach((h) => h.classList.remove("active"));
    },
    label: (stage, i, text, kind) => {
      const it = (groups[stage] || [])[i];
      if (it && it.lab) {
        it.lab.textContent = text;
        it.g.setAttribute("data-kind", kind || "");
      }
    },
  };
})();
