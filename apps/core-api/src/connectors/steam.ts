const BASE_URL = "https://api.steampowered.com";

export interface SteamConfig {
  apiKey: string;
  steamId: string;
}

async function steamGet(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_URL}${path}?${qs}`);
  if (!res.ok) throw new Error(`Steam HTTP ${res.status}`);
  return res.json();
}

export function createSteamConnector(config: SteamConfig) {
  const { apiKey, steamId } = config;

  async function getRecentlyPlayedGames() {
    const json = await steamGet("/IPlayerService/GetRecentlyPlayedGames/v1/", {
      key: apiKey,
      steamid: steamId,
      count: "10",
      format: "json"
    }) as { response: { total_count?: number; games?: Array<{
      appid: number;
      name: string;
      playtime_2weeks: number;
      playtime_forever: number;
      img_icon_url: string;
    }> } };

    const games = json.response.games ?? [];
    return {
      fetchedAt: new Date().toISOString(),
      steamId,
      totalCount: json.response.total_count ?? games.length,
      games: games.map((g) => ({
        appId: g.appid,
        name: g.name,
        playtime2WeeksMinutes: g.playtime_2weeks,
        playtimeForeverMinutes: g.playtime_forever,
        iconUrl: g.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
          : null
      }))
    };
  }

  async function getPlayerSummary() {
    const json = await steamGet("/ISteamUser/GetPlayerSummaries/v2/", {
      key: apiKey,
      steamids: steamId,
      format: "json"
    }) as { response: { players: Array<{
      steamid: string;
      personaname: string;
      profileurl: string;
      avatarfull: string;
      personastate: number;
      gameextrainfo?: string;
      gameid?: string;
      loccountrycode?: string;
      lastlogoff?: number;
    }> } };

    const player = json.response.players[0];
    if (!player) throw new Error("Steam player not found.");

    const stateMap: Record<number, string> = {
      0: "offline", 1: "online", 2: "busy", 3: "away",
      4: "snooze", 5: "looking_to_trade", 6: "looking_to_play"
    };

    return {
      fetchedAt: new Date().toISOString(),
      steamId: player.steamid,
      displayName: player.personaname,
      profileUrl: player.profileurl,
      avatarUrl: player.avatarfull,
      status: stateMap[player.personastate] ?? "unknown",
      currentGame: player.gameextrainfo ?? null,
      currentGameId: player.gameid ? Number(player.gameid) : null,
      country: player.loccountrycode ?? null,
      lastLogoffAt: player.lastlogoff
        ? new Date(player.lastlogoff * 1000).toISOString()
        : null
    };
  }

  return { getRecentlyPlayedGames, getPlayerSummary };
}

export function parseSteamEnv(env: NodeJS.ProcessEnv): SteamConfig | null {
  const apiKey = env.STEAM_API_KEY?.trim();
  const steamId = env.STEAM_USER_ID?.trim();
  if (!apiKey || !steamId) return null;
  return { apiKey, steamId };
}
