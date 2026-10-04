# PingPong:

**PingPong: Network Request Lifecycle Observatory** — a browser-based tool that visualizes what happens between entering a URL and receiving an HTTP response.

> Integrated the Resource Timing API to surface real DNS, connect, TLS and TTFB metrics where servers permit, with explicit fallback and labelling of simulated data.
> Built request export (cURL, fetch, HAR 1.2) and a CORS-aware security-header audit for inspecting HTTP responses in the browser.
> Built an interactive browser-based network observability tool that visualizes DNS resolution, TCP handshakes, TLS negotiation, HTTP request/response flow, and network timing using vanilla JavaScript and SVG.
> Implemented an HTTP request inspector with live Fetch API requests, CORS-aware fallback to a clearly labelled simulation, and local request history.

### Deployed at [https://harshneyvijay.github.io/PingPong-network-request-lifecycle-observatory/]

## Features

- Request builder: method, URL validation, query params, headers, JSON body (validated), presets
- Animated SVG client / DNS / server sequence diagram with per-stage nodes and "?" explanations
- Optional **live** `fetch()` with real status, headers, body, size and duration
- Request/response inspector (Overview, Request, Response, Headers, Timing) with copy buttons
- Waterfall timeline and developer-style terminal log
- Explain mode, OSI and TCP/IP explorer, HTTP status explorer, TCP vs UDP, DNS chain, HTTP versions
- **Export**: cURL, `fetch()` snippet and HAR 1.2 download (auth headers redacted; unobserved timings exported as -1)
- **Security audit**: checks observed response headers (HSTS, CSP, nosniff, framing, referrer/permissions policy), aware that CORS hides unexposed headers
- **Run comparison**: pin a baseline run and diff status, size and timings against the next run
- **Real timings**: DNS/TCP/TLS/TTFB from the Resource Timing API when the server sends `Timing-Allow-Origin`; otherwise clearly labelled simulation
- Local history, dark/light theme, keyboard shortcuts, reduced-motion support

## How it works

`simulation.js` runs an async stage loop (DNS → TCP → TLS → HTTP → SERVER → RESPONSE) with jittered timings and a cancellation token. `network.js` draws the SVG diagram and animates packets with `requestAnimationFrame`. `inspector.js` renders the request/response views from one central state object in `app.js`.

## Real request vs simulation

Browsers do not expose raw DNS, TCP or TLS to JavaScript, so those stages are an **educational simulation** and are labelled `SIMULATED` in the UI.

If _Try live fetch()_ is on, PingPong sends a real request. Status, headers, body, size and duration are **observed**; real DNS/TCP/TLS/TTFB timings appear when the server exposes them via `Timing-Allow-Origin`.

**PingPong never fabricates a response.** If the request fails, you get an explicit outcome and no status code:

- _Blocked (CORS):_ a follow-up `no-cors` GET probe (no headers/body) shows the server answered, but the browser hides the response.
- _Unreachable:_ the probe also fails, so the host may not exist, be down, refuse connections, have a bad certificate, or be blocked (browsers do not say which).
- _Timeout / offline_ are reported as such. With live fetch off, the run is animation-only and shows no response.

The stage animation is always an illustration. IPs, certificates, TCP sequence numbers and TLS versions are not observable from JavaScript and are not shown as facts.


## Project structure

```text
PingPong/
├── index.html
├── css/
│   ├── style.css
│   ├── components.css
│   └── animations.css
├── js/
│   ├── app.js
│   ├── simulation.js
│   ├── network.js
│   ├── inspector.js
│   ├── tools.js
│   ├── history.js
│   ├── education.js
│   └── data.js
├── assets/
│   └── favicon.svg
└── README.md
```

## Key learning takeaways

- Browser networking limits and CORS
- HTTP lifecycle
- TCP handshake
- DNS resolution
- TLS at a conceptual level
- asynchronous JavaScript with cancellation
- Fetch API
- SVG animation
- Managing UI state with a single state object.


