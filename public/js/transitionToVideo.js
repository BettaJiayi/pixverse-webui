// transitionToVideo.js —— 首尾帧 Transition 相关前端逻辑（自动上传 + img_id 行右侧“重新上传”）

(() => {
  const apiBase = window.apiBase || '';

  // DOM 引用
  const firstFrameFileEl = document.getElementById('firstFrameFile');
  const firstFrameImgIdText = document.getElementById('firstFrameImgIdText');

  const firstFrameFileStatus = document.getElementById('firstFrameFileStatus');
  const lastFrameFileStatus  = document.getElementById('lastFrameFileStatus');

  const lastFrameFileEl = document.getElementById('lastFrameFile');
  const lastFrameImgIdText = document.getElementById('lastFrameImgIdText');

  const transitionPromptEl = document.getElementById('transitionPrompt');
  const transitionDurationEl = document.getElementById('transitionDuration');
  const transitionModelEl = document.getElementById('transitionModel');
  const transitionQualityEl = document.getElementById('transitionQuality');
  const transitionMotionModeEl = document.getElementById('transitionMotionMode');
  const transitionSeedEl = document.getElementById('transitionSeed');
  const generateTransitionBtn = document.getElementById('generateTransitionBtn');

  const modeTitleEl = document.getElementById('modeTitle');

  // 当前 img_id
  let firstFrameImgId = null;
  let lastFrameImgId = null;

  // -----------------------------
  // 工具：上传图片到 /api/image-upload，获取 img_id
  // -----------------------------
  async function uploadImageAndGetId(file) {
    const form = new FormData();
    form.append('file', file); // 对应后端 multer.single('file')

    const data = await window.fetchJson(apiBase + '/api/image-upload', {
      method: 'POST',
      body: form
    });

    if (data.ErrCode !== 0) {
      throw new Error(data.ErrMsg || '上传图片到 PixVerse 失败');
    }

    const resp = data.Resp || {};
    if (typeof resp.img_id === 'undefined' || resp.img_id === null) {
      throw new Error('返回中缺少 img_id');
    }
    return resp.img_id;
  }

  // -----------------------------
  // 首帧：选择文件后自动上传
  // -----------------------------

  if (firstFrameFileEl) {
    firstFrameFileEl.addEventListener('change', async () => {
      const file = firstFrameFileEl.files && firstFrameFileEl.files[0];
      if (!file) return;

      // 文件状态文案 & img_id 文案一起变成“上传中…”
      if (firstFrameFileStatus) {
        firstFrameFileStatus.textContent = '上传中…';
        firstFrameFileStatus.style.color = '#ffd84d';
      }

      try {
        const imgId = await uploadImageAndGetId(file);
        firstFrameImgId = imgId;

        // img_id 文案
        firstFrameImgIdText.textContent = String(imgId);
        firstFrameImgIdText.style.color = '';

        // 文件状态文案：文件已上传（绿色）
        if (firstFrameFileStatus) {
          firstFrameFileStatus.textContent = '文件已上传';
          firstFrameFileStatus.style.color = '#3ada72';
        }

      } catch (e) {
        console.error('上传首帧失败', e);
        if (firstFrameFileStatus) {
          firstFrameFileStatus.textContent = '上传失败';
          firstFrameFileStatus.style.color = '#ff8989';
        }
        alert('首帧上传失败：' + e.message);
      }
    });
  }

  // -----------------------------
  // 尾帧：选择文件后自动上传
  // -----------------------------

  if (lastFrameFileEl) {
    lastFrameFileEl.addEventListener('change', async () => {
      const file = lastFrameFileEl.files && lastFrameFileEl.files[0];
      if (!file) return;

      if (lastFrameFileStatus) {
        lastFrameFileStatus.textContent = '上传中…';
        lastFrameFileStatus.style.color = '#ffd84d';
      }

      try {
        const imgId = await uploadImageAndGetId(file);
        lastFrameImgId = imgId;

        lastFrameImgIdText.textContent = String(imgId);
        lastFrameImgIdText.style.color = '';

        if (lastFrameFileStatus) {
          lastFrameFileStatus.textContent = '文件已上传';
          lastFrameFileStatus.style.color = '#3ada72';
        }

      } catch (e) {
        console.error('上传尾帧失败', e);
        if (lastFrameFileStatus) {
          lastFrameFileStatus.textContent = '上传失败';
          lastFrameFileStatus.style.color = '#ff8989';
        }
        alert('尾帧上传失败：' + e.message);
      }
    });
  }

  // -----------------------------
  // 提交首尾帧转视频任务
  // -----------------------------
  if (generateTransitionBtn) {
    generateTransitionBtn.addEventListener('click', async () => {
      const prompt = (transitionPromptEl.value || '').trim();

      if (!firstFrameImgId) {
        alert('请先上传首帧图片并确保获得有效的 img_id');
        return;
      }
      if (!lastFrameImgId) {
        alert('请先上传尾帧图片并确保获得有效的 img_id');
        return;
      }
      if (!prompt) {
        alert('提示词（prompt）不能为空');
        return;
      }

      const duration = Number(transitionDurationEl.value || 5);
      const model = transitionModelEl.value || 'v4.5';
      const quality = transitionQualityEl.value || '540p';
      const motion_mode = transitionMotionModeEl.value || 'normal';

      let seed = (transitionSeedEl.value || '').trim();
      seed = seed === '' ? null : Number(seed);
      if (seed !== null && Number.isNaN(seed)) {
        alert('种子（seed）必须是整数，或留空随机');
        return;
      }

      const body = {
        first_frame_img: firstFrameImgId,
        last_frame_img: lastFrameImgId,
        prompt,
        duration,
        model,
        quality,
        motion_mode
      };
      if (seed !== null) body.seed = seed;

      try {
        generateTransitionBtn.disabled = true;
        generateTransitionBtn.textContent = '提交中…';

        const data = await window.fetchJson(apiBase + '/api/transition-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (data.ErrCode !== 0) {
          throw new Error(data.ErrMsg || '调用首尾帧转视频接口失败');
        }

        const resp = data.Resp || {};
        const videoId = resp.video_id;
        if (!videoId && videoId !== 0) {
          throw new Error('返回中缺少 video_id');
        }

        alert('任务已提交成功，video_id = ' + videoId);

        // 写入历史记录
        window.upsertHistoryRecord({
          id: videoId,
          type: 'transition-video',
          prompt,
          style: null,
          seed: seed === null ? undefined : seed,
          createdAt: new Date().toISOString(),
          lastStatusCode: 5,
          url: null
        });

        // 自动轮询
        window.startAutoPolling(videoId);
      } catch (e) {
        console.error('首尾帧转视频提交失败', e);
        alert('首尾帧转视频提交失败：' + e.message);
      } finally {
        generateTransitionBtn.disabled = false;
        generateTransitionBtn.textContent = '提交首尾帧转视频任务';
      }
    });
  }

  // -----------------------------
  // 顶部标题文案切换
  // -----------------------------
  const tabTransitionRadio = document.getElementById('tab-transition');
  const tabTextRadio = document.getElementById('tab-text');
  const tabImageRadio = document.getElementById('tab-image');
  const tabExtendRadio = document.getElementById('tab-extend');

  function updateModeTitle() {
    if (!modeTitleEl) return;

    if (tabTransitionRadio && tabTransitionRadio.checked) {
      modeTitleEl.textContent = '首尾帧转视频（Transition）';
    } else if (tabExtendRadio && tabExtendRadio.checked) {
      modeTitleEl.textContent = '续写视频（Extend）';
    } else if (tabImageRadio && tabImageRadio.checked) {
      modeTitleEl.textContent = '图片转视频（Image-to-Video）';
    } else {
      modeTitleEl.textContent = '文本转视频（Text-to-Video）';
    }
  }

  [tabTextRadio, tabImageRadio, tabExtendRadio, tabTransitionRadio]
    .filter(Boolean)
    .forEach((radio) => radio.addEventListener('change', updateModeTitle));

  updateModeTitle();
})();
