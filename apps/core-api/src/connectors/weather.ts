const BASE_URL = "https://api.open-meteo.com/v1/forecast";

const WMO_CODES: Record<number, string> = {
  0: "晴", 1: "基本晴", 2: "局部多云", 3: "阴",
  45: "雾", 48: "雾凇",
  51: "小毛毛雨", 53: "毛毛雨", 55: "大毛毛雨",
  61: "小雨", 63: "中雨", 65: "大雨",
  71: "小雪", 73: "中雪", 75: "大雪", 77: "冰粒",
  80: "小阵雨", 81: "中阵雨", 82: "大阵雨",
  85: "小阵雪", 86: "大阵雪",
  95: "雷阵雨", 96: "雷阵雨伴小冰雹", 99: "雷阵雨伴大冰雹"
};

function describeCode(code: number): string {
  return WMO_CODES[code] ?? `天气代码 ${code}`;
}

export interface WeatherConfig {
  latitude: number;
  longitude: number;
  locationName: string;
}

export async function fetchWeather(config: WeatherConfig) {
  const params = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
    timezone: "Asia/Shanghai",
    forecast_days: "4"
  });

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

  const json = await res.json() as {
    current: {
      time: string;
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
      precipitation: number;
    };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      wind_speed_10m_max: number[];
    };
  };

  const c = json.current;
  const d = json.daily;

  return {
    fetchedAt: new Date().toISOString(),
    location: config.locationName,
    latitude: config.latitude,
    longitude: config.longitude,
    current: {
      time: c.time,
      temperatureC: c.temperature_2m,
      feelsLikeC: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      windSpeedKmh: c.wind_speed_10m,
      precipitationMm: c.precipitation,
      weatherCode: c.weather_code,
      description: describeCode(c.weather_code)
    },
    forecast: d.time.map((date, i) => ({
      date,
      maxC: d.temperature_2m_max[i],
      minC: d.temperature_2m_min[i],
      precipitationMm: d.precipitation_sum[i],
      maxWindKmh: d.wind_speed_10m_max[i],
      weatherCode: d.weather_code[i],
      description: describeCode(d.weather_code[i])
    }))
  };
}

export function parseWeatherConfig(env: NodeJS.ProcessEnv): WeatherConfig {
  const lat = parseFloat(env.WEATHER_LATITUDE ?? "30.75");
  const lon = parseFloat(env.WEATHER_LONGITUDE ?? "120.75");
  const name = env.WEATHER_LOCATION_NAME ?? "嘉兴";
  return { latitude: lat, longitude: lon, locationName: name };
}
