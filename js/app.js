/* app.js — initialization, shared helpers, central state, request builder */
window.PF = window.PF || {};
PF.state = {
  mode: "simulation",
  running: false,
  request: null,
  response: null,
  currentStage: null,
  timings: {},
  timingSource: "simulated",
  total: 0,
  sim: null,
  history: [],
  explain: false,
};
PF.$ = (s, r = document) => r.querySelector(s);
PF.$$ = (s, r = document) => [...r.querySelectorAll(s)];
PF.esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
PF.copy = async (text, btn) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    /* clipboard unavailable */
  }
  const o = btn.textContent;
  btn.textContent = "Copied ✓";
  setTimeout(() => (btn.textContent = o), 1200);
};
PF.tabs = (list, cb) => {
  const btns = PF.$$("[role=tab]", list);
  const sel = (b) => {
    btns.forEach((x) => {
      x.setAttribute("aria-selected", x === b);
      x.tabIndex = x === b ? 0 : -1;
    });
    cb(b.dataset.tab);
  };
  btns.forEach((b) => b.addEventListener("click", () => sel(b)));
  list.addEventListener("keydown", (e) => {
    const i = btns.indexOf(document.activeElement);
    if (i < 0 || !["ArrowRight", "ArrowLeft"].includes(e.key)) return;
    const n =
      btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length];
    n.focus();
    sel(n);
  });
  sel(btns[0]);
  return (t) => sel(btns.find((b) => b.dataset.tab === t));
};
PF.modal = (title, html) => {
  PF.$("#modalTitle").textContent = title;
  PF.$("#modalBody").innerHTML = html;
  const m = PF.$("#modal");
  if (!m.open) m.showModal();
};
PF.setStatus = (text, kind) => {
  PF.$("#statusText").textContent = text;
  PF.$("#statusDot").className = "dot " + (kind || "");
};

/* editable key/value rows */
PF.rows = (box, init = {}) => {
  const add = (k = "", v = "") => {
    const r = document.createElement("div");
    r.className = "row";
    r.innerHTML =
      '<input placeholder="key" aria-label="key"><input placeholder="value" aria-label="value"><button aria-label="Remove row">✕</button>';
    r.children[0].value = k;
    r.children[1].value = v;
    r.children[2].onclick = () => {
      r.remove();
      PF.updateUrl();
    };
    r.addEventListener("input", PF.updateUrl);
    box.insertBefore(
      r,
      box.lastElementChild && box.lastElementChild.classList.contains("addbtn")
        ? box.lastElementChild
        : null,
    );
  };
  box.innerHTML = "";
  const a = document.createElement("button");
  a.textContent = "+ Add";
  a.className = "addbtn sm";
  a.onclick = () => add();
  box.appendChild(a);
  Object.entries(init).forEach(([k, v]) => add(k, v));
  if (!Object.keys(init).length) add();
};
PF.getRows = (box) => {
  const o = {};
  PF.$$(".row", box).forEach((r) => {
    const k = r.children[0].value.trim();
    if (k) o[k] = r.children[1].value;
  });
  return o;
};

PF.buildRequest = () => {
  const method = PF.$("#method").value;
  let raw = PF.$("#url").value.trim();
  if (!raw)
    return {
      error:
        "Invalid URL\nURL is empty. Please enter a valid HTTP or HTTPS URL.",
    };
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return {
      error:
        "Invalid URL\nMalformed URL. Please enter a valid HTTP or HTTPS URL.",
    };
  }
  if (!["http:", "https:"].includes(u.protocol))
    return {
      error:
        'Invalid URL\nUnsupported protocol "' +
        u.protocol +
        '". Please enter a valid HTTP or HTTPS URL.',
    };
  Object.entries(PF.getRows(PF.$("#paramRows"))).forEach(([k, v]) =>
    u.searchParams.set(k, v),
  );
  const headers = PF.getRows(PF.$("#headerRows"));
  let bodyText = null;
  if (["POST", "PUT", "PATCH"].includes(method)) {
    bodyText = PF.$("#bodyText").value.trim();
    if (bodyText) {
      try {
        bodyText = JSON.stringify(JSON.parse(bodyText), null, 2);
      } catch (e) {
        return {
          error: "INVALID JSON BODY\nFix the JSON before sending the request.",
        };
      }
    } else bodyText = null;
    if (
      bodyText &&
      !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")
    )
      headers["Content-Type"] = "application/json";
  }
  return { req: { method, url: u.href, headers, bodyText } };
};
PF.updateUrl = () => {
  try {
    const u = new URL(PF.$("#url").value.trim());
    Object.entries(PF.getRows(PF.$("#paramRows"))).forEach(([k, v]) =>
      u.searchParams.set(k, v),
    );
    PF.$("#finalUrl").textContent = u.href;
  } catch (e) {
    PF.$("#finalUrl").textContent = "";
  }
};
PF.showError = (msg) => {
  const e = PF.$("#urlError");
  e.hidden = !msg;
  e.textContent = msg || "";
};
PF.notice = (msg, kind) => {
  const n = PF.$("#notice");
  n.hidden = !msg;
  n.textContent = msg || "";
  n.className = "notice" + (kind ? " " + kind : "");
};

PF.send = () => {
  if (PF.state.running) return;
  const r = PF.buildRequest();
  PF.showError(r.error);
  if (r.error) return;
  PF.state.request = r.req;
  PF.notice("");
  PF.simulation.start();
};
PF.restore = (e) => {
  PF.$("#method").value = e.method;
  try {
    const u = new URL(e.url);
    PF.$("#url").value = u.origin + u.pathname + u.search;
  } catch (x) {
    PF.$("#url").value = e.url;
  }
  PF.rows(PF.$("#paramRows"));
  PF.updateUrl();
  window.scrollTo({ top: 0, behavior: "smooth" });
};
PF.reset = () => {
  PF.simulation.stop(true);
  PF.network.reset();
  PF.state.response = null;
  PF.state.timings = {};
  PF.state.request = null;
  PF.state.sim = null;
  PF.inspector.clear();
  PF.$("#term").textContent = "$ PingPong ready";
  PF.$("#empty").hidden = false;
  PF.$("#stageInfo").innerHTML = "";
  PF.$("#srvNote").innerHTML = "";
  PF.$("#explain").hidden = true;
  PF.notice("");
  PF.showError("");
  PF.simulation.renderNodes();
  PF.setStatus("SIMULATION READY");
  PF.education.onStage(null);
};

PF.init = () => {
  const root = document.documentElement;
  try {
    root.dataset.theme = localStorage.getItem("pf-theme") || "dark";
  } catch (e) {
    /* ignore */
  }
  PF.rows(PF.$("#paramRows"));
  PF.rows(PF.$("#headerRows"));
  PF.data.presets.forEach((p, i) => PF.$("#preset").add(new Option(p.name, i)));
  PF.$("#preset").onchange = (e) => {
    const p = PF.data.presets[e.target.value];
    if (!p) return;
    PF.$("#method").value = p.method;
    PF.$("#url").value = p.url;
    PF.rows(PF.$("#paramRows"));
    PF.rows(PF.$("#headerRows"), p.headers);
    if (p.body) PF.$("#bodyText").value = p.body;
    PF.updateUrl();
  };
  const cfgShow = PF.tabs(PF.$("#cfgTabs"), (t) => {
    PF.$("#pParams").hidden = t !== "params";
    PF.$("#pHeaders").hidden = t !== "headers";
    PF.$("#pBody").hidden = t !== "body";
  });
  PF.$("#url").addEventListener("input", PF.updateUrl);
  PF.$("#send").onclick = PF.send;
  PF.$("#stop").onclick = () => PF.simulation.stop();
  PF.$("#replay").onclick = () => {
    if (PF.state.request) {
      PF.notice("");
      PF.simulation.start();
    } else PF.send();
  };
  PF.$("#btnReset").onclick = PF.reset;
  PF.$("#btnHistory").onclick = () =>
    PF.$("#historyPanel").scrollIntoView({ behavior: "smooth" });
  PF.$("#btnTheme").onclick = () => {
    const t = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = t;
    try {
      localStorage.setItem("pf-theme", t);
    } catch (e) {
      /* ignore */
    }
  };
  PF.$("#tryExample").onclick = () => {
    PF.$("#preset").value = 0;
    PF.$("#preset").onchange({ target: PF.$("#preset") });
    PF.send();
  };
  PF.$("#explainToggle").onchange = (e) => {
    PF.state.explain = e.target.checked;
    PF.education.onStage(PF.state.currentStage);
  };
  PF.$("#modalClose").onclick = () => PF.$("#modal").close();
  PF.$("#btnKeys").onclick = () =>
    PF.modal(
      "Keyboard shortcuts",
      '<table class="table"><tr><td><code>Ctrl/Cmd + Enter</code></td><td>Send request</td></tr><tr><td><code>Esc</code></td><td>Stop simulation</td></tr><tr><td><code>R</code></td><td>Reset (when not typing)</td></tr></table>',
    );
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      PF.send();
    } else if (e.key === "Escape" && PF.state.running) PF.simulation.stop();
    else if (
      (e.key === "r" || e.key === "R") &&
      !typing &&
      !e.ctrlKey &&
      !e.metaKey
    )
      PF.reset();
  });
  PF.$("#termClear").onclick = () => (PF.$("#term").textContent = "");
  PF.$("#termCopy").onclick = (e) =>
    PF.copy(PF.$("#term").textContent, e.target);
  PF.simulation.renderNodes();
  PF.network.reset();
  PF.inspector.init();
  PF.history.init();
  PF.education.init();
};
