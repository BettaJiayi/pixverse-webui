// imageToVideo.js —— 图片转视频（Image-to-Video）相关前端逻辑
(() => {
  const apiBase = window.apiBase || '';

  // DOM
  const imgFileEl = document.getElementById('imgFile');
  const uploadImageBtn = document.getElementById('uploadImageBtn');
  const imgIdTextEl = document.getElementById('imgIdText');

  const imgPromptEl = document.getElementById('imgPrompt');
  const imgNegativePromptEl = document.getElementById('imgNegativePrompt');
  const imgDurationEl = document.getElementById('imgDuration');
  const imgModelEl = document.getElementById('imgModel');
  const imgQualityEl = document.getElementById('imgQuality');
  const imgStyleEl = document.getElementById('imgStyle');
  const imgMotionModeEl = document.getElementById('imgMotionMode');
  const imgSoundSwitchEl = document.getElementById('imgSoundSwitch');
  const imgSoundPromptWrapper = document.getElementById('imgSoundPromptWrapper');
  const imgSoundPromptEl = document.getElementById('imgSoundPrompt');
  const imgSeedEl = document.getElementById('imgSeed');
  const imgTemplateIdEl = document.getElementById('imgTemplateId'); // ★ 新增
  const generateImageBtn = document.getElementById('generateImageBtn');

  let currentImgId = null;

  // =============== 文件状态标签：未选择 / 上传中 / 已上传 ===============
  // 直接拿 HTML 里已有的状态标签，不再重复创建
  let imgFileStatusEl = document.getElementById('imgFileStatus');

  // 保证 file input 有统一的样式（HTML 里已经加了，这句只是兜底）
  if (imgFileEl) {
    imgFileEl.classList.add('transition-file-input');
  }

  function setImgFileStatus(text, color) {
    if (!imgFileStatusEl) return;
    imgFileStatusEl.textContent = text;
    imgFileStatusEl.style.color = color || 'var(--text-muted)';
  }

  // =============== 上传图片，获取 img_id ===============
  async function uploadImageFile(file) {
    if (!file) return;

    setImgFileStatus('上传中…', '#ffd84d');
    imgIdTextEl.textContent = '上传中…';

    try {
      const form = new FormData();
      form.append('file', file);

      const data = await window.fetchJson(apiBase + '/api/upload-image', {
        method: 'POST',
        body: form,
      });

      if (data.ErrCode !== 0) {
        throw new Error(data.ErrMsg || '上传图片失败');
      }

      const resp = data.Resp || {};
      if (typeof resp.img_id === 'undefined' || resp.img_id === null) {
        throw new Error('返回结果中缺少 img_id');
      }

      currentImgId = resp.img_id;
      imgIdTextEl.textContent = String(currentImgId);

      setImgFileStatus('文件已上传', '#3ada72');

      // 显示“重新上传”按钮
      if (uploadImageBtn) {
        uploadImageBtn.style.display = 'inline-flex';
      }
    } catch (e) {
      console.error('上传图片失败', e);
      alert('上传图片失败：' + e.message);
      imgIdTextEl.textContent = '上传失败';
      setImgFileStatus('上传失败', '#ff8989');
    }
  }

  // 选择文件后自动上传
  if (imgFileEl) {
    imgFileEl.addEventListener('change', () => {
      const file = imgFileEl.files && imgFileEl.files[0];
      if (!file) {
        setImgFileStatus('未选择文件', 'var(--text-muted)');
        imgIdTextEl.textContent = '尚未上传图片';
        currentImgId = null;
        if (uploadImageBtn) uploadImageBtn.style.display = 'none';
        return;
      }
      uploadImageFile(file);
    });
  }

  // 原来的上传按钮 → 改成“重新上传”（只在上传成功后显示）
  if (uploadImageBtn && imgFileEl) {
    uploadImageBtn.style.display = 'none';
    uploadImageBtn.textContent = '重新上传';
    uploadImageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      imgFileEl.click();
    });
  }

  // =============== 声音文案显示/隐藏（和文本转视频一致） ===============
  function updateSoundPromptVisibility() {
    if (!imgSoundSwitchEl || !imgSoundPromptWrapper) return;
    const v = imgSoundSwitchEl.value;
    imgSoundPromptWrapper.style.display = v === 'prompt' ? 'block' : 'none';
  }

  if (imgSoundSwitchEl) {
    imgSoundSwitchEl.addEventListener('change', updateSoundPromptVisibility);
    updateSoundPromptVisibility();
  }

  // =============== 提交图片转视频任务 ===============
  if (generateImageBtn) {
    generateImageBtn.addEventListener('click', async () => {
      if (!currentImgId) {
        alert('请先选择图片并等待上传完成，获得有效的 img_id');
        return;
      }

      const prompt = (imgPromptEl.value || '').trim();
      const negativePrompt =
        (imgNegativePromptEl.value || '').trim() || undefined;

      const duration = Number(imgDurationEl.value || 5);
      const model = imgModelEl.value || 'v4.5';
      const quality = imgQualityEl.value || '540p';
      const style = (imgStyleEl.value || '').trim() || undefined;
      const motionMode = imgMotionModeEl.value || 'normal';

      // ✅ 这里改成布尔开关 + 单独内容
      const soundMode = imgSoundSwitchEl ? imgSoundSwitchEl.value : 'off'; // off / auto / prompt
      const soundEffectSwitch = soundMode !== 'off';
      let soundContent = undefined;
      if (soundMode === 'prompt' && imgSoundPromptEl) {
        const s = imgSoundPromptEl.value.trim();
        if (s) soundContent = s;
      }

      let seedRaw = (imgSeedEl.value || '').trim();
      let seed;
      if (!seedRaw) {
        seed = undefined;
      } else {
        seed = Number(seedRaw);
        if (Number.isNaN(seed)) {
          alert('种子必须是 0 ~ 2147483647 之间的整数，留空则随机');
          return;
        }
      }

      let templateId;
      if (imgTemplateIdEl) {
        const templateRaw = (imgTemplateIdEl.value || '').trim();
        if (templateRaw) {
          templateId = Number(templateRaw);
          if (!Number.isInteger(templateId) || templateId <= 0) {
            alert('特效模板 ID（template_id）必须是正整数，或者留空不填');
            return;
          }
        }
      }

      const body = {
        img_id: currentImgId,
        prompt,
        negative_prompt: negativePrompt,
        duration,
        model,
        quality,
        style,
        motion_mode: motionMode,
        seed: seed === undefined ? undefined : seed,
        template_id: templateId === undefined ? undefined : templateId, // ★ 新增
        sound_effect_switch: soundEffectSwitch,
        sound_effect_content: soundContent,
      };

      try {
        generateImageBtn.disabled = true;
        generateImageBtn.textContent = '提交中...';

        const data = await window.fetchJson(apiBase + '/api/image-to-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (
          data.ErrCode !== 0 ||
          !data.Resp ||
          typeof data.Resp.video_id === 'undefined'
        ) {
          throw new Error(data.ErrMsg || '图片转视频接口返回异常');
        }

        const videoId = data.Resp.video_id;
        alert('图片转视频任务提交成功，video_id = ' + videoId);

        // 写入历史记录
        window.upsertHistoryRecord({
          id: videoId,
          type: 'image-to-video',
          prompt,
          style,
          seed,
          createdAt: new Date().toISOString(),
          lastStatusCode: 5,
          url: null,
        });

        // 自动开始轮询
        window.startAutoPolling(videoId);
      } catch (e) {
        console.error('图片转视频提交失败', e);
        alert('图片转视频提交失败：' + e.message);
      } finally {
        generateImageBtn.disabled = false;
        generateImageBtn.textContent = '提交图片转视频任务';
      }
    });
  }
})();
