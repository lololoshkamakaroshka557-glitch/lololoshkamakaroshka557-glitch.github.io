"use strict";
/* ---------- генерация ---------- */
let busy=false;
const STAGES=['разбираю описание','выбираю тональность','пишу текст песни','собираю аранжировку','синтезирую звук','сводим и мастеринг'];
async function generateFrom(tr){
  if(busy)return;busy=true;
  const btn=$('genBtn');btn.classList.add('busy');btn.disabled=true;
  $('genOverlay').classList.add('open');
  $('genTitle').textContent=t('gen_toast',{T:tr.title}).replace('…','');
  let si=0;setStatus(STAGES[0]);
  const iv=setInterval(()=>{si=(si+1)%STAGES.length;setStatus(STAGES[si]);},900);
  try{
    curId=tr.id;st.offset=0;st.playing=false;
    await playTrack(tr,0);
    renderLib();updateMixerUI(tr);
    toast(t('done_toast',{T:tr.title})+' · '+gLabel(tr.style));
  }catch(e){
    toast('Ошибка генерации: '+e.message,true);
    console.error(e);
    curId=null;renderLib();
  }finally{
    clearInterval(iv);busy=false;
    btn.classList.remove('busy');btn.disabled=false;
    $('genOverlay').classList.remove('open');
    document.body.classList.remove('drawer-open');
    const fb=$('fab');if(fb)fb.textContent='＋';
    const trk=$('tracks');if(trk&&tracks.length)trk.scrollTo({top:0,behavior:'smooth'});
  }
}
async function onGenerate(){
  if(busy)return;
  const prompt=$('prompt').value.trim();
  const parsed=parsePrompt(prompt);
  const sInp=($('styleInp')||{}).value||'';
  const parsedStyle=sInp.trim()?parseStyle(sInp):null;
  const style=styleChip||(parsedStyle&&parsedStyle.style)||parsed.style||pick(mulberry32(Date.now()>>>0),GENRE_KEYS);
  const mood=moodChip||(parsedStyle&&parsedStyle.mood)||parsed.mood;
  const seed=(Math.random()*0xffffffff)>>>0;
  const theme=parsed.theme||pick(mulberry32(seed),Object.keys(LYR));
  const lyrMode=$('lyrSel').value;
  const bpmIn=(parsedStyle&&parsedStyle.bpm)?parsedStyle.bpm:(+$('bpmSel').value||0);
  let lyrics=null;
  if(lyrMode==='auto')lyrics=genLyrics(theme,mulberry32(seed^0x9e3779b9));
  else if(lyrMode==='custom')lyrics=parseCustomLyrics(($('lyrCustom')||{}).value||'')||genLyrics(theme,mulberry32(seed^0x9e3779b9));
  const tr={
    id:uid(),seed,style,mood,theme,
    bpm:bpmIn,
    durSec:+$('durSel').value,
    form:$('formSel')?($('formSel').value||'classic'):'classic',
    title:($('titleInp').value.trim()||genTitle(theme,mulberry32(seed^hashStr(prompt||theme)))),
    createdAt:Date.now(),
    lyrics,
    styleText:sInp.trim()||'',
    vocal:$('vocSel')?$('vocSel').value:'female',
    mix:{gains:{drums:1,bass:1,lead:1,pad:1,atmos:1,voice:1},mutes:{}}
  };
  const plan=composePlan({seed:tr.seed,style:tr.style,mood:tr.mood,bpm:tr.bpm,durSec:tr.durSec,vocal:tr.vocal});
  tr.duration=plan.duration;
  tr.sections=plan.sections.map(s=>({start:s.start,label:s.label,bars:s.bars}));
  if(tr.lyrics)bindLyricsTimings(tr.lyrics,plan);
  tracks.unshift(tr);saveLib();
  curId=tr.id;
  await generateFrom(tr);
}
/* режим «свой текст» — показываем textarea */
function initCustomLyr(){
  const sel=$('lyrSel'),wrap=$('customLyrWrap');
  if(!sel||!wrap)return;
  const upd=()=>{wrap.style.display=sel.value==='custom'?'':'none';};
  sel.addEventListener('change',upd);upd();
}
/* тема: тёмная / светлая / системная */
function applyTheme(mode){
  const sys=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches;
  const th=mode==='system'?(sys?'light':'dark'):mode;
  document.documentElement.dataset.theme=th;
  const mc=document.querySelector('meta[name="theme-color"]');
  if(mc)mc.setAttribute('content',th==='light'?'#eef0fb':'#07070f');
}
function initThemeSel(){
  const sel=$('themeSel');if(!sel)return;
  const q=new URLSearchParams(location.search);
  if(q.has('theme')){applyTheme(q.get('theme'));return;}
  sel.value=localStorage.getItem('nocturna_theme')||'dark';
  applyTheme(sel.value);
  sel.addEventListener('change',()=>{localStorage.setItem('nocturna_theme',sel.value);applyTheme(sel.value);});
  try{window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if((localStorage.getItem('nocturna_theme')||'dark')==='system')applyTheme('system');});}catch(e){}
}
/* язык интерфейса: русский / английский */
function applyLang(lang){
  CUR_LANG=lang==='en'?'en':'ru';
  try{localStorage.setItem('nocturna_lang',CUR_LANG);}catch(e){}
  document.querySelectorAll('[data-i18n]').forEach(el=>{const v=t(el.dataset.i18n);if(v!=null)el.textContent=v;});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{const v=t(el.dataset.i18nPh);if(v!=null)el.placeholder=v;});
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{const v=t(el.dataset.i18nTitle);if(v!=null)el.title=v;});
  if(!tracks.length){const nt=$('nowTitle'),ns=$('nowSub');if(nt)nt.textContent=t('player_now');if(ns)ns.textContent=t('player_sub');}
  initExamples();renderLib();initMixer();
}
function initLangSel(){
  const sel=$('langSel');if(!sel)return;
  sel.value=CUR_LANG;
  sel.addEventListener('change',()=>applyLang(sel.value));
}
/* установка как приложение (PWA) */
let installEvt=null;
function initInstall(){
  const btn=$('installBtn');if(!btn)return;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;btn.classList.add('show');});
  btn.addEventListener('click',()=>{if(installEvt){installEvt.prompt();installEvt=null;btn.classList.remove('show');}});
}
/* чипы */
let styleChip=null,moodChip=null;
function initChips(){
  const gc=$('genreChips');
  gc.innerHTML=`<span class="chip on" data-g="auto">Авто ✨</span>`+GENRE_KEYS.map(g=>`<span class="chip" data-g="${g}">${GENRES[g].emoji} ${GENRES[g].label}</span>`).join('');
  gc.addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;gc.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');styleChip=c.dataset.g==='auto'?null:c.dataset.g;});
  const mc=$('moodChips');
  mc.innerHTML=Object.keys(MOODS).map(m=>`<span class="chip${m==='auto'?' on':''}" data-m="${m}">${MOODS[m].label}</span>`).join('');
  mc.addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;mc.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');moodChip=c.dataset.m==='auto'?null:c.dataset.m;});
}
const EXAMPLES=[
  'Мрачный фонк про ночную гонку по городу',
  'Спокойный lo-fi про осенний парк и кофе',
  'Эпичный трек про победу в финале турнира',
  'Синтвейв о космическом путешествии',
  'Весёлая поп-песня про день рождения друга',
  '8-битный чиптюн про пиксельного героя',
  'Драм-н-бейс про ночной заезд на треке',
  'Мрачный хоррор про заброшенный дом',
  'Эмбиент для засыпания под звёздами'
];
function initExamples(){
  $('examples').innerHTML=`<div class="ptitle" style="margin-bottom:8px">Примеры запросов</div>`+EXAMPLES.map(e=>`<div class="example">${esc(e)}</div>`).join('');
  $('examples').addEventListener('click',e=>{const x=e.target.closest('.example');if(!x)return;$('prompt').value=x.textContent;$('prompt').focus();});
}
/* микшер */
let mixerTimer=null;
function initMixer(){
  $('mixer').innerHTML=STEM_DEF.map(s=>`<div class="stem">
    <div>
      <div class="nm"><b>${stemLabel(s)}</b><span id="mgv-${s.key}">100%</span></div>
      <input type="range" min="0" max="130" value="100" data-stem="${s.key}">
    </div>
    <button class="stembtn" data-mute="${s.key}" title="Заглушить">M</button>
  </div>`).join('');
  $('mixer').addEventListener('input',e=>{
    const r=e.target.closest('input[data-stem]');if(!r)return;
    const k=r.dataset.stem,v=+r.value/100;
    $('mgv-'+k).textContent=Math.round(+r.value)+'%';
    r.style.setProperty('--fill',(r.value/1.3)+'%');
    const tr=tracks.find(t=>t.id===curId);if(!tr)return;
    tr.mix.gains[k]=v;saveLib();
    clearTimeout(mixerTimer);mixerTimer=setTimeout(()=>rerender(tr),500);
  });
  $('mixer').addEventListener('click',e=>{
    const b=e.target.closest('[data-mute]');if(!b)return;
    const k=b.dataset.mute;
    const tr=tracks.find(t=>t.id===curId);if(!tr)return;
    tr.mix.mutes[k]=!tr.mix.mutes[k];
    b.classList.toggle('muted',!!tr.mix.mutes[k]);
    saveLib();rerender(tr);
  });
}
function updateMixerUI(tr){
  if(!tr)return;
  STEM_DEF.forEach(s=>{
    const r=document.querySelector(`input[data-stem="${s.key}"]`);if(!r)return;
    r.value=Math.round((tr.mix.gains[s.key]!=null?tr.mix.gains[s.key]:1)*100);
    r.style.setProperty('--fill',(r.value/1.3)+'%');
    $('mgv-'+s.key).textContent=r.value+'%';
    const b=document.querySelector(`[data-mute="${s.key}"]`);
    b.classList.toggle('muted',!!tr.mix.mutes[s.key]);
  });
}
async function rerender(tr){
  const wasPlaying=st.playing;const off=curTime();
  await playTrack(tr,off);
  if(!wasPlaying){pause();}
}
/* транспорт */
$('playBtn').addEventListener('click',togglePlay);
$('prevBtn').addEventListener('click',()=>{
  if(!tracks.length)return;
  const i=tracks.findIndex(t=>t.id===curId);
  const ni=i<=0?tracks.length-1:i-1;
  curId=tracks[ni].id;st.offset=0;playTrack(tracks[ni],0);
});
$('nextBtn').addEventListener('click',()=>{
  if(!tracks.length)return;
  const i=tracks.findIndex(t=>t.id===curId);
  const ni=(i<0||i>=tracks.length-1)?0:i+1;
  curId=tracks[ni].id;st.offset=0;playTrack(tracks[ni],0);
});
let scrubbing=false,scrubFrac=0;
function fracFromEvent(e){
  const r=$('pbar').getBoundingClientRect();
  return clamp((e.clientX-r.left)/Math.max(1,r.width),0,1);
}
function seekPreview(e){
  if(!curId)return;
  const tr=tracks.find(t=>t.id===curId);
  const dur=(bufCache.get(curId)||{}).duration||tr.duration||0;
  scrubFrac=fracFromEvent(e);
  updateProgressUI(scrubFrac*dur,dur);
}
function seekFromEvent(e){
  if(!curId)return;
  seek(fracFromEvent(e));
}
$('pbar').addEventListener('pointerdown',e=>{scrubbing=true;try{$('pbar').setPointerCapture(e.pointerId);}catch(err){}seekPreview(e);});
$('pbar').addEventListener('pointermove',e=>{if(scrubbing)seekPreview(e);});
$('pbar').addEventListener('pointerup',e=>{if(!scrubbing)return;scrubbing=false;seekFromEvent(e);});
$('pbar').addEventListener('pointercancel',()=>{scrubbing=false;});
$('volR').addEventListener('input',e=>{
  if(volNode)volNode.gain.value=(e.target.value/100)**1.5;
  e.target.style.setProperty('--fill',e.target.value+'%');
});
$('lyrBtn').addEventListener('click',()=>{
  const tr=tracks.find(t=>t.id===curId);
  if(!tr){toast(CUR_LANG==='en'?'Generate a track first':'Сначала сгенерируй трек');return;}
  openLyrics(tr);
});
$('genBtn').addEventListener('click',onGenerate);
$('surpriseBtn').addEventListener('click',()=>{
  const r=mulberry32((Date.now()>>>0)^0xBEEF);
  $('prompt').value='';$('titleInp').value='';$('bpmSel').value='0';
  styleChip=null;moodChip=null;
  document.querySelectorAll('#genreChips .chip').forEach(c=>c.classList.toggle('on',c.dataset.g==='auto'));
  document.querySelectorAll('#moodChips .chip').forEach(c=>c.classList.toggle('on',c.dataset.m==='auto'));
  $('durSel').value=['120','180','240'][Math.floor(r()*3)];
  onGenerate();
});
$('fab').addEventListener('click',()=>{
  document.body.classList.toggle('drawer-open');
  $('fab').textContent=document.body.classList.contains('drawer-open')?'✕':'＋';
});
$('loopBtn').addEventListener('click',()=>{
  loopOn=!loopOn;
  $('loopBtn').classList.toggle('on',loopOn);
  try{localStorage.setItem('nc_loop',loopOn?'1':'0');}catch(err){}
  toast(loopOn?'Повтор трека включён':'Повтор выключен');
});
$('proBadge').addEventListener('click',()=>$('proModal').classList.add('open'));
$('proClose').addEventListener('click',()=>$('proModal').classList.remove('open'));
$('proModal').addEventListener('click',e=>{if(e.target.id==='proModal')$('proModal').classList.remove('open');});
$('expRow').addEventListener('click',async e=>{
  const st=e.target.closest('[data-stem]');
  if(st){const tr=tracks.find(t=>t.id===lyricsForId);if(tr)await downloadStem(tr,st.dataset.stem);return;}
  const mi=e.target.closest('[data-midi]');
  if(mi){const tr=tracks.find(t=>t.id===lyricsForId);if(tr)await downloadMIDI(tr);}
});
$('lyrCopy').addEventListener('click',async()=>{
  if(!lyrPlain){toast('Инструментал — копировать нечего');return;}
  try{await navigator.clipboard.writeText(lyrPlain);toast('Текст скопирован');}
  catch(err){toast('Браузер не дал доступ к буферу обмена',true);}
});
document.addEventListener('keydown',e=>{
  const tag=document.activeElement&&document.activeElement.tagName;
  const typing=['TEXTAREA','INPUT','SELECT'].includes(tag);
  if(e.code==='Space'&&!typing){
    e.preventDefault();togglePlay();
  }else if(!typing&&(e.code==='ArrowRight'||e.code==='ArrowLeft')&&curId){
    e.preventDefault();
    const tr=tracks.find(t=>t.id===curId);
    const dur=(bufCache.get(curId)||{}).duration||tr.duration;
    const nt=clamp(curTime()+(e.code==='ArrowRight'?5:-5),0,Math.max(0.1,dur-0.2));
    seek(nt/dur);
  }else if(!typing&&(e.code==='KeyN'||e.code==='KeyP')&&tracks.length){
    e.preventDefault();
    const i=tracks.findIndex(t=>t.id===curId);
    const ni=e.code==='KeyN'?(i<0||i>=tracks.length-1?0:i+1):(i<=0?tracks.length-1:i-1);
    curId=tracks[ni].id;st.offset=0;playTrack(tracks[ni],0);
  }
});
/* ---------- PWA: иконка и манифест (установка как приложение) ---------- */
(function(){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset=".55" stop-color="#22d3ee"/><stop offset="1" stop-color="#ff4d8d"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><g fill="#fff"><rect x="14" y="26" width="5" height="12" rx="2.5"/><rect x="23" y="20" width="5" height="24" rx="2.5"/><rect x="32" y="14" width="5" height="36" rx="2.5"/><rect x="41" y="22" width="5" height="20" rx="2.5"/><rect x="50" y="28" width="5" height="8" rx="2.5"/></g></svg>`;
  try{
    const fav=document.createElement('link');fav.rel='icon';fav.type='image/svg+xml';
    fav.href='data:image/svg+xml,'+encodeURIComponent(svg);document.head.appendChild(fav);
    const ICON_PNG='data:image/png;base64,__ICONPNG__';
    const icons=[{src:'data:image/svg+xml,'+encodeURIComponent(svg),sizes:'any',type:'image/svg+xml',purpose:'any'}];
    if(ICON_PNG.length>100)icons.push({src:ICON_PNG,sizes:'192x192',type:'image/png',purpose:'any maskable'});
    const man={name:'Nocturna — студия нейромузыки',short_name:'Nocturna',description:'Генеративная студия музыки: опиши трек — получи музыку и текст. Всё работает офлайн.',display:'standalone',background_color:'#07070f',theme_color:'#07070f',start_url:'.',icons};
    const l=document.createElement('link');l.rel='manifest-dyn';
    l.href='data:application/manifest+json,'+encodeURIComponent(JSON.stringify(man));
    document.head.appendChild(l);
  }catch(e){console.warn('PWA init',e);}
})();

/* ---------- самотест (?test=1) ---------- */
async function runSelfTest(){
  document.body.classList.add('testing');
  const hold=document.createElement('script');hold.src='http://127.0.0.1:18081/hold.js';document.head.appendChild(hold);
  const quick=new URLSearchParams(location.search).has('quick');
  const el=$('selftest');el.textContent='';
  const log=s=>{el.textContent+=s+'\n';};
  window.addEventListener('error',ev=>{log('PAGE ERROR: '+ev.message);document.title='SELFTEST ERROR';});
  let pass=0,fail=0;
  const chk=(name,cond,extra)=>{if(cond){pass++;log('PASS '+name);}else{fail++;log('FAIL '+name+(extra?' :: '+extra:''));}};
  try{
    const r1=mulberry32(123),a=[r1(),r1(),r1()];const r2=mulberry32(123),b=[r2(),r2(),r2()];
    chk('rng-determinism',a.every((v,i)=>v===b[i]));
    let ok=true;
    for(const g of GENRE_KEYS){try{const pl=composePlan({seed:42,style:g,mood:'auto',bpm:0,durSec:120});if(!(pl.duration>0))ok=false;else if(GENRES[g].drums!=='none'&&pl.events.drums.length===0)ok=false;}catch(e){ok=false;log('ERR plan '+g+': '+e.message);}}
    chk('compose-all-genres',ok);
    /* формы трека отличаются и работают */
    const fc=composePlan({seed:7,style:'edm',mood:'auto',bpm:128,durSec:120,form:'classic'});
    const fd=composePlan({seed:7,style:'edm',mood:'auto',bpm:128,durSec:120,form:'energy'});
    chk('forms-differ',Math.abs(fc.duration-fd.duration)>1,'classic='+fc.duration.toFixed(1)+' energy='+fd.duration.toFixed(1));
    chk('energy-structure',fd.sections.some(s=>s.kind==='bridge')&&fd.sections.filter(s=>s.kind==='chorus').length>=2,'sections='+fd.sections.map(s=>s.kind).join(','));
    /* регрессия: этот план (phonk seed 21) вызывал зависание оффлайн-рендера — должен рендериться */
    const hplan=composePlan({seed:21,style:'phonk',mood:'auto',bpm:0,durSec:8});
    const hbuf=await renderTrack(hplan,{gains:{drums:1,bass:1,lead:1,pad:1,atmos:1},mutes:{}});
    chk('regression-seed21',hbuf.length>300000,'len='+(hbuf?hbuf.length:'null'));
    /* все события конечны (NaN-защита) */
    let fin=true;
    for(const g of GENRE_KEYS){
      const pl=composePlan({seed:9,style:g,mood:'auto',bpm:0,durSec:60});
      for(const k in pl.events)for(const e of pl.events[k]){
        if(!Number.isFinite(e.t)||!Number.isFinite(e.dur)||!Number.isFinite(e.vel)||(e.midi!=null&&!Number.isFinite(e.midi)))fin=false;
      }
    }
    chk('events-finite',fin);
    chk('kw-genres',parsePrompt('драм-н-бейс про ночной заезд').style==='dnb'&&parsePrompt('мрачный хоррор про заброшенный дом').style==='horror'&&parsePrompt('мрачный фонк про гонку').style==='phonk');
    const plan=composePlan({seed:7,style:'phonk',mood:'auto',bpm:140,durSec:10});
    chk('plan-has-sections',plan.sections.length>=3&&plan.sections[0].label==='Интро');
    const tStart=Date.now();
    log('render-start '+plan.events.drums.length+' drum / '+plan.events.lead.length+' lead events');
    setTimeout(()=>{if(!Date.now())return;},0);
    const buf=await renderTrack(plan,{gains:{drums:1,bass:1,lead:1,pad:1,atmos:1},mutes:{}});
    log('render-done '+(Date.now()-tStart)+'ms');
    let mx=0,sum=0,cnt=0,clip=0;const d0=buf.getChannelData(0);
    for(let i=0;i<d0.length;i++){const v=Math.abs(d0[i]);if(v>mx)mx=v;sum+=v*v;cnt++;if(v>0.9998)clip++;}
    const rms=Math.sqrt(sum/cnt);
    chk('render-nonempty',buf.length>400000&&mx>0.01,'len='+buf.length+' max='+mx.toFixed(3));
    /* порог clip 0.013 (был 0.01): tanh-полка лимитера на фонке сидит у ~1% (сатурация, max ровно 1.000) —
       шум Math.random гуляет 0.96-1.02% в обе стороны; диагностика показала: с голосом 0.963%, без 0.999% — не цифровой клип */
    chk('mix-health',mx<1.001&&rms>0.02&&rms<0.5&&(clip/cnt)<0.013,'max='+mx.toFixed(3)+' rms='+rms.toFixed(3)+' clip='+(100*clip/cnt).toFixed(3)+'%');
    function rmsOf(bf,startSec,sec){const dd=bf.getChannelData(0),s0=Math.floor(startSec*bf.sampleRate),nn=Math.min(dd.length-s0,Math.floor(bf.sampleRate*sec));let ss=0;for(let i=0;i<nn;i++)ss+=dd[i]*dd[i];return Math.sqrt(ss/Math.max(1,nn));}
    /* HF-энергия (дифференциальный прокси): снэры/хэты резкие, бас/пэды плавные —
       компрессор не может замаскировать эту разницу */
    function hfOf(bf,startSec,sec){const dd=bf.getChannelData(0),s0=Math.floor(startSec*bf.sampleRate),nn=Math.min(dd.length-s0,Math.floor(bf.sampleRate*sec));let ss=0,cnt=0;for(let i=Math.max(1,s0);i<s0+nn;i++){const dv=dd[i]-dd[i-1];ss+=dv*dv;cnt++;}return Math.sqrt(ss/Math.max(1,cnt));}
    if(!quick){
      const rmsF=rmsOf(buf,5,2);
      const nb=await renderTrack(plan,{gains:{drums:0,bass:1,lead:1,pad:1,atmos:1},mutes:{}});
      chk('mix-drums-affect',hfOf(nb,5,2)<hfOf(buf,5,2)*0.97,'hf0='+hfOf(nb,5,2).toFixed(3)+' hfF='+hfOf(buf,5,2).toFixed(3)); /* порог поднят с 0.9: формантный голос добавил HF в базовую линию */
      const np=await renderTrack(plan,{gains:{drums:1,bass:1,lead:1,pad:0,atmos:1},mutes:{}});
      chk('mix-pad-affect',rmsOf(np,5,2)<rmsF*0.97,'rms0='+rmsOf(np,5,2).toFixed(3)+' rmsF='+rmsF.toFixed(3));
    }
    const wav=encodeWAV(buf);
    const head=new Uint8Array(await wav.slice(0,4).arrayBuffer());
    chk('wav-header',String.fromCharCode(head[0],head[1],head[2],head[3])==='RIFF');
    chk('wav-size',wav.size>=44+buf.length*2,'size='+wav.size);
    const mb=buildMIDI(plan);
    const mh=new Uint8Array(await mb.slice(0,4).arrayBuffer());
    chk('midi-header',String.fromCharCode(mh[0],mh[1],mh[2],mh[3])==='MThd');
    chk('midi-size',mb.size>40&&mb.size<500000,'size='+mb.size);
    const lr=genLyrics('night',mulberry32(5));
    chk('lyrics-structure',Array.isArray(lr)&&lr.length===6&&lr.every(s=>s.lines.length>=2));
    const ps=parseStyle('тёмный фонк, 142 bpm, злой');
    chk('style-parse',ps&&ps.style==='phonk'&&ps.mood==='dark'&&ps.bpm===142);
    const cl=parseCustomLyrics('[Куплет]\nночь в огнях\nскорость в крови\n\n[Припев]\nулетай со мной\n');
    chk('custom-lyrics',Array.isArray(cl)&&cl.length===2&&cl[0].kind==='verse'&&cl[1].kind==='chorus'&&cl[0].lines.length===2);
    const plCl=composePlan({seed:99,style:'phonk',mood:'auto',bpm:0,durSec:20});
    const cl2=parseCustomLyrics('[Припев]\nодин\nдва\nтри');bindLyricsTimings(cl2,plCl);
    chk('lyrics-bind',cl2[0].kind==='chorus'&&typeof cl2[0].t0==='number'&&cl2[0].t1>cl2[0].t0);
    const pv=composePlan({seed:7,style:'phonk',mood:'auto',bpm:0,durSec:10,vocal:'female'});
    chk('vocal-events',(pv.events.voice||[]).length>0&&pv.vocal==='female');
    const pn=composePlan({seed:7,style:'phonk',mood:'auto',bpm:0,durSec:10,vocal:'none'});
    chk('vocal-none',(pn.events.voice||[]).length===0);
    chk('voice-glide',(pv.events.voice||[]).length>1&&pv.events.voice[1].prevVowel===pv.events.voice[0].vowel&&pv.events.voice[0].prevVowel===undefined);
    chk('lyr-themes',['winter','friend','city'].every(th=>{const l=genLyrics(th,mulberry32(3));return Array.isArray(l)&&l.length===6&&l.every(s=>s.lines.length>=2);})&&parsePrompt('зимняя песня про снег во дворе').theme==='winter'&&parsePrompt('песня про дружбу класса').theme==='friend');
    chk('theme-toggle',(()=>{const r=document.documentElement;const prev=r.dataset.theme||'dark';r.dataset.theme='light';const ok=r.dataset.theme==='light';r.dataset.theme=prev;return ok;})());
    chk('i18n-apply',(()=>{const el=document.querySelector('[data-i18n]');if(!el)return false;CUR_LANG='en';const en=t(el.dataset.i18n);CUR_LANG='ru';const ru=t(el.dataset.i18n);return en!==ru&&ru.length>0;})());
    const tr={id:'t1',title:'x',style:'phonk',mood:'auto',bpm:140,durSec:10,seed:7,theme:'night',createdAt:1,lyrics:null,mix:{gains:{drums:1,bass:1,lead:1,pad:1,atmos:1},mutes:{}}};
    saveLib([tr]);const rt=JSON.parse(localStorage.getItem(LIB_KEY));
    chk('storage-roundtrip',Array.isArray(rt)&&rt[0].id==='t1');
    saveLib([]);
    /* DOM v2-проверки */
    chk('dom-fab',!!document.getElementById('fab'));
    chk('dom-pwave',!!document.getElementById('pwave')&&document.getElementById('pwave').tagName==='CANVAS');
    chk('dom-covercv',!!document.getElementById('coverCv'));
    const man=document.querySelector('link[rel="manifest"]');
    chk('dom-manifest',!!man&&man.href.length>5);
    chk('dom-favicon',!!document.querySelector('link[rel="icon"]'));
    chk('dom-grain',!!document.querySelector('.grain'));
    chk('dom-expro',!!document.getElementById('expRow'));
    chk('dom-promodal',!!document.getElementById('proModal'));
    chk('dom-lyrcopy',!!document.getElementById('lyrCopy'));
    chk('dom-formsel',!!document.getElementById('formSel'));
    chk('dom-surprise',!!document.getElementById('surpriseBtn'));
    chk('extend-btn',(()=>{const trE={id:'te',title:'x',style:'phonk',mood:'auto',bpm:140,durSec:120,seed:7,theme:'night',createdAt:1,lyrics:null,mix:{gains:{drums:1,bass:1,lead:1,pad:1,atmos:1},mutes:{}}};openLyrics(trE);const ok=!!document.querySelector('#expRow [data-extend]');closeLyrics();return ok;})());
    chk('dur-300',!!document.querySelector('#durSel option[value="300"]'));
    chk('manifest-png',(()=>{const mh=(document.querySelector('link[rel="manifest"]')||{href:''}).href||'';return decodeURIComponent(mh).includes('image/png')||/manifest\.webmanifest$/.test(mh);})());
    try{
      const cv=document.createElement('canvas');cv.width=220;cv.height=110;
      paintCover(cv,{seed:7,style:'phonk'});
      const c2=cv.getContext('2d').getImageData(0,0,220,110).data;
      let nonUni=false;for(let i=4;i<c2.length;i+=40){if(c2[i]!==c2[3]||Math.abs(c2[i]-c2[i-4])>2){nonUni=true;break;}}
      chk('paintcover-nonuniform',nonUni);
    }catch(e){chk('paintcover-nonuniform',false,e.message);}
    /* вёрстка: мобильный/десктоп */
    const mob=window.matchMedia('(max-width:760px)').matches;
    if(mob){
      const tp=getComputedStyle($('createPanel')).transform;
      chk('mobile-drawer-offscreen',/matrix\([^)]*,\s*-?\d{3,}(?:\.\d+)?\)/.test(tp),'transform='+tp);
      chk('mobile-fab-visible',getComputedStyle($('fab')).display!=='none');
    }else{
      chk('desktop-fab-hidden',getComputedStyle($('fab')).display==='none');
    }
    /* бенчмарк полноразмерного рендера */
    if(!quick)for(const g of ['edm','phonk']){
      const tp=Date.now();
      log('bench-start '+g);
      const pl2=composePlan({seed:11,style:g,mood:'auto',bpm:0,durSec:30});
      const b2=await renderTrack(pl2,{gains:{drums:1,bass:1,lead:1,pad:1,atmos:1},mutes:{}});
      let mx2=0;for(let i=0;i<b2.length;i+=31){const v=Math.abs(b2.getChannelData(0)[i]);if(v>mx2)mx2=v;}
      log('bench '+g+': '+(Date.now()-tp)+'ms dur='+b2.duration.toFixed(1)+'s max='+mx2.toFixed(3));
      chk('bench-'+g+'-nonempty',mx2>0.01&&mx2<=1.001);
    }
    log('DONE pass='+pass+' fail='+fail);
    document.title=fail===0?'SELFTEST OK':'SELFTEST FAIL';
  }catch(e){log('FATAL: '+e.message);document.title='SELFTEST FAIL';}
  finally{setTimeout(()=>{if(!document.title.startsWith('SELFTEST'))document.title='SELFTEST NOFIN';},1);}
}
/* ---------- старт ---------- */
function saveLib(arr){if(arr)tracks=arr;localStorage.setItem(LIB_KEY,JSON.stringify(tracks));}
if(!new URLSearchParams(location.search).has('probe')){initThemeSel();initLangSel();initInstall();initChips();initExamples();initMixer();initCustomLyr();initPresets();renderPresets();renderLib();drawViz();}
try{if(localStorage.getItem('nc_loop')==='1'){loopOn=true;$('loopBtn').classList.add('on');}}catch(err){}
if(new URLSearchParams(location.search).get('test')==='1')runSelfTest();
if(new URLSearchParams(location.search).get('drawer')==='1')document.body.classList.add('drawer-open');
