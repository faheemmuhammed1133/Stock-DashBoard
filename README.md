# StockPulse — Stock Market Dashboard

A Flask + Python web application for real-time Indian stock market data (NSE/BSE), interactive trading concept explanations, order value calculations, and Excel export.

---

## 🌐 Live URL

> https://web-production-d1467.up.railway.app/
---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Flask 3.0 (Python) |
| Data API | yfinance (Yahoo Finance — free, no API key needed) |
| Excel | openpyxl |
| Charts | Chart.js |
| Hosting | Railway (free tier) |

---

## 🔑 Why These APIs?

**yfinance** was chosen because:
- Completely free, no API key required
- Supports NSE (`.NS`) and BSE (`.BO`) tickers natively
- Provides LTP, Open, Close, 52-Week High/Low, historical data
- Actively maintained, widely used in production dashboards

**Note on Circuit Limits:** Yahoo Finance does not expose upper/lower circuit limits directly (NSE restricts this data). The app calculates approximate ±20% circuit limits from the previous close, which is the standard SEBI rule for most stocks. For exact limits, an NSE-authorized vendor (e.g., TrueData, Global Datafeeds) would be needed.

---

## 🚀 Local Setup

### 1. Clone the repo
```bash
git clone <your-repo-url>
cd stock-dashboard
```

### 2. Create virtual environment
```bash
python -m venv venv
source venv/bin/activate      # Linux/Mac
venv\Scripts\activate         # Windows
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Run locally
```bash
flask run
```
Visit: http://localhost:5000

---

## ☁️ Deployment on Railway (Free Tier)

Railway offers a free hobby plan perfect for this project.

### Steps:

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Create Railway account**
   - Go to [railway.app](https://railway.app)
   - Sign up / login with GitHub

3. **New Project → Deploy from GitHub Repo**
   - Select your repository
   - Railway auto-detects Python and installs from `requirements.txt`

4. **Set Start Command** (in Railway service settings):
   ```
   gunicorn app:app --bind 0.0.0.0:$PORT --workers 2
   ```
   Or Railway will use the `Procfile` automatically.

5. **Generate Domain**
   - Go to **Settings → Networking → Generate Domain**
   - Your app is now live at `https://your-app.up.railway.app`

### Alternative: Render.com
1. Go to [render.com](https://render.com)
2. New → Web Service → Connect GitHub repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Free tier gives you a public URL instantly.

---

## 📁 Project Structure

```
stock-dashboard/
├── app.py                  # Flask entry point — routes
├── requirements.txt        # Python dependencies
├── Procfile               # Production server command
├── templates/
│   └── index.html         # Main UI template
├── static/
│   ├── style.css          # Dark fintech styling
│   └── script.js          # Client-side interactivity
├── utils/
│   ├── stock_fetcher.py   # All yfinance API logic
│   └── excel_exporter.py  # Excel generation logic
└── README.md
```

---

## 🎯 Features

- **Stock Search** — Equity, Index (NIFTY50, SENSEX), and Futures (RELIANCE FUT)
- **Real-time Data** — LTP, Open, Close, 52W High/Low, approximate Circuit Limits
- **Product Type Panel** — CNC / MIS / NRML with explanations (tab-based, no reload)
- **Order Type Panel** — Market / Limit / SL / SL-M with explanations (dropdown, no reload)
- **Live Calculator** — Instant estimated margin/amount for the selected product type
- **30-Day Price Chart** — Interactive Chart.js line chart
- **Session History** — Last 5 searched symbols remembered in session
- **Excel Export** — Two-sheet XLSX: Stock Details + Order Summary
- **Error Handling** — Invalid symbols, API failures, and network errors handled gracefully

---

## ⚠️ Disclaimer

Data is sourced from Yahoo Finance via yfinance for educational purposes only. Not financial advice.
