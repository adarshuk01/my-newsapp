"use strict";

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend

// ─────────────────────────────────────────────
// Source config
// ─────────────────────────────────────────────
const SOURCES = {
  manorama: {
    baseUrl: "https://www.manoramaonline.com",
    icon: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/50/3f/56/503f5669-704b-5689-b68b-88ce6dd7d7e9/AppIcon4NormalUsers-0-0-1x_U007emarketing-0-6-0-85-220.png/512x512bb.jpg",
    channel: "Manorama",
  },
  asianet: {
    baseUrl: "https://www.asianetnews.com",
    icon: "https://play-lh.googleusercontent.com/P_-tUCKxNAhgNMwSyHF1NQBg0H27KnHiD_7SFf_y5BYFT3cMEV8FqUBiGGGJsJNMUg=w240-h480-rw",
    channel: "Asianet",
  },
  mediaone: {
    baseUrl: "https://www.mediaoneonline.com",
    latestUrl: "https://www.mediaoneonline.com/latest-news",
    icon: "https://upload.wikimedia.org/wikipedia/commons/6/62/Media_One_Logo.png",
    channel: "MediaOne",
  },
  oneindia: {
    rssUrl: "https://malayalam.oneindia.com/rss/feeds/malayalam-news-fb.xml",
    icon: "https://imagesvs.oneindia.com/images/oneindia-lm-logo-1721304500709.svg",
    channel: "Oneindia",
  },
  news18: {
    sitemapUrl: "https://malayalam.news18.com/commonfeeds/v1/mal/sitemap/google-news.xml",
    baseUrl: "https://malayalam.news18.com",
    icon: "https://static.news18.com/static/img/logo-news18-favicon-32.png",
    channel: "News18 Malayalam",
  },
};

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function loadPage(url) {
  const { data } = await axios.get(url, {
    timeout: 20000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      Referer: "https://www.google.com/",
      DNT: "1",
      "Upgrade-Insecure-Requests": "1",
    },
  });
  return cheerio.load(data);
}

async function fetchRaw(url) {
  const { data } = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: 15000,
  });
  return data;
}

const stripLive = (t = "") => t.replace(/^Live\s*/gi, "").trim();
const stripCdata = (s = "") => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
const resolve = (base, href = "") => {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return base + href;
};

function cleanHtmlText(text = "") {
  if (!text) return "";
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/pic\.twitter\.com\/\S+/gi, "")
    .replace(/https?:\/\/t\.co\/\S+/gi, "");
  text = cheerio.load(`<div>${text}</div>`)("div").text();
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getXmlTag(xml, tag) {
  const esc = tag.replace(":", "\\:");
  const m = xml.match(new RegExp(`<${esc}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${esc}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : "";
}

function getXmlAttr(xml, tag, attr) {
  const esc = tag.replace(":", "\\:");
  const m = xml.match(new RegExp(`<${esc}[^>]*\\s${attr}="([^"]*)"`, "i"));
  return m ? m[1].trim() : "";
}

const isValidImage = (url = "") => {
  if (!url) return false;
  return /^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return dateStr;
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─────────────────────────────────────────────
// Scrapers
// ─────────────────────────────────────────────
async function scrapeManorama(url, selector) {
  const { baseUrl, icon, channel } = SOURCES.manorama;
  const $ = await loadPage(url);
  const news = [];

  $(selector).each((_, el) => {
    const anchor = $(el).find("h2 a");
    const title = stripLive(anchor.text().trim());
    const link = resolve(baseUrl, anchor.attr("href"));
    const summary = cleanHtmlText($(el).find(".cmp-story-list__dispn").html() || "");
    const imgEl = $(el).find(".cmp-story-list__image-block img");
    const image = imgEl.attr("data-src") || imgEl.attr("data-websrc") || imgEl.attr("src") || "";
    const readableTime = $(el).find(".cmp-story-list__date").text().trim();

    if (title && link) {
      news.push({ title, link, summary, image, readableTime, icon, channel });
    }
  });

  return news;
}

async function scrapeAsianet(url) {
  const { icon, channel } = SOURCES.asianet;
  const data = await fetchRaw(url);
  const news = [];
  const items = data.split("<item>");

  for (const chunk of items.slice(1)) {
    const itemXml = chunk.split("</item>")[0];
    const title = stripLive(getXmlTag(itemXml, "title"));
    const link = getXmlTag(itemXml, "link");
    const pubDate = getXmlTag(itemXml, "pubDate");
    const image =
      getXmlAttr(itemXml, "media:content", "url") ||
      getXmlAttr(itemXml, "enclosure", "url") || "";

    let summary = cleanHtmlText(
      getXmlTag(itemXml, "content:encoded") || getXmlTag(itemXml, "description")
    );
    const words = summary.split(" ").filter(Boolean);
    if (words.length > 40) summary = words.slice(0, 150).join(" ") + "...";

    if (!isValidImage(image)) continue;
    if (title && link) {
      news.push({ title, link, summary, image, readableTime: pubDate, icon, channel });
    }
  }
  return news;
}

async function scrapeMediaOne() {
  const { latestUrl, baseUrl, icon, channel } = SOURCES.mediaone;
  const $ = await loadPage(latestUrl);
  const news = [];

  $("#pills-all > ul > li.list-item").each((_, el) => {
    const title = stripLive($(el).find("h3.story-title").text().trim());
    const href = $(el).find("a").attr("href");
    const link = resolve(baseUrl, href);
    const summary = cleanHtmlText($(el).find("p").text().trim());
    const image =
      $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || "";
    const readableTime = $(el).find(".time-as-duration").text().trim();

    if (title && link) {
      news.push({ title, link, summary, image, readableTime, icon, channel });
    }
  });
  return news;
}

async function scrapeOneindia() {
  const { rssUrl, icon, channel } = SOURCES.oneindia;
  const data = await fetchRaw(rssUrl);
  const news = [];
  const items = data.split("<item>");

  for (const chunk of items.slice(1)) {
    const itemXml = chunk.split("</item>")[0];
    const title = stripLive(getXmlTag(itemXml, "title"));
    const link = getXmlTag(itemXml, "link");
    const summary = cleanHtmlText(getXmlTag(itemXml, "description"));
    const pubDate = getXmlTag(itemXml, "pubDate");
    const imgM = itemXml.match(/url="(https?:\/\/[^"]+)"/);
    const image = imgM ? imgM[1] : "";

    if (!isValidImage(image)) continue;
    if (title && link) {
      news.push({ title, link, summary, image, readableTime: pubDate, icon, channel });
    }
  }
  return news;
}

async function scrapeNews18() {
  const { sitemapUrl, icon, channel } = SOURCES.news18;
  const data = await fetchRaw(sitemapUrl);
  const news = [];
  const urlBlocks = data.split("<url>");

  for (const block of urlBlocks.slice(1)) {
    const chunk = block.split("</url>")[0];
    const loc = getXmlTag(chunk, "loc");
    if (!loc || !loc.includes("malayalam.news18.com")) continue;

    const rawTitle = getXmlTag(chunk, "news:title") || getXmlTag(chunk, "title");
    const title = stripLive(rawTitle.trim());
    if (!title) continue;

    const pubDate = getXmlTag(chunk, "news:publication_date") || getXmlTag(chunk, "lastmod") || "";
    let readableTime = pubDate;
    if (pubDate) {
      try {
        readableTime = new Date(pubDate).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        });
      } catch (_) {}
    }

    const rawImageLoc = getXmlTag(chunk, "image:loc");
    const image = rawImageLoc.trim();
    const rawKeywords = getXmlTag(chunk, "news:keywords");
    const summary = rawKeywords.trim();

    if (title && loc) {
      news.push({
        title, link: loc, summary,
        image: isValidImage(image) ? image : "",
        readableTime, icon, channel,
      });
    }
  }
  return news;
}

// ─────────────────────────────────────────────
// Aggregate
// ─────────────────────────────────────────────
async function fetchAllLatestNews() {
  const results = await Promise.allSettled([
    scrapeManorama(`${SOURCES.manorama.baseUrl}/news/latest-news.html`, "#Just_in_Slot > div > ul > li"),
    scrapeAsianet(`${SOURCES.asianet.baseUrl}/rss`),
    scrapeMediaOne(),
    scrapeOneindia(),
    scrapeNews18(),
  ]);

  const all = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // Add timeAgo to all items
  return all.map(item => ({
    ...item,
    timeAgo: timeAgo(item.readableTime),
  }));
}

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

// In-memory cache (60s TTL)
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 1000;

app.get("/api/news", async (req, res) => {
  try {
    const now = Date.now();
    if (cache && now - cacheTime < CACHE_TTL) {
      return res.json({ ok: true, articles: cache, cached: true });
    }

    const articles = await fetchAllLatestNews();
    cache = articles;
    cacheTime = now;

    return res.json({ ok: true, articles, cached: false });
  } catch (err) {
    console.error("❌ /api/news error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/news/source/:source", async (req, res) => {
  const { source } = req.params;
  try {
    let articles = [];
    switch (source.toLowerCase()) {
      case "manorama":
        articles = await scrapeManorama(`${SOURCES.manorama.baseUrl}/news/latest-news.html`, "#Just_in_Slot > div > ul > li");
        break;
      case "asianet":
        articles = await scrapeAsianet(`${SOURCES.asianet.baseUrl}/rss`);
        break;
      case "mediaone":
        articles = await scrapeMediaOne();
        break;
      case "oneindia":
        articles = await scrapeOneindia();
        break;
      case "news18":
        articles = await scrapeNews18();
        break;
      default:
        return res.status(400).json({ ok: false, error: "Unknown source" });
    }
    return res.json({ ok: true, articles: articles.map(a => ({ ...a, timeAgo: timeAgo(a.readableTime) })) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true, message: "Kerala News API running" }));

// Catch-all → serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});


