import { useState, useRef, useEffect } from 'react';

// ============ 配色与字体 ============
const C = {
  bg: '#FAF5EE',
  card: '#FFFEFB',
  ink: '#2A2520',
  inkMuted: '#6B6258',
  primary: '#3F4A3C',
  primaryHover: '#2F3A2C',
  border: '#E8DFD0',
  borderStrong: '#C4B59A',
  warm: '#8B7355',
  warning: '#A6533D',
  success: '#5C7A4D',
};

const FONT_SERIF = '"Songti SC", "STSong", Georgia, "Noto Serif SC", serif';
const FONT_SANS = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

// ============ 解析逻辑 ============
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTextToMessages(text, userName, charName) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const userPrefix = /^USER\s*[:：]\s*/i;
  const charPrefix = new RegExp(`^${escapeRegex(charName)}\\s*[:：]\\s*`);

  const messages = [];
  let currentSpeaker = null;
  let currentContent = [];
  const openingContent = [];
  let foundFirstUser = false;
  let skipped = 0;

  function commit() {
    if (currentSpeaker && currentContent.length > 0) {
      messages.push({ speaker: currentSpeaker, content: currentContent.join('') });
    }
    currentContent = [];
  }

  for (const line of lines) {
    let speaker = null;
    let content = '';

    if (userPrefix.test(line)) {
      speaker = 'user';
      content = line.replace(userPrefix, '');
    } else if (charPrefix.test(line)) {
      speaker = 'character';
      content = line.replace(charPrefix, '');
    } else if (
      (line.startsWith('(') || line.startsWith('（')) &&
      (line.endsWith(')') || line.endsWith('）'))
    ) {
      speaker = null;
      content = line;
    } else {
      skipped++;
      continue;
    }

    if (!foundFirstUser) {
      if (speaker === 'user') {
        foundFirstUser = true;
        if (openingContent.length > 0) {
          messages.push({ speaker: 'character', content: openingContent.join('') });
        }
        currentSpeaker = 'user';
        currentContent = [content];
      } else {
        openingContent.push(content);
      }
    } else {
      if (speaker === null || speaker === currentSpeaker) {
        currentContent.push(content);
      } else {
        commit();
        currentSpeaker = speaker;
        currentContent = [content];
      }
    }
  }

  if (!foundFirstUser && openingContent.length > 0) {
    messages.push({ speaker: 'character', content: openingContent.join('') });
  } else {
    commit();
  }

  return { messages, skipped };
}

// ============ 时间格式 ============
function pad(n) {
  return String(n).padStart(2, '0');
}

// 仅用于预览区展示起始时间（人类可读），不写进文件
function formatDisplayDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 导出文件名用的时间戳：用下载这一刻的时间，避免多个版本互相覆盖
function timestampForFilename(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ============ 时间识别 ============
function extractStartDate(text) {
  const head = text.slice(0, 2000);
  let m;
  m = head.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2})[:：](\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  m = head.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})[:：](\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  m = head.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 18, 0);
  m = head.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 18, 0);
  return null;
}

// ============ 工具函数 ============
function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function chatIdHash() {
  return Math.floor(Math.random() * 9e14) + 1e14;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 字段顺序对齐新版 ST 导出：chat_metadata 在前，user_name/character_name 在后；
// 不再写 create_date（新版 Android/Windows 都没有这个字段）
function buildMetadata(userName, charName) {
  return {
    chat_metadata: {
      integrity: uuid4(),
      chat_id_hash: chatIdHash(), // Android 新版没有，但多写无害，对 Windows 老版本兼容更好
      note_prompt: '',
      note_interval: 1,
      note_position: 1,
      note_depth: 4,
      note_role: 0,
      timedWorldInfo: { sticky: {}, cooldown: {} },
      variables: {},
      tainted: false,
      lastInContextMessageId: 0,
    },
    user_name: userName,
    character_name: charName,
  };
}

function buildMessageObjects(messages, userName, charName, startDate) {
  let current = new Date(startDate);
  return messages.map((msg) => {
    const date = new Date(current);
    const isUser = msg.speaker === 'user';
    const obj = {
      name: isUser ? userName : charName,
      is_user: isUser,
      is_system: false,
      send_date: date.toISOString(),
      mes: msg.content,
      extra: isUser ? { isSmallSys: false, reasoning: '' } : {},
    };
    current = new Date(current.getTime() + (2 + Math.random() * 3) * 60 * 1000);
    return obj;
  });
}

function generateJsonl(metadata, messageObjects) {
  return [JSON.stringify(metadata), ...messageObjects.map((o) => JSON.stringify(o))].join('\n');
}

// ============ 样式 ============
const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  fontSize: 14,
  fontFamily: FONT_SANS,
  color: C.ink,
  background: '#FDFBF6',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtnStyle = {
  width: '100%',
  padding: '14px',
  background: C.primary,
  color: '#FBF6EC',
  border: 'none',
  borderRadius: 4,
  fontSize: 14,
  fontFamily: FONT_SANS,
  fontWeight: 600,
  letterSpacing: 2,
  cursor: 'pointer',
};

const secondaryBtnStyle = {
  width: '100%',
  padding: '12px',
  background: 'transparent',
  color: C.primary,
  border: `1px solid ${C.primary}`,
  borderRadius: 4,
  fontSize: 13,
  fontFamily: FONT_SANS,
  fontWeight: 500,
  letterSpacing: 1,
  cursor: 'pointer',
};

const uploadBtnStyle = {
  display: 'inline-block',
  padding: '6px 12px',
  border: `1px dashed ${C.borderStrong}`,
  borderRadius: 4,
  color: C.warm,
  fontSize: 12,
  cursor: 'pointer',
  background: 'transparent',
};

const clearBtnStyle = {
  padding: '6px 12px',
  background: 'transparent',
  border: 'none',
  color: C.inkMuted,
  fontSize: 12,
  cursor: 'pointer',
};

// 顶部提示框（浅黄，跟正文卡片视觉区分）
const noticeBoxStyle = {
  background: '#FBF3D8',
  border: '1px solid #E6D08A',
  borderRadius: 6,
  padding: '14px 16px',
  marginBottom: 24,
  fontSize: 13,
  lineHeight: 1.7,
  color: '#6B5A2A',
};

const codeChipStyle = {
  background: '#F0E4B8',
  padding: '1px 6px',
  borderRadius: 3,
  fontFamily: 'ui-monospace, "SF Mono", monospace',
  fontSize: 12,
};

// ============ UI 子组件 ============
function Section({ title }) {
  return (
    <div
      style={{
        fontFamily: FONT_SERIF,
        fontSize: 16,
        color: C.primary,
        marginBottom: 12,
        letterSpacing: 1,
        fontWeight: 600,
      }}
    >
      {title}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

// ============ 主组件 ============
export default function App() {
  const [userName, setUserName] = useState('');
  const [charName, setCharName] = useState('');
  const [text, setText] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [preview, setPreview] = useState(null);
  const [hint, setHint] = useState('');
  const previewRef = useRef(null);

  // 解析出预览后自动滚到结果区，避免用户以为"点了没反应"而没发现折叠线下方还有内容
  useEffect(() => {
    if (preview && previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [preview]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result);
    reader.readAsText(file);
  };

  const doParse = () => {
    setHint('');
    setPreview(null);

    const u = userName.trim();
    const c = charName.trim();

    if (!u) return setHint('先告诉我你的名字');
    if (!c) return setHint('先告诉我 TA 的名字');
    if (!text.trim()) return setHint('把对话粘进文本框，或者上传 txt 文件');

    const { messages, skipped } = parseTextToMessages(text, u, c);
    if (messages.length === 0) {
      return setHint(`没识别出对话。检查一下文本是不是 "USER: ..." 和 "${c}: ..." 这样的格式开头`);
    }

    // 只识别到单方发言，通常是"TA 叫什么"跟源文本里的名字对不上
    const userCount = messages.filter((m) => m.speaker === 'user').length;
    const charCount = messages.filter((m) => m.speaker === 'character').length;
    if (userCount === 0 || charCount === 0) {
      setPreview(null);
      return setHint(
        `看起来角色名跟源文本对不上——只识别到了 ${userCount === 0 ? '一方' : '另一方'} 的发言。请检查"TA 叫什么"填的是不是跟 Gemini 输出文本里的角色名一字不差，然后重新生成。`,
      );
    }

    let startDate;
    let source;
    if (customStart) {
      const d = new Date(customStart);
      if (isNaN(d.getTime())) {
        return setHint('自定义起始时间格式有问题');
      }
      startDate = d;
      source = '你设的';
    } else {
      const ex = extractStartDate(text);
      if (ex) {
        startDate = ex;
        source = '从文本里读到的';
      } else {
        startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        source = '默认（今天往前推 30 天）';
      }
    }

    setPreview({ messages, startDate, source, skipped });
  };

  const doDownload = (testOnly = false) => {
    if (!preview) return;
    const u = userName.trim();
    const c = charName.trim();
    const msgs = testOnly ? preview.messages.slice(0, 3) : preview.messages;
    const metadata = buildMetadata(u, c);
    const objects = buildMessageObjects(msgs, u, c, preview.startDate);
    const jsonl = generateJsonl(metadata, objects);
    const suffix = testOnly ? '_前3条测试' : '';
    downloadFile(`${c}_${timestampForFilename()}${suffix}.jsonl`, jsonl);
  };

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        fontFamily: FONT_SANS,
        color: C.ink,
        padding: '24px 16px 48px',
      }}
    >
      <style>{`
        input:focus, textarea:focus {
          border-color: ${C.borderStrong} !important;
          background: #FFFEF8 !important;
        }
        button:hover { opacity: 0.9; }
        button:active { transform: translateY(1px); }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* 底部反馈卡片（搬自 feedback_card_mockup.html） */
        .feedback-card {
          margin-top: 24px;
          background: linear-gradient(180deg, #FBF4E0 0%, #F7ECCE 100%);
          border: 1px solid #D4C5A9;
          border-radius: 8px;
          padding: 22px 20px;
          position: relative;
          overflow: hidden;
        }
        .feedback-card::before {
          content: '';
          position: absolute;
          top: -8px;
          left: -8px;
          right: -8px;
          height: 4px;
          background: repeating-linear-gradient(
            90deg,
            #C4B59A 0,
            #C4B59A 6px,
            transparent 6px,
            transparent 12px
          );
          opacity: 0.4;
        }
        .feedback-title {
          font-family: ${FONT_SERIF};
          font-size: 19px;
          color: #3F4A3C;
          font-weight: 600;
          letter-spacing: 2px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .feedback-icon {
          display: inline-block;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #3F4A3C;
          color: #FBF6EC;
          font-size: 13px;
          text-align: center;
          line-height: 22px;
          font-family: serif;
          font-style: italic;
        }
        .feedback-text {
          font-size: 13px;
          color: #5C4E40;
          line-height: 1.75;
          margin-bottom: 16px;
        }
        .account-block {
          background: rgba(255, 255, 255, 0.5);
          border: 1px dashed #B89B6E;
          border-radius: 6px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .account-line {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: wrap;
        }
        .account-label {
          font-size: 11px;
          color: #8B7355;
          letter-spacing: 2px;
        }
        .account-value {
          font-family: "Songti SC", "STSong", serif;
          font-size: 18px;
          color: #3F4A3C;
          font-weight: 600;
          letter-spacing: 1px;
        }
        .account-id {
          font-family: "SF Mono", "Menlo", monospace;
          font-size: 13px;
          color: #6B6258;
          background: rgba(255,255,255,0.6);
          padding: 2px 8px;
          border-radius: 3px;
          letter-spacing: 1px;
        }
        .copy-hint {
          font-size: 11px;
          color: #8B7355;
          margin-top: 4px;
          font-style: italic;
        }
        .feedback-divider {
          width: 30px;
          height: 1px;
          background: #C4B59A;
          margin: 14px auto;
        }
        .feedback-footer {
          margin-top: 14px;
          font-size: 11px;
          color: #8B7355;
          text-align: center;
          line-height: 1.6;
        }
      `}</style>

      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* 头部（对齐 og-image.png 横幅设计） */}
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          {/* 顶部细线 */}
          <div style={{ height: 1, background: C.borderStrong, opacity: 0.55, marginBottom: 22 }} />
          {/* 眉标 */}
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 12,
              color: C.warm,
              letterSpacing: 6,
              marginBottom: 18,
            }}
          >
            SHUKEITEI · ST · CHATLOG
          </div>
          {/* 标题 */}
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 32,
              color: C.primary,
              fontWeight: 600,
              letterSpacing: 5,
              marginBottom: 16,
            }}
          >
            把白月光接回家
          </div>
          {/* 中间带小圆点的装饰分隔线 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: 150,
              margin: '0 auto 16px',
            }}
          >
            <div style={{ flex: 1, height: 1, background: C.borderStrong }} />
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                border: `1px solid ${C.borderStrong}`,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, height: 1, background: C.borderStrong }} />
          </div>
          {/* 副标题 */}
          <div style={{ color: C.inkMuted, fontSize: 14, letterSpacing: 1, lineHeight: 1.6 }}>
            星野 / 猫箱 聊天记录 → SillyTavern / Tavo
          </div>
          {/* 底部细线 */}
          <div style={{ height: 1, background: C.borderStrong, opacity: 0.55, marginTop: 22 }} />
        </header>

        {/* 顶部醒目提示：只做格式转换，不处理图片/视频 */}
        <div style={noticeBoxStyle}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            ⚠ 这是格式转换工具，不处理图片和视频
          </div>
          <div>
            你需要先用 Gemini（手机 App 或 Google AI Studio 网页版都行）看你的录屏，整理成{' '}
            <code style={codeChipStyle}>USER: 内容</code> 和{' '}
            <code style={codeChipStyle}>角色名: 内容</code>{' '}
            这样一行一句的纯文本，再回来这里。详细步骤看小红书笔记。
          </div>
        </div>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: '24px 20px',
            boxShadow: '0 1px 0 rgba(0,0,0,0.02), 0 8px 24px rgba(70,60,40,0.06)',
          }}
        >
          {/* 一 */}
          <Section title="一 · 角色登记" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            <Field label="你叫什么">
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="比如：江栩栩"
                style={inputStyle}
              />
            </Field>
            <Field label="TA 叫什么">
              <input
                type="text"
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                placeholder="比如：周漾"
                style={inputStyle}
              />
              <div style={{ fontSize: 12, color: C.warm, marginTop: 4, lineHeight: 1.5 }}>
                必须跟源文本里出现的名字一字不差（比如填 "周漾"，不是 "vines" 或 "Zhou Yang"），不一致工具识别不出来
              </div>
            </Field>
          </div>

          {/* 二 */}
          <Section title="二 · 对话内容" />
          <div style={{ marginBottom: 8, fontSize: 12, color: C.inkMuted, lineHeight: 1.6 }}>
            把 Gemini 帮你整理好的对话流粘到下面，或者上传 txt 文件。
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <label style={uploadBtnStyle}>
              <input
                type="file"
                accept=".txt,.text,text/plain"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              📎 选个 txt 文件
            </label>
            {text && (
              <button onClick={() => setText('')} style={clearBtnStyle}>
                清空
              </button>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`USER: 内容\n${charName || '角色名'}: 内容\n...`}
            style={{
              ...inputStyle,
              minHeight: 160,
              maxHeight: 280,
              fontFamily: 'ui-monospace, "SF Mono", monospace',
              fontSize: 12,
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
          {text && (
            <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 6, textAlign: 'right' }}>
              {text.length.toLocaleString()} 字
            </div>
          )}

          {/* 高级 */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => setAdvanced(!advanced)}
              style={{
                background: 'none',
                border: 'none',
                color: C.warm,
                fontSize: 12,
                cursor: 'pointer',
                padding: 0,
                fontFamily: FONT_SANS,
              }}
            >
              {advanced ? '↑ 收起' : '↓ 自定义起始时间（可选）'}
            </button>
            {advanced && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  background: C.bg,
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <div style={{ color: C.inkMuted, marginBottom: 8 }}>
                  不填的话，会自动从文本里找时间；找不到就用今天往前推 30 天。
                </div>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={doParse} style={primaryBtnStyle}>
              ✦ 看看效果
            </button>
          </div>

          {hint && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: '#FBF0EB',
                border: `1px solid ${C.warning}33`,
                borderRadius: 4,
                fontSize: 13,
                color: C.warning,
                lineHeight: 1.5,
              }}
            >
              {hint}
            </div>
          )}

          {/* 预览 */}
          {preview && (
            <div
              ref={previewRef}
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: `1px dashed ${C.borderStrong}`,
                animation: 'fadeInUp 0.4s ease',
                scrollMarginTop: 16,
              }}
            >
              <Section title="三 · 预览" />
              <div
                style={{
                  background: C.bg,
                  padding: 12,
                  borderRadius: 4,
                  fontSize: 12,
                  color: C.inkMuted,
                  lineHeight: 1.7,
                  marginBottom: 12,
                }}
              >
                <div>
                  解析到 <span style={{ color: C.primary, fontWeight: 600 }}>{preview.messages.length}</span> 条对话
                </div>
                {preview.skipped > 0 && <div>忽略了 {preview.skipped} 行无效内容</div>}
                <div>
                  起始时间：<span style={{ color: C.ink }}>{formatDisplayDate(preview.startDate)}</span>
                </div>
                <div style={{ color: C.warm, fontSize: 11 }}>↳ {preview.source}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {preview.messages.slice(0, 3).map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: msg.speaker === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '10px 12px',
                        background: msg.speaker === 'user' ? C.primary : '#F0E9DA',
                        color: msg.speaker === 'user' ? '#FBF6EC' : C.ink,
                        borderRadius: 8,
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          opacity: 0.7,
                          marginBottom: 4,
                          fontWeight: 600,
                        }}
                      >
                        {msg.speaker === 'user' ? userName : charName}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                        {msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  background: '#F5F1E5',
                  padding: 12,
                  borderRadius: 4,
                  fontSize: 12,
                  color: C.inkMuted,
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}
              >
                💡 建议先下载"前 3 条测试包"导入 SillyTavern 验证一下，确认显示正常再下完整版。
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => doDownload(true)} style={secondaryBtnStyle}>
                  ⬇ 下载测试包（前 3 条）
                </button>
                <button onClick={() => doDownload(false)} style={primaryBtnStyle}>
                  ⬇ 下载完整版（{preview.messages.length} 条）
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部反馈卡片 */}
        <div className="feedback-card">
          <div className="feedback-title">
            <span className="feedback-icon">!</span>
            <span>卡住了？告诉我</span>
          </div>
          <div className="feedback-text">
            工具出错、ST 或 Tavo 导入失败、想加新功能、想吐槽——都欢迎来找我。我会定期把大家的反馈打包处理。
          </div>

          <div className="account-block">
            <div className="account-line">
              <span className="account-label">小红书</span>
              <span className="account-value">@江栩栩</span>
            </div>
            <div className="account-line">
              <span className="account-label">小红书号</span>
              <span className="account-id">6385292153</span>
            </div>
            <div className="copy-hint">在原教程笔记的评论区或者群聊里留言，看到都会回</div>
          </div>

          <div className="feedback-divider" />
          <div className="feedback-footer">本地处理 · 不上传任何数据 · 完全免费</div>
        </div>
      </div>
    </div>
  );
}
