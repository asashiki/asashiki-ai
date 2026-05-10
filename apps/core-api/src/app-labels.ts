// Centralized package-name → friendly-name + activity-description mapping.
// Used by both the /console route and the daily-digest endpoint.

export interface AppLabel {
  name: string;
  desc: string;
}

export const APP_LABELS: Record<string, AppLabel> = {
  // ── AI ────────────────────────────────────────────────────────────────────
  "com.anthropic.claude":              { name: "Claude",       desc: "正在和 Claude 聊天~" },
  "com.openai.chatgpt":                { name: "ChatGPT",      desc: "正在和 ChatGPT 聊天~" },
  "com.google.android.apps.bard":     { name: "Gemini",       desc: "正在和 Gemini 聊天~" },

  // ── Social / IM ──────────────────────────────────────────────────────────
  "com.tencent.mobileqq":             { name: "QQ",           desc: "正在和朋友聊 QQ~" },
  "com.tencent.mm":                   { name: "微信",          desc: "正在刷微信~" },
  "com.twitter.android":              { name: "Twitter / X",  desc: "正在刷 Twitter~" },
  "com.weibo.android":                 { name: "微博",          desc: "正在刷微博~" },
  "com.sina.weibo":                    { name: "微博",          desc: "正在刷微博~" },
  "com.zhihu.android":                 { name: "知乎",          desc: "正在看知乎~" },
  "com.xingin.xhs":                    { name: "小红书",        desc: "正在刷小红书~" },
  "com.instagram.android":             { name: "Instagram",    desc: "正在刷 INS~" },
  "com.discord":                       { name: "Discord",      desc: "正在摸鱼 Discord~" },
  "com.telegram.messenger":            { name: "Telegram",     desc: "正在看 Telegram~" },
  "org.telegram.messenger":            { name: "Telegram",     desc: "正在看 Telegram~" },
  "com.whatsapp":                      { name: "WhatsApp",     desc: "正在聊 WhatsApp~" },
  "com.facebook.orca":                 { name: "Messenger",    desc: "正在用 Messenger~" },
  "com.facebook.katana":               { name: "Facebook",     desc: "正在刷 Facebook~" },
  "com.snapchat.android":              { name: "Snapchat",     desc: "正在玩 Snapchat~" },
  "com.linkedin.android":              { name: "LinkedIn",     desc: "正在刷 LinkedIn~" },
  "com.douban.frodo":                  { name: "豆瓣",          desc: "正在刷豆瓣~" },

  // ── Video / Streaming ────────────────────────────────────────────────────
  "tv.danmaku.bili":                   { name: "哔哩哔哩",      desc: "正在刷 B站~" },
  "com.bilibili.app.blue":             { name: "哔哩哔哩",      desc: "正在刷 B站~" },
  "com.google.android.youtube":        { name: "YouTube",      desc: "正在看 YouTube~" },
  "com.google.android.apps.youtube.music": { name: "YouTube Music", desc: "正在听 YT Music~" },
  "com.ss.android.ugc.aweme":          { name: "抖音",          desc: "正在刷抖音~" },
  "com.zhiliaoapp.musically":          { name: "TikTok",       desc: "正在刷 TikTok~" },
  "com.smile.gifmaker":                { name: "快手",          desc: "正在刷快手~" },
  "com.netflix.mediaclient":           { name: "Netflix",      desc: "正在看 Netflix~" },
  "com.amazon.avod.thirdpartyclient":  { name: "Prime Video",  desc: "正在看 Prime~" },

  // ── Music ────────────────────────────────────────────────────────────────
  "com.netease.cloudmusic":            { name: "网易云音乐",    desc: "正在听网易云~" },
  "com.kugou.android":                 { name: "酷狗音乐",      desc: "正在听酷狗~" },
  "com.tencent.qqmusic":               { name: "QQ音乐",        desc: "正在听 QQ音乐~" },
  "com.spotify.music":                 { name: "Spotify",      desc: "正在听 Spotify~" },
  "com.apple.android.music":           { name: "Apple Music",  desc: "正在听 Apple Music~" },
  "com.miui.player":                   { name: "小米音乐",      desc: "正在听小米音乐~" },

  // ── E-commerce / Lifestyle ───────────────────────────────────────────────
  "com.taobao.taobao":                 { name: "淘宝",          desc: "正在剁手淘宝~" },
  "com.tmall.wireless":                { name: "天猫",          desc: "正在逛天猫~" },
  "com.jingdong.app.mall":             { name: "京东",          desc: "正在逛京东~" },
  "com.xunmeng.pinduoduo":             { name: "拼多多",        desc: "正在拼多多砍一刀~" },
  "com.eg.android.AlipayGphone":       { name: "支付宝",        desc: "正在用支付宝~" },
  "me.ele.application":                { name: "饿了么",        desc: "正在点饿了么~" },
  "com.sankuai.meituan.takeoutnew":    { name: "美团外卖",      desc: "正在点美团外卖~" },
  "com.sankuai.meituan":               { name: "美团",          desc: "正在用美团~" },
  "com.dianping.v1":                   { name: "大众点评",      desc: "正在看点评~" },

  // ── Maps / Travel ────────────────────────────────────────────────────────
  "com.autonavi.minimap":              { name: "高德地图",      desc: "正在导航~" },
  "com.baidu.BaiduMap":                { name: "百度地图",      desc: "正在导航~" },
  "com.google.android.apps.maps":      { name: "Google Maps",  desc: "正在导航~" },
  "ctrip.android.view":                { name: "携程",          desc: "正在订票~" },
  "com.didi.es.psngr":                 { name: "滴滴",          desc: "正在打车~" },

  // ── News / Reading ───────────────────────────────────────────────────────
  "com.ss.android.article.news":       { name: "今日头条",      desc: "正在刷头条~" },
  "com.netease.newsreader.activity":   { name: "网易新闻",      desc: "正在看网易新闻~" },

  // ── Productivity / Dev ───────────────────────────────────────────────────
  "com.notion.id":                     { name: "Notion",       desc: "正在整理 Notion~" },
  "md.obsidian":                       { name: "Obsidian",     desc: "正在记笔记~" },
  "com.github.android":                { name: "GitHub",       desc: "正在逛 GitHub~" },
  "com.microsoft.outlook":             { name: "Outlook",      desc: "正在处理邮件~" },
  "com.google.android.gm":             { name: "Gmail",        desc: "正在看邮件~" },
  "com.google.android.calendar":       { name: "Google日历",    desc: "看日程~" },
  "com.android.chrome":                { name: "Chrome",       desc: "正在浏览网页~" },
  "com.google.android.chrome":         { name: "Chrome",       desc: "正在浏览网页~" },
  "org.mozilla.firefox":               { name: "Firefox",      desc: "正在浏览网页~" },
  "com.microsoft.emmx":                { name: "Edge",         desc: "正在浏览网页~" },
  "com.microsoft.teams":               { name: "Teams",        desc: "正在 Teams 开会~" },

  // ── Gaming ───────────────────────────────────────────────────────────────
  "com.miHoYo.GenshinImpact":          { name: "原神",          desc: "正在打原神~" },
  "com.miHoYo.bh3oversea":             { name: "崩坏3",         desc: "正在打崩3~" },
  "com.HoYoverse.hkrpgoversea":        { name: "星穹铁道",      desc: "正在开星铁~" },
  "com.netease.onmyoji":               { name: "阴阳师",        desc: "正在抽阴阳师~" },
  "com.tencent.tmgp.pubgmhd":          { name: "和平精英",      desc: "正在吃鸡~" },

  // ── Windows process names (Windows agent reports lowercased proc.ProcessName) ──
  "msedge":                            { name: "Edge",         desc: "正在用 Edge 浏览~" },
  "chrome":                            { name: "Chrome",       desc: "正在用 Chrome 浏览~" },
  "firefox":                           { name: "Firefox",      desc: "正在用 Firefox 浏览~" },
  "opera":                             { name: "Opera",        desc: "正在用 Opera 浏览~" },
  "brave":                             { name: "Brave",        desc: "正在用 Brave 浏览~" },
  "code":                              { name: "VS Code",      desc: "正在 coding~" },
  "cursor":                            { name: "Cursor",       desc: "正在 coding (Cursor)~" },
  "windsurf":                          { name: "Windsurf",     desc: "正在 coding (Windsurf)~" },
  "devenv":                            { name: "Visual Studio", desc: "正在用 VS 写 .NET~" },
  "rider64":                           { name: "Rider",        desc: "正在 coding (Rider)~" },
  "idea64":                            { name: "IntelliJ IDEA", desc: "正在 coding (IDEA)~" },
  "pycharm64":                         { name: "PyCharm",      desc: "正在 coding (PyCharm)~" },
  "webstorm64":                        { name: "WebStorm",     desc: "正在 coding (WebStorm)~" },
  "windowsterminal":                   { name: "Windows Terminal", desc: "在敲命令行~" },
  "wt":                                { name: "Windows Terminal", desc: "在敲命令行~" },
  "powershell":                        { name: "PowerShell",   desc: "在敲 PowerShell~" },
  "pwsh":                              { name: "PowerShell",   desc: "在敲 PowerShell~" },
  "cmd":                               { name: "Cmd",          desc: "在敲 cmd~" },
  "explorer":                          { name: "文件资源管理器", desc: "在翻文件夹~" },
  "notepad":                           { name: "记事本",        desc: "在记事本写东西~" },
  "obsidian":                          { name: "Obsidian",     desc: "在 Obsidian 记笔记~" },
  "discord":                           { name: "Discord",      desc: "在 Discord 摸鱼~" },
  "telegram":                          { name: "Telegram",     desc: "在看 Telegram~" },
  "qqmusic":                           { name: "QQ音乐",        desc: "在听 QQ 音乐~" },
  "cloudmusic":                        { name: "网易云音乐",    desc: "在听网易云~" },
  "spotify":                           { name: "Spotify",      desc: "在听 Spotify~" },
  "steam":                             { name: "Steam",        desc: "在 Steam 上挑游戏~" },
  "winrar":                            { name: "WinRAR",       desc: "在解压文件~" },
  "7zfm":                              { name: "7-Zip",        desc: "在解压文件~" },
  "applicationframehost":              { name: "UWP 应用",      desc: "在用 UWP 应用~" },
  "shellexperiencehost":               { name: "系统界面",      desc: "切系统界面~" },
  "searchhost":                        { name: "搜索",          desc: "在 Windows 搜索~" },
  "windows.afk":                       { name: "AFK",          desc: "暂时离开~" },
  "windows.idle":                      { name: "Windows",      desc: "Windows 待机~" },

  // ── Mobile system / MIUI ─────────────────────────────────────────────────
  "com.miui.home":                     { name: "桌面",          desc: "在桌面发呆~" },
  "com.miui.gallery":                  { name: "相册",          desc: "正在翻相册~" },
  "com.miui.notes":                    { name: "便签",          desc: "正在记便签~" },
  "com.miui.weather2":                 { name: "天气",          desc: "正在看天气~" },
  "com.miui.calculator":               { name: "计算器",        desc: "正在算账~" },
  "com.android.settings":              { name: "系统设置",      desc: "正在改设置~" },
  "com.android.deskclock":             { name: "时钟",          desc: "正在看闹钟~" },
  "com.android.camera2":               { name: "相机",          desc: "正在拍照~" },
  "com.android.contacts":              { name: "联系人",        desc: "翻通讯录~" },
  "com.android.dialer":                { name: "电话",          desc: "正在打电话~" },
  "com.android.mms":                   { name: "短信",          desc: "正在看短信~" },
  "com.android.systemui":              { name: "系统UI",        desc: "切系统界面~" },
  "com.android.vending":               { name: "Play商店",      desc: "正在找应用~" },
  "com.miui.securitycenter":           { name: "安全中心",      desc: "正在用安全中心~" },
};

// Heuristic: try last segment as fallback display name
export function appLabel(appId: string | null | undefined): AppLabel {
  if (!appId) return { name: "未知", desc: "发呆中~" };
  if (APP_LABELS[appId]) return APP_LABELS[appId];
  const last = appId.split(".").pop() ?? appId;
  // Capitalize first letter for cleaner display
  const name = last.length > 0 ? last.charAt(0).toUpperCase() + last.slice(1) : last;
  return { name, desc: `正在用 ${name}~` };
}

export function appName(appId: string | null | undefined): string {
  return appLabel(appId).name;
}

// ─── Live description (uses windowTitle when available) ─────────────────────

const BROWSER_PROCS = new Set(["msedge", "chrome", "firefox", "opera", "brave"]);
const EDITOR_PROCS = new Set(["code", "cursor", "windsurf", "devenv", "rider64", "idea64", "pycharm64", "webstorm64", "notepad"]);
const TERMINAL_PROCS = new Set(["windowsterminal", "wt", "powershell", "pwsh", "cmd"]);

// Strip common suffixes like " - Microsoft​ Edge", " — Mozilla Firefox" etc.
const BROWSER_SUFFIX_RE = /\s*[-—–]\s*(Microsoft\s*Edge|Google Chrome|Mozilla Firefox|Opera|Brave)\s*$/i;
// VS Code: "file.ts - folder - Visual Studio Code"
const EDITOR_SUFFIX_RE = /\s*[-—–]\s*(Visual Studio Code|Visual Studio|Cursor|Windsurf|JetBrains [^-—–]+|Rider|IntelliJ IDEA|PyCharm|WebStorm)\s*$/i;
// Generic strip leading/trailing whitespace + common nbsp variants
function clean(s: string): string {
  return s.replace(/[​-‍﻿ ]/g, " ").trim();
}

export interface LiveContext {
  appId: string | null | undefined;
  windowTitle?: string | null;
  who?: string;
}

export function liveDescription({ appId, windowTitle, who = "Asashiki" }: LiveContext): string {
  const lbl = appLabel(appId);
  const title = windowTitle ? clean(windowTitle) : "";

  // Browsers: extract tab name from window title
  if (appId && BROWSER_PROCS.has(appId) && title) {
    const tab = clean(title.replace(BROWSER_SUFFIX_RE, ""));
    if (tab && tab.length > 0 && tab !== title) {
      // Heuristic: detect well-known sites in tab text
      const lower = tab.toLowerCase();
      if (lower.includes("youtube"))   return `${who} 在 ${lbl.name} 上看 YouTube：${truncate(tab.replace(/^.*-\s*YouTube.*$/i, "").trim() || tab, 40)}`;
      if (lower.includes("bilibili") || lower.includes("哔哩哔哩")) return `${who} 在 ${lbl.name} 上刷 B 站：${truncate(tab, 40)}`;
      if (lower.includes("github"))    return `${who} 在 ${lbl.name} 上逛 GitHub：${truncate(tab, 40)}`;
      if (lower.includes("twitter") || lower.includes(" / x"))    return `${who} 在 ${lbl.name} 上刷 Twitter`;
      if (lower.includes("stack overflow")) return `${who} 在 ${lbl.name} 上查 Stack Overflow`;
      return `${who} 在 ${lbl.name} 看「${truncate(tab, 50)}」`;
    }
  }

  // Editors: extract filename
  if (appId && EDITOR_PROCS.has(appId) && title) {
    const stripped = clean(title.replace(EDITOR_SUFFIX_RE, ""));
    if (stripped && stripped !== title) {
      const file = stripped.split(/\s*[-—–]\s*/)[0];
      if (file) return `${who} 在 ${lbl.name} 写 ${truncate(file, 50)}`;
    }
  }

  // Terminals: try to show the working directory or running command if it's in the title
  if (appId && TERMINAL_PROCS.has(appId) && title) {
    return `${who} 在 ${lbl.name}：${truncate(title, 60)}`;
  }

  // Default: prefix user name to the standard description
  return `${who} ${lbl.desc}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

