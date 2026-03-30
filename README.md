# StockPulse — Indian Stock Market Dashboard

StockPulse is a modern, real-time web application designed to bring the Indian stock market (NSE/BSE) to your fingertips. Built with a sleek, dark-themed user interface, it provides live market quotes, educational trading concepts, live order value calculations, and comprehensive market explorers.

---

## 🌐 Live URL

> https://web-production-d1467.up.railway.app/

---

## 📖 About the Project

StockPulse serves as an interactive financial sandbox. It empowers users to explore Indian equities, indices, and derivatives (Futures & Options) without requiring complex broker terminals. 

### How it Works
1. **Frontend:** A responsive UI built with vanilla HTML/CSS/JS, featuring glassmorphism elements, real-time autocomplete, and paginated data tables. 
2. **Backend:** A lightweight Flask server acts as an API gateway. It safely proxies requests to live market APIs, manages local caching to prevent rate-limiting, and handles complex calculations like Excel file generation.
3. **Data Flow:** When a user searches for a stock or navigates to an explorer tab, the frontend requests data from the Flask API. The backend fetches this data from the upstream sources, parses/formats it into a clean JSON structure, and returns it to the client for rendering.

### How to Use It
- **Search:** Use the main search bar to find any NSE equity. As you type, the autocomplete engine will suggest relevant stocks, indices, and futures.
- **Market Explorer:** Browse the NIFTY 500 universe to discover the most liquid Indian securities. 
- **F&O Explorer:** Switch to the F&O tab to view active derivatives contracts (Futures) currently trading on the market.
- **Order Calculator:** Once a stock is selected, use the calculator module to estimate margins for different product types (CNC, MIS, NRML) and understand order types (Market, Limit, SL).
- **Export:** Click the "Download as Excel" button to export an offline snapshot of the asset's current metrics and your calculated order summary.

---

## 🛠 Tech Stack

| Component | Technology |
|-----------|-----------|
| **Backend** | Python 3.12, Flask 3.0 |
| **Frontend** | HTML5, Vanilla CSS3 (Custom Variables/Flexbox), Vanilla JavaScript |
| **Data Fetching** | `requests` (with Session Management) |
| **Historical Data**| `yfinance` |
| **Data Export** | `openpyxl` |

---

## 📡 API & Data Sources

StockPulse utilizes a hybrid data-fetching strategy to ensure reliability and speed:

1. **NSE India Unofficial API (Primary):** Used for real-time market data, autocomplete suggestions, and derivative quotes. The backend implements session and cookie managers to seamlessly communicate with the regular NSE public endpoints without requiring authentication.
2. **Yahoo Finance (`yfinance`) (Fallback/Historical):** Used to fetch the 30-day historical plot data for the interactive chart, and utilized as a bridge for extracting data for the BSE SENSEX index (which is unavailable natively on NSE). Graceful error handling is implemented to prevent rate-limit crashes.

### Internal API Endpoints

The Flask backend exposes the following RESTful endpoints to the client:

- `GET /api/search?q={query}`
  Returns a list of autocomplete suggestions (Symbol, Name, Type) matching the user's input.
- `GET /api/stock?symbol={symbol}`
  Fetches the complete real-time dashboard data for a single equity or futures contract. Includes LTP, limits, and 30-day OHLC chart data.
- `GET /api/market-list?type={fno|all}&page={page}`
  Returns a paginated list of either Active Futures Contracts (`type=fno`) or NIFTY 500 Equities (`type=all`).
- `POST /api/export`
  Accepts a JSON payload of the current dashboard state and returns a generated `.xlsx` Excel file stream.

---

## 🚀 Local Setup

**1. Clone the repository**
```bash
git clone <your-repo-url>
cd stock-dashboard
```

**2. Set up the Python Environment**
```bash
python3 -m venv venv
source venv/bin/activate      # Mac/Linux
venv\Scripts\activate         # Windows
```

**3. Install Dependencies**
```bash
pip install -r requirements.txt
```

**4. Run the Development Server**
```bash
flask run
# Or purely via python:
python3 app.py
```
*Visit `http://localhost:5000` in your browser.*

---

## 🔮 Future Improvements Needed

To make StockPulse production-ready and expand its capabilities, the following enhancements are recommended:

1. **Official Broker API Integration:** Transition from unofficial public APIs (NSE/Yahoo) to an official broker API (e.g., Upstox, Zerodha Kite Connect, or AngelOne) to ensure strict adherence to exchange compliances, guarantee uptime, and access precise circuit limits.
2. **WebSocket Live Streams:** Currently, the dashboard requires a manual refresh or a re-search to update the Last Traded Price (LTP). Implementing a WebSocket connection would allow prices to tick in real-time.
3. **Advanced Charting:** Replace the static Chart.js implementation with a robust financial charting library like Lightweight Charts (TradingView) to support candlestick formats, volume bars, and technical indicators.
4. **Options Chain Integration:** Expand the F&O Explorer to include a full Options Chain, allowing users to analyze specific Call (CE) and Put (PE) strike prices and their respective implied volatilities/Greeks.
5. **Database Caching Layer:** Replace the in-memory Python dictionary cache (`_CACHE`) with a distributed memory store like Redis to improve performance across multiple server workers.

---

## ⚠️ Disclaimer

All financial data displayed in this application is sourced from public endpoints and is strictly intended for **educational and demonstrative purposes only**. It should not be construed as financial advice or used for live algorithmic trading.
