// ==UserScript==
// @name         GeoFS Ultimate HUD (AoA Fix v10.3)
// @namespace    https://github.com/weixiaoSmile2026/geofs-sounds
// @version      10.3
// @description  修正地面 AoA 顯示、補全 APR MINI/MINI 音效、移除機場距離限制
// @author       Gemini / User
// @match        https://www.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 音效資源
    // ==========================================
    const RAW_BASE = "https://raw.githubusercontent.com/weixiaoSmile2026/geofs-sounds/main/";
    const SOUND_FILES = {
        "2500": "audio_2500.mp3", "1000": "audio_1000.mp3", "500": "audio_500.mp3",
        "400": "audio_400.mp3", "300": "audio_300.mp3", "200": "audio_200.mp3",
        "100": "audio_100.mp3", "50": "audio_50.mp3", "40": "audio_40.mp3",
        "30": "audio_30.mp3", "20": "audio_20.mp3", "10": "audio_10.mp3",
        "SINK": "audio_sink-rate.mp3", "STALL": "audio_airbus-stall-warning.mp3",
        "PULL_UP": "audio_terrain-terrain-pull-up.mp3", "OVERSPEED": "audio_md-80-overspeed.mp3",
        "GEAR": "audio_too-low-gear.mp3", "FLAPS": "audio_too-low-flaps.mp3",
        "RETARD": "audio_airbus-retard.mp3", "BANK_ANGLE": "audio_bank-angle-bank-angle.mp3",
        "AP_OFF": "audio_airbus-autopilot-off.mp3",
        "V1": "luvvoice.com-20260422-JRyr2B.mp3", "VR": "luvvoice.com-20260422-TY83zn.mp3",
        "APR_MINI": "audio_approaching-minimums.mp3",
        "MINI": "audio_minimums.mp3"
    };

    const audioCtx = {};
    let isMuted = false, callFlags = { v1: false, vr: false }, oldAltitude = 0, apWasOn = false;

    Object.keys(SOUND_FILES).forEach(k => {
        audioCtx[k] = new Audio(RAW_BASE + SOUND_FILES[k]);
        if (["STALL", "OVERSPEED", "BANK_ANGLE", "SINK", "GEAR", "FLAPS", "PULL_UP"].includes(k)) audioCtx[k].loop = true;
    });

    function play(k) { if (!isMuted && audioCtx[k]?.paused) audioCtx[k].play().catch(()=>{}); }
    function stop(k) { if (audioCtx[k] && !audioCtx[k].paused) { audioCtx[k].pause(); audioCtx[k].currentTime = 0; } }

    const getV = () => window.geofs.animation.values || {};
    const getAC = () => window.geofs.aircraft.instance || {};
    const groundAltitude = () => (getV().altitude || 0) - (getV().groundElevationFeet || 0) - 50;

    // ==========================================
    // 2. UI 系統
    // ==========================================
    let dataPanel, alertPanel;
    function initUI() {
        const css = `.h-panel { position: absolute; z-index: 10000; padding: 12px; background: rgba(0,0,0,0.85); color: #0F0; font-family: "Consolas", monospace; border: 1.5px solid #0F0; border-radius: 6px; cursor: move; min-width: 230px; }
                     .h-ctrl { position: absolute; z-index: 10001; padding: 10px; background: rgba(15,15,15,0.95); border: 2px solid #5AF; border-radius: 8px; cursor: move; width: 120px; top:25px; left:25px; display: flex; flex-direction: column; gap: 5px; }
                     .h-btn { background: #222; color: #5AF; border: 1px solid #5AF; padding: 5px; cursor: pointer; font-size: 11px; font-weight: bold; border-radius: 4px; text-align: center; }
                     .v-speed { color: #5AF; font-weight: bold; }
                     .red-alert { background: #D00; color: #FFF; animation: blink 0.3s infinite; text-align:center; font-weight:bold; padding:5px; margin:3px 0; border-radius:4px; font-size:14px; }
                     @keyframes blink { 0%{opacity:1} 50%{opacity:0.4} 100%{opacity:1} }`;
        const s = document.createElement('style'); s.innerHTML = css; document.head.appendChild(s);
        dataPanel = document.createElement('div'); dataPanel.className = 'h-panel'; dataPanel.style.top = '160px'; dataPanel.style.left = '20px'; document.body.appendChild(dataPanel);
        alertPanel = document.createElement('div'); alertPanel.className = 'h-panel'; alertPanel.style.top = '160px'; alertPanel.style.left = '270px'; alertPanel.style.minWidth = '200px'; document.body.appendChild(alertPanel);
        const ctrl = document.createElement('div'); ctrl.className = 'h-ctrl';
        ctrl.innerHTML = `<button id="b1" class="h-btn">DATA HUD</button><button id="b2" class="h-btn">WARN HUD</button><button id="bm" class="h-btn">MUTE OFF</button>`;
        document.body.appendChild(ctrl);
        document.getElementById('b1').onclick = () => dataPanel.style.display = (dataPanel.style.display==='none'?'block':'none');
        document.getElementById('b2').onclick = () => alertPanel.style.display = (alertPanel.style.display==='none'?'block':'none');
        document.getElementById('bm').onclick = function() { isMuted = !isMuted; this.innerText = isMuted ? "MUTE ON" : "MUTE OFF"; this.style.color = isMuted ? "#F55" : "#5AF"; if (isMuted) Object.keys(audioCtx).forEach(stop); };
        [dataPanel, alertPanel, ctrl].forEach(p => { p.onmousedown = (e) => { if (e.target.tagName === 'BUTTON') return; let ox = e.clientX-p.offsetLeft, oy = e.clientY-p.offsetTop; document.onmousemove = (em) => { p.style.left=(em.clientX-ox)+'px'; p.style.top=(em.clientY-oy)+'px'; }; document.onmouseup = () => document.onmousemove = null; }; });
    }

    // ==========================================
    // 3. 核心邏輯
    // ==========================================
    function mainLoop() {
        if (!window.geofs?.animation?.values || window.geofs.isPaused()) return;
        const v = getV(), ac = getAC(), alt = groundAltitude();
        let alerts = [];

        // 警告邏輯
        if (v.groundContact != 1 && ac.stalling) { alerts.push({t: "STALL", c: "red-alert"}); play('STALL'); } else { stop('STALL'); }
        if (Math.abs(v.aroll || 0) > 40) { alerts.push({t: "BANK ANGLE", c: "red-alert"}); play('BANK_ANGLE'); } else { stop('BANK_ANGLE'); }
        if (v.verticalSpeed < -2500) { alerts.push({t: "SINK RATE", c: "red-alert"}); play('SINK'); } else { stop('SINK'); }
        if (v.gearPosition == 1 && alt <= 1000 && v.groundContact != 1) { alerts.push({t: "PULL UP", c: "red-alert"}); play('PULL_UP'); } else { stop('PULL_UP'); }

        // 配置警告
        if (v.verticalSpeed < -50 && alt <= 1500) {
            if (v.gearPosition == 1) { alerts.push({t: "TOO LOW GEAR", c: "red-alert"}); play('GEAR'); }
            else if ((v.flapsValue || 0) == 0) { alerts.push({t: "TOO LOW FLAPS", c: "red-alert"}); play('FLAPS'); }
            else { stop('GEAR'); stop('FLAPS'); }
        } else { stop('GEAR'); stop('FLAPS'); }

        let vmo = (v.VNO > 0) ? v.VNO + 1 : 350;
        if (v.kias > vmo) { alerts.push({t: "OVERSPEED", c: "red-alert"}); play('OVERSPEED'); } else { stop('OVERSPEED'); }

        if (apWasOn && !window.geofs.autopilot?.on) play('AP_OFF');
        apWasOn = window.geofs.autopilot?.on;

        // 高度呼叫 (補齊 APR MINI / MINI)
        if (v.verticalSpeed < -50) {
            const levels = { 2500:"2500", 1000:"1000", 500:"500", 400:"400", 350:"APR_MINI", 300:"300", 200:"200", 150:"MINI", 100:"100", 50:"50", 40:"40", 30:"30", 20:"20", 10:"10" };
            Object.keys(levels).forEach(l => { if (oldAltitude > l && alt <= l) play(levels[l]); });
            if (oldAltitude > 20 && alt <= 20 && (v.throttle > 0.05)) play('RETARD');
        }

        // V速度與 AoA 處理
        const ias = Math.round(v.kias || 0), fVal = v.flapsValue || 0;
        const v1 = Math.round(160 - (fVal * 15)), vr = Math.round(168 - (fVal * 10));

        // [關鍵修正]：若接地，AoA 強制顯示 0.0
        const displayAoA = (v.groundContact == 1) ? "0.0" : (v.aoa || 0).toFixed(1);

        if (v.groundContact == 1 && v.throttle > 0.6) {
            if (ias >= v1 && !callFlags.v1) { play('V1'); callFlags.v1 = true; }
            if (ias >= vr && !callFlags.vr) { play('VR'); callFlags.vr = true; }
        } else if (v.groundContact == 1 && ias < 30) { callFlags = {v1:false, vr:false}; }

        // --- UI 渲染 ---
        dataPanel.innerHTML = `<b>FLIGHT MONITOR</b><hr style="border:0.5px solid #0F0;margin:4px 0;">
            SPD: ${ias} KT | THR: ${Math.round((v.throttle||0)*100)}%<br>
            ALT: ${Math.round(alt)} FT | VS: ${Math.round(v.verticalSpeed || 0)}<br>
            <span class="v-speed">V1: ${v1}</span> | <span class="v-speed">VR: ${vr}</span><br>
            FLP: ${(fVal*100).toFixed(0)}% | AoA: ${displayAoA}°<br>
            BNK: ${(v.aroll||0).toFixed(1)}° | AP: ${window.geofs.autopilot?.on?"<span style='color:#5AF'>ON</span>":"OFF"}`;
        alertPanel.innerHTML = alerts.length ? alerts.map(a => `<div class="${a.c}">${a.t}</div>`).join('') : '<div style="opacity:0.3;text-align:center;">SYSTEM SAFE</div>';
        oldAltitude = alt;
    }

    let setup = setInterval(() => { if (window.geofs?.animation) { initUI(); setInterval(mainLoop, 100); clearInterval(setup); } }, 1000);
})();