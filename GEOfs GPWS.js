// ==UserScript==
// @name         GeoFS Ultimate HUD & PFD (Stable V12.3)
// @namespace    https://github.com/weixiaoSmile2026/geofs-sounds
// @version      12.3
// @description  整合 PFD 陀螺儀、修正音效同步與進場誤報問題
// @author       User & Gemini AI
// @match        https://www.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // [音效資源]
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
        "APR_MINI": "audio_approaching-minimums.mp3", "MINI": "audio_minimums.mp3"
    };

    const audioCtx = {};
    let isMuted = false, callFlags = { v1: false, vr: false }, oldAltitude = 0, apWasOn = false;

    // 定義循環音效清單，用於強制同步
    const LOOP_SOUNDS = ["STALL", "OVERSPEED", "BANK_ANGLE", "SINK", "GEAR", "FLAPS", "PULL_UP"];

    Object.keys(SOUND_FILES).forEach(k => {
        audioCtx[k] = new Audio(RAW_BASE + SOUND_FILES[k]);
        if (LOOP_SOUNDS.includes(k)) audioCtx[k].loop = true;
    });

    function play(k) { if (!isMuted && audioCtx[k]?.paused) audioCtx[k].play().catch(()=>{}); }
    function stop(k) { if (audioCtx[k] && !audioCtx[k].paused) { audioCtx[k].pause(); audioCtx[k].currentTime = 0; } }
    const getV = () => window.geofs.animation.values || {};
    const getAC = () => window.geofs.aircraft.instance || {};

    // UI 變數
    let dataPanel, alertPanel, pfdWrapper, aiBall, rollPointer;
    const PITCH_SPACING = 2.2;

    function initUI() {
        const css = `
            .h-panel { position: absolute; z-index: 10000; padding: 12px; background: rgba(0,0,0,0.85); color: #0F0; font-family: "Consolas", monospace; border: 1.5px solid #0F0; border-radius: 6px; cursor: move; min-width: 240px; }
            .h-ctrl { position: absolute; z-index: 10001; padding: 10px; background: rgba(15,15,15,0.95); border: 2px solid #5AF; border-radius: 8px; cursor: move; width: 130px; top:25px; left:25px; display: flex; flex-direction: column; gap: 5px; }
            .h-btn { background: #222; color: #5AF; border: 1px solid #5AF; padding: 5px; cursor: pointer; font-size: 11px; font-weight: bold; border-radius: 4px; text-align: center; }
            .red-alert { background: #D00; color: #FFF; animation: blink 0.3s infinite; text-align:center; font-weight:bold; padding:5px; margin:3px 0; border-radius:4px; font-size:14px; }
            @keyframes blink { 0%{opacity:1} 50%{opacity:0.4} 100%{opacity:1} }
            #pfd-gyro-wrapper { position: absolute; top: 160px; right: 40px; width: 150px; height: 150px; z-index: 10000; cursor: move; filter: drop-shadow(0 0 5px black); display: block; }
            .pitch-line-major { stroke: #FFFFFF; stroke-width: 2.5; }
            .pitch-text { fill: #FFFFFF; font-size: 11px; font-family: Arial; font-weight: 900; filter: drop-shadow(1px 1px 1px black); }
            .bank-tick-bold { stroke: #FFFFFF; stroke-width: 3; }
            .external-ring { fill: rgba(0, 0, 0, 0.75); stroke: rgba(255,255,255,0.3); stroke-width: 1; }
            .ref-line-glow { stroke: #FFFFFF; stroke-width: 4; filter: drop-shadow(0px 0px 1.5px #000); }
        `;
        const s = document.createElement('style'); s.innerHTML = css; document.head.appendChild(s);

        dataPanel = document.createElement('div'); dataPanel.className = 'h-panel'; dataPanel.style.top = '160px'; dataPanel.style.left = '20px'; document.body.appendChild(dataPanel);
        alertPanel = document.createElement('div'); alertPanel.className = 'h-panel'; alertPanel.style.top = '360px'; alertPanel.style.left = '20px'; alertPanel.style.minWidth = '200px'; document.body.appendChild(alertPanel);

        pfdWrapper = document.createElement('div');
        pfdWrapper.id = 'pfd-gyro-wrapper';
        pfdWrapper.innerHTML = `
            <svg viewBox="0 0 200 200" width="100%" height="100%" style="overflow: visible;">
                <defs><clipPath id="pfd-clip"><circle cx="100" cy="100" r="72" /></clipPath></defs>
                <circle cx="100" cy="100" r="95" class="external-ring" />
                <g clip-path="url(#pfd-clip)">
                    <g id="pfd-dynamic-group">
                        <rect x="-300" y="-1200" width="800" height="1300" fill="#007AFF" />
                        <rect x="-300" y="100" width="800" height="1300" fill="#54350A" />
                        <line x1="-300" y1="100" x2="500" y2="100" stroke="white" stroke-width="4" />
                        <g id="pfd-ladder-content"></g>
                    </g>
                </g>
                <g>
                    <path id="roll-pointer" d="M100,28 L110,45 L92,45 Z" fill="#FFFFFF" stroke="#000000" stroke-width="2" />
                    <line x1="25" y1="100" x2="65" y2="100" class="ref-line-glow" />
                    <line x1="135" y1="100" x2="175" y2="100" class="ref-line-glow" />
                    <path d="M65,100 L90,100 L90,110 M110,110 L110,100 L135,100" stroke="#FFD700" stroke-width="6" fill="none" stroke-linejoin="round" />
                    <circle cx="100" cy="100" r="4" fill="#FF0000" stroke="#000000" stroke-width="1.5" />
                </g>
            </svg>`;
        document.body.appendChild(pfdWrapper);

        const ladder = document.getElementById('pfd-ladder-content');
        for (let i = -180; i <= 180; i += 10) {
            if (i === 0) continue;
            const y = 100 - (i * PITCH_SPACING);
            ladder.insertAdjacentHTML('beforeend', `<line x1="82" y1="${y}" x2="118" y2="${y}" class="pitch-line-major" /><text x="78" y="${y+4}" class="pitch-text" text-anchor="end">${Math.abs(i)}</text>`);
        }

        aiBall = document.getElementById('pfd-dynamic-group');
        rollPointer = document.getElementById('roll-pointer');

        const ctrl = document.createElement('div'); ctrl.className = 'h-ctrl';
        ctrl.innerHTML = `
            <button id="b1" class="h-btn">DATA HUD</button>
            <button id="b2" class="h-btn">WARN HUD</button>
            <button id="b3" class="h-btn">PFD GYRO</button>
            <button id="bm" class="h-btn">MUTE OFF</button>`;
        document.body.appendChild(ctrl);

        document.getElementById('b1').onclick = () => dataPanel.style.display = (dataPanel.style.display==='none'?'block':'none');
        document.getElementById('b2').onclick = () => alertPanel.style.display = (alertPanel.style.display==='none'?'block':'none');
        document.getElementById('b3').onclick = () => pfdWrapper.style.display = (pfdWrapper.style.display==='none'?'block':'none');
        document.getElementById('bm').onclick = function() {
            isMuted = !isMuted; this.innerText = isMuted ? "MUTE ON" : "MUTE OFF";
            if (isMuted) Object.keys(audioCtx).forEach(stop);
        };

        [dataPanel, alertPanel, ctrl, pfdWrapper].forEach(p => {
            p.onmousedown = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                let ox = e.clientX-p.offsetLeft, oy = e.clientY-p.offsetTop;
                document.onmousemove = (em) => { p.style.left=(em.clientX-ox)+'px'; p.style.top=(em.clientY-oy)+'px'; };
                document.onmouseup = () => document.onmousemove = null;
            };
        });
    }

    function mainLoop() {
        if (!window.geofs?.animation?.values || window.geofs.isPaused()) return;
        const v = getV(), ac = getAC();

        let alt = Math.max(0, (v.altitude || 0) - (v.groundElevationFeet || 0) - 50);
        const vs = v.verticalSpeed || 0;
        const ias = Math.round(v.kias || 0);
        const roll = v.aroll || 0;
        const pitch = -(v.atilt || 0);

        let activeAlerts = []; // 儲存當前正在觸發的警告 Key

        // 1. 下沉率判斷
        let sinkThreshold = (alt < 1000) ? -1500 : (alt < 2500 ? -2500 : -4000);
        if (vs < sinkThreshold && v.groundContact != 1) {
            if (alt < 500 && vs < -3000) activeAlerts.push("PULL_UP");
            else activeAlerts.push("SINK");
        }

        // 2. 超速與失速
        if (ias > ((alt < 10000) ? 255 : 360)) activeAlerts.push("OVERSPEED");
        if (v.groundContact != 1 && ac.stalling) activeAlerts.push("STALL");

        // 3. 坡度
        if (Math.abs(roll) > 45) activeAlerts.push("BANK_ANGLE");

        // 4. 起落架/襟翼 (修正誤報)
        if (vs < -200 && alt < 1000 && v.groundContact != 1) {
            if (v.gearPosition > 0.5) activeAlerts.push("GEAR");
            if (alt < 500 && (v.flapsValue || 0) < 0.1) activeAlerts.push("FLAPS");
        }

        // --- 強制同步邏輯 ---
        // 停止沒在清單中的循環音效
        LOOP_SOUNDS.forEach(k => { if (!activeAlerts.includes(k)) stop(k); });

        // 播放並渲染清單中的內容
        let alertsHTML = "";
        activeAlerts.forEach(k => {
            play(k);
            let label = k.replace("_", " ");
            if (k === "SINK") label = "SINK RATE";
            if (k === "GEAR") label = "TOO LOW GEAR";
            if (k === "FLAPS") label = "TOO LOW FLAPS";
            alertsHTML += `<div class="red-alert">${label}</div>`;
        });

        // 5. 自動駕駛與語音呼叫
        if (apWasOn && !window.geofs.autopilot?.on) play('AP_OFF');
        apWasOn = window.geofs.autopilot?.on;
        if (vs < -50) {
            const lvls = { 2500:"2500", 1000:"1000", 500:"500", 400:"400", 300:"300", 200:"200", 100:"100", 50:"50", 40:"40", 30:"30", 20:"20", 10:"10" };
            Object.keys(lvls).forEach(l => { if (oldAltitude > l && alt <= l) play(lvls[l]); });
            if (oldAltitude > 20 && alt <= 20 && v.throttle > 0.1) play('RETARD');
        }

        // --- PFD 動態更新 ---
        if (pfdWrapper.style.display !== 'none') {
            aiBall.setAttribute('transform', `rotate(${roll}, 100, 100) translate(0, ${pitch * PITCH_SPACING})`);
            rollPointer.setAttribute('transform', `rotate(${roll}, 100, 100)`);
        }

        // --- HUD 數據渲染 ---
        dataPanel.innerHTML = `<b>FLIGHT MONITOR</b><hr style="border:0.5px solid #0F0;margin:4px 0;">
            SPD: ${ias} KT | ALT: ${Math.round(alt)} FT<br>
            VS: ${Math.round(vs)} FPM | THR: ${Math.round(v.throttle*100)}%<br>
            PIT: ${pitch.toFixed(1)}° | BNK: ${roll.toFixed(1)}°<br>
            FLP: ${((v.flapsValue||0)*100).toFixed(0)}% | GEAR: ${v.gearPosition<0.5?"DOWN":"UP"}<br>
            AP: ${window.geofs.autopilot?.on?"<span style='color:#5AF'>ON</span>":"OFF"}`;

        alertPanel.innerHTML = alertsHTML || '<div style="opacity:0.3;text-align:center;">SYSTEM SAFE</div>';
        oldAltitude = alt;
    }

    let setup = setInterval(() => { if (window.geofs?.animation) { initUI(); setInterval(mainLoop, 100); clearInterval(setup); } }, 1000);
})();
