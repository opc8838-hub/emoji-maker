'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Check, Download, RefreshCw } from 'lucide-react';

type Step =
  | 'upload'
  | 'generating_styles'
  | 'style_select'
  | 'generating_textures'
  | 'texture_select'
  | 'scene_select'
  | 'pay'
  | 'generating'
  | 'select'
  | 'processing'
  | 'done';
type StyleType = 'line' | '3d' | 'crayon' | 'perler';
type SceneType = 'daily' | 'horse';

interface Sticker {
  id: number;
  text: string;
  action: string;
  state: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8';
  pngUrl?: string;
  selected?: boolean;
}

interface StyleOption {
  id: StyleType;
  name: string;
  emoji: string;
  gradient: string;
  prompt: string;
}

const UPLOAD_COOLDOWN = 5000;
const UPLOAD_MESSAGE = 'AI正在分析照片特征...';
const DEFAULT_RETRIES = 2;
const DOWNLOAD_EXPIRE = 60 * 60 * 1000;

const WATERMARK_CONFIG = {
  text: '预览',
  position: 'bottom-right',
  opacity: 0.3,
  fontSize: 16,
  color: 'white',
};

const ABNORMAL_THRESHOLD = {
  timeWindow: 10 * 60 * 1000,
  maxUploads: 10,
  delayWhenAbnormal: 3000,
};

const MOCK = {
  stylePreview: (style: string) => `https://picsum.photos/400/400?random=style_${style}_${Date.now()}`,
  textureGrid: (style: string, index: number) =>
    `https://picsum.photos/400/400?random=texture_${style}_${index}_${Date.now()}`,
  sticker: (id: number, text: string) =>
    `https://picsum.photos/400/400?random=sticker_${id}_${encodeURIComponent(text)}_${Date.now()}`,
};

const S1_POOL = ['收到', '好的', 'OK', '明白', '行', '可以', '没问题', '知道了', '在的', '好嘞', '收到啦', '安排', '懂了', '马上', '确认', '稳'];
const S2_POOL = ['哈哈哈哈', '笑死', '绷不住了', '确实', '有点东西', '我懂', '对对对', '离谱', '太真实了', '我也是', '服了哈哈'];
const S3_POOL = ['累了', '摆了', '先这样吧', '不想动', '有点困', '缓缓'];
const S4_POOL = ['怪我', '我不行', '下次一定', '我错了', '失误了'];
const S5_POOL = ['谢谢啦', '辛苦了', '爱了', '抱抱', '给你点赞', '太棒了', '牛的', '靠谱', 'respect', 'nice'];
const S6_POOL = ['好耶', '成了', '稳了', '开心', '搞定'];
const S7_POOL = ['麻了', '无语', '我服了', '算了'];
const S8_POOL = ['在路上', '马上到', '等我一下', '出发了', '快到了', '我来了'];

type DailyConfig = { id: number; state: Sticker['state']; textPool: string[]; action: string };

const DAILY_CONFIG: DailyConfig[] = [
  { id: 0, state: 'S1', textPool: S1_POOL, action: '微笑点头，双手自然放在身体前' },
  { id: 1, state: 'S1', textPool: S1_POOL, action: '单手 OK 手势，表情轻松' },
  { id: 2, state: 'S1', textPool: S1_POOL, action: "轻挥手示意'收到'" },
  { id: 3, state: 'S2', textPool: S2_POOL, action: '张嘴大笑，身体前倾' },
  { id: 4, state: 'S2', textPool: S2_POOL, action: '捂嘴偷笑' },
  { id: 5, state: 'S5', textPool: S5_POOL, action: '双手比心' },
  { id: 6, state: 'S5', textPool: S5_POOL, action: '竖起大拇指点赞' },
  { id: 7, state: 'S8', textPool: S8_POOL, action: '小跑姿态（在路上）' },
  { id: 8, state: 'S3', textPool: S3_POOL, action: '微微瘫着，疲惫但不丧' },
  { id: 9, state: 'S4', textPool: S4_POOL, action: '挠头苦笑' },
  { id: 10, state: 'S6', textPool: S6_POOL, action: '双手举起开心跳' },
  { id: 11, state: 'S7', textPool: S7_POOL, action: '双手摊开无语叹气' },
];

const HORSE_FOUR = [
  '马上发财',
  '马上加薪',
  '马上暴富',
  '马上有钱',
  '马上好运',
  '马到成功',
  '新年快乐',
  '恭喜发财',
  '好运连连',
  '财运亨通',
  '福气满满',
  '今年稳赢',
  '马上成功',
  '喜气洋洋',
  '福到财到',
  '一路发财',
  '红红火火',
  '升职加薪',
  '红包多多',
  '稳稳发财',
];

const HORSE_THREE = ['马上发', '马上富', '马上顺', '马上赢', '马上稳', '马上红', '马上乐', '马上财', '马上喜', '马上爽'];

const STYLES: StyleOption[] = [
  {
    id: 'line',
    name: 'Line 风',
    emoji: '🎨',
    gradient: 'from-yellow-400 to-orange-500',
    prompt:
      'Q版 LINE sticker风格，矢量图，白色纯背景#FFFFFF，模切风格（Die-cut），严格保留参考图中的发型和眼镜等头部特征，2x2网格布局的贴纸合集，包含开心、疑惑、大哭、点赞四种情绪，无贴纸效果，无背胶质感，无贴纸白边，人物比例协调萌系，单格形象独立完整，整体画面简洁干净，矢量图清晰无锯齿，干净边缘，生成一张高质量图片',
  },
  {
    id: '3d',
    name: '3D 卡通',
    emoji: '🎭',
    gradient: 'from-blue-400 to-purple-500',
    prompt:
      '以上传的图片肖像为蓝本创作 Q版 3D卡通风格矢量图，白色纯背景#FFFFFF，2x2网格构图，画面包含四个独立形象分别对应开心、疑惑、大哭、点赞四种情绪，严格保留参考图中的头部特征，3D卡通质感柔和，矢量图清晰无锯齿，干净边缘，无贴纸效果，无背胶质感，无贴纸白边，人物比例协调萌系，单格形象独立完整，整体画面简洁干净，生成一张高质量图片',
  },
  {
    id: 'crayon',
    name: '蜡笔手绘',
    emoji: '🖍️',
    gradient: 'from-pink-400 to-rose-500',
    prompt:
      '以上传的图片肖像为蓝本创作 蜡笔手绘风格矢量图，白色纯背景#FFFFFF，2x2网格构图，画面包含四个独立形象分别对应开心、疑惑、大哭、点赞四种情绪，严格保留参考图中的头部特征，蜡笔手绘风格柔和，矢量图清晰无锯齿，干净边缘，无贴纸效果，无背胶质感，无贴纸白边，人物比例协调萌系，单格形象独立完整，整体画面简洁干净，生成一张高质量图片',
  },
  {
    id: 'perler',
    name: '拼豆风',
    emoji: '🔷',
    gradient: 'from-green-400 to-emerald-500',
    prompt:
      '以上传的图片肖像为蓝本创作 Q版 拼豆风格矢量图，白色纯背景#FFFFFF，2x2网格构图，画面包含四个独立形象分别对应开心、疑惑、大哭、点赞四种情绪，严格保留参考图中的头部特征，拼豆风格柔和，矢量图清晰无锯齿，干净边缘，无贴纸效果，无背胶质感，无贴纸白边，人物比例协调萌系，单格形象独立完整，整体画面简洁干净，生成一张高质量图片',
  },
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const shuffle = <T,>(items: T[]) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const getToday = () => new Date().toISOString().slice(0, 10);

const getRetryData = () => {
  if (typeof window === 'undefined') {
    return { date: getToday(), count: DEFAULT_RETRIES };
  }
  const raw = window.localStorage.getItem('emoji_retry');
  if (!raw) return { date: getToday(), count: DEFAULT_RETRIES };
  try {
    const parsed = JSON.parse(raw) as { date: string; count: number };
    if (parsed.date !== getToday()) {
      return { date: getToday(), count: DEFAULT_RETRIES };
    }
    return parsed;
  } catch {
    return { date: getToday(), count: DEFAULT_RETRIES };
  }
};

const setRetryData = (count: number) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('emoji_retry', JSON.stringify({ date: getToday(), count }));
};

const generateHorseTexts = () => {
  const four = shuffle(HORSE_FOUR).slice(0, 9);
  const three = shuffle(HORSE_THREE).slice(0, 3);
  return shuffle([...four, ...three]);
};

export default function EmojiGenerator() {
  const [step, setStep] = useState<Step>('upload');
  const [photo, setPhoto] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<StyleType | null>(null);
  const [selectedTexture, setSelectedTexture] = useState<number>(-1);
  const [selectedScene, setSelectedScene] = useState<SceneType>('daily');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickers, setSelectedStickers] = useState<number[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<number[]>([]);
  const [freeRetries, setFreeRetries] = useState(DEFAULT_RETRIES);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [styleSeed, setStyleSeed] = useState(0);
  const [textureSeed, setTextureSeed] = useState(0);
  const [identityId, setIdentityId] = useState('');
  const [generatingIndex, setGeneratingIndex] = useState(0);
  const [gifStatus, setGifStatus] = useState<boolean[]>(Array.from({ length: 8 }, () => false));

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) return;
    return () => {
      URL.revokeObjectURL(photo);
    };
  }, [photo]);

  useEffect(() => {
    const retryData = getRetryData();
    setFreeRetries(retryData.count);
  }, []);

  const remainingRetries = freeRetries;

  const stylePreviews = useMemo(
    () =>
      STYLES.map(style => ({
        ...style,
        url: MOCK.stylePreview(`${style.id}_${styleSeed}`),
      })),
    [styleSeed],
  );

  const texturePreviews = useMemo(() => {
    if (!selectedStyle) return [];
    return Array.from({ length: 4 }, (_, index) => ({
      id: index,
      label: String(index + 1),
      url: MOCK.textureGrid(selectedStyle, index + textureSeed),
    }));
  }, [selectedStyle, textureSeed]);

  const selectedStyleOption = STYLES.find(style => style.id === selectedStyle);
  const selectedTexturePreview = texturePreviews.find(item => item.id === selectedTexture);

  const handleUpload = async (file?: File) => {
    if (!file) return;
    const isSupported = file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isSupported) {
      setUploadError('仅支持 JPG/PNG 格式的图片');
      return;
    }
    setUploadError('');
    setPhoto(URL.createObjectURL(file));

    const now = Date.now();
    const updatedHistory = [...uploadHistory, now].filter(item => now - item <= ABNORMAL_THRESHOLD.timeWindow);
    setUploadHistory(updatedHistory);
    const abnormalDelay = updatedHistory.length > ABNORMAL_THRESHOLD.maxUploads ? ABNORMAL_THRESHOLD.delayWhenAbnormal : 0;

    setIsUploading(true);
    setStep('generating_styles');
    await sleep(UPLOAD_COOLDOWN + abnormalDelay);
    setStyleSeed(Date.now());
    setIsUploading(false);
    setStep('style_select');
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleUpload(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleUpload(file);
  };

  const useRetry = async () => {
    if (remainingRetries > 0) {
      const next = remainingRetries - 1;
      setFreeRetries(next);
      setRetryData(next);
    }
  };

  const regenerateStyles = async () => {
    await useRetry();
    setSelectedStyle(null);
    setStep('generating_styles');
    await sleep(1200);
    setStyleSeed(Date.now());
    setStep('style_select');
  };

  const regenerateTextures = async () => {
    if (!selectedStyle) return;
    await useRetry();
    setSelectedTexture(-1);
    setStep('generating_textures');
    await sleep(1200);
    setTextureSeed(Date.now());
    setStep('texture_select');
  };

  const handleSelectStyle = (styleId: StyleType) => {
    setSelectedStyle(styleId);
  };

  const generateTextures = async () => {
    if (!selectedStyle) return;
    setSelectedTexture(-1);
    setStep('generating_textures');
    await sleep(1500);
    setTextureSeed(Date.now());
    setStep('texture_select');
  };

  const confirmTexture = () => {
    if (selectedTexture < 0) return;
    const newIdentity = `identity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setIdentityId(newIdentity);
    setStep('scene_select');
  };

  const getSignedDownloadUrl = () => {
    const expireAt = Date.now() + DOWNLOAD_EXPIRE;
    const token = Math.random().toString(36).slice(2);
    return `https://example.com/download?token=${token}&expires=${expireAt}`;
  };

  const generateStickers = async () => {
    setStep('generating');
    setGeneratingIndex(0);

    const usedTexts = new Set<string>();
    const pickText = (pool: string[]) => {
      const available = pool.filter(item => !usedTexts.has(item));
      const choice = (available.length ? available : pool)[Math.floor(Math.random() * (available.length || pool.length))];
      usedTexts.add(choice);
      return choice;
    };

    const texts =
      selectedScene === 'daily'
        ? DAILY_CONFIG.map(config => pickText(config.textPool))
        : generateHorseTexts();

    const results: Sticker[] = [];
    for (let i = 0; i < 12; i += 1) {
      setGeneratingIndex(i + 1);
      let attempts = 0;
      let success = false;
      while (attempts < 3 && !success) {
        attempts += 1;
        await sleep(260);
        success = true;
      }
      const dailyConfig = DAILY_CONFIG[i];
      results.push({
        id: i,
        text: texts[i],
        action: selectedScene === 'daily' ? dailyConfig.action : '与小马互动',
        state: selectedScene === 'daily' ? dailyConfig.state : 'S1',
        pngUrl: MOCK.sticker(i, texts[i]),
      });
    }

    setStickers(results);
    setStep('select');
  };

  const toggleSticker = (id: number) => {
    setSelectedStickers(prev => {
      if (prev.includes(id)) return prev.filter(item => item !== id);
      if (prev.length >= 8) return prev;
      return [...prev, id];
    });
  };

  const generateGIFs = async () => {
    setStep('processing');
    setProgress(0);
    setGifStatus(Array.from({ length: 8 }, () => false));
    for (let i = 0; i < 8; i += 1) {
      await sleep(400);
      setGifStatus(prev => prev.map((item, index) => (index === i ? true : item)));
      setProgress(Math.round(((i + 1) / 8) * 100));
    }
    setStep('done');
  };

  const reset = () => {
    setStep('upload');
    setPhoto('');
    setSelectedStyle(null);
    setSelectedTexture(-1);
    setSelectedScene('daily');
    setStickers([]);
    setSelectedStickers([]);
    setProgress(0);
    setIsUploading(false);
    setUploadHistory([]);
    setStyleSeed(0);
    setTextureSeed(0);
    setIdentityId('');
    setGeneratingIndex(0);
    setGifStatus(Array.from({ length: 8 }, () => false));
  };

  const sceneLabel = selectedScene === 'daily' ? '日常版' : '马年限定版';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4 pb-24">
      <h1 className="text-3xl font-bold text-center mb-2 text-blue-600">一键生成表情包</h1>
      <p className="text-center text-gray-500 mb-8">12张静态PNG + 8张动态GIF = ¥6.9</p>

      <AnimatePresence mode="wait">
        {step === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-md mx-auto">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleFileInput} className="hidden" id="upload" />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-4 border-dashed rounded-3xl p-12 text-center bg-white cursor-pointer transition ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-blue-300 hover:bg-blue-50'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-16 h-16 mx-auto text-blue-400 mb-4" />
              <p className="text-lg font-semibold text-gray-700">点击上传照片</p>
              <p className="text-sm text-gray-400 mt-2">支持 JPG、PNG</p>
              {uploadError && <p className="text-sm text-red-500 mt-3">{uploadError}</p>}
            </div>
            {photo && (
              <div className="mt-6 text-center">
                <img src={photo} className="w-28 h-28 rounded-full mx-auto object-cover border-4 border-white shadow-lg" />
                <p className="text-sm text-gray-500 mt-2">已上传照片</p>
              </div>
            )}
          </motion.div>
        )}

        {step === 'generating_styles' && (
          <motion.div key="gen_styles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-6" />
            <h3 className="text-xl font-bold">AI正在生成4种风格预览...</h3>
            <p className="text-sm text-gray-500 mt-2">AI正在处理，请稍候...</p>
          </motion.div>
        )}

        {step === 'style_select' && (
          <motion.div key="style_select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">选择你喜欢的风格</h2>
                <p className="text-sm text-gray-500 mt-1">自动生成4种风格预览</p>
              </div>
              <button
                onClick={regenerateStyles}
                className="text-sm text-blue-600 font-semibold px-3 py-2 rounded-full bg-blue-50 hover:bg-blue-100 transition"
              >
                我们换个感觉（{remainingRetries > 0 ? `还剩${remainingRetries}次` : '¥1换一批'}）
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {stylePreviews.map((style) => (
                <button
                  key={style.id}
                  onClick={() => handleSelectStyle(style.id)}
                  className={`relative rounded-2xl overflow-hidden border-4 transition ${selectedStyle === style.id ? 'border-blue-500 ring-4 ring-blue-200' : 'border-transparent'}`}
                >
                  <div className="bg-white">
                    <img src={style.url} className="w-full h-36 object-cover" />
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-white/90 px-3 py-2 text-sm font-bold text-gray-700 flex items-center justify-between">
                    <span>{style.name}</span>
                    <span className="text-xs text-gray-400">{style.emoji}</span>
                  </div>
                  <div
                    className="absolute bottom-2 right-2 text-white text-sm"
                    style={{ opacity: WATERMARK_CONFIG.opacity }}
                  >
                    {WATERMARK_CONFIG.text}
                  </div>
                  {selectedStyle === style.id && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-8 max-w-md mx-auto">
              <button
                onClick={generateTextures}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-bold shadow-lg hover:opacity-90 disabled:opacity-50"
                disabled={!selectedStyle}
              >
                下一步：生成4种形象
              </button>
            </div>
          </motion.div>
        )}

        {step === 'generating_textures' && (
          <motion.div key="gen_textures" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-6" />
            <h3 className="text-xl font-bold">正在生成4种形象...</h3>
            <p className="text-sm text-gray-500 mt-2">同一风格不同seed，稍等片刻</p>
          </motion.div>
        )}

        {step === 'texture_select' && (
          <motion.div key="texture_select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">选择最像你的形象</h2>
                <p className="text-sm text-gray-500 mt-1">同一种风格，生成4种细微差异</p>
              </div>
              <button
                onClick={regenerateTextures}
                className="text-sm text-blue-600 font-semibold px-3 py-2 rounded-full bg-blue-50 hover:bg-blue-100 transition"
              >
                我们换个感觉（{remainingRetries > 0 ? `还剩${remainingRetries}次` : '¥1换一批'}）
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {texturePreviews.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedTexture(item.id)}
                  className={`relative rounded-2xl overflow-hidden border-4 transition ${selectedTexture === item.id ? 'border-blue-500' : 'border-transparent'}`}
                >
                  <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">形象 {item.label}</div>
                  <div className="bg-white">
                    <img src={item.url} className="w-full h-40 object-cover" />
                  </div>
                  <div
                    className="absolute bottom-2 right-2 text-white text-sm"
                    style={{ opacity: WATERMARK_CONFIG.opacity }}
                  >
                    {WATERMARK_CONFIG.text}
                  </div>
                  {selectedTexture === item.id && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-8 max-w-md mx-auto">
              <button
                onClick={confirmTexture}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-bold shadow-lg hover:opacity-90 disabled:opacity-50"
                disabled={selectedTexture < 0}
              >
                确认形象，选择场景
              </button>
            </div>
          </motion.div>
        )}

        {step === 'scene_select' && (
          <motion.div key="scene_select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-3xl mx-auto">
            <h2 className="text-xl font-bold text-center mb-6">选择你的表情包场景</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedScene('daily')}
                className={`p-6 rounded-3xl text-left text-white shadow-lg bg-gradient-to-br from-blue-400 to-cyan-400 relative transition ${selectedScene === 'daily' ? 'border-4 border-blue-500 scale-[1.02]' : 'border-4 border-transparent hover:scale-[1.02]'}`}
              >
                <div className="text-3xl mb-2">😊</div>
                <h3 className="text-lg font-bold">日常表情包</h3>
                <p className="text-sm opacity-90">12 PNG + 8 GIF</p>
                <p className="text-sm opacity-80 mt-2">收到、好的、哈哈哈哈等日常用语</p>
              </button>
              <button
                onClick={() => setSelectedScene('horse')}
                className={`p-6 rounded-3xl text-left text-white shadow-lg bg-gradient-to-br from-red-500 to-yellow-500 relative transition ${selectedScene === 'horse' ? 'border-4 border-red-600 scale-[1.02]' : 'border-4 border-transparent hover:scale-[1.02]'}`}
              >
                <div className="text-3xl mb-2">🐴🧧</div>
                <h3 className="text-lg font-bold">马年限定版</h3>
                <p className="text-sm opacity-90">12 PNG + 8 GIF</p>
                <p className="text-sm opacity-80 mt-2">马上发财、新年快乐等春节用语</p>
                <span className="absolute top-3 right-3 bg-red-600 text-white text-xs px-2 py-1 rounded-full">限时上线</span>
              </button>
            </div>
            <div className="mt-8 bg-white rounded-2xl shadow-lg p-6 text-center">
              <p className="text-gray-600">已选场景：{sceneLabel}</p>
              <p className="text-gray-600 mt-1">12张表情包图片 + 8张动态GIF</p>
              <div className="text-3xl font-bold text-blue-600 mt-3">¥6.9</div>
              <button
                onClick={() => setStep('pay')}
                className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700"
              >
                立即支付
              </button>
            </div>
          </motion.div>
        )}

        {step === 'pay' && (
          <motion.div key="pay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-md mx-auto">
            <div className="bg-white rounded-3xl shadow-xl p-6">
              <h2 className="text-lg font-bold mb-4 text-center">订单确认</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${selectedStyleOption?.gradient ?? 'from-blue-400 to-purple-500'} text-white flex items-center justify-center text-xl`}>
                  {selectedStyleOption?.emoji ?? '🎨'}
                </div>
                <div>
                  <p className="font-semibold">{selectedStyleOption?.name ?? '已选风格'}</p>
                  <p className="text-xs text-gray-500">identity_id: {identityId.slice(0, 10)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-20 h-20 rounded-2xl bg-white border-2 border-gray-100 overflow-hidden">
                  {selectedTexturePreview && <img src={selectedTexturePreview.url} className="w-full h-full object-cover" />}
                </div>
                <div>
                  <p className="font-semibold">已选形象</p>
                  <p className="text-xs text-gray-500">白底预览，文案后期叠字</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm">
                <div className="flex justify-between mb-2">
                  <span>表情包套餐</span>
                  <span>12张静态PNG + 8张动态GIF</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>场景类型</span>
                  <span>{sceneLabel}</span>
                </div>
                <div className="border-t pt-2 flex justify-between items-end">
                  <span className="text-gray-600">总价</span>
                  <span className="text-3xl font-bold text-blue-600">¥6.9</span>
                </div>
              </div>
              <button
                onClick={generateStickers}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-bold shadow-lg hover:opacity-90"
              >
                立即支付
              </button>
              <p className="text-xs text-gray-400 text-center mt-3">支持微信支付 · 7天无理由</p>
            </div>
          </motion.div>
        )}

        {step === 'generating' && (
          <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-6" />
            <h3 className="text-xl font-bold">AI正在绘制12张专属表情...</h3>
            <p className="text-sm text-gray-500 mt-2">正在生成第 {generatingIndex} 张...</p>
          </motion.div>
        )}

        {step === 'select' && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="text-center mb-4 sticky top-0 bg-gradient-to-br from-blue-50 to-purple-50 py-2">
              <h2 className="font-bold text-lg">选择8张制作动态表情</h2>
              <p className="text-sm text-gray-500 mt-1">已选 {selectedStickers.length}/8</p>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {stickers.map((sticker) => (
                <div
                  key={sticker.id}
                  onClick={() => toggleSticker(sticker.id)}
                  className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition ${selectedStickers.includes(sticker.id) ? 'border-blue-500' : 'border-transparent'} ${selectedStickers.length >= 8 && !selectedStickers.includes(sticker.id) ? 'opacity-50' : ''}`}
                >
                  <img src={sticker.pngUrl} className="w-full h-28 object-cover" />
                  <div className="bg-white/90 p-2 text-center text-xs font-semibold">{sticker.text}</div>
                  {selectedStickers.includes(sticker.id) && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
              <div className="text-sm text-gray-500 mb-2 text-center">已选 {selectedStickers.length}/8</div>
              <button
                onClick={generateGIFs}
                disabled={selectedStickers.length !== 8}
                className={`w-full py-3 rounded-xl font-bold transition ${selectedStickers.length === 8 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}
              >
                生成动态表情
              </button>
            </div>
          </motion.div>
        )}

        {step === 'processing' && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-16">
            <div className="w-64 h-2 bg-gray-200 rounded-full mx-auto mb-6 overflow-hidden">
              <motion.div className="h-full bg-purple-500" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
            </div>
            <h3 className="text-xl font-bold">制作动态效果...</h3>
            <p className="text-sm text-gray-500 mt-2">{progress}%</p>
            <div className="grid grid-cols-4 gap-3 max-w-xs mx-auto mt-6">
              {gifStatus.map((done, index) => (
                <div key={index} className={`h-12 rounded-xl flex items-center justify-center text-sm ${done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {done ? '✓' : '...'}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-12">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 text-white text-3xl">✓</div>
            <h3 className="text-2xl font-bold mb-2">制作完成！</h3>
            <p className="text-gray-600 mb-8">获得12张静态PNG + 8张动态GIF</p>
            <div className="flex gap-3 max-w-md mx-auto">
              <button
                onClick={() => {
                  const url = getSignedDownloadUrl();
                  window.open(url, '_blank');
                }}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                下载全部
              </button>
              <button
                onClick={reset}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                再做一套
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">下载链接1小时内有效</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}