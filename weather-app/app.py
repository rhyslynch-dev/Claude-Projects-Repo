from flask import Flask, render_template, request
import requests

app = Flask(__name__)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

WMO_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Icy fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow",
    75: "Heavy snow", 80: "Light showers", 81: "Showers", 82: "Heavy showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}


def get_weather(city):
    geo = requests.get(GEOCODE_URL, params={"name": city, "count": 1}).json()
    results = geo.get("results")
    if not results:
        return None, f'City "{city}" not found.'

    loc = results[0]
    params = {
        "latitude": loc["latitude"],
        "longitude": loc["longitude"],
        "current_weather": True,
        "hourly": "relativehumidity_2m",
        "forecast_days": 1,
        "timezone": "auto",
    }
    data = requests.get(WEATHER_URL, params=params).json()
    current = data["current_weather"]

    return {
        "city": loc["name"],
        "country": loc.get("country", ""),
        "temp": current["temperature"],
        "wind": current["windspeed"],
        "condition": WMO_CODES.get(current["weathercode"], "Unknown"),
        "humidity": data["hourly"]["relativehumidity_2m"][0],
    }, None


@app.route("/", methods=["GET", "POST"])
def index():
    weather, error = None, None
    if request.method == "POST":
        city = request.form.get("city", "").strip()
        if city:
            weather, error = get_weather(city)
    return render_template("index.html", weather=weather, error=error)


if __name__ == "__main__":
    app.run(debug=True)
