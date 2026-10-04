/* history.js — localStorage request history (no auth headers, no bodies) */
PF.history = (() => {
  const KEY = "pf-history";
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch (e) {
      return [];
    }
  };
  const save = (l) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(l));
    } catch (e) {
      /* storage unavailable */
    }
  };
  function render() {
    const l = (PF.state.history = load()),
      box = PF.$("#histBody");
    if (!l.length) {
      box.innerHTML = '<p class="muted small">No history yet.</p>';
      return;
    }
    box.innerHTML = l
      .map(
        (e, i) =>
          '<button class="hrow" data-i="' +
          i +
          '"><b>' +
          e.method +
          "</b><span>" +
          PF.esc(e.url) +
          '</span><span class="s' +
          String(e.status)[0] +
          '">' +
          e.status +
          "</span><span>" +
          e.duration +
          "ms " +
          (e.live ? "" : "(sim)") +
          "</span></button>",
      )
      .join("");
    PF.$$(".hrow", box).forEach(
      (b) => (b.onclick = () => PF.restore(l[b.dataset.i])),
    );
  }
  return {
    init() {
      PF.$("#histClear").onclick = () => {
        save([]);
        render();
      };
      render();
    },
    add(req, resp, duration) {
      const u = new URL(req.url);
      // strip query values that look like secrets; never store headers or body
      ["key", "token", "api_key", "apikey", "access_token", "password"].forEach(
        (k) => u.searchParams.has(k) && u.searchParams.set(k, "***"),
      );
      const l = load();
      l.unshift({
        method: req.method,
        url: u.href,
        status: resp.status,
        duration,
        live: resp.live,
        time: Date.now(),
      });
      save(l.slice(0, 30));
      render();
    },
  };
})();
