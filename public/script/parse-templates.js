// parse-templates.js —— 自动解析 PixVerse 模板（带 name_en）
// CommonJS 版本，可直接 node parse-templates.js

const fs = require("fs");
const cheerio = require("cheerio");

// 读取 HTML
const html = fs.readFileSync("./effect-list.html", "utf8");

// cheerio 载入
const $ = cheerio.load(html);

const templates = [];

/**
 * 从图片 URL 中提取 ID，例如：
 * web_money360_250326.gif → web_money360_250326
 */
function extractIdFromUrl(url) {
  if (!url) return "";
  try {
    const [pathPart] = url.split("?");
    const fileName = pathPart.split("/").pop() || "";
    return fileName.replace(/\.(gif|webp|jpg|png)$/i, "");
  } catch (e) {
    return "";
  }
}

/**
 * 清理文本（去换行、去多余空格）
 */
function cleanText(t) {
  return t.replace(/\s+/g, " ").trim();
}

// 找到所有模板卡片
$("div.w-full.rounded-lg.cursor-pointer.flex.flex-col").each((i, el) => {
  const card = $(el);

  // ===== 1) 提取模板名（英文） =====
  // 你告诉我真实结构是一个带 -webkit-line-clamp 的 div
  const nameEl = card.find("div[style*='-webkit-line-clamp']");
  const rawName = nameEl.text() || "";
  const name_en = cleanText(rawName);

  // ===== 2) 封面图 =====
  const cover = card.find("img").attr("src") || "";

  // ===== 3) 自动生成 id =====
  const id = extractIdFromUrl(cover) || String(i + 1);

  // ===== 4) 构建你要的结构 =====
  const item = {
    id: "", // ✨真 ID 需要你自己手动填，这里保持空字符串
    name_zh: "", // 暂时留空，你以后可以手动翻译
    name_en: name_en,
    cover: cover,
    preview: cover,
    favorite: false,
  };

  templates.push(item);
});

// 写入 JSON 文件
fs.writeFileSync("./templates.json", JSON.stringify(templates, null, 2), "utf8");

console.log("✔ 解析完成");
console.log("✔ 模板数量:", templates.length);
console.log("✔ 输出文件:", "templates.json");
