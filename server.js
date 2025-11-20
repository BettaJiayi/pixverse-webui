// server.js —— PixVerse 本地代理服务（CommonJS 版本）

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const FormData = require('form-data');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const PIXVERSE_API_KEY = process.env.PIXVERSE_API_KEY;
const PIXVERSE_BASE_URL =
  process.env.PIXVERSE_BASE_URL || 'https://app-api.pixverse.ai';

if (!PIXVERSE_API_KEY) {
  console.error('❌ 请在 .env 中配置 PIXVERSE_API_KEY');
  process.exit(1);
}

app.use(cors());
app.use(express.json());

// 静态文件目录（public）
app.use(express.static('public'));

// 用于接收前端上传图片 / 媒体文件的中间件（内存存储）
const upload = multer();

/* ------------------------------------------------------------------ */
/* 工具函数：调用 PixVerse JSON 接口                                   */
/* ------------------------------------------------------------------ */

async function callPixVerse(path, method = 'GET', data = null) {
  const url = `${PIXVERSE_BASE_URL}${path}`;
  const headers = {
    'API-KEY': PIXVERSE_API_KEY,
    'Ai-trace-id': uuidv4()
  };

  const config = { method, url, headers };
  if (data) {
    config.data = data;
  }

  const res = await axios(config);
  return res.data;
}

/* ------------------------------------------------------------------ */
/* 工具函数：上传图片到 PixVerse（/image/upload，字段 image）           */
/* ------------------------------------------------------------------ */

async function uploadImageToPixVerse(file) {
  const url = `${PIXVERSE_BASE_URL}/openapi/v2/image/upload`;

  const form = new FormData();
  form.append('image', file.buffer, {
    filename: file.originalname || 'image.png',
    contentType: file.mimetype || 'application/octet-stream'
  });

  const headers = {
    'API-KEY': PIXVERSE_API_KEY,
    'Ai-trace-id': uuidv4(),
    ...form.getHeaders()
  };

  const res = await axios.post(url, form, { headers });
  return res.data;
}

/* ------------------------------------------------------------------ */
/* 工具函数：上传媒体到 PixVerse（/media/upload，字段 file）            */
/*  — 用于外部视频 / 音频上传                                          */
/* ------------------------------------------------------------------ */

async function uploadMediaToPixVerse(file) {
  const url = `${PIXVERSE_BASE_URL}/openapi/v2/media/upload`;

  const form = new FormData();
  form.append('file', file.buffer, {
    filename: file.originalname || 'media.bin',
    contentType: file.mimetype || 'application/octet-stream'
  });

  const headers = {
    'API-KEY': PIXVERSE_API_KEY,
    'Ai-trace-id': uuidv4(),
    ...form.getHeaders()
  };

  const res = await axios.post(url, form, { headers });
  return res.data;
}

/* ================================================================== */
/* 1) 文本转视频：/api/text-to-video                                   */
/* ================================================================== */

app.post('/api/text-to-video', async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt = '',
      aspect_ratio = '16:9',
      duration = 5,
      model = 'v4.5',
      motion_mode = 'normal',
      quality = '540p',
      // 可选参数
      seed,
      style,
      template_id,
      camera_movement,
      sound_effect_switch = false, // BGM
      sound_effect_content = '',
      // 预留：直接在 TTV / ITV 上使用口型同步参数（可选）
      lip_sync_tts_switch = false,
      lip_sync_tts_content = '',
      lip_sync_tts_speaker_id = 'auto',
      water_mark = false
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt 是必填的' });
    }

    const body = {
      aspect_ratio,
      duration,
      model,
      motion_mode,
      negative_prompt,
      prompt,
      quality,
      water_mark
    };

    // seed（仅当是合法数字时才传）
    if (typeof seed === 'number' && !Number.isNaN(seed)) {
      body.seed = seed;
    }

    // style（有值时才传）
    if (typeof style === 'string' && style.trim() !== '') {
      body.style = style.trim();
    }

    // template_id（特效 / Effects）
    if (
      typeof template_id === 'number' &&
      Number.isFinite(template_id) &&
      !Number.isNaN(template_id)
    ) {
      body.template_id = template_id;
    }

    // camera_movement（镜头运动）
    if (
      typeof camera_movement === 'string' &&
      camera_movement.trim() !== ''
    ) {
      body.camera_movement = camera_movement.trim();
    }

    // 背景音乐：由前端显式决定
    body.sound_effect_switch = !!sound_effect_switch;
    if (body.sound_effect_switch) {
      body.sound_effect_content =
        typeof sound_effect_content === 'string'
          ? sound_effect_content
          : '';
    }

    // 口型同步（Speech 参数，嵌在文本转视频里用）
    if (lip_sync_tts_switch) {
      body.lip_sync_tts_switch = true;
      if (
        typeof lip_sync_tts_content === 'string' &&
        lip_sync_tts_content.trim() !== ''
      ) {
        body.lip_sync_tts_content = lip_sync_tts_content.trim();
      }
      if (
        typeof lip_sync_tts_speaker_id === 'string' &&
        lip_sync_tts_speaker_id.trim() !== ''
      ) {
        body.lip_sync_tts_speaker_id = lip_sync_tts_speaker_id.trim();
      }
    }

    const data = await callPixVerse(
      '/openapi/v2/video/text/generate',
      'POST',
      body
    );

    res.json(data);
  } catch (err) {
    console.error('Text-to-video error:', err.response?.data || err.message);
    res.status(500).json({
      error: '调用 PixVerse 文本转视频接口失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 2) 图片上传：/api/upload-image   （兼容 /api/image-upload）          */
/* ================================================================== */

async function handleImageUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '缺少文件字段 file' });
    }

    const data = await uploadImageToPixVerse(req.file);
    res.json(data);
  } catch (err) {
    console.error('Upload image error:', err.response?.data || err.message);
    res.status(500).json({
      error: '上传图片到 PixVerse 失败',
      detail: err.response?.data || err.message
    });
  }
}

// 建议前端统一用 /api/upload-image + 字段名 file
app.post('/api/upload-image', upload.single('file'), handleImageUpload);
// 兼容旧的 /api/image-upload
app.post('/api/image-upload', upload.single('file'), handleImageUpload);

/* ================================================================== */
/* 3) 图片转视频：/api/image-to-video                                  */
/* ================================================================== */

app.post('/api/image-to-video', async (req, res) => {
  try {
    const {
      img_id,
      prompt = '',
      negative_prompt = '',
      // 官方示例中没写 aspect_ratio，这里可选，传了就带上
      aspect_ratio,
      duration = 5,
      model = 'v4.5',
      motion_mode = 'normal',
      quality = '540p',
      // 可选
      seed,
      style,
      template_id,
      camera_movement,
      sound_effect_switch = false,
      sound_effect_content = '',
      lip_sync_tts_switch = false,
      lip_sync_tts_content = '',
      lip_sync_tts_speaker_id = 'auto',
      water_mark = false
    } = req.body;

    if (!img_id) {
      return res.status(400).json({ error: 'img_id 是必填的' });
    }

    const body = {
      img_id,
      prompt,
      negative_prompt,
      duration,
      model,
      motion_mode,
      quality,
      water_mark
    };

    if (
      typeof aspect_ratio === 'string' &&
      aspect_ratio.trim() !== ''
    ) {
      body.aspect_ratio = aspect_ratio.trim();
    }

    if (typeof seed === 'number' && !Number.isNaN(seed)) {
      body.seed = seed;
    }

    if (typeof style === 'string' && style.trim() !== '') {
      body.style = style.trim();
    }

    if (
      typeof template_id === 'number' &&
      Number.isFinite(template_id) &&
      !Number.isNaN(template_id)
    ) {
      body.template_id = template_id;
    }

    if (
      typeof camera_movement === 'string' &&
      camera_movement.trim() !== ''
    ) {
      body.camera_movement = camera_movement.trim();
    }

    body.sound_effect_switch = !!sound_effect_switch;
    if (body.sound_effect_switch) {
      body.sound_effect_content =
        typeof sound_effect_content === 'string'
          ? sound_effect_content
          : '';
    }

    if (lip_sync_tts_switch) {
      body.lip_sync_tts_switch = true;
      if (
        typeof lip_sync_tts_content === 'string' &&
        lip_sync_tts_content.trim() !== ''
      ) {
        body.lip_sync_tts_content = lip_sync_tts_content.trim();
      }
      if (
        typeof lip_sync_tts_speaker_id === 'string' &&
        lip_sync_tts_speaker_id.trim() !== ''
      ) {
        body.lip_sync_tts_speaker_id = lip_sync_tts_speaker_id.trim();
      }
    }

    const data = await callPixVerse(
      '/openapi/v2/video/img/generate',
      'POST',
      body
    );

    res.json(data);
  } catch (err) {
    console.error('Image-to-video error:', err.response?.data || err.message);
    res.status(500).json({
      error: '调用 PixVerse 图片转视频接口失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 4) 通用媒体上传：/api/media-upload   （视频 / 音频）                  */
/* ================================================================== */

app.post('/api/media-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '缺少文件字段 file' });
    }

    const data = await uploadMediaToPixVerse(req.file);
    res.json(data);
  } catch (err) {
    console.error('Media upload error:', err.response?.data || err.message);
    res.status(500).json({
      error: '上传媒体到 PixVerse 失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 5) Speech / Lip sync：/api/lip-sync-generate                        */
/* ================================================================== */

app.post('/api/lip-sync-generate', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/lip_sync/generate',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error('Lip sync generate error:', err.response?.data || err.message);
    res.status(500).json({
      error: '调用 PixVerse 口型同步接口失败',
      detail: err.response?.data || err.message
    });
  }
});

// 获取 TTS 说话人列表
app.get('/api/lip-sync-tts-list', async (req, res) => {
  try {
    const { page_num = 0, page_size = 0 } = req.query;
    const body = {
      page_num: Number(page_num) || 0,
      page_size: Number(page_size) || 0
    };
    const data = await callPixVerse(
      '/openapi/v2/video/lip_sync/tts_list',
      'GET',
      body
    );
    res.json(data);
  } catch (err) {
    console.error('Lip sync tts list error:', err.response?.data || err.message);
    res.status(500).json({
      error: '获取 lip_sync TTS 列表失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 6) Extend：/api/extend-generate                                     */
/* ================================================================== */

app.post('/api/extend-generate', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/extend/generate',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error('Extend generate error:', err.response?.data || err.message);
    res.status(500).json({
      error: '调用 PixVerse Extend 接口失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 7) Transition（首尾帧）：/api/transition-generate                    */
/* ================================================================== */

app.post('/api/transition-generate', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/transition/generate',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error(
      'Transition generate error:',
      err.response?.data || err.message
    );
    res.status(500).json({
      error: '调用 PixVerse Transition 接口失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 8) 单独的 Sound effects：/api/sound-effect-generate                  */
/* ================================================================== */

app.post('/api/sound-effect-generate', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/sound_effect/generate',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error(
      'Sound effect generate error:',
      err.response?.data || err.message
    );
    res.status(500).json({
      error: '调用 PixVerse sound_effect 接口失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 9) Fusion（Reference-to-video）：/api/fusion-generate                */
/* ================================================================== */

app.post('/api/fusion-generate', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/fusion/generate',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error('Fusion generate error:', err.response?.data || err.message);
    res.status(500).json({
      error: '调用 PixVerse Fusion 接口失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 10) Multi-transition：/api/multi-transition-generate                */
/* ================================================================== */

app.post('/api/multi-transition-generate', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/multi_transition/generate',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error(
      'Multi transition generate error:',
      err.response?.data || err.message
    );
    res.status(500).json({
      error: '调用 PixVerse multi_transition 接口失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 11) Restyle：/api/restyle-generate & /api/restyle-list              */
/* ================================================================== */

app.post('/api/restyle-generate', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/restyle/generate',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error('Restyle generate error:', err.response?.data || err.message);
    res.status(500).json({
      error: '调用 PixVerse Restyle 接口失败',
      detail: err.response?.data || err.message
    });
  }
});

app.get('/api/restyle-list', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/restyle/list',
      'GET',
      null
    );
    res.json(data);
  } catch (err) {
    console.error('Restyle list error:', err.response?.data || err.message);
    res.status(500).json({
      error: '获取 Restyle 列表失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 12) Mask selection & Swap                                           */
/* ================================================================== */

// 获取 mask：/api/mask-selection → video/mask/selection
app.post('/api/mask-selection', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/mask/selection',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error(
      'Mask selection error:',
      err.response?.data || err.message
    );
    res.status(500).json({
      error: '调用 PixVerse mask selection 接口失败',
      detail: err.response?.data || err.message
    });
  }
});

// Swap：/api/swap-generate → video/swap/generate
app.post('/api/swap-generate', async (req, res) => {
  try {
    const data = await callPixVerse(
      '/openapi/v2/video/swap/generate',
      'POST',
      req.body
    );
    res.json(data);
  } catch (err) {
    console.error('Swap generate error:', err.response?.data || err.message);
    res.status(500).json({
      error: '调用 PixVerse Swap 接口失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 13) 查询视频生成状态：/api/video-status/:videoId                     */
/* ================================================================== */

app.get('/api/video-status/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const data = await callPixVerse(
      `/openapi/v2/video/result/${videoId}`,
      'GET'
    );
    res.json(data);
  } catch (err) {
    console.error('Get video status error:', err.response?.data || err.message);
    res.status(500).json({
      error: '查询视频状态失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ================================================================== */
/* 14) 查询账号余额：/api/account-balance                               */
/* ================================================================== */

app.get('/api/account-balance', async (req, res) => {
  try {
    const data = await callPixVerse('/openapi/v2/account/balance', 'GET');
    res.json(data);
  } catch (err) {
    console.error('Get balance error:', err.response?.data || err.message);
    res.status(500).json({
      error: '查询账号余额失败',
      detail: err.response?.data || err.message
    });
  }
});

/* ------------------------------------------------------------------ */
/* X) 首尾帧转视频：/api/transition-video                              */
/*     对应 PixVerse: POST /openapi/v2/video/transition/generate       */
/* ------------------------------------------------------------------ */

app.post('/api/transition-video', async (req, res) => {
  try {
    const {
      first_frame_img,
      last_frame_img,
      prompt,
      model = 'v4.5',
      duration = 5,
      quality = '540p',
      motion_mode = 'normal',
      seed
    } = req.body;

    if (!first_frame_img || !last_frame_img) {
      return res.status(400).json({ error: 'first_frame_img 和 last_frame_img 都是必填的（请先上传两张图片）' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'prompt 是必填的' });
    }

    const body = {
      first_frame_img,
      last_frame_img,
      prompt,
      model,
      duration,
      quality,
      motion_mode
    };

    // 只有 seed 是合法数字才传
    if (typeof seed === 'number' && !Number.isNaN(seed)) {
      body.seed = seed;
    }

    const data = await callPixVerse(
      '/openapi/v2/video/transition/generate',
      'POST',
      body
    );

    res.json(data);
  } catch (err) {
    console.error('Transition(首尾帧) error:', err.response?.data || err.message);
    res.status(500).json({
      error: '调用 PixVerse 首尾帧转视频接口失败',
      detail: err.response?.data || err.message
    });
  }
});



/* ================================================================== */

app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
