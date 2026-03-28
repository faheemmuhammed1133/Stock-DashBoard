import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, request, jsonify, session, Response
from utils.stock_fetcher import fetch_stock_data, search_symbols, fetch_market_list
from utils.excel_exporter import generate_excel

app = Flask(__name__)
app.secret_key = "stockpulse_delta_2024"


@app.route("/")
def index():
    history = session.get("search_history", [])
    return render_template("index.html", history=history)


@app.route("/api/stock", methods=["GET"])
def get_stock():
    symbol = request.args.get("symbol", "").strip().upper()
    if not symbol:
        return jsonify({"error": "No symbol provided"}), 400

    data = fetch_stock_data(symbol)

    if "error" not in data:
        history = session.get("search_history", [])
        if symbol not in history:
            history.insert(0, symbol)
        session["search_history"] = history[:5]

    return jsonify(data)


@app.route("/api/search", methods=["GET"])
def api_search():
    """Search symbols for autocomplete suggestions."""
    q = request.args.get("q", "").strip()
    if len(q) < 1:
        return jsonify({"results": []})
    results = search_symbols(q)
    return jsonify({"results": results})


@app.route("/api/market-list", methods=["GET"])
def api_market_list():
    """Fetch paginated stock list."""
    list_type = request.args.get("type", "all").strip().lower()
    page = int(request.args.get("page", 1))
    data = fetch_market_list(list_type, page)
    return jsonify(data)


@app.route("/api/export", methods=["POST"])
def export_excel():
    payload    = request.get_json()
    stock_data = payload.get("stock_data", {})
    order_data = payload.get("order_data", {})

    output = generate_excel(stock_data, order_data)

    return Response(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=stockpulse_report.xlsx"}
    )


if __name__ == "__main__":
    app.run(debug=True)