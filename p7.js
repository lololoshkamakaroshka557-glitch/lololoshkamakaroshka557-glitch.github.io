"use strict";
/* ---------- состояние ---------- */
const LIB_KEY='nocturna_lib_v1';
let tracks=[];
try{tracks=JSON.parse(localStorage.getItem(LIB_KEY)||'[]');}catch(e){tracks=[];}
if(!Array.isArray(tracks))tracks=[];
let curId=null;
const bufCache=new Map(); /* id -> {buf,peaks,key} */
const bufKey=t=>t.id+'|'+JSON.stringify(t.mix.gains)+'|'+JSON.stringify(t.mix.mutes);

/* ---------- аудио ---------- */
let AC=null,analyser=null,volNode=null,srcNode=null;
let st={playing:false,startCtxTime:0,offset:0};
let loopOn=false;
const CAN_SHARE=!!(navigator.canShare&&navigator.share);

/* процедурная обложка трека */
function paintCover(cv,tr){
  const G=GENRES[tr.style],rng=mulberry32(tr.seed^0xCAFE);
  const W=cv.width||300,H=cv.height||150,cx=cv.getContext('2d');
  const g=cx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,G.colors[0]);g.addColorStop(1,G.colors[1]);
  cx.globalAlpha=1;cx.fillStyle=g;cx.fillRect(0,0,W,H);
  cx.globalAlpha=.15;
  for(let i=0;i<7;i++){
    cx.fillStyle=i%2?'#ffffff':'#000000';
    const r=(0.08+rng()*0.3)*W;
    cx.beginPath();cx.arc(rng()*W,rng()*H,r,0,7);cx.fill();
  }
  cx.globalAlpha=.2;
  for(let i=0;i<5;i++){
    cx.strokeStyle='#ffffff';cx.lineWidth=Math.max(1,W/300);
    cx.beginPath();const y0=rng()*H;cx.moveTo(0,y0);cx.lineTo(W,y0+(rng()*2-1)*H*.4);cx.stroke();
  }
  cx.globalAlpha=1;
  const vg=cx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,H*.85);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.45)');
  cx.fillStyle=vg;cx.fillRect(0,0,W,H);
}
/* волновая дорожка прогресса */
function drawWave(){
  const cv=$('pwave');if(!cv)return;
  const wrap=cv.parentElement,W=wrap.clientWidth,H=wrap.clientHeight;
  if(W<5)return;
  if(cv.width!==W*2||cv.height!==H*2){cv.width=W*2;cv.height=H*2;}
  const cx=cv.getContext('2d');cx.clearRect(0,0,cv.width,cv.height);
  const e=curId?bufCache.get(curId):null;
  if(!e){
    cx.fillStyle='rgba(255,255,255,.14)';
    const N=56,bw=cv.width/N;
    for(let i=0;i<N;i++)cx.fillRect(i*bw+2,cv.height/2-2,bw-4,4);
    return;
  }
  const prog=e.duration?clamp(curTime()/e.duration,0,1):0;
  const played=cx.createLinearGradient(0,0,cv.width,0);
  played.addColorStop(0,'#22d3ee');played.addColorStop(1,'#7c5cff');
  const n=e.peaks.length,bw=cv.width/n;
  for(let i=0;i<n;i++){
    const h=Math.max(3,e.peaks[i]*cv.height*0.92);
    cx.fillStyle=(i/n<prog)?played:'rgba(255,255,255,.2)';
    cx.fillRect(i*bw,(cv.height-h)/2,Math.max(2,bw-2),h);
  }
}
function ensureAC(){
  if(!AC){AC=new (window.AudioContext||window.webkitAudioContext)();
    analyser=AC.createAnalyser();analyser.fftSize=1024;
    volNode=AC.createGain();volNode.gain.value=(document.getElementById('volR').value/100)**1.5;
    volNode.connect(analyser);analyser.connect(AC.destination);}
  if(AC.state==='suspended')AC.resume();
}
function stopSrc(){if(srcNode){try{srcNode._manual=true;srcNode.stop();}catch(e){}srcNode.disconnect();srcNode=null;}}
async function getBuffer(tr){
  const key=bufKey(tr);
  const c=bufCache.get(tr.id);
  if(c&&c.key===key)return c;
  const plan=composePlan({seed:tr.seed,style:tr.style,mood:tr.mood,bpm:tr.bpm,durSec:tr.durSec,form:tr.form});
  const buf=await renderTrack(plan,tr.mix);
  const entry={buf,key,peaks:computePeaks(buf,420),duration:buf.duration};
  bufCache.set(tr.id,entry);
  if(bufCache.size>3){const k=[...bufCache.keys()][0];if(k!==tr.id)bufCache.delete(k);}
  return entry;
}
async function playTrack(tr,offset){
  ensureAC();stopSrc();
  setNowUI(tr);setStatus('загружаю звук…');
  const e=await getBuffer(tr);
  if(curId!==tr.id)return;
  srcNode=AC.createBufferSource();srcNode.buffer=e.buf;
  srcNode.connect(volNode);
  st.offset=clamp(offset||0,0,e.duration-0.01);
  st.startCtxTime=AC.currentTime;
  srcNode.start(0,st.offset);
  srcNode.onended=()=>{
    if(srcNode&&srcNode._manual)return;
    srcNode=null;st.playing=false;
    if(loopOn){playTrack(tr,0);return;}
    const i=tracks.findIndex(t=>t.id===curId);
    if(i>=0&&i<tracks.length-1){curId=tracks[i+1].id;st.offset=0;playTrack(tracks[i+1],0);}
    else{updatePlayUI();document.title='Nocturna — студия нейромузыки';}
  };
  st.playing=true;updatePlayUI();setNowUI(tr,e.duration);
  document.title='▶ '+tr.title;
  document.getElementById('tDur').textContent=fmtTime(e.duration);
}
function pause(){if(!st.playing)return;st.offset+=AC.currentTime-st.startCtxTime;stopSrc();st.playing=false;updatePlayUI();document.title='Nocturna — студия нейромузыки';}
function togglePlay(){
  if(!curId)return;
  if(st.playing)pause();
  else playTrack(tracks.find(t=>t.id===curId),st.offset);
}
function seek(frac){
  if(!curId)return;const tr=tracks.find(t=>t.id===curId);
  const dur=(bufCache.get(curId)||{}).duration||tr.duration;
  const wasPlaying=st.playing;
  st.offset=clamp(frac*dur,0,dur-0.05);
  if(wasPlaying)playTrack(tr,st.offset);
  else{updateProgressUI(st.offset,dur);}
}
function curTime(){
  if(!curId)return 0;
  const e=bufCache.get(curId);
  if(!e)return 0;
  return st.playing?(st.offset+AC.currentTime-st.startCtxTime):st.offset;
}
/* ---------- интерфейс ---------- */
const $=id=>document.getElementById(id);
function setNowUI(tr,dur){
  const G=GENRES[tr.style];
  const cs=$('coverSm');
  try{paintCover($('coverCv'),tr);}catch(e){}
  cs.style.background=`linear-gradient(135deg,${G.colors[0]},${G.colors[1]})`;
  $('nowTitle').textContent=tr.title;
  $('nowSub').textContent=G.label+' · '+fmtTime(dur||tr.duration);
  $('tDur').textContent=fmtTime(dur||tr.duration);
}
function updatePlayUI(){
  const ic=$('playIco');
  ic.innerHTML=st.playing?'<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>':'<path d="M8 5v14l11-7z"/>';
  document.querySelectorAll('.tcard').forEach(c=>c.classList.toggle('playing',c.dataset.id===curId&&st.playing));
  document.querySelectorAll('.tcard').forEach(c=>c.classList.toggle('active',c.dataset.id===curId));
  $('nowBlock').classList.toggle('playing',st.playing);
}
function updateProgressUI(t,dur){
  $('tCur').textContent=fmtTime(t);
  $('pfill').style.width=(dur?clamp(t/dur,0,1)*100:0)+'%';
  if(modalOpen&&lyricsForId===curId)highlightLyricsSection(t);
}
function toast(msg,err){
  const d=document.createElement('div');d.className='toast'+(err?' err':'');d.textContent=msg;
  $('toasts').appendChild(d);
  setTimeout(()=>{d.style.opacity='0';d.style.transition='opacity .3s';setTimeout(()=>d.remove(),320);},2600);
}
function setStatus(s){const g=$('genStage');if(g)g.textContent=s;}

/* карточки */
function cardHTML(t){
  const G=GENRES[t.style];
  const playingCls=(t.id===curId&&st.playing)?' playing':'';
  const activeCls=t.id===curId?' active':'';
  return `<div class="tcard${playingCls}${activeCls}" data-id="${t.id}">
    <div class="cover">
      <canvas class="cvcov" width="440" height="220"></canvas>
      <div class="bars">${Array.from({length:14},(_,i)=>`<i style="animation-duration:${0.5+((i*79)%7)/10}s;animation-delay:${(i%5)*0.11}s"></i>`).join('')}</div>
      <span class="tag">${G.emoji} ${gLabel(t.style)}</span>
      <div class="playov"><div class="pb"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><div class="eq"><i></i><i></i><i></i></div></div></div>
    </div>
    <div class="tinfo">
      <div class="ttl">${esc(t.title)}</div>
      <div class="sub"><span class="sty">${G.label}</span><span>${fmtTime(t.duration)}</span><span>${new Date(t.createdAt).toLocaleDateString('ru-RU')}</span></div>
    </div>
    <div class="tact">
      <button class="abtn dl" data-act="dl">&#8681; WAV</button>
      <button class="abtn" data-act="lyr">&#9998; Текст</button>
      ${CAN_SHARE?'<button class="abtn" data-act="shr">&#8599;</button>':''}
      <button class="abtn" data-act="rmk">&#10227; Ещё</button>
      <button class="abtn rm" data-act="del">&#10005;</button>
    </div>
  </div>`;
}
function renderLib(){
  const el=$('tracks');
  if(!tracks.length){
    el.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="eqdemo"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><h3>${esc(t('empty_h'))}</h3><p>${esc(t('empty_p'))}</p></div>`;
  }else{
    el.innerHTML=tracks.map(cardHTML).join('');
  }
  $('libCount').textContent=plural(tracks.length);
  document.querySelectorAll('.tcard canvas.cvcov').forEach(cv=>{
    const card=cv.closest('.tcard');const tr=tracks.find(t=>t.id===card.dataset.id);
    if(tr)paintCover(cv,tr);
  });
  document.querySelectorAll('.tcard').forEach(c=>{c.classList.toggle('playing',c.dataset.id===curId&&st.playing);c.classList.toggle('active',c.dataset.id===curId);});
}
function plural(n){
  const m10=n%10,m100=n%100;
  if(m10===1&&m100!==11)return n+' трек';
  if(m10>=2&&m10<=4&&(m100<10||m100>=20))return n+' трека';
  return n+' треков';
}
$('tracks').addEventListener('click',async ev=>{
  const card=ev.target.closest('.tcard');if(!card)return;
  const tr=tracks.find(t=>t.id===card.dataset.id);if(!tr)return;
  const act=ev.target.closest('[data-act]');
  if(!act){curId=tr.id;st.offset=0;playTrack(tr,0);return;}
  const a=act.dataset.act;
  if(a==='dl')downloadTrack(tr);
  else if(a==='lyr')openLyrics(tr);
  else if(a==='del'){if(curId===tr.id){pause();curId=null;$('nowTitle').textContent='Ничего не выбрано';$('nowSub').textContent=t('player_sub');$('coverSm').innerHTML='<canvas id="coverCv" width="108" height="108"></canvas>';$('coverSm').style.background='rgba(255,255,255,.06)';document.title='Nocturna — '+t('lib_title');}
    tracks=tracks.filter(t2=>t2.id!==tr.id);bufCache.delete(tr.id);saveLib();renderLib();toast(t('del_toast'));}
  else if(a==='rmk')remake(tr);
  else if(a==='shr')shareTrack(tr);
});
async function downloadStem(tr,key){
  const label=(STEM_DEF.find(s=>s.key===key)||{label:key}).label;
  toast('Рендерю стем «'+label+'»…');
  const plan=composePlan({seed:tr.seed,style:tr.style,mood:tr.mood,bpm:tr.bpm,durSec:tr.durSec,form:tr.form});
  const gains={drums:0,bass:0,lead:0,pad:0,atmos:0};gains[key]=1;
  const buf=await renderTrack(plan,{gains,mutes:{}});
  const blob=encodeWAV(buf);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=tr.title.replace(/[^\wа-яёА-ЯЁ -]/g,'').trim()+' — '+label+'.wav';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast('Стем «'+label+'» скачан — как в настоящей студии, только твой');
}
async function downloadMIDI(tr){
  toast('Собираю MIDI…');
  const plan=composePlan({seed:tr.seed,style:tr.style,mood:tr.mood,bpm:tr.bpm,durSec:tr.durSec,form:tr.form});
  const blob=buildMIDI(plan);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=tr.title.replace(/[^\wа-яёА-ЯЁ -]/g,'').trim()+'.mid';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast('MIDI мелодии скачан — открывай в любой студии');
}
async function shareTrack(tr){
  if(!navigator.canShare){toast('Системная отправка недоступна в этом браузере — WAV всегда можно скачать',true);return;}
  toast('Готовлю файл…');
  const e=await getBuffer(tr);
  const file=new File([encodeWAV(e.buf)],tr.title.replace(/[^\wа-яёА-ЯЁ -]/g,'').trim()+'.wav',{type:'audio/wav'});
  if(navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:tr.title});toast('Открыло системное меню отправки');}
    catch(err){if(err&&err.name!=='AbortError')toast('Не удалось поделиться: '+err.message,true);}
  }else{toast('Меню не принимает файлы — используй кнопку «WAV»');}
}
async function downloadTrack(tr){
  toast('Готовлю WAV…');
  const e=await getBuffer(tr);
  const blob=encodeWAV(e.buf);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=tr.title.replace(/[^\wа-яёА-ЯЁ -]/g,'').trim()+'.wav';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast('Скачано: '+a.download+' — без лимитов, как договаривались 🙂');
}
function remake(tr){
  const seed=(Math.random()*0xffffffff)>>>0;
  const nt=Object.assign({},tr,{id:uid(),seed,title:tr.title+' (II)',createdAt:Date.now()});
  if(tr.lyrics){
    nt.lyrics=genLyrics(tr.theme,mulberry32(seed^0x9e3779b9));
    if(nt.lyrics.length===tr.lyrics.length)nt.lyrics.forEach((s,i)=>{s.t0=tr.lyrics[i].t0;s.t1=tr.lyrics[i].t1;});
  }
  tracks.unshift(nt);saveLib();renderLib();
  toast(t('rmk_toast'));
  generateFrom(nt);
}
/* продлить трек: тот же сид и стиль, длительность +1 минута — начало остаётся, добавляется развитие */
function extendTrack(tr){
  if((tr.durSec||120)>=300){toast(CUR_LANG==='en'?'Track is already at max length (5:00)':'Трек уже максимальной длины (5:00) — максимум остаётся прежним');return;}
  const nt=Object.assign({},tr,{id:uid(),durSec:Math.min(300,(tr.durSec||120)+60),title:tr.title.replace(/ \(ext\)$/,'')+' (ext)',createdAt:Date.now()});
  if(nt.lyrics)nt.lyrics=JSON.parse(JSON.stringify(tr.lyrics));
  try{const pl=composePlan({seed:nt.seed,style:nt.style,mood:nt.mood,bpm:nt.bpm||0,durSec:nt.durSec,form:nt.form});if(nt.lyrics)bindLyricsTimings(nt.lyrics,pl);}catch(e){}
  tracks.unshift(nt);saveLib();renderLib();
  closeLyrics();
  toast(CUR_LANG==='en'?'Extending track to '+Math.round(nt.durSec/60)+' min':'Продлеваю трек до '+Math.round(nt.durSec/60)+' мин');
  generateFrom(nt);
}
/* кавер: та же лирика — другой жанр */
function coverTrack(tr,genre){
  const G=GENRES[genre];if(!G)return;
  const seed=(Math.random()*0xffffffff)>>>0;
  const nt=Object.assign({},tr,{id:uid(),seed,style:genre,title:tr.title+' · '+G.label,createdAt:Date.now()});
  if(tr.lyrics)nt.lyrics=JSON.parse(JSON.stringify(tr.lyrics));
  if(nt.mix)nt.mix={gains:{drums:1,bass:1,lead:1,pad:1,atmos:1},mutes:{}};
  try{const plan=composePlan({seed:nt.seed,style:nt.style,mood:nt.mood,bpm:nt.bpm||0,durSec:nt.durSec});bindLyricsTimings(nt.lyrics,plan);}catch(e){}
  tracks.unshift(nt);saveLib();renderLib();
  closeLyrics();
  toast(t('cover_toast',{G:gLabel(genre)}));
  generateFrom(nt);
}
/* пресеты стиля — как Персоны: стиль трека сохраняется и переиспользуется */
function loadPresets(){try{return JSON.parse(localStorage.getItem('nocturna_presets')||'[]')}catch(e){return[]}}
function savePresets(p){try{localStorage.setItem('nocturna_presets',JSON.stringify(p.slice(0,12)))}catch(e){}}
function renderPresets(){
  const wrap=$('presetWrap'),el=$('presetChips');if(!wrap||!el)return;
  const ps=loadPresets();
  if(!ps.length){wrap.style.display='none';return;}
  wrap.style.display='';
  el.innerHTML=ps.map(p=>`<span class="chip" data-p="${p.id}">💾 ${esc(p.label)}</span>`).join('');
}
function initPresets(){
  const el=$('presetChips');if(!el)return;
  el.addEventListener('click',e=>{
    const c=e.target.closest('.chip');if(!c)return;
    const p=loadPresets().find(x=>x.id===c.dataset.p);if(!p)return;
    const gc=$('genreChips');
    if(gc)gc.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x.dataset.g===p.style));
    styleChip=p.style;
    const mc=$('moodChips');
    if(mc)mc.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x.dataset.m===p.mood));
    moodChip=p.mood;
    const bs=$('bpmSel');if(bs)bs.value=(p.bpm&&[80,110,140].indexOf(p.bpm)>=0)?String(p.bpm):'0';
    const fs=$('formSel');if(fs&&p.form)fs.value=p.form;
    if($('styleInp'))$('styleInp').value=p.styleText||'';
    toast(t('preset_apply',{L:p.label}));
  });
}
function savePresetFromTrack(tr){
  const ps=loadPresets();
  const label=(tr.title||'Стиль').split(' ')[0]+' · '+GENRES[tr.style].label;
  ps.unshift({id:'p'+Date.now().toString(36),label,style:tr.style,mood:tr.mood||'auto',bpm:tr.bpm||0,form:tr.form||'classic',styleText:tr.styleText||''});
  savePresets(ps);renderPresets();
  toast(t('preset_save'));
}
function uid(){return 'tr'+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36);}

/* текст песни */
let modalOpen=false,lyricsForId=null,lyrPlain='';
function openLyrics(tr){
  lyricsForId=tr.id;modalOpen=true;
  lyrPlain=tr.lyrics?tr.lyrics.map(s=>s.sec.toUpperCase()+'\n'+s.lines.join('\n')).join('\n\n'):'';
  $('lyrTitle').textContent=tr.title;
  $('lyrSub').textContent=(tr.lyrics?t('lyr_btn')+' Nocturna':t('voc_none').replace('без голоса','инструментал — без текста').replace('no vocals','instrumental — no lyrics'))+' · '+gLabel(tr.style);
  $('lyrBody').innerHTML=tr.lyrics?tr.lyrics.map((s,i)=>`<div data-sec="${i}" data-t0="${s.t0||0}" data-t1="${s.t1||1e9}"><div class="lyr-sec">${esc(s.sec)}</div>${s.lines.map(esc).join('<br>')}</div>`).join(''):'<div class="lyr-body" style="color:var(--dim)">Для этого трека выбран инструментал.</div>';
  $('lyrCopy').style.display=tr.lyrics?'':'none';
  $('expRow').innerHTML=`<div class="exp-title">${esc(t('exp_title'))}</div>`+STEM_DEF.map(s=>`<button class="abtn" data-stem="${s.key}">&#8681; ${esc(stemLabel(s))}</button>`).join('')+`<button class="abtn" data-midi="1">&#8681; MIDI ${CUR_LANG==='en'?'melody':'мелодии'}</button><button class="abtn" data-extend="1">&#9654;&#8203; ${CUR_LANG==='en'?'Extend +1 min':'Продлить +1 мин'}</button><div class="exp-title">${esc(t('cover_title'))}</div>`+GENRE_KEYS.filter(k=>k!==tr.style).map(k=>`<button class="abtn" data-cover="${k}">${GENRES[k].emoji} ${esc(gLabel(k))}</button>`).join('')+`<button class="abtn" data-preset="1">${esc(t('preset_btn'))}</button>`;
  $('lyrModal').classList.add('open');
}
function closeLyrics(){modalOpen=false;$('lyrModal').classList.remove('open');lyricsForId=null;}
$('lyrClose').addEventListener('click',closeLyrics);
$('lyrModal').addEventListener('click',e=>{if(e.target.id==='lyrModal')closeLyrics();});
$('expRow').addEventListener('click',e=>{
  const cov=e.target.closest('[data-cover]');
  if(cov){const tr=tracks.find(t=>t.id===lyricsForId);if(tr)coverTrack(tr,cov.dataset.cover);return;}
  const pre=e.target.closest('[data-preset]');
  if(pre){const tr=tracks.find(t=>t.id===lyricsForId);if(tr)savePresetFromTrack(tr);return;}
  const ext=e.target.closest('[data-extend]');
  if(ext){const tr=tracks.find(t=>t.id===lyricsForId);if(tr)extendTrack(tr);return;}
});
let lyrSecCache=null,lyrSecId=null;
function highlightLyricsSection(t){
  if(!lyricsForId)return;
  if(lyrSecId!==lyricsForId||!(lyrSecCache&&lyrSecCache.length&&lyrSecCache[0].isConnected)){
    lyrSecId=lyricsForId;lyrSecCache=document.querySelectorAll('#lyrBody [data-sec]');
  }
  const tr=tracks.find(x=>x.id===lyricsForId);if(!tr||!tr.lyrics)return;
  (lyrSecCache||[]).forEach(d=>{
    const on=t>=(+d.dataset.t0)&&t<(+d.dataset.t1);
    d.style.opacity=on?'1':'.55';
  });
}
/* визуализатор */
function drawViz(){
  const cv=$('viz'),cx=cv.getContext('2d');
  let vizIdle=false;
  function frame(){
    requestAnimationFrame(frame);
    if(!analyser||!st.playing){
      if(vizIdle)return;
      vizIdle=true;
      cx.clearRect(0,0,cv.width,cv.height);
      const ccv0=$('coverCv');if(ccv0)ccv0.style.transform='';
      const nb0=$('nowBlock');if(nb0)nb0.style.boxShadow='';
      cx.fillStyle='rgba(255,255,255,.08)';for(let i=0;i<24;i++)cx.fillRect(i*11,44,6,2);return;
    }
    vizIdle=false;
    const data=new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let bass=0;for(let i=1;i<10;i++)bass+=data[i];
    bass=bass/(9*255);
    const ccv=$('coverCv');if(ccv)ccv.style.transform=`scale(${(1+bass*.07).toFixed(3)})`;
    const nbEl=$('nowBlock');if(nbEl)nbEl.style.boxShadow=`0 0 ${(6+bass*26).toFixed(0)}px rgba(124,92,255,${(0.10+bass*.28).toFixed(3)})`;
    const N=24,w=cv.width/N;
    for(let i=0;i<N;i++){
      const v=data[Math.floor(i*data.length/N*0.7)]/255;
      const h=Math.max(2,v*cv.height);
      const grd=cx.createLinearGradient(0,cv.height-h,0,cv.height);
      grd.addColorStop(0,'#22d3ee');grd.addColorStop(1,'#7c5cff');
      cx.fillStyle=grd;
      cx.fillRect(i*w+2,cv.height-h,w-4,h);
    }
    drawWave();
    /* прогресс */
    if(curId){const e=bufCache.get(curId);if(e)updateProgressUI(curTime(),e.duration);}
  }
  frame();
}
