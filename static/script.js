/* ===================================================
   StockPulse — script.js
   Indian Market Dashboard (NSE India API)
   Polished interactivity: count-up, range bar,
   smooth desc transitions, formula display, ripple
=================================================== */

// ── State ──────────────────────────────────────────
let currentStock = null;
let selectedProduct = "CNC";
let selectedOrder = "MARKET";
let priceChart = null;

// ── Product data ───────────────────────────────────
const PRODUCTS = {
  CNC: {
    title: "Cash and Carry (CNC)",
    body: "Full payment required upfront. Shares are delivered to your demat account. Best for investors intending to hold for multiple days. No leverage is provided — you own the shares outright.",
    chips: ["Delivery", "Multi-day", "No Leverage"],
  },
  MIS: {
    title: "Margin Intraday Square-off (MIS)",
    body: "The broker lends 5× leverage — you pay only 20% of the total order value. The position MUST be closed before market close (3:30 PM). If you forget, the broker auto-squares off automatically.",
    chips: ["Intraday Only", "5× Leverage", "Auto Square-off"],
  },
  NRML: {
    title: "Normal (NRML)",
    body: "Used primarily for Futures & Options. Standard margin (~20%) is blocked. Unlike MIS, NRML positions can be carried overnight into the next trading session.",
    chips: ["F&O", "Overnight", "20% Margin"],
  },
};

// ── Order data ─────────────────────────────────────
const ORDERS = {
  MARKET: {
    title: "Market Order",
    body: "Executes immediately at the current market price. Speed is prioritised over price precision. Best when you need guaranteed execution and are not sensitive to exact fill price.",
    chips: ["Instant", "Any Price", "Guaranteed Fill"],
  },
  LIMIT: {
    title: "Limit Order",
    body: "You specify a maximum buy price (or minimum sell price). The order sits in the queue and executes only when the market reaches your stated price. No fill guarantee.",
    chips: ["Your Price", "Queue-based", "No Fill Guarantee"],
  },
  SL: {
    title: "SL — Stop Loss",
    body: "A two-part order with a trigger price and a limit price. Once the stock crosses your trigger, a limit order is placed automatically. Protects you from large unexpected losses.",
    chips: ["Trigger + Limit", "Loss Protection", "Conditional"],
  },
  SLM: {
    title: "SL-M — Stop Loss Market",
    body: "Similar to SL but once the trigger price is breached, a market order is placed instead of a limit order. Execution is guaranteed but the exact fill price is not.",
    chips: ["Trigger + Market", "Execution Guaranteed", "Price Not Fixed"],
  },
};

// ── Search ─────────────────────────────────────────
document.getElementById("symbolInput").addEventListener("keydown", e => {
  if (e.key === "Enter") doSearch();
});

function searchSymbol(sym) {
  document.getElementById("symbolInput").value = sym;
  doSearch();
}

async function doSearch() {
  const symbol = document.getElementById("symbolInput").value.trim().toUpperCase();
  if (!symbol) return;

  setLoading(true);
  hideDashboard();
  hideError();

  try {
    const res = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`);
    const data = await res.json();
    if (data.error) {
      showError(data.error);
    } else {
      currentStock = data;
      switchTab('dashboard'); // ensure the dashboard is showing
      document.getElementById("dashboard").classList.remove("hidden");
      renderDashboard(data);
    }
  } catch {
    showError("Network error. Check your connection and try again.");
  } finally {
    setLoading(false);
  }
}

// ── Render dashboard ───────────────────────────────
function renderDashboard(d) {
  // Name + badge
  document.getElementById("stockName").textContent = d.script_name || "—";
  const badge = document.getElementById("instrumentBadge");
  const itype = (d.instrument_type || "equity");
  badge.textContent = itype.toUpperCase();
  badge.className = "badge " + (itype !== "equity" ? itype : "");

  // Change pill (LTP vs close)
  const pill = document.getElementById("changePill");
  const ltp = parseFloat(d.ltp) || 0;
  const close = parseFloat(d.close) || 0;
  if (close && ltp) {
    const diff = ltp - close;
    const pct = (diff / close * 100);
    const up = diff >= 0;
    pill.textContent = `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}% (${up ? "+" : ""}${diff.toFixed(2)})`;
    pill.className = "change-pill " + (up ? "up" : "dn");
  } else {
    pill.textContent = "—";
    pill.className = "change-pill neutral";
  }

  // Index note
  const inote = document.getElementById("indexNote");
  if (d.index_note) {
    inote.textContent = "ℹ " + d.index_note;
    inote.classList.remove("hidden");
  } else {
    inote.classList.add("hidden");
  }

  // LTP — count-up animation
  animateCount(document.getElementById("ltp"), 0, ltp, 800, v =>
    v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  // Stat cards
  animateCount(document.getElementById("statOpen"), 0, parseFloat(d.open) || 0, 700);
  animateCount(document.getElementById("statClose"), 0, close, 700);
  setStatValue("statUpper", d.upper_circuit);
  setStatValue("statLower", d.lower_circuit);
  animateCount(document.getElementById("stat52H"), 0, parseFloat(d.week_52_high) || 0, 700);
  animateCount(document.getElementById("stat52L"), 0, parseFloat(d.week_52_low) || 0, 700);

  // 52W range bar
  const hi = parseFloat(d.week_52_high) || 0;
  const lo = parseFloat(d.week_52_low) || 0;
  const sec = document.getElementById("rangeSection");
  if (hi && lo && hi > lo) {
    const pct = Math.max(0, Math.min(100, ((ltp - lo) / (hi - lo)) * 100));
    document.getElementById("rangeFill").style.width = pct + "%";
    document.getElementById("rangePin").style.left = pct + "%";
    document.getElementById("rangePos").textContent =
      pct.toFixed(1) + "% of 52W range";
    document.getElementById("rangeLow").textContent = "₹ " + lo.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    document.getElementById("rangeHigh").textContent = "₹ " + hi.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    sec.classList.remove("hidden");
  } else {
    sec.classList.add("hidden");
  }

  // Futures extra
  const futDiv = document.getElementById("futuresExtra");
  if (itype === "futures") {
    document.getElementById("futExpiry").textContent = d.expiry_date || "—";
    document.getElementById("futLotSize").textContent = d.lot_size || "—";
    const contractVal = ltp * (d.lot_size || 1);
    document.getElementById("futContract").textContent =
      "₹ " + contractVal.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    futDiv.classList.remove("hidden");
    document.getElementById("qtyLabel").textContent = "Lots";
  } else {
    futDiv.classList.add("hidden");
    document.getElementById("qtyLabel").textContent = "Quantity (shares)";
  }

  // Chart
  renderChart(d.chart_data || []);

  // Calculator
  calcAmount();

  // Show dashboard
  document.getElementById("dashboard").classList.remove("hidden");
  requestAnimationFrame(() => window.scrollTo({ top: document.getElementById("dashboard").offsetTop - 80, behavior: "smooth" }));
}

function setStatValue(id, val) {
  const el = document.getElementById(id);
  if (typeof val === "number") {
    animateCount(el, 0, val, 700);
  } else {
    el.textContent = val || "—";
  }
}

// ── Count-up animation ─────────────────────────────
function animateCount(el, from, to, duration, fmt) {
  if (!el || !to) { el && (el.textContent = fmt ? fmt(to) : fmtNum(to)); return; }
  const start = performance.now();
  fmt = fmt || fmtNum;
  function step(ts) {
    const p = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = fmt(from + (to - from) * ease);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function fmtNum(v) {
  if (!v && v !== 0) return "—";
  return "₹ " + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Chart ──────────────────────────────────────────
function renderChart(data) {
  const ctx = document.getElementById("priceChart").getContext("2d");
  if (priceChart) priceChart.destroy();
  if (!data.length) return;

  const labels = data.map(d => d.date);
  const vals = data.map(d => d.close);
  const hi30 = Math.max(...vals);
  const lo30 = Math.min(...vals);
  const last = vals[vals.length - 1];
  const first = vals[0];
  const rising = last >= first;

  // 30D chart meta
  const metaEl = document.getElementById("chartMeta");
  metaEl.classList.remove("hidden");
  document.getElementById("cm30H").textContent = "₹ " + hi30.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  document.getElementById("cm30L").textContent = "₹ " + lo30.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  const lineColor = rising ? "#00E5A0" : "#FF4D6D";
  const grad = ctx.createLinearGradient(0, 0, 0, 250);
  grad.addColorStop(0, rising ? "rgba(0,229,160,.3)" : "rgba(255,77,109,.3)");
  grad.addColorStop(1, "rgba(0,0,0,0)");

  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Close ₹",
        data: vals,
        borderColor: lineColor,
        backgroundColor: grad,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: lineColor,
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0d1220",
          borderColor: lineColor,
          borderWidth: 1,
          titleColor: lineColor,
          bodyColor: "#DDE6F0",
          padding: 12,
          titleFont: { family: "'IBM Plex Mono'" },
          bodyFont: { family: "'IBM Plex Mono'", size: 13 },
          callbacks: {
            label: ctx => "₹ " + ctx.parsed.y.toLocaleString("en-IN", { minimumFractionDigits: 2 })
          }
        }
      },
      scales: {
        x: {
          grid: { color: "#182035", drawTicks: false },
          border: { color: "#182035" },
          ticks: {
            color: "#4A5B78",
            font: { family: "'IBM Plex Mono'", size: 10 },
            maxTicksLimit: 7,
            maxRotation: 0,
          }
        },
        y: {
          position: "right",
          grid: { color: "#182035", drawTicks: false },
          border: { color: "#182035" },
          ticks: {
            color: "#4A5B78",
            font: { family: "'IBM Plex Mono'", size: 10 },
            callback: v => "₹" + v.toLocaleString("en-IN"),
          }
        }
      }
    }
  });
}

// ── Product Type ───────────────────────────────────
function selectProduct(val, btn) {
  selectedProduct = val;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("calcProductDisplay").textContent = val;
  updateDescBox("productDesc", PRODUCTS[val]);
  calcAmount();
}

// ── Order Type ─────────────────────────────────────
function selectOrderType() {
  selectedOrder = document.getElementById("orderTypeSelect").value;
  updateDescBox("orderDesc", ORDERS[selectedOrder]);
}

function updateDescBox(id, info) {
  const box = document.getElementById(id);
  box.style.opacity = "0";
  box.style.transform = "translateY(6px)";
  setTimeout(() => {
    box.innerHTML = `
      <div class="desc-title">${info.title}</div>
      <div class="desc-body">${info.body}</div>
      <div class="desc-chips">${info.chips.map(c => `<span class="chip">${c}</span>`).join("")}</div>
    `;
    box.style.transition = "opacity .25s, transform .25s";
    box.style.opacity = "1";
    box.style.transform = "translateY(0)";
  }, 120);
}

// ── Calculator ─────────────────────────────────────
function calcAmount() {
  if (!currentStock) return;

  const qty = Math.max(1, parseFloat(document.getElementById("qtyInput").value) || 1);
  const ltp = parseFloat(currentStock.ltp) || 0;
  const isFut = currentStock.instrument_type === "futures";
  const lotSize = isFut ? (currentStock.lot_size || 1) : 1;
  const effQty = qty * lotSize;

  let amount = 0;
  let formula = "";

  if (selectedProduct === "CNC") {
    amount = ltp * effQty;
    formula = isFut
      ? `₹${fmtCompact(ltp)} × ${qty} lots × ${lotSize} (lot size) = full value`
      : `₹${fmtCompact(ltp)} × ${qty} qty = full price`;
  } else if (selectedProduct === "MIS") {
    amount = (ltp * effQty) / 5;
    formula = `(₹${fmtCompact(ltp)} × ${effQty}) ÷ 5 = 5× intraday leverage`;
  } else if (selectedProduct === "NRML") {
    amount = (ltp * effQty) * 0.20;
    formula = `(₹${fmtCompact(ltp)} × ${effQty}) × 20% margin`;
  }

  // Animated update
  const resultEl = document.getElementById("calcResult");
  const prev = parseFloat(resultEl.dataset.raw) || 0;
  resultEl.dataset.raw = amount;
  animateCount(resultEl, prev, amount, 500, v =>
    "₹ " + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  document.getElementById("calcFormula").textContent = formula;
}

function fmtCompact(v) {
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ── Excel Export ───────────────────────────────────
async function exportExcel() {
  if (!currentStock) return;

  const qty = Math.max(1, parseFloat(document.getElementById("qtyInput").value) || 1);
  const ltp = parseFloat(currentStock.ltp) || 0;
  const isFut = currentStock.instrument_type === "futures";
  const lotSize = isFut ? (currentStock.lot_size || 1) : 1;
  const effQty = qty * lotSize;

  let amount = 0;
  if (selectedProduct === "CNC") amount = ltp * effQty;
  if (selectedProduct === "MIS") amount = (ltp * effQty) / 5;
  if (selectedProduct === "NRML") amount = (ltp * effQty) * 0.20;

  const btn = document.getElementById("exportBtn");
  btn.disabled = true;
  btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Generating…`;

  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stock_data: currentStock,
        order_data: {
          product_type: selectedProduct,
          order_type: ORDERS[selectedOrder].title,
          quantity: qty,
          ltp: ltp,
          estimated_amount: amount.toFixed(2),
        }
      })
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stockpulse_${(currentStock.script_name || "report").replace(/\s+/g, "_")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Export failed: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download as Excel`;
  }
}

// ── UI Helpers ─────────────────────────────────────
function setLoading(on) {
  document.getElementById("searchBtn").disabled = on;
  
  const overlay = document.getElementById("globalLoadingOverlay");
  if (overlay) {
    if (on) overlay.classList.remove("hidden");
    else overlay.classList.add("hidden");
  }
}
function hideDashboard() {
  document.getElementById("dashboardView").classList.remove("active-view");
  document.getElementById("dashboard").classList.add("hidden");
  const meta = document.getElementById("chartMeta");
  if (meta) meta.classList.add("hidden");
}
function showError(msg) {
  const el = document.getElementById("errorBanner");
  document.getElementById("errorMsg").textContent = msg;
  el.classList.remove("hidden");
}
function hideError() {
  document.getElementById("errorBanner").classList.add("hidden");
}

// ── Tab Navigation ─────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".view-section").forEach(v => v.classList.remove("active-view"));
  
  const tabBtn = document.querySelector(`.nav-tab[onclick*="${tabId}"]`);
  if (tabBtn) tabBtn.classList.add("active");
  
  if (tabId === 'dashboard') {
    document.getElementById("dashboardView").classList.add("active-view");
  } else if (tabId === 'fno') {
    document.getElementById("fnoView").classList.add("active-view");
    if (fnoPage === 1) loadMarketData('fno');
  } else if (tabId === 'all') {
    document.getElementById("marketView").classList.add("active-view");
    if (marketPage === 1) loadMarketData('all');
  }
}

// ── Autocomplete ───────────────────────────────────
let debounceTimer;
const searchInput = document.getElementById("symbolInput");
const autocompleteList = document.getElementById("autocompleteList");

searchInput.addEventListener("input", (e) => {
  clearTimeout(debounceTimer);
  const q = e.target.value.trim();
  
  if (q.length < 1) {
    autocompleteList.classList.add("hidden");
    return;
  }
  
  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      renderAutocomplete(data.results);
    } catch (err) {
      console.error("Autocomplete failed", err);
    }
  }, 350);
});

function renderAutocomplete(results) {
  if (!results || results.length === 0) {
    autocompleteList.classList.add("hidden");
    return;
  }
  
  autocompleteList.innerHTML = "";
  results.forEach(item => {
    const li = document.createElement("li");
    li.className = "autocomplete-item";
    li.innerHTML = `
      <span class="ac-sym">${item.symbol}</span>
      <span class="ac-name">${item.name}</span>
      <span class="ac-type ${item.type.toLowerCase()}">${item.type}</span>
    `;
    li.onmousedown = () => {
      searchInput.value = item.symbol;
      autocompleteList.classList.add("hidden");
      switchTab('dashboard');
      doSearch();
    };
    autocompleteList.appendChild(li);
  });
  
  autocompleteList.classList.remove("hidden");
}

// Hide autocomplete when clicking outside
document.addEventListener("mousedown", (e) => {
  if (!e.target.closest(".search-bar-wrap")) {
    autocompleteList.classList.add("hidden");
  }
});

// ── Market Explorer Data ───────────────────────────
let fnoPage = 1;
let marketPage = 1;

async function loadMarketData(type) {
  const isFno = type === 'fno';
  const page = isFno ? fnoPage : marketPage;
  const btn = document.getElementById(isFno ? "fnoLoadBtn" : "marketLoadBtn");
  const tbody = document.querySelector(isFno ? "#fnoTable tbody" : "#marketTable tbody");
  
  btn.disabled = true;
  btn.textContent = "Loading...";

  try {
    const res = await fetch(`/api/market-list?type=${type}&page=${page}`);
    const data = await res.json();
    
    if (data.error) throw new Error(data.error);
    
    data.items.forEach(item => {
      const tr = document.createElement("tr");
      const chgClass = item.change > 0 ? "up" : item.change < 0 ? "dn" : "neutral";
      tr.innerHTML = `
        <td class="mt-sym">${item.symbol}</td>
        <td class="mt-name">${item.name}</td>
        <td class="ta-right mt-ltp">₹${item.ltp.toLocaleString("en-IN", {minimumFractionDigits: 2})}</td>
        <td class="ta-right"><span class="mt-chg ${chgClass}">${item.change > 0 ? "+" : ""}${item.change.toFixed(2)} (${item.pchange}%)</span></td>
      `;
      tr.onclick = () => {
        searchInput.value = item.symbol;
        switchTab('dashboard');
        doSearch();
        window.scrollTo(0,0);
      };
      tbody.appendChild(tr);
    });
    
    if (data.has_more) {
      if (isFno) fnoPage++; else marketPage++;
      btn.textContent = "Load More";
      btn.disabled = false;
    } else {
      btn.textContent = "All Caught Up";
      btn.disabled = true;
    }
    
  } catch (err) {
    btn.textContent = "Error Loading";
    console.error(err);
  }
}
