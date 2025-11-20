// textToVideo.js - 文本转视频逻辑

(function () {
  const apiBase = window.apiBase || '';
  const fetchJson = window.fetchJson;
  const startAutoPolling = window.startAutoPolling;
  const upsertHistoryRecord = window.upsertHistoryRecord;

  if (!fetchJson || !startAutoPolling || !upsertHistoryRecord) {
    console.warn('PixVerse common helpers not found, skip textToVideo init.');
    return;
  }

  const promptEl = document.getElementById('txtPrompt');
  if (!promptEl) return; // 页面上没有对应区域时直接退出

  const negativePromptEl = document.getElementById('txtNegativePrompt');
  const aspectRatioEl = document.getElementById('txtAspectRatio');
  const durationEl = document.getElementById('txtDuration');
  const modelEl = document.getElementById('txtModel');
  const qualityEl = document.getElementById('txtQuality');
  const styleEl = document.getElementById('txtStyle');
  const motionModeEl = document.getElementById('txtMotionMode');
  const soundSwitchEl = document.getElementById('txtSoundSwitch');
  const soundPromptEl = document.getElementById('txtSoundPrompt');
  const seedEl = document.getElementById('txtSeed');
  const generateBtn = document.getElementById('generateTextBtn');
  const txtTemplateIdEl = document.getElementById('txtTemplateId'); // ★ 新增
  const statusVideoIdInput = document.getElementById('statusVideoId');

  // --- 背景音乐描述显示 / 隐藏 ---
  function updateSoundPromptVisibility() {
    if (!soundPromptEl) return;
    const row = soundPromptEl.closest('.form-label') || soundPromptEl;
    const mode = soundSwitchEl ? soundSwitchEl.value : 'off';
    if (mode === 'prompt') {
      row.style.display = '';
    } else {
      row.style.display = 'none';
      soundPromptEl.value = '';
    }
  }

  if (soundSwitchEl) {
    soundSwitchEl.addEventListener('change', updateSoundPromptVisibility);
  }
  updateSoundPromptVisibility(); // 初始化时根据默认值（off）隐藏

  // fast 模式限制：只允许 5 秒
  if (motionModeEl && durationEl) {
    motionModeEl.addEventListener('change', () => {
      if (motionModeEl.value === 'fast' && durationEl.value === '8') {
        alert('fast 动作模式当前只支持 5 秒，已自动为你切换到 5 秒。');
        durationEl.value = '5';
      }
    });
  }

  // --- 提交文本转视频任务 ---
  generateBtn.addEventListener('click', async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      alert('提示词（prompt）不能为空');
      return;
    }

    // 再兜一层 fast 限制
    if (motionModeEl && durationEl &&
        motionModeEl.value === 'fast' && durationEl.value === '8') {
      alert('fast 动作模式只支持 5 秒，已自动将时长切换为 5 秒。');
      durationEl.value = '5';
    }

    const style = styleEl ? styleEl.value : '';
    const soundMode = soundSwitchEl ? soundSwitchEl.value : 'off'; // off / auto / prompt
    const soundPrompt = soundPromptEl ? soundPromptEl.value.trim() : '';

    // 解析种子
    const seedRaw = seedEl ? seedEl.value.trim() : '';
    let seed;
    const MAX_SEED = 2147483647;
    if (seedRaw !== '') {
      const n = Number(seedRaw);
      if (!Number.isInteger(n) || n < 0 || n > MAX_SEED) {
        alert('种子必须是 0 ~ 2147483647 之间的整数，留空则随机');
        return;
      }
      seed = n;
    }
    let templateId;
    if (txtTemplateIdEl) {
    const templateRaw = (txtTemplateIdEl.value || '').trim();
    if (templateRaw) {
        templateId = Number(templateRaw);
        if (!Number.isInteger(templateId) || templateId <= 0) {
        alert('特效模板 ID（template_id）必须是正整数，或者留空不填');
        return;
        }
    }
    }

    // 组装请求体
    const body = {
      prompt,
      negative_prompt: negativePromptEl ? negativePromptEl.value.trim() : '',
      aspect_ratio: aspectRatioEl ? aspectRatioEl.value : '16:9',
      duration: Number(durationEl ? durationEl.value : 5) || 5,
      model: modelEl ? modelEl.value : 'v4.5',
      quality: qualityEl ? qualityEl.value : '540p',
      motion_mode: motionModeEl ? motionModeEl.value : 'normal',
      template_id: templateId === undefined ? undefined : templateId, // ★ 新增
    };

    if (style) body.style = style;
    if (seed !== undefined) body.seed = seed;

    // 背景音乐参数
    if (soundMode === 'off') {
      body.sound_effect_switch = false;
    } else {
      body.sound_effect_switch = true;
      body.sound_effect_content = soundMode === 'prompt' ? (soundPrompt || '') : '';
    }

    try {
      generateBtn.disabled = true;
      generateBtn.textContent = '提交中...';

      const data = await fetchJson(apiBase + '/api/text-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (data && data.ErrCode === 0 && data.Resp && typeof data.Resp.video_id !== 'undefined') {
        const videoId = data.Resp.video_id;
        const createdAt = new Date().toISOString();

        upsertHistoryRecord({
          id: videoId,
          source: 'text',
          prompt,
          style: style || '',
          seed: seed === undefined ? null : seed,
          sound_effect: soundMode,
          createdAt,
          lastStatusCode: 5,
          url: null,
          duration: body.duration,
          aspect_ratio: body.aspect_ratio,
          model: body.model,
          quality: body.quality,
          motion_mode: body.motion_mode,
          img_id: null
        });

        if (statusVideoIdInput) {
          statusVideoIdInput.value = videoId;
        }

        alert('任务创建成功！video_id = ' + videoId);
        startAutoPolling(videoId);
      } else if (data && data.ErrCode === 400017 && style) {
        // PixVerse 对某些 style 返回 invalid param，将错误信息展示给用户
        const msg = data.ErrMsg || 'invalid param';
        alert(
          '当前模型暂不支持所选画面风格（' +
          style +
          '）。\n\n后端返回：' +
          msg
        );
      } else {
        alert('创建失败：' + (data && data.ErrMsg ? data.ErrMsg : JSON.stringify(data)));
      }
    } catch (e) {
      // fetchJson 在 HTTP 非 2xx 时会 throw，message 里是原始文本
      let backend = null;
      try {
        backend = JSON.parse(e.message);
      } catch (_) {}

      const errMsg =
        backend?.detail?.ErrMsg ||
        backend?.ErrMsg ||
        backend?.error ||
        e.message;

      if (backend && backend.detail && backend.detail.ErrCode === 400017 && style) {
        alert(
          '当前模型暂不支持所选画面风格（' +
          style +
          '）。\n\n后端返回：' +
          errMsg
        );
      } else {
        alert('请求出错：' + errMsg);
      }
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '提交文本转视频任务';
    }
  });
})();
