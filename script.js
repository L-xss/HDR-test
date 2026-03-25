
(function () {
  const $ = (id) => document.getElementById(id);

  const els = {
    timeNow: $("time-now"),
    statusIcon: $("status-icon"),
    statusBadge: $("status-badge"),
    statusText: $("status-text"),
    scoreText: $("score-text"),
    scoreBar: $("score-bar"),
    scoreHint: $("score-hint"),
    reasonsText: $("reasons-text"),
    suggestions: $("suggestions"),
    signalsList: $("signals-list"),
    techDetails: $("tech-details"),
    cssRes: $("css-res"),
    dpr: $("dpr"),
    phyRes: $("phy-res"),
    scale: $("scale"),
    colorDepth: $("color-depth"),
    gamut: $("gamut"),
    cssHdr: $("css-hdr"),
    videoHdr: $("video-hdr"),
    btnCopy: $("btn-copy"),
    btnRetest: $("btn-retest"),
    toast: $("toast"),
    boost: $("boost"),
    boostVal: $("boost-val"),
    gradMain: $("grad-main"),
    clipBar: $("clip-bar"),
  };

  const ICONS = { ok: "✅", warn: "⚠️", bad: "❌", unknown: "❓", loading: "⏳" };

  // 体验指数阈值
  // 80+：优秀（必须 输出线索 + HDR解码 同时满足）  ← 方案A
  // 60+：及格（输出线索满足）
  // 35+：信息有限
  function scoreToLevel(score) {
    if (score >= 80) return "ok";
    if (score >= 60) return "warn";
    if (score >= 35) return "unknown";
    return "bad";
  }

  function scoreHintText(score) {
    const level = scoreToLevel(score);
    if (level === "ok") return "体验优秀：HDR 输出线索 + HDR 视频解码同时满足（≥80）";
    if (level === "warn") return "体验及格：检测到 HDR 输出线索（≥60）";
    if (level === "unknown") return "信息有限：仅有少量线索，体验难以评估";
    return "体验较弱：未见 HDR 输出线索或关键能力不足";
  }

  window.addEventListener("error", (ev) => {
    try {
      const msg = (ev && ev.message) ? ev.message : "脚本错误";
      setHero("unknown", "检测异常", "页面脚本发生错误，导致检测无法完成：" + msg + "。建议刷新或换浏览器再试。");
    } catch (_) {}
  });

  function pad(n) { return String(n).padStart(2, "0"); }

  function nowText() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.remove("show"), 1200);
  }

  function pillClass(level) {
    if (level === "ok") return "pill ok";
    if (level === "warn") return "pill warn";
    if (level === "bad") return "pill bad";
    return "pill unknown";
  }

  function badgeClass(level) {
    if (level === "ok") return "badge ok";
    if (level === "warn") return "badge warn";
    if (level === "bad") return "badge bad";
    return "badge unknown";
  }

  function setHero(level, title, text) {
    els.statusIcon.textContent = ICONS[level] || ICONS.unknown;
    els.statusBadge.className = badgeClass(level);
    els.statusBadge.textContent = title;
    els.statusText.textContent = text;
  }

  function renderSignals(items) {
    els.signalsList.innerHTML = "";
    for (const it of items) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="itemLeft">
          <div class="itemTitle">
            <span>${it.title}</span>
            <span class="${pillClass(it.level)}">${it.badge}</span>
          </div>
          <div class="itemDesc">${it.desc}</div>
        </div>
        <div class="itemRight">${it.value ?? ""}</div>
      `;
      els.signalsList.appendChild(div);
    }
  }

  async function testCodec(config) {
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo) {
      return { _error: "MediaCapabilities API 不可用" };
    }
    try {
      return await navigator.mediaCapabilities.decodingInfo(config);
    } catch (e) {
      return { _error: String(e && e.message ? e.message : e) };
    }
  }

  function normalizeCodecResult(name, short, info) {
    if (!info) {
      return { name, short, state: "unknown", supported: false, smooth: null, power: null, label: "无法检测", note: "未拿到信息" };
    }
    if (info._error) {
      return { name, short, state: "unknown", supported: false, smooth: null, power: null, label: "无法检测", note: "浏览器/环境限制" };
    }

    const supported = info.supported === true;
    const smooth = info.smooth;
    const power = info.powerEfficient;

    if (!supported) {
      return { name, short, state: "bad", supported: false, smooth, power, label: "不支持", note: "" };
    }

    // “吃力”判定：smooth 或 power 任一为 false -> warn
    const heavy = (smooth === false) || (power === false);
    return {
      name, short,
      state: heavy ? "warn" : "ok",
      supported: true,
      smooth,
      power,
      label: heavy ? "支持（可能吃力）" : "支持",
      note: heavy ? "可能不够流畅或不够省电" : ""
    };
  }

  function summarizeCodecGroup(vp9Info, hevcInfo, av1Info) {
    const rows = [
      normalizeCodecResult("VP9", "VP9", vp9Info),
      normalizeCodecResult("HEVC(H.265)", "HEVC", hevcInfo),
      normalizeCodecResult("AV1", "AV1", av1Info),
    ];

    const supportedRows = rows.filter(x => x.supported);
    const anySupported = supportedRows.length > 0;
    const allUnknown = rows.every(x => x.state === "unknown");

    let level = "bad";
    let badge = "不支持";
    let desc = "浏览器未报告常见 HDR 编码（HEVC / AV1 / VP9）的解码支持，这会影响 HDR 视频/流媒体体验。";

    if (allUnknown) {
      level = "unknown";
      badge = "无法检测";
      desc = "浏览器不支持 MediaCapabilities API 或被隐私/平台限制；不代表不支持 HDR，只是网页无法得知。";
    } else if (anySupported) {
      const hasWarn = supportedRows.some(x => x.state === "warn");
      level = hasWarn ? "warn" : "ok";
      const list = supportedRows.map(x => x.short).join("/");
      badge = level === "ok" ? `支持（${list}）` : `支持（可能吃力：${list}）`;
      desc = level === "ok"
        ? "浏览器报告支持至少一种常见 HDR 编码解码，有利于 HDR 视频/流媒体体验。"
        : "支持 HDR 解码，但可能不够流畅或不够省电；HDR 播放可能更吃性能。";
    }

    const lines = rows.map(r => {
      const tail = r.note ? ` — ${r.note}` : "";
      return `${r.name}：${r.label}${tail}`;
    }).join("\n");

    const detailsHtml = `
      <details class="codecDetails">
        <summary>展开查看各编码结果</summary>
        <div class="mono">${lines}</div>
      </details>
    `;

    return {
      title: "HDR 解码能力（汇总）",
      level,
      badge,
      desc: `${desc}${detailsHtml}`,
      value: anySupported ? "MediaCapabilities" : (allUnknown ? "—" : "MediaCapabilities"),
      _rows: rows, // 供评分用
    };
  }

  function detectOS() {
    const ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
    if (/Android/i.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS/iPadOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Unknown";
  }

  function buildSuggestions(ctx) {
    const os = detectOS();
    const lines = [];

    // 方案A：80+需要输出+解码同时满足
    if (ctx.score < 60) {
      if (os === "Windows") {
        lines.push("• Windows：设置 → 系统 → 显示 → HDR，开启并确保对当前显示器生效。");
      } else if (os === "macOS") {
        lines.push("• macOS：系统设置 → 显示器，检查 HDR 选项（机型/外接屏支持不同）。");
      } else {
        lines.push("• 检查系统显示设置里是否有 HDR 开关，并确认对当前屏幕生效。");
      }
      lines.push("• 外接屏请确认线材/接口（DP/HDMI）与显卡输出设置支持 HDR/高位深。");
    } else if (ctx.score < 80) {
      // 60~79：有输出线索，但可能缺解码优秀条件
      lines.push("• 已检测到 HDR 输出线索（≥60）。若想达到优秀线（≥80），需要同时具备 HDR 视频解码支持。");
      lines.push("• 建议用 YouTube/流媒体 HDR 测试素材验证（并用显示器 OSD 确认 HDR 标识）。");
    } else {
      lines.push("• 体验指数已达优秀线（≥80）：输出线索 + HDR 解码同时满足。若观感仍像 SDR，建议检查系统 SDR/HDR 映射设置，并用 OSD 二次确认。");
    }

    lines.push(`• CSS dynamic-range：${ctx.cssHDR ? "high(true)" : "not high(false)"}（输出线索）`);

    if (ctx.mediaCapOk === false) {
      lines.push("• MediaCapabilities API 不可用：可换 Chrome/Edge 或关闭严格隐私模式再测。");
    } else {
      if (!ctx.anyCodecSupported) {
        lines.push("• 未报告常见 HDR 解码支持：HDR 视频体验可能受限（或浏览器/系统不暴露能力）。");
      } else {
        if (!ctx.cssHDR) {
          lines.push("• 检测到 HDR 解码能力，但未拿到 HDR 输出线索：优秀线（≥80）不会触发。请优先检查系统 HDR 开关/输出链路。");
        } else {
          lines.push("• HDR 输出线索 + HDR 解码同时满足：HDR 视频/流媒体体验通常更完整。");
        }
      }
    }

    lines.push("• 更权威：播放已知 HDR 内容并查看系统 HDR 状态与显示器 OSD HDR 标识。");
    return lines.join("<br/>");
  }

  function asJson(obj) {
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  }

  function applyBoostUI() {
    const v = Number(els.boost.value) / 100;
    els.boostVal.textContent = v.toFixed(2);
    const b = Math.max(0.6, Math.min(1.6, v));
    const c = 1.0 + (b - 1.0) * 0.65;
    const f = `brightness(${b}) contrast(${c})`;
    els.gradMain.style.filter = f;
    els.clipBar.style.filter = f;
  }

  function drawHDRProof() {
    const c = document.getElementById("hdr-proof");
    if (!c) return;

    const rect = c.getBoundingClientRect();
    const cssW = Math.max(320, Math.floor((rect && rect.width) ? rect.width : 720));
    const cssH = Math.round(cssW * 0.26);
    const dpr = window.devicePixelRatio || 1;

    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.height = cssH + "px";

    let ctx = null;
    let canvasSupportsP3 = false;

    try {
      ctx = c.getContext("2d", { colorSpace: "display-p3" });
      if (ctx && ctx.getContextAttributes) {
        const attrs = ctx.getContextAttributes();
        canvasSupportsP3 = !!(attrs && attrs.colorSpace === "display-p3");
      }
    } catch (_) {}

    if (!ctx) ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cssHDR = matchMedia("(dynamic-range: high)").matches;
    const gamutP3 = matchMedia("(color-gamut: p3)").matches;

    const canDoHDRTest = canvasSupportsP3 && (cssHDR || gamutP3);

    if (canDoHDRTest) {
      ctx.fillStyle = "color(display-p3 1.5 1.5 1.5)";
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "color(display-p3 3 3 3)";

      ctx.font = `800 ${Math.round(cssH * 0.38)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillText("仅 HDR 可见", cssW / 2, cssH / 2);

      ctx.font = `700 ${Math.round(cssH * 0.14)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText("HDR-only", cssW / 2, Math.round(cssH * 0.78));
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#888888";

      ctx.font = `600 ${Math.round(cssH * 0.18)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillText("此验证需要 Canvas 支持 display-p3，且输出链路能呈现差异", cssW / 2, cssH * 0.35);

      ctx.font = `400 ${Math.round(cssH * 0.13)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillText(`Canvas P3=${canvasSupportsP3}, CSS HDR=${cssHDR}, P3色域=${gamutP3}`, cssW / 2, cssH * 0.55);

      ctx.font = `400 ${Math.round(cssH * 0.12)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillStyle = "#666666";
      ctx.fillText("建议使用 Chrome/Edge 115+ 或 Safari 16+", cssW / 2, cssH * 0.75);
    }
  }

  // ===== 方案A核心：优秀线（>=80）必须 输出线索 + HDR解码 同时满足 =====
  function computeExperienceScore(ctx) {
    let score = 0;
    const reasons = [];

    // 输出线索：命中则至少 60（及格线）
    if (ctx.cssHDR) {
      score = Math.max(score, 60);
      reasons.push("dynamic-range: high（可判断 HDR 输出 → 至少 60）");
    } else {
      reasons.push("未报告 dynamic-range: high（未拿到 HDR 输出线索）");
    }

    const rows = ctx.codecRows || [];
    const supported = rows.filter(r => r.supported);
    const anyCodecSupported = supported.length > 0;

    // 体验加成（细分 80 以上/或 60~79）
    let extra = 0;

    // 色域/色深：体验加成
    if (ctx.gamutRec2020) { extra += 3; reasons.push("Rec.2020 色域支持（体验加成）"); }
    else if (ctx.gamutP3) { extra += 2; reasons.push("P3 色域支持（体验加成）"); }
    if (ctx.colorDepthHDRish) { extra += 1; reasons.push("screen.colorDepth ≥ 30（弱加成）"); }

    // MediaCapabilities 不可用：只能提示无法评估
    if (ctx.mediaCapOk === false) {
      reasons.push("MediaCapabilities 不可用（无法评估 HDR 解码能力）");
      score = Math.min(score + extra, 79); // 不能进优秀线
      return { score, reasons, anyCodecSupported: false };
    }

    // 有解码支持：记录原因（无论是否能进优秀线）
    if (anyCodecSupported) {
      const list = supported.map(x => x.short).join("/");
      reasons.push(`HDR 视频解码支持（${list}）`);
    } else {
      reasons.push("未报告 HDR 视频解码支持（优秀线 ≥80 可能达不到）");
    }

    // 编码细分 bonus
    const getBonus = (short, state) => {
      // state: ok / warn
      if (short === "HEVC") return (state === "ok") ? 6 : 4;
      if (short === "AV1")  return (state === "ok") ? 5 : 3;
      if (short === "VP9")  return (state === "ok") ? 2 : 1;
      return 0;
    };
    for (const r of supported) extra += getBonus(r.short, r.state);

    // 协同加成仅当输出线索存在
    if (ctx.cssHDR && anyCodecSupported) {
      extra += 3;
      reasons.push("输出 + 解码 同时命中（协同加成）");
    }

    // ===== 方案A门槛 =====
    // 只有 (cssHDR && anyCodecSupported) 才能进入优秀线（>=80）
    if (ctx.cssHDR && anyCodecSupported) {
      score = Math.max(score, 80);
      reasons.push("优秀线触发：HDR 输出线索 + HDR 解码同时满足（→ 至少 80）");
      score = Math.min(score + extra, 100);
    } else {
      // 有解码但没输出：明确限制在 79 以内
      if (!ctx.cssHDR && anyCodecSupported) {
        reasons.push("限制：仅有 HDR 解码能力但未拿到 HDR 输出线索（不进入优秀线，≤79）");
      }
      score = Math.min(score + extra, 79);
    }

    return { score, reasons, anyCodecSupported };
  }

  async function run() {
    els.timeNow.textContent = nowText();
    setHero("loading", "检测中…", "正在收集浏览器与设备信号并计算网页 HDR 体验指数…");
    els.scoreText.textContent = "—";
    els.scoreHint.textContent = "—";
    els.scoreBar.style.width = "0%";
    els.reasonsText.textContent = "";
    els.suggestions.innerHTML = "";

    const cssWidth = screen.width;
    const cssHeight = screen.height;
    const dpr = window.devicePixelRatio || 1;
    const phyW = Math.round(cssWidth * dpr);
    const phyH = Math.round(cssHeight * dpr);
    const scaling = Math.round((phyW / cssWidth) * 100);

    els.cssRes.textContent = `${cssWidth}×${cssHeight}`;
    els.dpr.textContent = `${dpr}`;
    els.phyRes.textContent = `${phyW}×${phyH}`;
    els.scale.textContent = `${scaling}%`;

    const gamutP3 = matchMedia("(color-gamut: p3)").matches;
    const gamutRec2020 = matchMedia("(color-gamut: rec2020)").matches;
    els.gamut.textContent = gamutRec2020 ? "Rec.2020" : (gamutP3 ? "P3" : "sRGB/未知");

    const cssHDR = matchMedia("(dynamic-range: high)").matches;
    els.cssHdr.textContent = cssHDR ? "true" : "false";

    let videoHDR = null;
    try {
      videoHDR = matchMedia("(video-dynamic-range: high)").matches;
      els.videoHdr.textContent = videoHDR ? "true" : "false";
    } catch {
      els.videoHdr.textContent = "不支持";
      videoHDR = null;
    }

    const colorDepth = screen.colorDepth;
    const colorDepthHDRish = (typeof colorDepth === "number") && colorDepth >= 30;
    els.colorDepth.textContent = `${colorDepth}`;

    const mediaCapOk = !!(navigator.mediaCapabilities && navigator.mediaCapabilities.decodingInfo);

    const vp9Config = {
      type: "file",
      video: { contentType: 'video/webm; codecs="vp9"', width: 3840, height: 2160, bitrate: 10_000_000, framerate: 30, transferFunction: "pq" }
    };
    const hevcConfig = {
      type: "file",
      video: { contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"', width: 3840, height: 2160, bitrate: 12_000_000, framerate: 30, transferFunction: "pq" }
    };
    const av1Config = {
      type: "file",
      video: { contentType: 'video/mp4; codecs="av01.0.12M.10.0.110.09.16.09"', width: 3840, height: 2160, bitrate: 10_000_000, framerate: 30, transferFunction: "pq" }
    };

    const [vp9Info, hevcInfo, av1Info] = await Promise.all([
      testCodec(vp9Config),
      testCodec(hevcConfig),
      testCodec(av1Config),
    ]);

    const items = [];

    items.push({
      title: "HDR 输出线索（CSS dynamic-range）",
      level: cssHDR ? "ok" : "bad",
      badge: cssHDR ? "有" : "无",
      desc: cssHDR
        ? "浏览器认为当前显示环境支持高动态范围输出（网页侧最直接的 HDR 输出线索之一）。"
        : "浏览器未报告 HDR 输出线索；可能 HDR 未开启、未对当前屏幕生效，或平台/浏览器不暴露该信息。",
      value: "(dynamic-range: high)"
    });

    items.push({
      title: "色深线索（screen.colorDepth）",
      level: colorDepthHDRish ? "warn" : "unknown",
      badge: colorDepthHDRish ? "偏高" : "参考",
      desc: colorDepthHDRish
        ? "screen.colorDepth ≥ 30 往往与更高位深相关，但不严格等同“当前输出位深”，仅作体验加成参考。"
        : "在许多环境中它不够准确，因此只作为参考。",
      value: `${colorDepth}`
    });

    {
      let level = "unknown", badge = "未知", desc = "";
      if (gamutRec2020) {
        level = "ok"; badge = "Rec.2020";
        desc = "检测到 Rec.2020 色域支持（有利于广色域内容体验），但不应作为 HDR 开关硬证据。";
      } else if (gamutP3) {
        level = "warn"; badge = "P3";
        desc = "检测到 P3 广色域支持（颜色更丰富），但广色域不等同 HDR。";
      } else {
        level = "unknown"; badge = "sRGB/未知";
        desc = "未检测到 P3/Rec.2020；也可能是浏览器/系统限制导致探测不可靠。";
      }
      items.push({ title: "色域能力（CSS color-gamut）", level, badge, desc, value: els.gamut.textContent });
    }

    const codecSummary = summarizeCodecGroup(vp9Info, hevcInfo, av1Info);
    items.push({
      title: codecSummary.title,
      level: codecSummary.level,
      badge: codecSummary.badge,
      desc: codecSummary.desc,
      value: codecSummary.value
    });

    renderSignals(items);

    const { score, reasons, anyCodecSupported } = computeExperienceScore({
      cssHDR,
      gamutP3,
      gamutRec2020,
      colorDepthHDRish,
      mediaCapOk,
      codecRows: (codecSummary && codecSummary._rows) ? codecSummary._rows : []
    });

    els.scoreText.textContent = `${score}/100`;
    els.scoreHint.textContent = scoreHintText(score);
    els.scoreBar.style.width = `${score}%`;
    els.reasonsText.textContent = `依据：${reasons.join("；")}`;

    const level = scoreToLevel(score);

    if (level === "ok") {
      setHero("ok", "HDR 体验优秀", "优秀线（≥80）已触发：HDR 输出线索 + HDR 视频解码同时满足。建议结合显示器 OSD HDR 标识确认。");
    } else if (level === "warn") {
      // 60~79：一定有输出线索（或接近）
      if (cssHDR) {
        if (anyCodecSupported) {
          setHero("warn", "HDR 输出已达及格线", "已检测到 HDR 输出线索（≥60），但未满足优秀线门槛（需输出+解码同时满足；或受平台信息限制）。");
        } else {
          setHero("warn", "HDR 输出已达及格线", "已检测到 HDR 输出线索（≥60），但未报告 HDR 视频解码支持；流媒体 HDR 体验可能受限。");
        }
      } else {
        setHero("warn", "体验及格附近", "分数达到及格附近，但未明确拿到 HDR 输出线索；建议检查系统 HDR 开关与外接屏链路。");
      }
    } else if (level === "unknown") {
      setHero("unknown", "信息有限", "网页侧只拿到少量线索：可能是浏览器/系统限制，也可能当前确实不是 HDR 体验场景。建议用 OSD/系统 HDR 状态进一步确认。");
    } else {
      setHero("bad", "体验较弱", "未见 HDR 输出线索或关键能力不足；网页 HDR 体验可能受限。若你期望 HDR，请检查系统 HDR 开关与连接链路。");
    }

    const tech = {
      time: new Date().toISOString(),
      ua: navigator.userAgent,
      osGuess: detectOS(),
      resolution: {
        css: { width: cssWidth, height: cssHeight },
        dpr,
        inferredPhysical: { width: phyW, height: phyH },
        inferredScalePercent: scaling
      },
      color: {
        screenColorDepth: colorDepth,
        css: {
          dynamicRangeHigh: cssHDR,
          videoDynamicRangeHigh: videoHDR,
          gamutP3,
          gamutRec2020
        }
      },
      mediaCapabilities: {
        available: mediaCapOk,
        vp9Info,
        hevcInfo,
        av1Info
      },
      synthesis: {
        score,
        reasons,
        rule: {
          passLine: 60,
          excellentLine: 80,
          passCondition: "dynamic-range: high => score>=60",
          excellentCondition: "dynamic-range: high && 任一 HDR 解码支持 => score>=80"
        }
      }
    };

    els.techDetails.textContent = asJson(tech);
    els.suggestions.innerHTML = buildSuggestions({
      score,
      cssHDR,
      mediaCapOk,
      anyCodecSupported
    });

    els.btnCopy.onclick = async () => {
      const report = asJson(tech);
      try {
        await navigator.clipboard.writeText(report);
        showToast("已复制技术报告");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = report;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          showToast("已复制技术报告");
        } catch {
          showToast("复制失败：请手动复制");
        }
        document.body.removeChild(ta);
      }
    };

    els.btnRetest.onclick = () => run();
  }

  // UI 初始化
  els.boost.addEventListener("input", applyBoostUI);
  applyBoostUI();

  // 先跑核心检测，再绘制 HDR 验证图
  run();

  requestAnimationFrame(() => { try { drawHDRProof(); } catch (e) {} });

  let _hdrT = 0;
  const _hdrRedraw = () => {
    clearTimeout(_hdrT);
    _hdrT = setTimeout(drawHDRProof, 80);
  };
  window.addEventListener("resize", _hdrRedraw);
})();
