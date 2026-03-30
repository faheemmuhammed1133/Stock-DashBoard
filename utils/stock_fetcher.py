"""
stock_fetcher.py
Uses NSE India's unofficial REST API for live Indian stock market data.
Falls back to yfinance for 30-day historical OHLC chart data.
Supports Equities, Indices, and Futures.
"""
import time
import requests
import re
from datetime import datetime, timedelta

# ── Cache ──────────────────────────────────────────
_CACHE: dict = {}
CACHE_TTL = 120  # 2 min

# ── NSE Session (with browser-like headers) ───────
_nse_session = None
_session_ts = 0
SESSION_TTL = 300  # refresh session cookies every 5 min

NSE_BASE = "https://www.nseindia.com"
NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/",
}

# ── Static display name map ────────────────────────
NAME_MAP = {
    "RELIANCE":   "Reliance Industries Ltd",
    "TCS":        "Tata Consultancy Services",
    "HDFCBANK":   "HDFC Bank Ltd",
    "INFY":       "Infosys Ltd",
    "ICICIBANK":  "ICICI Bank Ltd",
    "HINDUNILVR": "Hindustan Unilever Ltd",
    "SBIN":       "State Bank of India",
    "BAJFINANCE": "Bajaj Finance Ltd",
    "TATAMOTORS": "Tata Motors Ltd",
    "WIPRO":      "Wipro Ltd",
    "AXISBANK":   "Axis Bank Ltd",
    "MARUTI":     "Maruti Suzuki India Ltd",
    "LT":         "Larsen & Toubro Ltd",
    "KOTAKBANK":  "Kotak Mahindra Bank Ltd",
    "SUNPHARMA":  "Sun Pharmaceutical Industries",
    "ADANIENT":   "Adani Enterprises Ltd",
}

# ── Lookups ────────────────────────────────────────
INDEX_MAP = {
    "NIFTY50": "NIFTY 50", "NIFTY 50": "NIFTY 50", "NIFTY": "NIFTY 50",
    "SENSEX": "SENSEX",
    "BANKNIFTY": "NIFTY BANK", "BANK NIFTY": "NIFTY BANK",
    "NIFTYMIDCAP": "NIFTY MIDCAP 50",
    "NIFTYIT": "NIFTY IT", "NIFTY IT": "NIFTY IT",
    "NIFTYMIDCAP50": "NIFTY MIDCAP 50",
    "NIFTYFINSERV": "NIFTY FIN SERVICE", "NIFTY FIN SERVICE": "NIFTY FIN SERVICE",
}

# yfinance symbol mapping for historical chart data
YF_INDEX_MAP = {
    "NIFTY 50": "^NSEI",
    "SENSEX": "^BSESN",
    "NIFTY BANK": "^NSEBANK",
    "NIFTY MIDCAP 50": "NIFTYMIDCAP50.NS",
    "NIFTY IT": "^CNXIT",
    "NIFTY FIN SERVICE": "NIFTY_FIN_SERVICE.NS",
}

LOT_SIZES = {
    "NIFTY": 50, "BANKNIFTY": 15, "SENSEX": 10, "RELIANCE": 250, "TCS": 150,
    "INFY": 300, "HDFC": 300, "TATAMOTORS": 1425, "WIPRO": 1500, "HDFCBANK": 550,
    "ICICIBANK": 700, "AXISBANK": 1200, "SBIN": 1500, "MARUTI": 100,
    "BAJFINANCE": 125, "LT": 25, "KOTAKBANK": 400, "SUNPHARMA": 350, "ADANIENT": 250,
    "HINDUNILVR": 300,
}

FUTURES_RE = re.compile(r"^(.+?)\s+FUT$", re.IGNORECASE)


# ── NSE Session Management ────────────────────────
def _get_session():
    """Get or refresh the NSE session with fresh cookies."""
    global _nse_session, _session_ts

    if _nse_session and (time.time() - _session_ts) < SESSION_TTL:
        return _nse_session

    s = requests.Session()
    s.headers.update(NSE_HEADERS)

    # Hit main page to get cookies (required by NSE)
    try:
        r = s.get(NSE_BASE, timeout=10)
        r.raise_for_status()
    except Exception:
        pass  # Even if this fails, try API calls anyway

    _nse_session = s
    _session_ts = time.time()
    return s


def _nse_get(path: str, retries: int = 2):
    """Make a GET request to NSE API with retry logic."""
    for attempt in range(retries + 1):
        try:
            session = _get_session()
            url = f"{NSE_BASE}{path}"
            r = session.get(url, timeout=10)
            if r.status_code == 401 or r.status_code == 403:
                # Session expired, force refresh
                global _session_ts
                _session_ts = 0
                if attempt < retries:
                    time.sleep(0.5)
                    continue
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt < retries:
                time.sleep(0.5)
                # Force session refresh on error
                _session_ts = 0
            else:
                return None
    return None


# ── Public entry ───────────────────────────────────
def fetch_stock_data(symbol: str) -> dict:
    """Fetch live market data for an Indian stock, index, or futures."""
    key = symbol.strip().upper()

    cached = _CACHE.get(key)
    if cached and time.time() - cached["ts"] < CACHE_TTL:
        return cached["data"]

    itype, base, nse_name = _detect(key)

    try:
        if itype == "index":
            result = _fetch_index(base, nse_name)
        elif itype == "futures":
            result = _fetch_futures(base)
        else:
            result = _fetch_equity(base)
    except Exception as e:
        return {"error": f"Failed to fetch '{symbol}': {str(e)}"}

    if "error" not in result:
        # Add 30-day chart data
        result["chart_data"] = _fetch_chart_data(base, itype, nse_name)
        _CACHE[key] = {"data": result, "ts": time.time()}

    return result


def _detect(sym):
    """Detect instrument type from input symbol."""
    m = FUTURES_RE.match(sym)
    if m:
        return "futures", m.group(1).strip(), None

    if sym in INDEX_MAP:
        return "index", sym, INDEX_MAP[sym]

    return "equity", sym, None


# ── Equity fetch ───────────────────────────────────
def _fetch_equity(symbol: str) -> dict:
    """Fetch equity quote from NSE India API."""
    data = _nse_get(f"/api/quote-equity?symbol={symbol}")

    if not data or "info" not in data:
        return {
            "error": (
                f"Could not fetch data for '{symbol}'. "
                "Make sure it's a valid NSE symbol (e.g., RELIANCE, TCS, INFY). "
                "The NSE API may be temporarily unavailable — retry in a few seconds."
            )
        }

    info = data.get("info", {})
    price_info = data.get("priceInfo", {})
    intra_hl = price_info.get("intraDayHighLow", {})
    week_hl = price_info.get("weekHighLow", {})

    ltp = _sf(price_info.get("lastPrice", 0))
    prev_close = _sf(price_info.get("previousClose", price_info.get("close", 0)))
    open_p = _sf(price_info.get("open", 0))
    hi52 = _sf(week_hl.get("max", 0))
    lo52 = _sf(week_hl.get("min", 0))
    upper = _sf(price_info.get("upperCP", 0))
    lower = _sf(price_info.get("lowerCP", 0))
    day_high = _sf(intra_hl.get("max", 0))
    day_low = _sf(intra_hl.get("min", 0))
    change = _sf(price_info.get("change", 0))
    pchange = _sf(price_info.get("pChange", 0))

    company_name = info.get("companyName", NAME_MAP.get(symbol, symbol))

    return {
        "script_name": company_name,
        "symbol": symbol,
        "ltp": round(ltp, 2),
        "open": round(open_p, 2),
        "close": round(prev_close, 2),
        "day_high": round(day_high, 2),
        "day_low": round(day_low, 2),
        "week_52_high": round(hi52, 2),
        "week_52_low": round(lo52, 2),
        "upper_circuit": round(upper, 2) if upper else "N/A",
        "lower_circuit": round(lower, 2) if lower else "N/A",
        "change": round(change, 2),
        "pchange": round(pchange, 2),
        "instrument_type": "equity",
    }


# ── Index fetch ────────────────────────────────────
def _fetch_index(base: str, nse_name: str) -> dict:
    """Fetch index data from NSE India API."""
    # SENSEX is BSE — we'll handle separately
    if nse_name == "SENSEX":
        return _fetch_sensex()

    data = _nse_get(f"/api/equity-stockIndices?index={requests.utils.quote(nse_name)}")

    if not data or not data.get("data"):
        return {
            "error": (
                f"Could not fetch index data for '{base}'. "
                "Try NIFTY50, BANKNIFTY, NIFTYIT, etc."
            )
        }

    # First element in data array is the index itself
    idx = data["data"][0]

    ltp = _sf(idx.get("lastPrice", 0))
    prev_close = _sf(idx.get("previousClose", 0))
    open_p = _sf(idx.get("open", 0))
    day_high = _sf(idx.get("dayHigh", 0))
    day_low = _sf(idx.get("dayLow", 0))
    hi52 = _sf(idx.get("yearHigh", 0))
    lo52 = _sf(idx.get("yearLow", 0))
    change = _sf(idx.get("change", 0))
    pchange = _sf(idx.get("pChange", 0))

    return {
        "script_name": nse_name,
        "symbol": base,
        "ltp": round(ltp, 2),
        "open": round(open_p, 2),
        "close": round(prev_close, 2),
        "day_high": round(day_high, 2),
        "day_low": round(day_low, 2),
        "week_52_high": round(hi52, 2),
        "week_52_low": round(lo52, 2),
        "upper_circuit": "N/A (Index)",
        "lower_circuit": "N/A (Index)",
        "change": round(change, 2),
        "pchange": round(pchange, 2),
        "instrument_type": "index",
        "index_note": "Indices cannot be bought directly. Trade via Futures or Options.",
    }


# ── BSE SENSEX Handling ────────────────────────────
def _fetch_sensex() -> dict:
    try:
        import requests
        
        # Fetch live metrics from TradingView (uncapped, highly reliable)
        tv_url = "https://scanner.tradingview.com/india/scan"
        payload = {
            "symbols": {"tickers": ["BSE:SENSEX"]},
            "columns": ["close", "change", "change_abs", "open", "high", "low"]
        }
        res = requests.post(tv_url, json=payload, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        
        if res.status_code == 200 and res.json().get("data"):
            data_points = res.json()["data"][0]["d"]
            ltp = data_points[0]
            pchange = data_points[1]
            change = data_points[2]
            open_p = data_points[3]
            day_high = data_points[4]
            day_low = data_points[5]
            prev_close = ltp - change
            hi52 = day_high
            lo52 = day_low
        else:
            return {"error": "SENSEX data unavailable currently."}

        return {
            "script_name": "BSE SENSEX",
            "symbol": "SENSEX",
            "ltp": round(ltp, 2),
            "open": round(open_p, 2),
            "close": round(prev_close, 2),
            "day_high": round(day_high, 2),
            "day_low": round(day_low, 2),
            "week_52_high": round(hi52, 2),
            "week_52_low": round(lo52, 2),
            "upper_circuit": "N/A (Index)",
            "lower_circuit": "N/A (Index)",
            "change": round(change, 2),
            "pchange": round(pchange, 2),
            "instrument_type": "index",
            "index_note": "Indices cannot be bought directly. Trade via Futures or Options.",
        }
    except Exception as e:
        return {"error": f"Could not fetch SENSEX data: {str(e)}"}


# ── Futures fetch ──────────────────────────────────
def _fetch_futures(base: str) -> dict:
    """Fetch equity data + add futures overlay (expiry, lot size)."""
    result = _fetch_equity(base)
    if "error" in result:
        return result

    today = datetime.today()
    month_end = (today.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    while month_end.weekday() != 3:  # Thursday
        month_end -= timedelta(days=1)

    result["instrument_type"] = "futures"
    result["expiry_date"] = month_end.strftime("%d-%b-%Y")
    result["lot_size"] = LOT_SIZES.get(base, 100)
    return result


# ── Chart data (30-day historical) ─────────────────
def _fetch_chart_data(symbol: str, itype: str, nse_name: str = None) -> list:
    """
    Fetch 30-day historical close prices for the chart.
    Uses direct requests to Yahoo Finance API to bypass library-level rate limits.
    """
    try:
        import requests
        from datetime import datetime

        if itype == "index" and nse_name:
            yf_sym = YF_INDEX_MAP.get(nse_name, f"{symbol}.NS")
        else:
            yf_sym = f"{symbol}.NS"

        # Direct API call to Yahoo Finance chart endpoint
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_sym}?range=1mo&interval=1d"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Origin": "https://finance.yahoo.com",
            "Referer": f"https://finance.yahoo.com/quote/{yf_sym}"
        }
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            print(f"Chart API failed for {yf_sym}: {res.status_code}")
            return []

        data = res.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return []

        timestamps = result[0].get("timestamp", [])
        close_prices = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])

        if not timestamps or not close_prices:
            return []

        # Zip and format (filtering out None values)
        chart_data = []
        for ts, price in zip(timestamps, close_prices):
            if price is not None:
                dt = datetime.fromtimestamp(ts)
                chart_data.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "close": round(float(price), 2)
                })

        return chart_data[-30:] # Return last 30 points
    except Exception as e:
        print(f"Chart fetch error: {str(e)}")
        return []


def _sf(val) -> float:
    """Safely convert to float."""
    if val is None or val == "" or val == "-":
        return 0.0
    try:
        if isinstance(val, str):
            val = val.replace(",", "")
        return float(val)
    except (TypeError, ValueError):
        return 0.0


# ── Search / Autocomplete ──────────────────────────
def search_symbols(query: str) -> list:
    """
    Search NSE symbols using the autocomplete API.
    Returns list of {symbol, name, type} dicts.
    """
    if not query or len(query) < 1:
        return []

    # Also include matching indices
    results = []
    q = query.upper()

    # Add matching indices first
    for key, nse_name in INDEX_MAP.items():
        if q in key or q in nse_name.upper():
            results.append({
                "symbol": key,
                "name": nse_name,
                "type": "index",
            })

    # Deduplicate indices by nse_name
    seen = set()
    unique_indices = []
    for r in results:
        if r["name"] not in seen:
            seen.add(r["name"])
            unique_indices.append(r)
    results = unique_indices

    # Query NSE autocomplete API
    try:
        data = _nse_get(f"/api/search/autocomplete?q={requests.utils.quote(query)}")
        if data:
            for item in data.get("symbols", [])[:15]:
                sym = item.get("symbol", "")
                name = item.get("symbol_info", "")
                sub_type = item.get("result_sub_type", "equity")
                active = item.get("activeSeries", [])
                # Only include actively traded stocks
                if active and "EQ" in active:
                    results.append({
                        "symbol": sym,
                        "name": name,
                        "type": sub_type,
                    })
    except Exception:
        pass

    return results[:12]


# ── Market Explorer (All Stocks & F&O) ─────────────
def fetch_market_list(list_type: str, page: int = 1, limit: int = 50) -> dict:
    """Fetch paginated lists for F&O or Nifty 500."""
    cache_key = f"market_list_{list_type}"
    cached = _CACHE.get(cache_key)

    if not cached or time.time() - cached["ts"] > 1800: # Cache for 30 mins
        try:
            if list_type == "fno":
                # Fetch real derivatives data instead of just the equity index
                items = []
                for index_name in ['nse50_fut', 'nifty_bank_fut', 'stock_fut']:
                    data = _nse_get(f"/api/liveEquity-derivatives?index={index_name}")
                    if data and "data" in data:
                        for row in data["data"]:
                            sym = row.get("underlying")
                            if sym == "NIFTY":
                                items.append({"symbol": "NIFTY FUT", "name": "NIFTY 50 Futures", "lastPrice": row.get("lastPrice"), "change": row.get("change"), "pChange": row.get("pChange"), "totalTradedVolume": row.get("volume")})
                            elif sym == "BANKNIFTY":
                                items.append({"symbol": "BANKNIFTY FUT", "name": "Nifty Bank Futures", "lastPrice": row.get("lastPrice"), "change": row.get("change"), "pChange": row.get("pChange"), "totalTradedVolume": row.get("volume")})
                            else:
                                items.append({
                                    "symbol": f"{sym} FUT",
                                    "name": NAME_MAP.get(sym, f"{sym} Futures"),
                                    "lastPrice": row.get("lastPrice"),
                                    "change": row.get("change"),
                                    "pChange": row.get("pChange"),
                                    "totalTradedVolume": row.get("volume")
                                })
                _CACHE[cache_key] = {"data": items, "ts": time.time()}
            else:
                index_name = "NIFTY 500"
                data = _nse_get(f"/api/equity-stockIndices?index={requests.utils.quote(index_name)}")
                if data and "data" in data:
                    # Filter out the index itself
                    items = [item for item in data["data"] if item.get("symbol") != index_name]
                    _CACHE[cache_key] = {"data": items, "ts": time.time()}
                else:
                    _CACHE[cache_key] = {"data": [], "ts": time.time()}
        except Exception as e:
            return {"error": f"Failed to fetch market list: {str(e)}"}
            
    items = _CACHE.get(cache_key, {}).get("data", [])
    
    total = len(items)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated = items[start_idx:end_idx]

    formatted = []
    for item in paginated:
        symbol = item.get("symbol", "")
        # NIFTY 500 equities have meta company names, futures use our explicit name logic
        name = item.get("name", NAME_MAP.get(symbol, item.get("meta", {}).get("companyName", symbol)))
        formatted.append({
            "symbol": symbol,
            "name": name,
            "ltp": round(_sf(item.get("lastPrice")), 2),
            "change": round(_sf(item.get("change")), 2),
            "pchange": round(_sf(item.get("pChange")), 2),
            "volume": _sf(item.get("totalTradedVolume")),
        })

    return {
        "items": formatted,
        "total": total,
        "page": page,
        "has_more": end_idx < total
    }