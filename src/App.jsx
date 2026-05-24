import { useState } from 'react';

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
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatSendDate(d) {
  let hour = d.getHours();
  const ampm = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12 || 12;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${hour}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${ampm}`;
}

function formatCreateDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}@${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s`;
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

function buildMetadata(userName, charName, startDate) {
  return {
    user_name: userName,
    character_name: charName,
    create_date: formatCreateDate(startDate),
    chat_metadata: {
      integrity: uuid4(),
      chat_id_hash: chatIdHash(),
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
      send_date: formatSendDate(date),
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
    const metadata = buildMetadata(u, c, preview.startDate);
    const objects = buildMessageObjects(msgs, u, c, preview.startDate);
    const jsonl = generateJsonl(metadata, objects);
    const suffix = testOnly ? '_前3条测试' : '';
    downloadFile(`${c}${suffix}.jsonl`, jsonl);
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
      `}</style>

      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* 头部 */}
        <header style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 30,
              color: C.primary,
              fontWeight: 600,
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            把白月光接回家
          </div>
          <div style={{ color: C.inkMuted, fontSize: 13, lineHeight: 1.6 }}>
            星野 / 猫箱 聊天记录 → SillyTavern 格式
          </div>
          <div
            style={{
              width: 60,
              height: 1,
              background: C.borderStrong,
              margin: '20px auto 0',
            }}
          />
        </header>

        {/* 顶部醒目提示：只做格式转换，不处理图片/视频 */}
        <div style={noticeBoxStyle}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            ⚠ 这是格式转换工具，不处理图片和视频
          </div>
          <div>
            你需要先用 Google AI Studio 让 Gemini 看你的录屏，整理成{' '}
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
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: `1px dashed ${C.borderStrong}`,
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
                  起始时间：<span style={{ color: C.ink }}>{formatCreateDate(preview.startDate)}</span>
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

        <div
          style={{
            marginTop: 24,
            fontSize: 11,
            color: C.inkMuted,
            textAlign: 'center',
            lineHeight: 1.8,
          }}
        >
          所有处理在你的设备本地完成 · 不会上传任何数据
          <br />
          有问题反馈到小红书 @江栩栩（小红书号 6385292153）笔记评论区或群聊
        </div>
      </div>
    </div>
  );
}
