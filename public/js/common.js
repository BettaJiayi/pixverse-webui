// common.js  —— 公共逻辑：余额 / 历史记录 / 状态轮询

const apiBase = ''; // 同域，直接调用 /api/xxx 即可

// ---- DOM 引用：余额 ----
const balanceText = document.getElementById('balanceText');
const refreshBalanceBtn = document.getElementById('refreshBalanceBtn');

// ---- DOM 引用：状态 & 原始响应 ----
const statusVideoIdEl = document.getElementById('statusVideoId');
const checkStatusBtn = document.getElementById('checkStatusBtn');
const statusLabelEl = document.getElementById('statusLabel');
const statusProgressBarEl = document.getElementById('statusProgressBar');
const statusRawEl = document.getElementById('statusRaw');
const toggleRawBtn = document.getElementById('toggleRawBtn');
const videoLinkBoxEl = document.getElementById('videoLinkBox');
const statusVideoPreviewEl = document.getElementById('statusVideoPreview');

// ---- DOM 引用：历史记录 ----
const historyListEl = document.getElementById('historyList');
const historyEmptyEl = document.getElementById('historyEmpty');
const historyPagerInfoEl = document.getElementById('historyPagerInfo');
const historyPrevBtn = document.getElementById('historyPrevBtn');
const historyNextBtn = document.getElementById('historyNextBtn');
const historyClearBtn = document.getElementById('historyClearBtn');

const HISTORY_KEY = 'pixverse_history_v1';
const HISTORY_PAGE_SIZE = 5; // 每页条数
let historyPage = 1; // 当前页（1 开始）

// —— 自动轮询相关状态 ——
let currentVideoId = null;
let statusPollTimer = null;
let progressTimer = null;
let progressValue = 0;
let pollCount = 0;
const MAX_POLL = 90; // 最多轮询 90 次，4s 一次，大概 6 分钟

// —— 下载相关：记住最后一次成功的视频地址 & 按钮句柄 ——
let lastVideoUrl = null;
let lastVideoId = null;
let downloadVideoBtn = null;

// 初始化：在“视频链接”区域下方插入一个下载按钮（如果不存在）
function ensureDownloadButton() {
  if (downloadVideoBtn) return;
  if (!videoLinkBoxEl) return;

  const container = videoLinkBoxEl.parentElement || videoLinkBoxEl;

  const wrapper = document.createElement('div');
  wrapper.className = 'video-actions'; // 只是个容器，不加样式也能用

  const btn = document.createElement('button');
  btn.id = 'downloadVideoBtn';
  btn.className = 'btn btn-xs';
  btn.textContent = '下载视频到本地';
  btn.disabled = true;

  wrapper.appendChild(btn);
  container.appendChild(wrapper);

  downloadVideoBtn = btn;

  // 绑定点击事件：先用 fetch 拉取视频为 Blob，再用本地 blob: 地址触发下载
  downloadVideoBtn.addEventListener('click', async () => {
    if (!lastVideoUrl) {
      alert('当前没有可下载的视频，请先生成或查询一个已完成的视频。');
      return;
    }

    try {
      downloadVideoBtn.disabled = true;
      downloadVideoBtn.textContent = '正在下载...';

      // 拉取远程视频为 Blob（需要后端允许 CORS）
      const resp = await fetch(lastVideoUrl);
      if (!resp.ok) {
        throw new Error('视频地址响应异常：' + resp.status);
      }

      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      const base = lastVideoId || 'pixverse_video';
      a.href = blobUrl;
      a.download = `${base}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 用完马上释放
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('下载失败', e);
      alert(
        '自动下载失败，可以尝试右键“视频预览”另存为，或在新标签打开后另存为。'
      );
      // 兜底：至少帮你打开原始链接
      try {
        window.open(lastVideoUrl, '_blank');
      } catch {}
    } finally {
      downloadVideoBtn.disabled = false;
      downloadVideoBtn.textContent = '下载视频到本地';
    }
  });
}

// 工具：请求 JSON
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    // 直接把 json 字符串往外抛，方便上层自己解析 ErrCode / ErrMsg
    throw new Error(text || '请求失败');
  }
  return res.json();
}

// 工具：状态码 → 文案 & 颜色分类
function mapStatus(statusCode) {
  switch (statusCode) {
    case 1:
      return { text: '✅ 已完成', cls: 'ok' };
    case 5:
      return { text: '⏳ 生成中', cls: 'running' };
    case 7:
      return { text: '⚠️ 审核未通过', cls: 'blocked' };
    case 8:
      return { text: '❌ 生成失败', cls: 'error' };
    default:
      return { text: '未查询 / 未知状态', cls: 'unknown' };
  }
}

// 工具：时间格式化
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

// 工具：截断文本
function truncate(str, len = 40) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// ---- 历史记录：读写本地存储 ----
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('保存历史到 localStorage 失败', e);
  }
}

let history = loadHistory();

// 历史记录中的进度条：完成/失败 100，生成中 60，其他 10
function calcHistoryProgress(statusCode) {
  if (statusCode === 1 || statusCode === 7 || statusCode === 8) return 100;
  if (statusCode === 5) return 60;
  return 10;
}

// 工具：复制文本到剪贴板（带兼容处理）
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.warn('navigator.clipboard 写入失败，尝试降级方案', e);
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (e) {
    console.warn('降级复制方案失败', e);
    return false;
  }
}

async function copyVideoIdFromHistory(id) {
  const ok = await copyTextToClipboard(String(id));
  if (ok) {
    alert('已复制 PixVerse video_id：' + id);
  } else {
    alert('复制失败，请手动选中并复制：' + id);
  }
}

function renderHistory() {
  historyListEl.innerHTML = '';

  // 没有记录
  if (!history.length) {
    historyEmptyEl.style.display = 'block';
    if (historyPagerInfoEl) {
      historyPagerInfoEl.textContent = '暂无记录';
    }
    if (historyPrevBtn) historyPrevBtn.disabled = true;
    if (historyNextBtn) historyNextBtn.disabled = true;
    return;
  }

  historyEmptyEl.style.display = 'none';

  // 按时间倒序排
  const sorted = history
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const total = sorted.length;
  const pageSize = HISTORY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (historyPage < 1) historyPage = 1;
  if (historyPage > totalPages) historyPage = totalPages;

  const startIndex = (historyPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageItems = sorted.slice(startIndex, endIndex);

  pageItems.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const statusInfo = mapStatus(item.lastStatusCode);
    const percent = calcHistoryProgress(item.lastStatusCode);

    const styleText = item.style ? `风格：${item.style}` : '风格：默认';
    const seedText =
      typeof item.seed === 'number' && !Number.isNaN(item.seed)
        ? `种子：${item.seed}`
        : '种子：随机';

    // ✅ 这里兼容 extend / extend-video 两种写法
    const sourceText =
      item.type === 'image-to-video'
        ? '图生视频'
        : item.type === 'extend' || item.type === 'extend-video'
        ? '续写视频'
        : item.type === 'transition-video'
        ? '首尾帧'
        : '文生视频';

    li.innerHTML = `
      <div class="history-header">
        <span class="history-id">#${item.id}</span>
        <span class="status-pill status-${statusInfo.cls}">${statusInfo.text}</span>
      </div>
      <div class="history-prompt" title="${item.prompt || ''}">
        [${sourceText}] ${truncate(item.prompt || '（无提示词）')}
      </div>
      <div class="history-meta">${styleText} ｜ ${seedText}</div>
      <div class="history-footer">
        <span class="history-time">${formatTime(item.createdAt)}</span>
        <div class="history-actions">
          <button data-action="check" data-id="${item.id}">查看状态</button>
          <button data-action="copy" data-id="${item.id}">复制ID</button>
          <button data-action="delete" data-id="${item.id}">删除</button>
        </div>
      </div>
      <div class="progress">
        <div class="progress-bar progress-${statusInfo.cls}" style="width:${percent}%"></div>
      </div>
    `;

    historyListEl.appendChild(li);
  });

  // 更新分页信息 & 按钮状态
  if (historyPagerInfoEl) {
    historyPagerInfoEl.textContent = `第 ${historyPage} / ${totalPages} 页，共 ${total} 条`;
  }
  if (historyPrevBtn) historyPrevBtn.disabled = historyPage <= 1;
  if (historyNextBtn) historyNextBtn.disabled = historyPage >= totalPages;
}

function upsertHistoryRecord(record) {
  const idx = history.findIndex((x) => String(x.id) === String(record.id));
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...record };
  } else {
    history.push(record);
  }
  historyPage = 1; // 新增记录后回到第一页
  saveHistory(history);
  renderHistory();
}

function deleteHistoryRecord(id) {
  history = history.filter((x) => String(x.id) !== String(id));
  saveHistory(history);
  renderHistory();
}

// 新增：清空全部历史记录（带二次确认）
function clearHistoryAll() {
  if (!history.length) {
    alert('当前没有历史记录。');
    return;
  }

  const ok = confirm(
    '确认要清空全部历史记录吗？\n\n' +
      '提示：这只会删除当前浏览器中保存的本地记录，不会删除 PixVerse 服务器上的视频。'
  );
  if (!ok) return;

  history = [];
  historyPage = 1;
  saveHistory(history);
  renderHistory();
}

// 历史记录点击事件（查看状态、复制、删除）
historyListEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  if (!id) return;

  if (action === 'delete') {
    if (confirm(`确认删除记录 #${id} 吗？`)) {
      deleteHistoryRecord(id);
    }
  } else if (action === 'check') {
    // 填入右侧输入框并直接开始轮询
    statusVideoIdEl.value = id;
    startAutoPolling(id);
  } else if (action === 'copy') {
    copyVideoIdFromHistory(id);
  }
});

// 原始响应展开/收起
toggleRawBtn.addEventListener('click', () => {
  const isHidden =
    statusRawEl.style.display === 'none' ||
    statusRawEl.style.display === '';
  if (isHidden) {
    statusRawEl.style.display = 'block';
    toggleRawBtn.textContent = '收起';
  } else {
    statusRawEl.style.display = 'none';
    toggleRawBtn.textContent = '展开';
  }
});

// ---- 余额 ----
async function refreshBalance() {
  try {
    refreshBalanceBtn.disabled = true;
    const data = await fetchJson(apiBase + '/api/account-balance');
    if (data.ErrCode === 0) {
      const resp = data.Resp || {};
      const credit_monthly = resp.credit_monthly ?? 0;
      const credit_package = resp.credit_package ?? 0;
      balanceText.textContent = `月度：${credit_monthly}，套餐：${credit_package}`;
    } else {
      balanceText.textContent = '获取失败：' + (data.ErrMsg || data.ErrCode);
    }
  } catch (e) {
    balanceText.textContent = '请求错误：' + e.message;
  } finally {
    refreshBalanceBtn.disabled = false;
  }
}

refreshBalanceBtn.addEventListener('click', refreshBalance);

// ---- 进度条 & 状态显示 ----
function resetProgressVisual() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  progressValue = 0;
  currentVideoId = null;
  lastVideoUrl = null;
  lastVideoId = null;

  statusLabelEl.textContent = '未查询';
  statusLabelEl.className = 'status-pill status-unknown';
  statusProgressBarEl.className = 'progress-bar progress-unknown';
  statusProgressBarEl.style.width = '0%';
  videoLinkBoxEl.textContent = '暂无';

  if (statusVideoPreviewEl) {
    statusVideoPreviewEl.innerHTML =
      '<div class="video-preview-placeholder">暂无视频预览</div>';
  }

  if (downloadVideoBtn) {
    downloadVideoBtn.disabled = true;
    downloadVideoBtn.textContent = '下载视频到本地';
  }
}

function applyStatusVisual(statusCode) {
  const { text, cls } = mapStatus(statusCode);
  statusLabelEl.textContent = text;
  statusLabelEl.className = 'status-pill status-' + cls;

  if (statusCode === 5) {
    // 生成中：开启缓慢增长到 90%
    if (!progressTimer) {
      if (progressValue < 15) progressValue = 15;
      progressTimer = setInterval(() => {
        if (progressValue < 90) {
          const step = 1 + Math.random() * 4; // 1~5%
          progressValue = Math.min(90, progressValue + step);
          statusProgressBarEl.className = 'progress-bar progress-running';
          statusProgressBarEl.style.width = progressValue + '%';
        }
      }, 800);
    }
  } else if (statusCode === 1) {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    progressValue = 100;
    statusProgressBarEl.className = 'progress-bar progress-ok';
    statusProgressBarEl.style.width = '100%';
  } else if (statusCode === 7) {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    progressValue = 100;
    statusProgressBarEl.className = 'progress-bar progress-blocked';
    statusProgressBarEl.style.width = '100%';
  } else if (statusCode === 8) {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    progressValue = 100;
    statusProgressBarEl.className = 'progress-bar progress-error';
    statusProgressBarEl.style.width = '100%';
  } else {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    progressValue = 0;
    statusProgressBarEl.className = 'progress-bar progress-unknown';
    statusProgressBarEl.style.width = '0%';
  }
}

// 自动轮询核心逻辑
function startAutoPolling(videoId) {
  if (!videoId) {
    alert('请先输入 video_id');
    return;
  }

  currentVideoId = videoId;
  pollCount = 0;

  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }

  progressValue = 0;
  statusRawEl.textContent =
    '已开始自动跟踪 video_id = ' + videoId + '，正在查询最新状态…';
  videoLinkBoxEl.textContent = '暂无（等待结果）';

  if (statusVideoPreviewEl) {
    statusVideoPreviewEl.innerHTML =
      '<div class="video-preview-placeholder">等待生成结果…</div>';
  }

  if (downloadVideoBtn) {
    downloadVideoBtn.disabled = true;
    downloadVideoBtn.textContent = '下载视频到本地';
  }

  // 先做一次立即查询，再每 4 秒查一次
  pollStatusOnce();
  statusPollTimer = setInterval(pollStatusOnce, 4000);
}

async function pollStatusOnce() {
  if (!currentVideoId) return;

  pollCount++;
  if (pollCount > MAX_POLL) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    statusLabelEl.textContent = '⏱ 超时未完成';
    statusLabelEl.className = 'status-pill status-unknown';
    statusProgressBarEl.className = 'progress-bar progress-unknown';
    statusProgressBarEl.style.width = progressValue + '%';
    videoLinkBoxEl.textContent =
      '任务耗时过长，请稍后手动再试或检查后台。';

    if (statusVideoPreviewEl) {
      statusVideoPreviewEl.innerHTML =
        '<div class="video-preview-placeholder">暂无视频预览</div>';
    }

    if (downloadVideoBtn) {
      downloadVideoBtn.disabled = true;
      downloadVideoBtn.textContent = '下载视频到本地';
    }
    return;
  }

  try {
    const data = await fetchJson(
      apiBase + '/api/video-status/' + encodeURIComponent(currentVideoId)
    );
    statusRawEl.textContent = JSON.stringify(data, null, 2);

    if (data.ErrCode === 0 && data.Resp) {
      const resp = data.Resp;
      const status = resp.status;
      const url = resp.url;

      // ✅ 从返回中读取 seed（包括 Resp.seed 或 Resp.params.seed）
      let seedFromResp = null;
      if (typeof resp.seed !== 'undefined' && resp.seed !== null) {
        seedFromResp = resp.seed;
      } else if (
        resp.params &&
        typeof resp.params.seed !== 'undefined' &&
        resp.params.seed !== null
      ) {
        seedFromResp = resp.params.seed;
      }

      applyStatusVisual(status);

      // 更新历史记录中的状态 & url & seed
      const historyPatch = {
        id: currentVideoId,
        lastStatusCode: status,
        url: url || null,
      };
      if (seedFromResp !== null) {
        historyPatch.seed = seedFromResp;
      }
      upsertHistoryRecord(historyPatch);

      if (status === 1 && url) {
        // ✅ 已完成：记录下载信息
        lastVideoUrl = url;
        lastVideoId = currentVideoId;

        // 链接区域：只显示可点击链接
        videoLinkBoxEl.innerHTML = `
          <a href="${url}" target="_blank" rel="noreferrer">${url}</a>
        `;

        // 预览区域：播放视频
        if (statusVideoPreviewEl) {
          statusVideoPreviewEl.innerHTML = `
            <video
              controls
              playsinline
              preload="metadata"
              src="${url}"
              style="display:block;width:100%;max-height:260px;border-radius:10px;"
            ></video>
          `;
        }

        if (downloadVideoBtn) {
          downloadVideoBtn.disabled = false;
          downloadVideoBtn.textContent = '下载视频到本地';
        }
      } else if (status === 5) {
        videoLinkBoxEl.textContent =
          '⏳ 正在生成，请稍候…（系统会自动刷新状态）';

        if (statusVideoPreviewEl) {
          statusVideoPreviewEl.innerHTML =
            '<div class="video-preview-placeholder">生成中…</div>';
        }

        if (downloadVideoBtn) {
          downloadVideoBtn.disabled = true;
          downloadVideoBtn.textContent = '等待生成完成…';
        }
      } else if (status === 7) {
        videoLinkBoxEl.textContent =
          '⚠️ 审核未通过，请修改提示词或参数后重试。';

        if (statusVideoPreviewEl) {
          statusVideoPreviewEl.innerHTML =
            '<div class="video-preview-placeholder">暂无视频预览（审核未通过）</div>';
        }

        if (downloadVideoBtn) {
          downloadVideoBtn.disabled = true;
          downloadVideoBtn.textContent = '下载视频到本地';
        }
      } else if (status === 8) {
        videoLinkBoxEl.textContent =
          '❌ 生成失败，请稍后重试或检查参数。';

        if (statusVideoPreviewEl) {
          statusVideoPreviewEl.innerHTML =
            '<div class="video-preview-placeholder">暂无视频预览（生成失败）</div>';
        }

        if (downloadVideoBtn) {
          downloadVideoBtn.disabled = true;
          downloadVideoBtn.textContent = '下载视频到本地';
        }
      }

      // 终止状态：成功 / 审核失败 / 生成失败 → 停止轮询
      if (status === 1 || status === 7 || status === 8) {
        if (statusPollTimer) {
          clearInterval(statusPollTimer);
          statusPollTimer = null;
        }
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
      }
    } else {
      // API 本身返回 ErrCode != 0
      applyStatusVisual(null);
      videoLinkBoxEl.textContent =
        '查询失败：' + (data.ErrMsg || data.ErrCode);

      if (statusVideoPreviewEl) {
        statusVideoPreviewEl.innerHTML =
          '<div class="video-preview-placeholder">暂无视频预览</div>';
      }

      if (downloadVideoBtn) {
        downloadVideoBtn.disabled = true;
        downloadVideoBtn.textContent = '下载视频到本地';
      }
    }
  } catch (e) {
    applyStatusVisual(null);
    videoLinkBoxEl.textContent = '请求出错：' + e.message;

    if (statusVideoPreviewEl) {
      statusVideoPreviewEl.innerHTML =
        '<div class="video-preview-placeholder">暂无视频预览</div>';
    }

    if (downloadVideoBtn) {
      downloadVideoBtn.disabled = true;
      downloadVideoBtn.textContent = '下载视频到本地';
    }
  }
}

// 右侧按钮：对任意 video_id 开始自动轮询
checkStatusBtn.addEventListener('click', () => {
  const videoId = statusVideoIdEl.value.trim();
  startAutoPolling(videoId);
});

// 历史记录分页按钮
if (historyPrevBtn) {
  historyPrevBtn.addEventListener('click', () => {
    if (historyPage > 1) {
      historyPage -= 1;
      renderHistory();
    }
  });
}
if (historyNextBtn) {
  historyNextBtn.addEventListener('click', () => {
    historyPage += 1;
    renderHistory();
  });
}
if (historyClearBtn) {
  historyClearBtn.addEventListener('click', clearHistoryAll);
}

// 页面初始化
ensureDownloadButton();
renderHistory();
resetProgressVisual();
refreshBalance();

// 暴露给其他模块使用
window.apiBase = apiBase;
window.fetchJson = fetchJson;
window.startAutoPolling = startAutoPolling;
window.upsertHistoryRecord = upsertHistoryRecord;
