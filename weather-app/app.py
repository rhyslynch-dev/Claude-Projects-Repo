from flask import Flask, render_template, request
import requests
from datetime import datetime

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

WMO_ICONS = {
    0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
    45: "🌫️", 48: "🌫️", 51: "🌦️", 53: "🌦️", 55: "🌧️",
    61: "🌧️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 73: "🌨️",
    75: "❄️", 80: "🌦️", 81: "🌧️", 82: "⛈️",
    95: "⛈️", 96: "⛈️", 99: "⛈️",
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
        "daily": "temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,windspeed_10m_max,precipitation_sum",
        "forecast_days": 7,
        "timezone": "auto",
    }
    data = requests.get(WEATHER_URL, params=params).json()
    current = data["current_weather"]

    daily = data["daily"]
    forecast = []
    for i in range(7):
        date = datetime.strptime(daily["time"][i], "%Y-%m-%d")
        forecast.append({
            "day": "Today" if i == 0 else date.strftime("%a"),
            "date": date.strftime("%d %b"),
            "icon": WMO_ICONS.get(daily["weathercode"][i], "🌡️"),
            "condition": WMO_CODES.get(daily["weathercode"][i], "Unknown"),
            "high": round(daily["temperature_2m_max"][i]),
            "low": round(daily["temperature_2m_min"][i]),
            "rain": daily["precipitation_probability_max"][i],
            "wind": round(daily["windspeed_10m_max"][i]),
            "precip": round(daily["precipitation_sum"][i], 1),
            "date_full": date.strftime("%A, %d %B"),
        })

    return {
        "city": loc["name"],
        "country": loc.get("country", ""),
        "temp": current["temperature"],
        "wind": current["windspeed"],
        "condition": WMO_CODES.get(current["weathercode"], "Unknown"),
        "icon": WMO_ICONS.get(current["weathercode"], "🌡️"),
        "humidity": data["hourly"]["relativehumidity_2m"][0],
        "forecast": forecast,
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
