// extendVideo.js —— 续写视频（Extend）相关前端逻辑
(() => {
  const apiBase = window.apiBase || '';

  // DOM 引用
  const sourceVideoIdEl = document.getElementById('extSourceVideoId');

  const extVideoFileEl = document.getElementById('extVideoFile');
  const extUploadVideoBtn = document.getElementById('extUploadVideoBtn');
  const extMediaIdTextEl = document.getElementById('extMediaIdText');

  const extPromptEl = document.getElementById('extPrompt');
  const extNegativePromptEl = document.getElementById('extNegativePrompt');

  const extDurationEl = document.getElementById('extDuration');
  const extModelEl = document.getElementById('extModel');
  const extQualityEl = document.getElementById('extQuality');
  const extMotionModeEl = document.getElementById('extMotionMode');
  const extSeedEl = document.getElementById('extSeed');
  const extTemplateIdEl = document.getElementById('extTemplateId');

  const generateExtendBtn = document.getElementById('generateExtendBtn');

  let currentMediaId = null;

  // =============== 文件状态标签：未选择 / 上传中 / 已上传 ===============
  // 使用 HTML 中已有的状态标签
  let extFileStatusEl = document.getElementById('extVideoFileStatus');

  if (extVideoFileEl) {
    extVideoFileEl.classList.add('transition-file-input');
  }

  function setExtFileStatus(text, color) {
    if (!extFileStatusEl) return;
    extFileStatusEl.textContent = text;
    if (color) {
      extFileStatusEl.style.color = color;
    } else {
      extFileStatusEl.style.color = '';
    }
  }

  // =============== 上传视频文件 ===============
  async function uploadVideoFile(file) {
    if (!file) return;

    setExtFileStatus('上传中…', '#ffd84d');
    extMediaIdTextEl.textContent = '上传中…';

    try {
      const form = new FormData();
      form.append('file', file);

      const data = await window.fetchJson(apiBase + '/api/media-upload', {
        method: 'POST',
        body: form,
      });

      if (data.ErrCode !== 0) {
        throw new Error(data.ErrMsg || '上传视频失败');
      }

      const resp = data.Resp;
      if (!resp || typeof resp.media_id === 'undefined') {
        throw new Error('返回结果中缺少 media_id');
      }

      currentMediaId = resp.media_id;
      extMediaIdTextEl.textContent = String(currentMediaId);
      setExtFileStatus('文件已上传', '#3ada72');

      // 显示“重新上传”按钮
      if (extUploadVideoBtn) {
        extUploadVideoBtn.style.display = 'inline-flex';
      }
    } catch (e) {
      console.error('上传视频失败', e);
      alert('上传视频失败：' + e.message);
      currentMediaId = null;
      extMediaIdTextEl.textContent = '无';
      setExtFileStatus('上传失败', '#ff4d4f');
    }
  }

  // 选择文件改变时自动上传
  if (extVideoFileEl) {
    extVideoFileEl.addEventListener('change', () => {
      const file = extVideoFileEl.files && extVideoFileEl.files[0];
      if (!file) {
        setExtFileStatus('未选择文件');
        // 不清空 currentMediaId，避免误判“未上传视频”
        return;
      }
      uploadVideoFile(file);
    });
  }

  // 重新上传按钮（重要：清空 value，避免同一个文件不触发 change）
  if (extUploadVideoBtn && extVideoFileEl) {
    // 这个按钮默认当成“重新上传视频”用
    extUploadVideoBtn.textContent = '重新上传视频';
    extUploadVideoBtn.style.display = 'none';

    extUploadVideoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // 清空一下，确保就算选同一个文件也会触发 change
      extVideoFileEl.value = '';
      extVideoFileEl.click();
    });
  }

  // =============== 提交续写任务 ===============
  if (generateExtendBtn) {
    generateExtendBtn.addEventListener('click', async () => {
      const prompt = (extPromptEl.value || '').trim();
      if (!prompt) {
        alert('续写提示词（prompt）不能为空');
        return;
      }

      const sourceVideoId = (sourceVideoIdEl.value || '').trim();
      const hasSourceId = !!sourceVideoId;
      const hasMediaId = !!currentMediaId;

      if (!hasSourceId && !hasMediaId) {
        alert('请至少填写一个已有 video_id，或上传一个本地视频');
        return;
      }

      const negativePrompt =
        (extNegativePromptEl.value || '').trim() || undefined;

      const duration = Number(extDurationEl.value || 5);
      const model = extModelEl.value || 'v4.5';
      const quality = extQualityEl.value || '540p';
      const motionMode = extMotionModeEl.value || 'normal';

      let seedRaw = (extSeedEl.value || '').trim();
      let seed;
      if (!seedRaw) {
        seed = undefined;
      } else {
        seed = Number(seedRaw);
        if (Number.isNaN(seed)) {
          alert('种子（seed）必须是一个整数，或者留空随机');
          return;
        }
      }

      // 解析特效模板 ID（template_id）
      let templateId;
      if (extTemplateIdEl) {
        const templateRaw = (extTemplateIdEl.value || '').trim();
        if (templateRaw) {
          templateId = Number(templateRaw);
          if (!Number.isInteger(templateId) || templateId <= 0) {
            alert('特效模板 ID（template_id）必须是正整数，或者留空不填');
            return;
          }
        }
      }

      const body = {
        prompt,
        negative_prompt: negativePrompt,
        duration,
        model,
        quality,
        motion_mode: motionMode,
        seed: seed === undefined ? undefined : seed,
        template_id: templateId === undefined ? undefined : templateId,
      };

      if (hasSourceId) {
        body.source_video_id = sourceVideoId;
      }
      if (hasMediaId) {
        body.video_media_id = currentMediaId;
      }

      try {
        generateExtendBtn.disabled = true;
        generateExtendBtn.textContent = '提交中...';

        const data = await window.fetchJson(
          apiBase + '/api/extend-generate',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );

        if (
          data.ErrCode !== 0 ||
          !data.Resp ||
          typeof data.Resp.video_id === 'undefined'
        ) {
          throw new Error(data.ErrMsg || '续写视频接口返回异常');
        }

        const videoId = data.Resp.video_id;
        alert('续写视频任务提交成功，video_id = ' + videoId);

        window.upsertHistoryRecord({
          id: videoId,
          type: 'extend-video',
          prompt,
          seed,
          createdAt: new Date().toISOString(),
          lastStatusCode: 5,
          url: null,
        });

        window.startAutoPolling(videoId);
      } catch (e) {
        console.error('续写视频提交失败', e);
        alert('续写视频提交失败：' + e.message);
      } finally {
        generateExtendBtn.disabled = false;
        generateExtendBtn.textContent = '提交续写视频任务';
      }
    });
  }
})();
