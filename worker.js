export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (request.method === 'GET') {
      return new Response(HTML, { headers: { ...cors, 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch(e) { return res({ error: 'bad_request' }, 400, cors); }

      if (url.pathname === '/check-passcode') {
        const ok = !!(body.passcode && body.passcode.trim() === (env.APP_PASSCODE || '').trim());
        return res({ ok }, 200, cors);
      }

      if (url.pathname === '/translate') {
        const { address, passcode } = body;
        if (!passcode || passcode.trim() !== (env.APP_PASSCODE || '').trim())
          return res({ error: 'unauthorized' }, 401, cors);
        if (!address || !address.trim()) return res({ error: 'invalid_input' }, 400, cors);
        if (address.length > 2000) return res({ error: 'input_too_long' }, 400, cors);
        if (!env.GEMINI_API_KEY) return res({ error: 'no_api_config' }, 500, cors);

        const cleanedAddress = address.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        const prompt = '你是台灣地址辨識與翻譯專家。輸入是一筆英文地址（通常來自航空 GDS）。請做三件事：1) 將英文地址翻成繁體中文（符合台灣地址格式：縣市、區、路/街、段、巷、弄、號、樓）；2) 判斷該地址在台灣是否真實存在（yes/no/unknown）——若路名是音譯但無法確認台灣真實有此路名，請回傳 unknown；3) 若 likely_exist 不是 yes，提供 1~3 個可能正確的建議地址。\n輸出僅限 JSON，欄位只有三個：text（中文翻譯）、likely_exist（yes/no/unknown）、suggestions（陣列，若 yes 則空陣列）。不要包含其他文字或 markdown。\n輸入地址：\n"' + cleanedAddress + '"';

        try {
          const gr = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
          );
          if (!gr.ok) return res({ error: 'api_error', code: gr.status }, 502, cors);

          const data = await gr.json();
          let content = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
          let parsed = null;
          const m = content.match(/\{[\s\S]*\}/m);
          if (m) try { parsed = JSON.parse(m[0]); } catch(e) {}
          if (!parsed) try { parsed = JSON.parse(content); } catch(e) {}
          if (!parsed) parsed = { text: content, likely_exist: 'unknown', suggestions: [] };

          return res({
            text: parsed.text || '',
            likely_exist: parsed.likely_exist || 'unknown',
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
          }, 200, cors);
        } catch(e) {
          return res({ error: 'fetch_failed' }, 500, cors);
        }
      }
    }

    return new Response('Not found', { status: 404 });
  }
};

function res(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

const HTML = String.raw`<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AVIS 艾維士 轉譯系統</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --red:#D4002A;--red-dark:#A30020;--red-light:#FFE8EC;
  --green:#1B8C3D;--blue:#1565C0;
  --bg:#F4F1EB;--card:#FFF;--text:#1A1A1A;--text2:#555;--text3:#999;
  --border:#DDD8D0;--shadow:0 2px 12px rgba(0,0,0,.08);--radius:12px;
}
html{font-size:15px;}
body{font-family:'Noto Sans TC',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;}
#gate-overlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:999;}
#gate-box{background:#fff;border-radius:16px;padding:40px 36px;border:1px solid var(--border);box-shadow:0 8px 32px rgba(0,0,0,.12);max-width:380px;width:90%;text-align:center;}
#gate-box .gate-logo{font-size:1.6rem;font-weight:900;letter-spacing:2px;color:var(--red);margin-bottom:4px;}
#gate-box .gate-sub{font-size:.85rem;color:var(--text2);margin-bottom:24px;}
#gate-box input{width:100%;padding:12px 16px;font-size:1.3rem;letter-spacing:6px;text-align:center;border:2px solid var(--border);border-radius:10px;font-family:inherit;margin-bottom:10px;transition:.2s;}
#gate-box input:focus{outline:none;border-color:var(--red);box-shadow:0 0 0 3px var(--red-light);}
#gate-error{color:var(--red);font-size:.85rem;min-height:20px;margin-bottom:10px;}
#gate-btn{width:100%;padding:12px;border:none;border-radius:8px;background:var(--red);color:#fff;font-size:1rem;font-weight:700;cursor:pointer;font-family:inherit;transition:.2s;}
#gate-btn:hover{background:var(--red-dark);}
#gate-btn:disabled{background:#aaa;cursor:not-allowed;}
.header{background:linear-gradient(135deg,var(--red) 0%,var(--red-dark) 100%);color:#fff;padding:0;position:sticky;top:0;z-index:100;box-shadow:0 3px 16px rgba(0,0,0,.2);}
.header-inner{max-width:1200px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
.header h1{font-size:1.5rem;font-weight:900;letter-spacing:2px;}
.header h1 span{font-weight:300;font-size:.85rem;opacity:.85;margin-left:8px;}
.header-badge{font-size:.78rem;color:rgba(255,255,255,.65);}
.tabs{display:flex;gap:4px;background:rgba(255,255,255,.12);border-radius:8px;padding:3px;}
.tab-btn{padding:8px 20px;border:none;background:transparent;color:rgba(255,255,255,.7);font-size:.9rem;font-weight:500;border-radius:6px;cursor:pointer;transition:.2s;font-family:inherit;}
.tab-btn:hover{color:#fff;background:rgba(255,255,255,.1);}
.tab-btn.active{color:var(--red);background:#fff;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.15);}
.main{max-width:1200px;margin:0 auto;padding:24px;}
.panel{display:none;}.panel.active{display:block;}
.card{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:28px;margin-bottom:20px;border:1px solid var(--border);}
.card-title{font-size:1.1rem;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;}
textarea{width:100%;min-height:180px;border:2px solid var(--border);border-radius:10px;padding:16px;font-family:'Noto Sans TC',monospace;font-size:.9rem;line-height:1.7;resize:vertical;transition:.3s;background:#FAFAF8;}
textarea:focus{outline:none;border-color:var(--red);background:#fff;box-shadow:0 0 0 3px var(--red-light);}
textarea::placeholder{color:var(--text3);}
.btn{padding:12px 28px;border:none;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer;font-family:inherit;transition:.2s;display:inline-flex;align-items:center;gap:6px;}
.btn-primary{background:var(--red);color:#fff;}
.btn-primary:hover{background:var(--red-dark);transform:translateY(-1px);box-shadow:0 4px 12px rgba(212,0,42,.3);}
.btn-secondary{background:#EEE;color:var(--text);}
.btn-secondary:hover{background:#DDD;}
.btn-row{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;}
.decode-result{margin-top:20px;}
.decode-section{background:#F9F8F5;border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;}
.decode-section h3{font-size:.95rem;font-weight:700;color:var(--red);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--red-light);display:flex;align-items:center;gap:6px;}
.field-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}
.field-item{display:flex;gap:8px;align-items:flex-start;padding:10px 14px;background:#fff;border-radius:8px;border:1px solid #EEE;}
.field-label{font-size:.8rem;color:var(--text2);white-space:nowrap;min-width:80px;font-weight:500;padding-top:2px;}
.field-value{font-size:.95rem;font-weight:600;color:var(--text);word-break:break-all;flex:1;}
.field-value.highlight{color:var(--red);}
.field-value .copy-btn{display:inline-block;margin-left:6px;font-size:.7rem;color:var(--blue);cursor:pointer;opacity:.6;transition:.2s;vertical-align:middle;}
.field-value .copy-btn:hover{opacity:1;}
.alert{padding:14px 18px;border-radius:8px;font-size:.88rem;line-height:1.6;margin-top:12px;display:flex;align-items:flex-start;gap:8px;}
.alert-warn{background:#FFF3E0;border:1px solid #FFB74D;color:#E65100;}
.alert-info{background:#E3F2FD;border:1px solid #64B5F6;color:#1565C0;}
.search-box{display:flex;gap:8px;margin-bottom:20px;}
.search-input{flex:1;padding:12px 16px;border:2px solid var(--border);border-radius:8px;font-size:.95rem;font-family:inherit;}
.search-input:focus{outline:none;border-color:var(--red);}
.glossary-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;}
.glossary-card{background:#F9F8F5;border:1px solid var(--border);border-radius:10px;padding:16px;transition:.2s;}
.glossary-card:hover{border-color:var(--red);box-shadow:0 2px 8px rgba(212,0,42,.1);}
.glossary-code{font-size:1.05rem;font-weight:700;color:var(--red);margin-bottom:4px;}
.glossary-meaning{font-size:.9rem;color:var(--text);line-height:1.6;}
.glossary-tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.72rem;font-weight:600;margin-top:6px;}
.tag-flight{background:#E3F2FD;color:#1565C0;}.tag-zone{background:#E8F5E9;color:#2E7D32;}
.tag-group{background:#FFF3E0;color:#E65100;}.tag-system{background:#F3E5F5;color:#7B1FA2;}.tag-status{background:#ECEFF1;color:#455A64;}
.glossary-cat-title{font-size:1rem;font-weight:700;padding:10px 0 8px;margin-top:16px;border-bottom:2px solid var(--red-light);color:var(--red);}
.glossary-cat-title:first-child{margin-top:0;}
.toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(100px);background:#333;color:#fff;padding:10px 24px;border-radius:8px;font-size:.88rem;font-weight:500;opacity:0;transition:.3s;z-index:998;}
.toast.show{transform:translateX(-50%) translateY(0);opacity:1;}
@media(max-width:768px){.header-inner{flex-direction:column;align-items:flex-start;}.tabs{width:100%;overflow-x:auto;}.tab-btn{font-size:.82rem;padding:8px 14px;white-space:nowrap;}.main{padding:16px;}.card{padding:20px;}.field-grid{grid-template-columns:1fr;}}
</style>
</head>
<body>

<div id="gate-overlay">
  <div id="gate-box">
    <div class="gate-logo">AVIS 艾維士</div>
    <div class="gate-sub">轉譯系統｜請輸入內部通行碼</div>
    <input type="password" id="passcode-input" placeholder="••••••" autocomplete="off" maxlength="32">
    <div id="gate-error"></div>
    <button id="gate-btn">進入系統</button>
  </div>
</div>

<div id="main-app" style="display:none">
  <div class="header">
    <div class="header-inner">
      <h1>AVIS 艾維士<span>轉譯系統</span></h1>
      <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('decode')">✈️ 信件解碼</button>
        <button class="tab-btn" onclick="switchTab('glossary')">📖 術語查詢</button>
      </div>
    </div>
    <div class="header-inner" style="padding-top:8px;padding-bottom:8px;border-top:1px solid rgba(255,255,255,.15);">
      <div class="header-badge">🔒 通行碼已驗證｜API Key 由後端管理，前端不暴露</div>
    </div>
  </div>

  <div class="main">
    <div class="panel active" id="panel-decode">
      <div class="card">
        <div class="card-title"><span>✈️</span> 阿聯酋信件解碼</div>
        <p style="color:var(--text2);font-size:.88rem;margin-bottom:14px;">貼上阿聯酋（EK）的訂單原文，自動拆解成 AST 建單需要的欄位格式。</p>
        <textarea id="decode-input" placeholder="把阿聯酋信件內容貼在這裡..."></textarea>
        <div class="btn-row">
          <button class="btn btn-primary" onclick="decodeMail()">🔍 開始解碼</button>
          <button class="btn btn-secondary" onclick="clearDecode()">清除</button>
        </div>
      </div>
      <div id="decode-result" class="decode-result"></div>
    </div>

    <div class="panel" id="panel-glossary">
      <div class="card">
        <div class="card-title"><span>📖</span> 術語 / 代碼查詢</div>
        <div class="search-box">
          <input class="search-input" id="glossary-search" placeholder="搜尋代碼或關鍵字，例如：EK367、Zone、K組..." oninput="filterGlossary()">
        </div>
        <div id="glossary-list"></div>
      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
var _passcode = '';

document.getElementById('passcode-input').addEventListener('keydown', function(e){ if(e.key==='Enter') submitPasscode(); });
document.getElementById('gate-btn').addEventListener('click', submitPasscode);

async function submitPasscode() {
  var code = document.getElementById('passcode-input').value;
  var btn = document.getElementById('gate-btn');
  var errEl = document.getElementById('gate-error');
  if (!code.trim()) { errEl.textContent = '請輸入通行碼'; return; }
  btn.disabled = true; btn.textContent = '驗證中…'; errEl.textContent = '';
  try {
    var r = await fetch('/check-passcode', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({passcode:code}) });
    var d = await r.json();
    if (d.ok) {
      _passcode = code;
      document.getElementById('gate-overlay').style.display = 'none';
      document.getElementById('main-app').style.display = 'block';
      renderGlossary(GLOSSARY);
    } else {
      errEl.textContent = '通行碼錯誤，請再試一次。';
      document.getElementById('passcode-input').value = '';
      document.getElementById('passcode-input').focus();
    }
  } catch(e) { errEl.textContent = '伺服器錯誤，請稍後再試。'; }
  btn.disabled = false; btn.textContent = '進入系統';
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('onclick').includes(name)); });
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('panel-'+name).classList.add('active');
}

function clearDecode() { document.getElementById('decode-input').value=''; document.getElementById('decode-result').innerHTML=''; }

async function translateAddressWorker(addr) {
  try {
    var r = await fetch('/translate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({address:addr, passcode:_passcode}) });
    if (!r.ok) return null;
    var data = await r.json();
    console.log('[Gemini 回傳]', addr, data);
    return data;
  } catch(e) { return null; }
}

async function decodeMail() {
  try {
    var raw = document.getElementById('decode-input').value.trim();
    if (!raw) { showToast('請先貼上信件內容！'); return; }
    var result = parseEKMail(raw);
    renderDecodeResult(result, raw);
    if (result.vehicles && result.vehicles.length) {
      for (var i=0; i<result.vehicles.length; i++) {
        var v = result.vehicles[i];
        if (!v.address) continue;
        v.addressCN = '⏳ 地址翻譯中...';
        renderDecodeResult(result, raw);
        var obj = await translateAddressWorker(v.address);
        if (obj && !obj.error && obj.text) {
          v.addressMeta = obj;
          if (obj.likely_exist==='no') v.addressCN = '⚠️UNVERIFIED⚠️'+obj.text;
          else if (obj.likely_exist==='unknown') v.addressCN = '⚠️AMBIGUOUS⚠️'+obj.text;
          else v.addressCN = obj.text;
          v.routeCode = detectZone(obj.text);
        } else { v.addressCN = '❌ 翻譯失敗，請確認後端設定'; }
        renderDecodeResult(result, raw);
      }
    }
  } catch(err) { showToast('❌ 解碼出錯：'+(err.message||'未知錯誤')); }
}

function normalizeForParse(text){ return text.replace(/([A-Za-z])\n\s+([A-Za-z0-9])/g,'$1 $2').replace(/\s+/g,' ').trim(); }
function parsePassengerFromLine(line){ var m=line.trim().match(/^\d+\.\s*\d*([A-Z]+)\/([A-Z]+?)(?:MISS|MRS|MR|MS|MSTR|CHD|INF)?(?:\s|$)/i); if(!m)return null; return{last:m[1].toUpperCase(),first:m[2].toUpperCase()}; }
function parseBookerAndPassengers(lines,full){
  var nameLines=[]; for(var i=0;i<lines.length;i++){var line=lines[i];if(/^\d+\.\s*EK\b/i.test(line)||/^\d+\.\s*AUX\b/i.test(line))break;if(/^\d+\.\s*/.test(line))nameLines.push(line.trim());}
  var passengers=[],booker='';
  for(var j=0;j<nameLines.length;j++){
    var pax=parsePassengerFromLine(nameLines[j]);
    if(!pax){var nm=nameLines[j].match(/^\d+\.\s*\d*([A-Z][A-Z0-9]*)/i);if(nm)pax={last:nm[1].toUpperCase(),first:''};}
    if(pax){if(!booker)booker=pax.last+(pax.first?'/'+pax.first:'');passengers.push(pax);}
  }
  if(!passengers.length){var pr=/\d([A-Z]{2,})\/([A-Z]+?)(?:MISS|MRS|MR|MS|MSTR|CHD|INF)?(?:\s|$)/gi,pm;while((pm=pr.exec(full))!==null){var p={last:pm[1].toUpperCase(),first:pm[2].toUpperCase()};if(!booker)booker=p.last+'/'+p.first;passengers.push(p);}}
  return{booker:booker,passengers:passengers};
}
function parseEKMail(text){
  var r={pnr:'',booker:'',passengers:[],flight:'',flightType:'',flightTime:'',date:'',totalPax:0,cabin:'商務艙',carGroup:'',warnings:[],vehicles:[]};
  var lines=text.split('\n').map(function(l){return l.trim();}).filter(Boolean),full=normalizeForParse(text);
  var pnrAll=[],pnrR=/R\/([A-Z0-9]+)/gi,pm;while((pm=pnrR.exec(text))!==null){if(!pnrAll.includes(pm[1].toUpperCase()))pnrAll.push(pm[1].toUpperCase());}
  r.pnr=pnrAll.join('；');
  var nr=parseBookerAndPassengers(lines,full);r.booker=nr.booker;r.passengers=nr.passengers;
  var mn='JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';
  var fm=full.match(new RegExp('EK\\s*(\\d{3})\\s+([A-Z])\\s+(\\d{1,2})('+mn+')\\s+([A-Z]{3})([A-Z]{3})\\s+HK(\\d+)','i'));
  if(fm){r.flight='EK '+fm[1];r.carGroup=fm[2]+'組';r.totalPax=parseInt(fm[7],10);r.date=formatGDSDate(fm[3],fm[4]);
    var fn=parseInt(fm[1],10);
    if(fn===366||fn===386){r.flightType='接機';r.flightTime=fn===366?'落地 03:15':'落地 08:40';}
    else if(fn===367||fn===387){r.flightType='送機';r.flightTime=fn===367?'起飛 01:00':'起飛 00:45';r.warnings.push('送機航班！上車時間可能需要設為 D-1（前一天）');}
  }else{var fm2=full.match(/EK\s*(\d{3})/i);if(fm2)r.flight='EK '+fm2[1];var dm=full.match(new RegExp('(\\d{1,2})('+mn+')','i'));if(dm)r.date=formatGDSDate(dm[1],dm[2]);var hm=full.match(/EK\s*\d{3}[^\n]*?HK(\d+)/i);if(hm)r.totalPax=parseInt(hm[1],10);}
  var tm=full.match(/(\d{4})-\d\s+(\d{4})-\d/);if(tm)r.flightTime+=' ('+tm[1].slice(0,2)+':'+tm[1].slice(2)+' → '+tm[2].slice(0,2)+':'+tm[2].slice(2)+')';
  if(!r.carGroup)r.carGroup='⚠️ 未偵測到，請手動確認';
  var em=full.match(/SR\s+.*?HK\d+\/([\w.]+)\/([\w.]+)/);r.email=em?em[1]+'@'+em[2]:'無email';
  var auxBlocks=extractAuxBlocks(text);
  r.vehicles=auxBlocks.map(function(b,i){return parseAuxBlock(b,i+1,r.date,r.flightType);});
  if(!r.vehicles.length){var sv=parseAuxBlock(text,1,r.date,r.flightType);if(sv.address||sv.phone||sv.pickupTime)r.vehicles.push(sv);}
  return r;
}
function extractAuxBlocks(text){var blocks=[],re=/(^|\n)\s*\d+\.AUX\s+[\s\S]*?(?=(\n\s*\d+\.AUX\s+)|$)/gi,m;while((m=re.exec(text))!==null)blocks.push(m[0].trim());return blocks;}
function detectZone(addrText){var s=addrText.toLowerCase();var zm=[{r:'0,Zone0',k:['novotel','thsr','高鐵','諾富特','凱悅','airport']},{r:'1,Zone1',k:['taipei','new taipei','keelung','taoyuan','hsinchu','桃園','台北','新北','基隆','新竹']},{r:'2,Zone2',k:['miaoli','taichung','changhua','nantou','苗栗','台中','彰化','南投']},{r:'3,Zone3',k:['yunlin','chiayi','tainan','kaohsiung','雲林','嘉義','台南','高雄']},{r:'4,Zone4',k:['pingtung','hualien','taitung','屏東','花蓮','台東']}];for(var z=0;z<zm.length;z++){if(zm[z].k.some(function(k){return s.includes(k);}))return zm[z].r;}return '';}
function parseAuxBlock(block,orderNo,commonDate,flightType){
  var b=normalizeForParse(block),v={orderNo:orderNo,carPax:1,address:'',addressCN:'',phone:'',phoneCountry:'',phoneFlag:'',pickupTime:'',pickupDateTime:'',bags:0,requestVan:false,routeCode:'',warnings:[]};
  var cm=b.match(/AUX\s+SUR\s+EK\s+HK(\d+)/i);if(cm)v.carPax=parseInt(cm[1],10);
  var am2=b.match(/ADDRESS\s+(.*?)(?=\*|TEL|\s+\d{9,15}\b|\s886\d{7,}|\s09\d{8}|\bP\/U|\bPU\d|\bPU\s|$)/i);if(am2)v.address=am2[1].replace(/\*.*/,'').trim();
  if(!v.address){var am=b.match(/[A-Z]{3}\.\s*([A-Z0-9][^*]*?)(?=\s+\d{9,15}\b|\s*886\d{7,}|\s*09\d{8}|\bP\/U|\bPU\d|\bPU\s|$)/i);if(am)v.address=am[1].trim();}
  if(v.address){v.address=cleanAddress(v.address).replace(/\*TCP\s+[A-Z]+\*/gi,'').replace(/\*\d+\s*BAGS?\*/gi,'').replace(/\*REQUEST\s+VAN\*/gi,'').replace(/\*/g,'').trim();}
  var pr=extractPhoneFromText(block);v.phone=pr.phone||'—';v.phoneCountry=pr.country;v.phoneFlag=pr.flag;
  var pu=b.match(/(?:P\/U|PU)\s*(\d{1,2}:\d{2}|\d{2,4})/i);if(pu){v.pickupTime=normalizeTime(pu[1]);v.pickupDateTime=commonDate&&v.pickupTime?commonDate+' '+v.pickupTime:(v.pickupTime||commonDate||'—');}
  var bg=b.match(/\*?\s*(\d+)\s*(?:BAGS?|PCS?\s*(?:LUGGAGE)?)\s*\*?/i);if(bg)v.bags=parseInt(bg[1],10);
  if(/REQUEST\s*VAN/i.test(b))v.requestVan=true;
  return v;
}
function formatGDSDate(day,mon){var m={JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};var mo=m[String(mon).toUpperCase()];if(!mo)return '';return new Date().getFullYear()+'/'+mo+'/'+String(day).padStart(2,'0');}
function normalizeTime(t){if(!t)return '';t=String(t).trim();if(t.includes(':')){var p=t.split(':');return p[0].padStart(2,'0')+':'+p[1].padStart(2,'0');}if(t.length>4)t=t.slice(0,4);if(t.length===4)return t.slice(0,2)+':'+t.slice(2);if(t.length===3)return t.slice(0,1).padStart(2,'0')+':'+t.slice(1);if(t.length===2)return t+':00';return t;}
var PHONE_CC=[
  {cc:'886',name:'台灣',flag:'🇹🇼',len:[8,9,10]},
  {cc:'971',name:'阿聯酋',flag:'🇦🇪',len:[9]},
  {cc:'966',name:'沙烏地阿拉伯',flag:'🇸🇦',len:[9]},
  {cc:'965',name:'科威特',flag:'🇰🇼',len:[8]},
  {cc:'974',name:'卡達',flag:'🇶🇦',len:[8]},
  {cc:'973',name:'巴林',flag:'🇧🇭',len:[8]},
  {cc:'968',name:'阿曼',flag:'🇴🇲',len:[8]},
  {cc:'967',name:'葉門',flag:'🇾🇪',len:[9]},
  {cc:'964',name:'伊拉克',flag:'🇮🇶',len:[10]},
  {cc:'963',name:'敘利亞',flag:'🇸🇾',len:[9]},
  {cc:'962',name:'約旦',flag:'🇯🇴',len:[9]},
  {cc:'961',name:'黎巴嫩',flag:'🇱🇧',len:[7,8]},
  {cc:'972',name:'以色列',flag:'🇮🇱',len:[9]},
  {cc:'98',name:'伊朗',flag:'🇮🇷',len:[10]},
  {cc:'91',name:'印度',flag:'🇮🇳',len:[10]},
  {cc:'92',name:'巴基斯坦',flag:'🇵🇰',len:[10]},
  {cc:'93',name:'阿富汗',flag:'🇦🇫',len:[9]},
  {cc:'94',name:'斯里蘭卡',flag:'🇱🇰',len:[9]},
  {cc:'977',name:'尼泊爾',flag:'🇳🇵',len:[10]},
  {cc:'975',name:'不丹',flag:'🇧🇹',len:[8]},
  {cc:'960',name:'馬爾地夫',flag:'🇲🇻',len:[7]},
  {cc:'880',name:'孟加拉',flag:'🇧🇩',len:[10]},
  {cc:'60',name:'馬來西亞',flag:'🇲🇾',len:[9,10]},
  {cc:'62',name:'印尼',flag:'🇮🇩',len:[9,10,11]},
  {cc:'63',name:'菲律賓',flag:'🇵🇭',len:[10]},
  {cc:'65',name:'新加坡',flag:'🇸🇬',len:[8]},
  {cc:'66',name:'泰國',flag:'🇹🇭',len:[9]},
  {cc:'84',name:'越南',flag:'🇻🇳',len:[9,10]},
  {cc:'95',name:'緬甸',flag:'🇲🇲',len:[8,9]},
  {cc:'855',name:'柬埔寨',flag:'🇰🇭',len:[8,9]},
  {cc:'856',name:'寮國',flag:'🇱🇦',len:[8,9]},
  {cc:'86',name:'中國',flag:'🇨🇳',len:[11]},
  {cc:'81',name:'日本',flag:'🇯🇵',len:[10,11]},
  {cc:'82',name:'韓國',flag:'🇰🇷',len:[9,10]},
  {cc:'852',name:'香港',flag:'🇭🇰',len:[8]},
  {cc:'853',name:'澳門',flag:'🇲🇴',len:[8]},
  {cc:'976',name:'蒙古',flag:'🇲🇳',len:[8]},
  {cc:'7',name:'俄羅斯/哈薩克',flag:'🇷🇺',len:[10]},
  {cc:'90',name:'土耳其',flag:'🇹🇷',len:[10]},
  {cc:'61',name:'澳洲',flag:'🇦🇺',len:[9]},
  {cc:'64',name:'紐西蘭',flag:'🇳🇿',len:[8,9]},
  {cc:'44',name:'英國',flag:'🇬🇧',len:[10]},
  {cc:'33',name:'法國',flag:'🇫🇷',len:[9]},
  {cc:'49',name:'德國',flag:'🇩🇪',len:[10,11]},
  {cc:'39',name:'義大利',flag:'🇮🇹',len:[9,10]},
  {cc:'34',name:'西班牙',flag:'🇪🇸',len:[9]},
  {cc:'351',name:'葡萄牙',flag:'🇵🇹',len:[9]},
  {cc:'31',name:'荷蘭',flag:'🇳🇱',len:[9]},
  {cc:'32',name:'比利時',flag:'🇧🇪',len:[8,9]},
  {cc:'41',name:'瑞士',flag:'🇨🇭',len:[9]},
  {cc:'43',name:'奧地利',flag:'🇦🇹',len:[10,11]},
  {cc:'352',name:'盧森堡',flag:'🇱🇺',len:[9]},
  {cc:'353',name:'愛爾蘭',flag:'🇮🇪',len:[9]},
  {cc:'46',name:'瑞典',flag:'🇸🇪',len:[9]},
  {cc:'47',name:'挪威',flag:'🇳🇴',len:[8]},
  {cc:'45',name:'丹麥',flag:'🇩🇰',len:[8]},
  {cc:'358',name:'芬蘭',flag:'🇫🇮',len:[9,10]},
  {cc:'354',name:'冰島',flag:'🇮🇸',len:[7]},
  {cc:'48',name:'波蘭',flag:'🇵🇱',len:[9]},
  {cc:'420',name:'捷克',flag:'🇨🇿',len:[9]},
  {cc:'421',name:'斯洛伐克',flag:'🇸🇰',len:[9]},
  {cc:'36',name:'匈牙利',flag:'🇭🇺',len:[9]},
  {cc:'40',name:'羅馬尼亞',flag:'🇷🇴',len:[9]},
  {cc:'30',name:'希臘',flag:'🇬🇷',len:[10]},
  {cc:'380',name:'烏克蘭',flag:'🇺🇦',len:[9]},
  {cc:'375',name:'白俄羅斯',flag:'🇧🇾',len:[9]},
  {cc:'373',name:'摩爾多瓦',flag:'🇲🇩',len:[8]},
  {cc:'359',name:'保加利亞',flag:'🇧🇬',len:[9]},
  {cc:'385',name:'克羅埃西亞',flag:'🇭🇷',len:[8,9]},
  {cc:'381',name:'塞爾維亞',flag:'🇷🇸',len:[8,9]},
  {cc:'387',name:'波士尼亞',flag:'🇧🇦',len:[8]},
  {cc:'382',name:'蒙特內哥羅',flag:'🇲🇪',len:[8]},
  {cc:'389',name:'北馬其頓',flag:'🇲🇰',len:[8]},
  {cc:'355',name:'阿爾巴尼亞',flag:'🇦🇱',len:[9]},
  {cc:'386',name:'斯洛維尼亞',flag:'🇸🇮',len:[8]},
  {cc:'370',name:'立陶宛',flag:'🇱🇹',len:[8]},
  {cc:'371',name:'拉脫維亞',flag:'🇱🇻',len:[8]},
  {cc:'372',name:'愛沙尼亞',flag:'🇪🇪',len:[7,8]},
  {cc:'356',name:'馬爾他',flag:'🇲🇹',len:[8]},
  {cc:'357',name:'賽普勒斯',flag:'🇨🇾',len:[8]},
  {cc:'377',name:'摩納哥',flag:'🇲🇨',len:[8]},
  {cc:'423',name:'列支敦斯登',flag:'🇱🇮',len:[7]},
  {cc:'994',name:'亞塞拜然',flag:'🇦🇿',len:[9]},
  {cc:'995',name:'喬治亞',flag:'🇬🇪',len:[9]},
  {cc:'374',name:'亞美尼亞',flag:'🇦🇲',len:[8]},
  {cc:'998',name:'烏茲別克',flag:'🇺🇿',len:[9]},
  {cc:'996',name:'吉爾吉斯',flag:'🇰🇬',len:[9]},
  {cc:'992',name:'塔吉克',flag:'🇹🇯',len:[9]},
  {cc:'993',name:'土庫曼',flag:'🇹🇲',len:[8]},
  {cc:'970',name:'巴勒斯坦',flag:'🇵🇸',len:[9]},
  {cc:'675',name:'巴布亞紐幾內亞',flag:'🇵🇬',len:[8]},
  {cc:'679',name:'斐濟',flag:'🇫🇯',len:[7]},
  {cc:'673',name:'汶萊',flag:'🇧🇳',len:[7]},
  {cc:'670',name:'東帝汶',flag:'🇹🇱',len:[8]},
  {cc:'20',name:'埃及',flag:'🇪🇬',len:[10]},
  {cc:'27',name:'南非',flag:'🇿🇦',len:[9]},
  {cc:'212',name:'摩洛哥',flag:'🇲🇦',len:[9]},
  {cc:'213',name:'阿爾及利亞',flag:'🇩🇿',len:[9]},
  {cc:'216',name:'突尼西亞',flag:'🇹🇳',len:[8]},
  {cc:'218',name:'利比亞',flag:'🇱🇾',len:[9]},
  {cc:'249',name:'蘇丹',flag:'🇸🇩',len:[9]},
  {cc:'211',name:'南蘇丹',flag:'🇸🇸',len:[9]},
  {cc:'234',name:'奈及利亞',flag:'🇳🇬',len:[10]},
  {cc:'233',name:'迦納',flag:'🇬🇭',len:[9]},
  {cc:'225',name:'象牙海岸',flag:'🇨🇮',len:[10]},
  {cc:'221',name:'塞內加爾',flag:'🇸🇳',len:[9]},
  {cc:'224',name:'幾內亞',flag:'🇬🇳',len:[9]},
  {cc:'226',name:'布吉納法索',flag:'🇧🇫',len:[8]},
  {cc:'223',name:'馬利',flag:'🇲🇱',len:[8]},
  {cc:'227',name:'尼日',flag:'🇳🇪',len:[8]},
  {cc:'228',name:'多哥',flag:'🇹🇬',len:[8]},
  {cc:'229',name:'貝南',flag:'🇧🇯',len:[8]},
  {cc:'232',name:'獅子山',flag:'🇸🇱',len:[8]},
  {cc:'231',name:'賴比瑞亞',flag:'🇱🇷',len:[8]},
  {cc:'237',name:'喀麥隆',flag:'🇨🇲',len:[9]},
  {cc:'235',name:'查德',flag:'🇹🇩',len:[8]},
  {cc:'236',name:'中非',flag:'🇨🇫',len:[8]},
  {cc:'241',name:'加彭',flag:'🇬🇦',len:[7,8]},
  {cc:'242',name:'剛果',flag:'🇨🇬',len:[9]},
  {cc:'243',name:'剛果民主共和國',flag:'🇨🇩',len:[9]},
  {cc:'244',name:'安哥拉',flag:'🇦🇴',len:[9]},
  {cc:'250',name:'盧安達',flag:'🇷🇼',len:[9]},
  {cc:'257',name:'蒲隆地',flag:'🇧🇮',len:[8]},
  {cc:'254',name:'肯亞',flag:'🇰🇪',len:[9]},
  {cc:'255',name:'坦尚尼亞',flag:'🇹🇿',len:[9]},
  {cc:'256',name:'烏干達',flag:'🇺🇬',len:[9]},
  {cc:'251',name:'衣索比亞',flag:'🇪🇹',len:[9]},
  {cc:'252',name:'索馬利亞',flag:'🇸🇴',len:[8,9]},
  {cc:'253',name:'吉布地',flag:'🇩🇯',len:[8]},
  {cc:'258',name:'莫三比克',flag:'🇲🇿',len:[9]},
  {cc:'260',name:'尚比亞',flag:'🇿🇲',len:[9]},
  {cc:'263',name:'辛巴威',flag:'🇿🇼',len:[9]},
  {cc:'265',name:'馬拉威',flag:'🇲🇼',len:[9]},
  {cc:'264',name:'納米比亞',flag:'🇳🇦',len:[9]},
  {cc:'267',name:'波札那',flag:'🇧🇼',len:[8]},
  {cc:'268',name:'史瓦帝尼',flag:'🇸🇿',len:[8]},
  {cc:'266',name:'賴索托',flag:'🇱🇸',len:[8]},
  {cc:'261',name:'馬達加斯加',flag:'🇲🇬',len:[9]},
  {cc:'230',name:'模里西斯',flag:'🇲🇺',len:[7,8]},
  {cc:'248',name:'塞席爾',flag:'🇸🇨',len:[7]},
  {cc:'1',name:'美國/加拿大',flag:'🇺🇸',len:[10]},
  {cc:'52',name:'墨西哥',flag:'🇲🇽',len:[10]},
  {cc:'502',name:'瓜地馬拉',flag:'🇬🇹',len:[8]},
  {cc:'503',name:'薩爾瓦多',flag:'🇸🇻',len:[8]},
  {cc:'504',name:'宏都拉斯',flag:'🇭🇳',len:[8]},
  {cc:'505',name:'尼加拉瓜',flag:'🇳🇮',len:[8]},
  {cc:'506',name:'哥斯大黎加',flag:'🇨🇷',len:[8]},
  {cc:'507',name:'巴拿馬',flag:'🇵🇦',len:[7,8]},
  {cc:'509',name:'海地',flag:'🇭🇹',len:[8]},
  {cc:'501',name:'貝里斯',flag:'🇧🇿',len:[7]},
  {cc:'55',name:'巴西',flag:'🇧🇷',len:[10,11]},
  {cc:'54',name:'阿根廷',flag:'🇦🇷',len:[10]},
  {cc:'56',name:'智利',flag:'🇨🇱',len:[9]},
  {cc:'57',name:'哥倫比亞',flag:'🇨🇴',len:[10]},
  {cc:'51',name:'秘魯',flag:'🇵🇪',len:[9]},
  {cc:'58',name:'委內瑞拉',flag:'🇻🇪',len:[10]},
  {cc:'593',name:'厄瓜多',flag:'🇪🇨',len:[9]},
  {cc:'591',name:'玻利維亞',flag:'🇧🇴',len:[8,9]},
  {cc:'595',name:'巴拉圭',flag:'🇵🇾',len:[9]},
  {cc:'598',name:'烏拉圭',flag:'🇺🇾',len:[9]},
  {cc:'592',name:'蓋亞那',flag:'🇬🇾',len:[7]},
  {cc:'597',name:'蘇利南',flag:'🇸🇷',len:[7]},
  {cc:'53',name:'古巴',flag:'🇨🇺',len:[8]},
];
PHONE_CC.sort(function(a,b){return b.cc.length-a.cc.length;});
function parsePhoneWithCountry(digits){
  if(!digits)return null;
  if(digits.startsWith('00'))digits=digits.slice(2);
  for(var i=0;i<PHONE_CC.length;i++){
    var c=PHONE_CC[i];
    if(digits.startsWith(c.cc)){var sub=digits.slice(c.cc.length);if(c.len.indexOf(sub.length)!==-1)return{cc:c.cc,name:c.name,flag:c.flag,formatted:'+'+c.cc+sub};}
  }
  if(/^09\d{8}$/.test(digits))return{cc:'886',name:'台灣',flag:'🇹🇼',formatted:digits};
  return null;
}
function extractPhoneFromText(text){
  var raw='',puIdx=-1,puRe=/(?:P\/U|PU\d)/gi,m;
  while((m=puRe.exec(text))!==null)puIdx=m.index;
  if(puIdx>0){
    var digits='',i=puIdx-1;
    while(i>=0){
      var ch=text[i];
      if(/\d/.test(ch)){digits=ch+digits;i--;}
      else if(/\s/.test(ch)){if(digits.length>=9)break;i--;}
      else break;
    }
    raw=digits;
  }
  if(!raw){var s=normalizeForParse(text),telM=s.match(/TEL\s*\+?([\d\s\-]{7,20})/i);if(telM)raw=telM[1].replace(/[\s\-]/g,'');}
  if(!raw)return{phone:'',country:'',flag:''};
  var parsed=parsePhoneWithCountry(raw);
  if(parsed)return{phone:parsed.formatted,country:parsed.name,flag:parsed.flag};
  return{phone:raw,country:'',flag:'🌐'};
}
function cleanAddress(addr){if(!addr)return '';return addr.replace(/^[A-Z]{3}\.\s*/g,'').replace(/\bTAIWAN\b/ig,'').replace(/\b\d{5,6}\b/g,'').replace(/\s+\d{9,15}\s*$/,'').replace(/\s+/g,' ').trim();}
function renderDecodeResult(r,raw){
  var container=document.getElementById('decode-result');
  var paxDisplay=r.passengers.map(function(p){return p.first?p.last+'/'+p.first:p.last;}).join('、')||'（未偵測到）';
  var html='';
  if(r.warnings.length)html+=r.warnings.map(function(w){return '<div class="alert alert-warn">⚠️ '+w+'</div>';}).join('');
  html+='<div class="decode-section"><h3>📨 共同資訊</h3><div class="field-grid">'+field('訂單編號',r.pnr||'—',true)+field('訂車人',r.booker||'—',true)+field('乘客姓名',paxDisplay,true)+field('乘客 Email',r.email||'無email',true)+field('航班號碼',r.flight||'—',true)+field('日期',r.date||'—',true)+field('總人數',(r.totalPax||Math.max(r.passengers.length,1))+' 人',true)+field('航班時間',r.flightTime||'—')+field('服務項目',r.flightType||'接機',true)+field('客戶來源','信件',true)+field('艙等',r.cabin||'商務艙')+field('車組',r.carGroup||'—',true)+'</div></div>';
  if(!r.vehicles.length)html+='<div class="alert alert-warn">⚠️ 沒有偵測到 AUX 用車訂單，請確認信件格式。</div>';
  r.vehicles.forEach(function(v){
    var ai=buildAddressDisplay(v),pp,dp,pe,de;
    if(r.flightType==='送機'){pp=ai.place||'—';dp='桃園國際機場';pe=ai.buttons;de='';}
    else{pp='桃園國際機場';dp=ai.place||'—';pe='';de=ai.buttons;}
    html+='<div class="decode-section"><h3>🚘 用車訂單 '+v.orderNo+'</h3><div class="field-grid">'+field('當車人數',v.carPax+' 人',true)+fieldWithExtra('電話號碼',v.phone||'—',v.phone&&v.phone!=='—',(v.phoneFlag||v.phoneCountry)?'<span style="font-size:.8rem;color:var(--text2);margin-left:6px;">'+v.phoneFlag+' '+v.phoneCountry+'</span>':'')+field('上車時間',v.pickupDateTime||'—',true)+fieldWithExtra('上車地點',pp,true,pe)+fieldWithExtra('下車地點',dp,true,de)+field('路線編號',v.routeCode||'⚠️ 無法自動判斷，請手動確認',true)+field('大行李數',v.bags?v.bags+' 件':'—')+field('要求車型',v.requestVan?'🚐 廂型車（VAN）':'一般轎車')+'</div>'+ai.unverifiedWarning+'</div>';
  });
  html+='<div class="alert alert-info">💡 <strong>小提醒：</strong>每一筆 AUX 已拆成一張用車訂單；地址仍建議用 Google Maps 再確認一次。</div>';
  container.innerHTML=html;container.scrollIntoView({behavior:'smooth',block:'start'});
}
function buildAddressDisplay(v){
  var addrEN=v.address?cleanAddress(v.address):'',raw=v.addressCN||'';
  var UT='⚠️UNVERIFIED⚠️',AT='⚠️AMBIGUOUS⚠️';
  var isU=raw.startsWith(UT),isA=raw.startsWith(AT),isL=(raw==='⏳ 地址翻譯中...');
  var addrCN=isU?raw.replace(UT,''):(isA?raw.replace(AT,''):raw);
  var place=(addrCN&&!isL)?addrCN:addrEN,afm=place||'';
  var mq=afm?encodeURIComponent(afm+(addrCN?'':', Taiwan')):'';
  var mu='https://www.google.com/maps/search/'+mq;
  var buttons=afm?'<a href="'+mu+'" target="_blank" style="display:inline-block;margin-top:4px;padding:4px 10px;background:var(--green);color:#fff;border-radius:5px;font-size:.75rem;text-decoration:none;font-weight:600;">📍 Google Maps</a>':'';
  var uw='';
  if((isU||isA)&&afm){var da=escapeHtml(addrCN),sh='',meta=v.addressMeta||{};
    if(Array.isArray(meta.suggestions)&&meta.suggestions.length){sh='<div style="margin-top:8px;font-weight:600;">可能地址：</div><ul style="margin:8px 0 0 18px;">'+meta.suggestions.map(function(s){return '<li><a href="https://www.google.com/maps/search/'+encodeURIComponent(s+', Taiwan')+'" target="_blank" style="color:var(--blue);">'+escapeHtml(s)+'</a></li>';}).join('')+'</ul>';}
    uw='<div class="alert alert-warn" style="margin-top:12px;">⚠️ 地址「'+da+'」未通過驗證或資訊模糊，請人工確認。<br><a href="'+mu+'" target="_blank" style="color:var(--blue);font-weight:700;">📍 點此開啟 Google Maps 確認</a>'+sh+'</div>';}
  return{place:place,buttons:buttons,unverifiedWarning:uw};
}
function field(label,value,copyable){var raw=String(value!=null?value:''),sv=escapeAttr(stripHtml(raw));var cb=copyable&&raw&&raw!=='—'?'<span class="copy-btn" onclick="copyText(\''+sv+'\')">📋複製</span>':'';return '<div class="field-item"><span class="field-label">'+label+'</span><span class="field-value'+(copyable?' highlight':'')+'">'+raw+cb+'</span></div>';}
function fieldWithExtra(label,value,copyable,extra){var raw=String(value!=null?value:''),sv=escapeAttr(stripHtml(raw));var cb=copyable&&raw&&raw!=='—'?'<span class="copy-btn" onclick="copyText(\''+sv+'\')">📋複製</span>':'';return '<div class="field-item"><span class="field-label">'+label+'</span><span class="field-value'+(copyable?' highlight':'')+'">'+raw+cb+(extra||'')+'</span></div>';}
function stripHtml(html){var d=document.createElement('div');d.innerHTML=html;return d.textContent||d.innerText||'';}
function escapeAttr(str){return String(str!=null?str:'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ').replace(/\r/g,' ');}
function escapeHtml(s){return String(s||'').replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function copyText(text){navigator.clipboard.writeText(text).then(function(){showToast('✅ 已複製！');}).catch(function(){showToast('複製失敗，請手動複製');});}
function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2000);}

var GLOSSARY=[
  {cat:'航班代碼',code:'EK366',meaning:'阿聯酋航空 接機航班（落地時間 03:15）',tag:'flight'},
  {cat:'航班代碼',code:'EK386',meaning:'阿聯酋航空 接機航班（落地時間 08:40）',tag:'flight'},
  {cat:'航班代碼',code:'EK367',meaning:'阿聯酋航空 送機航班（起飛時間 01:00）⚠️ 訂單上車時間應為 D-1',tag:'flight'},
  {cat:'航班代碼',code:'EK387',meaning:'阿聯酋航空 送機航班（起飛時間 00:45）⚠️ 因為 0045 起飛，訂單上車時間應為 D-1',tag:'flight'},
  {cat:'航班代碼',code:'1K',meaning:'阿聯酋航空（EK）的 IATA 代碼，建單時「訂車人名稱」固定填 1K',tag:'flight'},
  {cat:'航班代碼',code:'TPE',meaning:'桃園國際機場（Taiwan Taoyuan International Airport）',tag:'flight'},
  {cat:'航班代碼',code:'DXB',meaning:'杜拜國際機場（Dubai International Airport）',tag:'flight'},
  {cat:'航班代碼',code:'HK1',meaning:'已確認 1 位旅客（HK = 已確認，數字 = 人數）',tag:'flight'},
  {cat:'航班代碼',code:'HK2',meaning:'已確認 2 位旅客',tag:'flight'},
  {cat:'訂單狀態碼',code:'PNR',meaning:'訂位代號（Passenger Name Record），R/ 後面的字母串',tag:'status'},
  {cat:'訂單狀態碼',code:'AUX SUR',meaning:'附加服務（Auxiliary Surface），代表地面交通接送服務',tag:'status'},
  {cat:'訂單狀態碼',code:'P/U',meaning:'Pick Up 接客，後面的數字是上車時間',tag:'status'},
  {cat:'訂單狀態碼',code:'TCP',meaning:'同一台車多位乘客（機票分開買），不用新增乘客，但人數和行李數要加',tag:'status'},
  {cat:'車組代碼',code:'O組',meaning:'O 組車組（從航班行 EK XXX 後面的字母判斷）',tag:'group'},
  {cat:'訂單狀態碼',code:'CDD',meaning:'Chauffeur Drive Departure（代駕送機服務）',tag:'status'},
  {cat:'訂單狀態碼',code:'MR',meaning:'先生（Mr.），出現在姓名尾端不需要填入',tag:'status'},
  {cat:'訂單狀態碼',code:'MS / MRS',meaning:'女士，出現在姓名尾端不需要填入',tag:'status'},
  {cat:'訂單狀態碼',code:'REQUEST VAN',meaning:'客戶要求派廂型車（通常行李多或人數多）',tag:'status'},
  {cat:'Zone 區域',code:'Zone 0',meaning:'桃園機場周邊（凱悅、諾富特、高鐵）— 免費',tag:'zone'},
  {cat:'Zone 區域',code:'Zone 1',meaning:'北北基桃竹（新竹以北）— 免費',tag:'zone'},
  {cat:'Zone 區域',code:'Zone 2',meaning:'苗栗、台中、彰化、南投 — 收費（加購）',tag:'zone'},
  {cat:'Zone 區域',code:'Zone 3',meaning:'雲林、嘉義、台南、高雄 — 收費（加購）',tag:'zone'},
  {cat:'Zone 區域',code:'Zone 4',meaning:'屏東、花蓮、台東 — 收費（加購）',tag:'zone'},
  {cat:'Zone 區域',code:'Novotel & THSR',meaning:'諾富特飯店 & 台灣高鐵（屬於 Zone 0）',tag:'zone'},
  {cat:'車組代碼',code:'H組',meaning:'H 組客戶車組（額外等候費 450/小時）',tag:'group'},
  {cat:'車組代碼',code:'L組',meaning:'L 組客戶車組（額外等候費 650/小時）— Sedan 轎車',tag:'group'},
  {cat:'車組代碼',code:'K組',meaning:'K 組客戶車組（額外等候費 650/小時）— People over / MB-V Class',tag:'group'},
  {cat:'車組代碼',code:'P組',meaning:'P 組客戶車組（額外等候費 850/小時）',tag:'group'},
  {cat:'車組代碼',code:'V組',meaning:'V 組客戶車組（額外等候費 750/小時）',tag:'group'},
  {cat:'車組代碼',code:'W組',meaning:'W 組客戶車組（額外等候費 1,100/小時）',tag:'group'},
  {cat:'AST 建單',code:'訂車人名稱',meaning:'阿聯酋訂單固定填「1K」',tag:'system'},
  {cat:'AST 建單',code:'服務類型',meaning:'阿聯酋訂單固定選「接機」',tag:'system'},
  {cat:'AST 建單',code:'客戶來源',meaning:'阿聯酋訂單固定選「信件」',tag:'system'},
  {cat:'AST 建單',code:'艙等',meaning:'F = 頭等艙，其餘 = 商務艙',tag:'system'},
  {cat:'AST 建單',code:'舉牌',meaning:'預設有，不要刪除',tag:'system'},
  {cat:'AST 建單',code:'新增完成',meaning:'存檔即完成，不需傳送 API',tag:'system'},
  {cat:'AST 建單',code:'多台車處理',meaning:'同 PNR 每台各建一筆，PNR 後加 -1、-2 區分',tag:'system'},
  {cat:'AST 建單',code:'修改訂單',meaning:'修改訂單需要「儲存 + 傳送 API」兩步，新增只要存檔',tag:'system'},
];
function renderGlossary(items){
  var list=document.getElementById('glossary-list');
  var cats=[...new Set(items.map(function(g){return g.cat;}))];
  var tc={flight:'tag-flight',zone:'tag-zone',group:'tag-group',system:'tag-system',status:'tag-status'};
  var tl={flight:'航班',zone:'區域',group:'車組',system:'系統',status:'狀態碼'};
  list.innerHTML=cats.map(function(cat){var ci=items.filter(function(g){return g.cat===cat;});return '<div class="glossary-cat-title">'+cat+'</div><div class="glossary-grid">'+ci.map(function(g){return '<div class="glossary-card"><div class="glossary-code">'+g.code+'</div><div class="glossary-meaning">'+g.meaning+'</div><span class="glossary-tag '+(tc[g.tag]||'tag-status')+'">'+(tl[g.tag]||g.tag)+'</span></div>';}).join('')+'</div>';}).join('');
}
function filterGlossary(){var q=document.getElementById('glossary-search').value.trim().toLowerCase();if(!q){renderGlossary(GLOSSARY);return;}renderGlossary(GLOSSARY.filter(function(g){return g.code.toLowerCase().includes(q)||g.meaning.toLowerCase().includes(q)||g.cat.toLowerCase().includes(q);}));}
</script>
</body>
</html>`;
