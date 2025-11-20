// download-assets.js —— 批量下载 templates.json 里的封面 / 预览资源到本地
// 适用于 Windows/Mac/Linux （自动过滤非法文件名字符）

const fs = require("fs");
const path = require("path");
const axios = require("axios");

// 读取模板配置
const TEMPLATES_JSON_PATH = path.join(__dirname, "templates.json");

// 本地资源输出目录
const ASSET_DIR = path.join(__dirname, "..", "assets", "templates");

// 确保输出目录存在
if (!fs.existsSync(ASSET_DIR)) {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
}

// =====================
// 清理非法文件名字符
// =====================
function safeFileName(str) {
  return str.replace(/[\\/:*?"<>|]/g, "_");
}

// 从 URL 获取文件名
function getFileNameFromUrl(url, prefix) {
  if (!url) return "";

  // 去掉 query
  const cleanUrl = url.split("?")[0];

  // 关键：先 URL 解码，把 %2F 还原成 /
  const decodedUrl = decodeURIComponent(cleanUrl);

  // 现在 basename 就会变成 web_xxx.gif 这种干净文件名
  let base = path.basename(decodedUrl);

  if (!base) base = "unknown";

  const ext = path.extname(base);
  const name = path.basename(base, ext);

  const safePrefix = prefix ? safeFileName(prefix) : "tpl";
  const safeName = safeFileName(name);

  return `${safePrefix}_${safeName}${ext}`;
}


// 下载函数
async function downloadFile(url, filename) {
  const filePath = path.join(ASSET_DIR, filename);

  if (fs.existsSync(filePath)) {
    console.log("✔ 已存在跳过：", filename);
    return filePath;
  }

  console.log("↓ 下载：", filename);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 30000,
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  console.log("✔ 下载完成：", filename);
  return filePath;
}

async function main() {
  const raw = fs.readFileSync(TEMPLATES_JSON_PATH, "utf8");
  const templates = JSON.parse(raw);

  const urlCache = new Map();

  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i];

    // 文件名前缀使用英文名（干净化）
    const prefix = safeFileName(tpl.name_en || `tpl_${i + 1}`);

    // ========== cover ==========
    if (tpl.cover) {
      const url = tpl.cover;

      let localPath;
      if (urlCache.has(url)) {
        localPath = urlCache.get(url);
      } else {
        const filename = getFileNameFromUrl(url, prefix + "_cover");
        const filePath = await downloadFile(url, filename);

        // 生成相对路径
        localPath = path
          .relative(path.join(__dirname, ".."), filePath)
          .replace(/\\/g, "/");

        urlCache.set(url, localPath);
      }

      tpl.cover_local = localPath;
    }

    // ========== preview ==========
    if (tpl.preview) {
      const url = tpl.preview;

      let localPath;
      if (urlCache.has(url)) {
        localPath = urlCache.get(url);
      } else {
        const filename = getFileNameFromUrl(url, prefix + "_preview");
        const filePath = await downloadFile(url, filename);

        localPath = path
          .relative(path.join(__dirname, ".."), filePath)
          .replace(/\\/g, "/");

        urlCache.set(url, localPath);
      }

      tpl.preview_local = localPath;
    }
  }

  // 写新文件
  const outPath = path.join(__dirname, "templates.local.json");
  fs.writeFileSync(outPath, JSON.stringify(templates, null, 2), "utf8");

  console.log("\n=========================================");
  console.log("✔ 全部资源已下载");
  console.log("✔ 新配置文件：", outPath);
  console.log("✔ 本地资源目录：", ASSET_DIR);
  console.log("=========================================\n");
}

main().catch((err) => {
  console.error("❌ ERROR:", err);
});
