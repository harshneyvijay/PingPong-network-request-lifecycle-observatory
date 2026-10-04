/* education.js — OSI/TCP-IP, status codes, TCP vs UDP, DNS, HTTP versions, explain mode */
PF.education = (() => {
  const D = () => PF.data;
  let view = "layers",
    model = "osi",
    hot = [],
    q = "",
    cat = 0;
  const seg = (items, cur, attr) =>
    '<div class="seg">' +
    items
      .map(
        (i) =>
          "<button " +
          attr +
          '="' +
          i +
          '" aria-pressed="' +
          (i === cur) +
          '">' +
          i +
          "</button>",
      )
      .join("") +
    "</div>";
  const detail = (html) => {
    PF.$("#detail").innerHTML = html;
  };

  const views = {
    layers: () => {
      const items = model === "osi" ? D().osi : D().tcpip;
      return (
        "<div>" +
        seg(["osi", "tcpip"], model, "data-model")
          .replace(">osi<", ">OSI<")
          .replace(">tcpip<", ">TCP/IP<") +
        '<div class="list">' +
        items
          .map(
            (l, i) =>
              '<button class="item' +
              (hot.some((n) => (l.n ? [l.n] : l.nums).includes(n))
                ? " hot"
                : "") +
              '" data-i="' +
              i +
              '"><b>' +
              (l.n || "") +
              "</b>" +
              l.name +
              "<span>" +
              l.protos +
              "</span></button>",
          )
          .join("") +
        "</div>" +
        (model === "tcpip"
          ? '<p class="muted small">' + D().mapping + "</p>"
          : "") +
        '</div><div id="detail" class="detail">Select a layer. The active layer is highlighted while a request runs.</div>'
      );
    },
    status: () => {
      const s = D().status.filter(
        (x) =>
          (!cat || String(x[0])[0] == cat) &&
          (x[0] + " " + x[1]).toLowerCase().includes(q.toLowerCase()),
      );
      return (
        '<div><input id="sq" type="search" placeholder="Search status codes" aria-label="Search status codes" value="' +
        PF.esc(q) +
        '"><div class="seg" style="margin-top:6px;flex-wrap:wrap"><button data-cat="0" aria-pressed="' +
        (cat === 0) +
        '">All</button>' +
        Object.entries(D().statusCats)
          .map(
            ([k, v]) =>
              '<button data-cat="' +
              k +
              '" aria-pressed="' +
              (cat == k) +
              '">' +
              v +
              "</button>",
          )
          .join("") +
        '</div><div class="list">' +
        s
          .map(
            (x) =>
              '<button class="item" data-code="' +
              x[0] +
              '"><b class="s' +
              String(x[0])[0] +
              '">' +
              x[0] +
              "</b>" +
              x[1] +
              "</button>",
          )
          .join("") +
        '</div></div><div id="detail" class="detail">Select a status code.</div>'
      );
    },
    tcpudp: () =>
      "<div>" +
      seg(["TCP", "UDP"], "", "data-tu") +
      '<p class="muted small">Click TCP or UDP for details.</p></div><div id="detail" class="detail">Compare: connection-oriented vs connectionless, reliable vs lightweight.</div>',
    dns: () =>
      '<div class="list">' +
      D()
        .dns.map(
          (s, i) =>
            '<button class="item" data-d="' +
            i +
            '">' +
            (i + 1) +
            " · " +
            s[0] +
            "</button>",
        )
        .join("") +
      '</div><div id="detail" class="detail">Select a step in the resolution chain.</div>',
    http: () =>
      "<div>" +
      seg(Object.keys(D().http), "", "data-hv") +
      '</div><div id="detail" class="detail">Select an HTTP version.</div>',
  };

  function draw() {
    PF.$("#learnBody").innerHTML = views[view]();
  }
  function click(e) {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.model) {
      model = t.dataset.model;
      draw();
    } else if (t.dataset.cat !== undefined) {
      cat = +t.dataset.cat;
      draw();
    } else if (t.dataset.code) {
      const s = D().status.find((x) => x[0] == t.dataset.code);
      detail(
        '<b class="s' +
          String(s[0])[0] +
          '">' +
          s[0] +
          " " +
          s[1] +
          "</b><p><b>Meaning:</b> " +
          s[2] +
          "</p><p><b>Typical example:</b> " +
          s[3] +
          "</p>",
      );
    } else if (t.dataset.tu) {
      const x = D().tcpudp[t.dataset.tu];
      detail(
        "<b>" +
          t.dataset.tu +
          "</b><p>" +
          x.points +
          "</p><p><b>Used by:</b> " +
          x.examples +
          "</p><p>" +
          x.more +
          "</p>",
      );
    } else if (t.dataset.d) {
      const s = D().dns[t.dataset.d];
      detail("<b>" + s[0] + "</b><p>" + s[1] + "</p>");
    } else if (t.dataset.hv)
      detail(
        "<b>" + t.dataset.hv + "</b><p>" + D().http[t.dataset.hv] + "</p>",
      );
    else if (t.dataset.i !== undefined) {
      const l = (model === "osi" ? D().osi : D().tcpip)[t.dataset.i];
      detail(
        "<b>" +
          (l.n ? l.n + " · " : "") +
          l.name +
          "</b><p><b>Purpose:</b> " +
          l.purpose +
          "</p><p><b>Protocols:</b> " +
          l.protos +
          "</p><p><b>In PingPong:</b> " +
          l.where +
          "</p>",
      );
    }
  }

  function explain(st) {
    const box = PF.$("#explain");
    if (!PF.state.explain || !st) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML =
      "<h4>WHAT IS HAPPENING?</h4><p>" +
      st.what +
      "</p><h4>WHY DOES IT HAPPEN?</h4><p>" +
      st.why +
      "</p><h4>PROTOCOL</h4><p>" +
      st.proto +
      "</p><h4>OSI LAYER</h4><p>" +
      st.layer +
      "</p>";
  }
  return {
    init() {
      PF.tabs(PF.$("#learnTabs"), (t) => {
        view = t;
        draw();
      });
      PF.$("#learnBody").addEventListener("click", click);
      PF.$("#learnBody").addEventListener("input", (e) => {
        if (e.target.id === "sq") {
          q = e.target.value;
          const pos = q.length;
          draw();
          const i = PF.$("#sq");
          i.focus();
          i.setSelectionRange(pos, pos);
        }
      });
    },
    onStage(id) {
      const st = D().stages.find((s) => s.id === id);
      hot = st ? st.nums : [];
      if (view === "layers") {
        const d = PF.$("#detail").innerHTML;
        draw();
        PF.$("#detail").innerHTML = d;
      }
      explain(st);
    },
    why(id) {
      const st = D().stages.find((s) => s.id === id);
      PF.modal(
        "WHY " + st.name + "?",
        "<p>" +
          st.why +
          '</p><p class="muted small">' +
          st.what +
          "</p><p><b>Protocol:</b> " +
          st.proto +
          " · <b>OSI layer:</b> " +
          st.layer +
          "</p>",
      );
    },
  };
})();

/* Classify a real HTTP status code into a kind, label and explanation (data-driven from PF.data.status). */
PF.statusInfo = (code) => {
  const c = Math.floor(code / 100),
    e = PF.data.status.find((x) => x[0] === code);
  const kind =
    { 1: "info", 2: "success", 3: "redirect", 4: "client", 5: "server" }[c] ||
    "unknown";
  const label =
    {
      1: "INFORMATIONAL",
      2: "SUCCESS",
      3: "REDIRECTION",
      4: "CLIENT ERROR",
      5: "SERVER ERROR",
    }[c] || "UNRECOGNISED";
  const hint =
    {
      1: "An interim response; the final one follows.",
      2: "The request was processed successfully.",
      3: "The client is being pointed elsewhere, or to a cached copy.",
      4: "The server was reached but rejected the request. Check the URL, auth, params and body.",
      5: "The server was reached but failed to handle the request. Retrying later may help.",
    }[c] || "This status code is outside the standard classes.";
  return {
    kind,
    label,
    name: e ? e[1] : "",
    msg: e ? e[2] : hint,
    hint,
    example: e ? e[3] : "",
  };
};
