"use strict";
'use strict';
/* ============ Nocturna — студия нейромузыки ============
   Виток 1: генеративный движок (Web Audio, синтез в браузере),
   библиотека, плеер, WAV-экспорт без лимитов, стем-микшер. */

/* ---------- RNG и утилиты ---------- */
function mulberry32(seed){let s=seed>>>0;return function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function hashStr(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pick=(rng,arr)=>arr[Math.floor(rng()*arr.length)];
function fmtTime(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
/* ---------- локализация ---------- */
const I18N={
  ru:{app_sub:'студия нейромузыки · версия 2.2 · PWA',pro_badge:'PRO∞ активен',badge_note:'права на все треки — твои · коммерческое использование без лимитов',theme_title:'Тема',install_btn:'Установить приложение',p_desc:'Описание трека',prompt_ph:'Опиши трек своими словами: жанр, настроение, о чём песня…',p_desc_hint:'Например: «мрачный фонк про ночную гонку по городу» — жанр, темп и настроение я пойму из текста.',p_style:'Стиль — опиши звук словами',style_ph:'напр.: фонك, 140 bpm, мрачно, глубокий бас',style_hint:'Жанр, настроение и темп из этой строки сильнее чипов — как режим Custom в настоящих студиях. Пусто — работают чипы.',p_genre:'Жанр',p_mood:'Настроение',p_presets:'Мои пресеты стиля',presets_hint:'Сохраняются кнопкой «Сохранить стиль» в модалке любого трека — потом одним касанием применяются к новой генерации.',p_len:'Длина',dur_30:'0:30 — демо',dur_60:'1:00 — короткая',dur_120:'2:00 — стандарт',dur_180:'3:00 — полная',dur_240:'4:00 — максимум',dur_300:'5:00 — длинная',p_bpm:'Темп',bpm_auto:'как в жанре',bpm_slow:'медленный',bpm_med:'средний',bpm_fast:'быстрый',p_form:'Форма',form_classic:'классическая',form_compact:'компактная',form_epic:'эпичная',form_energy:'энергичная',p_voice:'Голос',voc_female:'синт-женский',voc_male:'синт-мужской',voc_none:'без голоса',p_lyr:'Текст песни',lyr_auto:'напишет Nocturna',lyr_custom:'свой текст',lyr_none:'без текста (инструментал)',p_title:'Название',title_ph:'придумаю сама',custom_title:'Твой текст песни',custom_hint:'Понимаю теги: [Куплет], [Припев], [Бридж], [Интро], [Аутро] — английские тоже ([Verse], [Chorus], [Bridge], [Intro], [Outro]). Пустая строка между секциями — на здоровье.',btn_surprise:'🎲 Сюрприз-трек — наугад',btn_gen:'Сгенерировать трек',examples_title:'Примеры запросов',studio_title:'Studio · микшер дорожек',mixer_hint:'Микшер применяется к активному треку: меняешь ползунки — трек пересобирается с новыми балансами. Как в настоящей студии, только твой.',note_com:'PRO∞: без кредитов, без лимитов скачиваний, все права на треки передаются тебе. Никаких «7 скачиваний за жизнь» — это прошло.',lib_title:'Библиотека',player_now:'Ничего не выбрано',player_sub:'сгенерируй первый трек',lyr_btn:'Текст песни',copy_lyr:'Копировать текст',empty_h:'Здесь пока тихо',empty_p:'Опиши трек слева — жанр, настроение и сюжет. Я напишу музыку и текст, а потом её можно слушать, редактировать в микшере и скачивать без ограничений.',gen_toast:'Генерирую: {T}…',done_toast:'Трек готов: {T}',del_toast:'Трек удалён',cover_toast:'Кавер «{G}» генерируется…',rmk_toast:'Новая вариация генерируется…',preset_save:'Стиль сохранён в пресеты',preset_apply:'Пресет «{L}» применён',exp_title:'Экспорт — включено в PRO∞',cover_title:'Кавер — та же лирика, другой жанр',preset_btn:'💾 Сохранить стиль как пресет',stem_dl:'Рендерю стем «{L}»…',dl_ok:'Скачано: {F} — без лимитов, как договаривались 🙂',s_lang:'Язык'},
  en:{app_sub:'neuro-music studio · v2.2 · PWA',pro_badge:'PRO∞ active',badge_note:'all track rights are yours · commercial use with no limits',theme_title:'Theme',install_btn:'Install app',p_desc:'Track description',prompt_ph:'Describe your track in words: genre, mood, what it is about…',p_desc_hint:'E.g. “dark phonk about a night race through the city” — I will pick up genre, tempo and mood from the text.',p_style:'Style — describe the sound',style_ph:'e.g.: phonk, 140 bpm, dark, deep bass',style_hint:'Genre, mood and tempo from this line override the chips — like Custom mode in pro studios. Empty — chips apply.',p_genre:'Genre',p_mood:'Mood',p_presets:'My style presets',presets_hint:'Saved with the “Save style” button in any track modal — then applied to a new generation in one tap.',p_len:'Length',dur_30:'0:30 — demo',dur_60:'1:00 — short',dur_120:'2:00 — standard',dur_180:'3:00 — full',dur_240:'4:00 — max',dur_300:'5:00 — long',p_bpm:'Tempo',bpm_auto:'genre default',bpm_slow:'slow',bpm_med:'medium',bpm_fast:'fast',p_form:'Structure',form_classic:'classic',form_compact:'compact',form_epic:'epic',form_energy:'energetic',p_voice:'Voice',voc_female:'synth female',voc_male:'synth male',voc_none:'no vocals',p_lyr:'Lyrics',lyr_auto:'Nocturna writes it',lyr_custom:'your own text',lyr_none:'no lyrics (instrumental)',p_title:'Title',title_ph:'I will name it myself',custom_title:'Your lyrics',custom_hint:'I understand tags: [Verse], [Chorus], [Bridge], [Intro], [Outro] — Russian ones too ([Куплет], [Припев], [Бридж]). Empty lines between sections are welcome.',btn_surprise:'🎲 Surprise track — random',btn_gen:'Generate track',examples_title:'Prompt examples',studio_title:'Studio · track mixer',mixer_hint:'The mixer applies to the active track: move the sliders and the track is rebuilt with new balance. Like a real studio, but yours.',note_com:'PRO∞: no credits, no download limits, all track rights are transferred to you. No “7 downloads for life” — that era is over.',lib_title:'Library',player_now:'Nothing selected',player_sub:'generate your first track',lyr_btn:'Lyrics',copy_lyr:'Copy lyrics',empty_h:'It is quiet here',empty_p:'Describe a track on the left — genre, mood and plot. I will write the music and the lyrics, then you can listen, remix in the mixer and download with no limits.',gen_toast:'Generating: {T}…',done_toast:'Track ready: {T}',del_toast:'Track deleted',cover_toast:'Cover “{G}” is generating…',rmk_toast:'New variation is generating…',preset_save:'Style saved to presets',preset_apply:'Preset “{L}” applied',exp_title:'Export — included in PRO∞',cover_title:'Cover — same lyrics, another genre',preset_btn:'💾 Save style as preset',stem_dl:'Rendering stem “{L}”…',dl_ok:'Downloaded: {F} — no limits, as agreed 🙂',s_lang:'Language'}
};
let CUR_LANG=(localStorage.getItem('nocturna_lang')==='en')?'en':'ru';
function t(k,subs){let s=(I18N[CUR_LANG]&&I18N[CUR_LANG][k]!=null)?I18N[CUR_LANG][k]:(I18N.ru[k]!=null?I18N.ru[k]:k);if(subs)for(const key in subs)s=s.replace('{'+key+'}',subs[key]);return s;}
function gLabel(g){if(CUR_LANG==='en'){const m={phonk:'Phonk',synthwave:'Synthwave',lofi:'Lo-Fi',rock:'Rock',epic:'Epic/Cinematic',edm:'EDM',chiptune:'Chiptune',trap:'Trap',dnb:'Drum & Bass',horror:'Horror',ambient:'Ambient',pop:'Pop'};if(m[g])return m[g];}return GENRES[g]?GENRES[g].label:g;}

/* ---------- теория ---------- */
const SCALES={minor:[0,2,3,5,7,8,10],major:[0,2,4,5,7,9,11],dorian:[0,2,3,5,7,9,10],phrygian:[0,1,3,5,7,8,10],harmonic:[0,2,3,5,7,8,11]};
const CHORDT={m:[0,3,7],M:[0,4,7],m7:[0,3,7,10],M7:[0,4,7,11]};
const midiToFreq=m=>440*Math.pow(2,(m-69)/12);
function scaleNote(scale,tonic,step){const oct=Math.floor(step/scale.length);const idx=((step%scale.length)+scale.length)%scale.length;return tonic+scale[idx]+12*oct;}

/* ---------- жанры ---------- */
const GENRES={
  phonk:{label:'Фонк',bpm:[128,148],scale:'phrygian',
    progs:[[[0,'m'],[8,'M'],[3,'M'],[10,'M']],[[0,'m'],[0,'m'],[8,'M'],[10,'M']],[[0,'m'],[10,'M'],[8,'M'],[0,'m']]],
    drums:'phonk',bass:'808',lead:'bell',pad:'dark',arp:false,swing:0,rev:.24,delay:.12,drive:.5,
    vinyl:true,colors:['#ff3d68','#7c5cff'],emoji:'🕶'},
  synthwave:{label:'Синтвейв',bpm:[96,112],scale:'minor',
    progs:[[[0,'m'],[8,'M'],[3,'M'],[10,'M']],[[0,'m'],[5,'m'],[10,'M'],[7,'M']],[[0,'m'],[3,'M'],[8,'M'],[7,'M']]],
    drums:'synth',bass:'saw',lead:'saw',pad:'bright',arp:true,swing:0,rev:.3,delay:.3,drive:.15,
    pump:.18,riser:true,colors:['#22d3ee','#a855f7'],emoji:'🌆'},
  lofi:{label:'Lo-Fi',bpm:[72,86],scale:'dorian',
    progs:[[[0,'m7'],[5,'m7'],[8,'M7'],[3,'M7']],[[0,'M7'],[9,'m7'],[2,'m7'],[7,'M7']],[[0,'m7'],[3,'M7'],[8,'M7'],[10,'m7']]],
    drums:'lofi',bass:'long',lead:'pluck',pad:'strings',arp:false,swing:.32,rev:.3,delay:.2,drive:0,
    vinyl:true,voicePre:.30,colors:['#f59e0b','#ec4899'],emoji:'☕'},
  rock:{label:'Рок',bpm:[112,132],scale:'minor',
    progs:[[[0,'M'],[7,'M'],[5,'M'],[7,'M']],[[0,'m'],[10,'M'],[5,'m'],[7,'M']],[[0,'M'],[5,'M'],[7,'M'],[3,'M']]],
    drums:'rock',bass:'saw',lead:'guitar',pad:'none',arp:false,swing:0,rev:.18,delay:.1,drive:.7,
    colors:['#ef4444','#f97316'],emoji:'🎸'},
  epic:{label:'Эпик',bpm:[84,100],scale:'minor',
    progs:[[[0,'m'],[8,'M'],[3,'M'],[10,'M']],[[0,'m'],[7,'M'],[8,'M'],[10,'M']],[[0,'m'],[5,'m'],[8,'M'],[10,'M']]],
    drums:'epic',bass:'long',lead:'saw',pad:'strings',arp:false,swing:0,rev:.42,delay:.08,drive:0,
    big:true,voicePre:.30,colors:['#f59e0b','#fbbf24'],emoji:'🏰'},
  edm:{label:'EDM',bpm:[124,132],scale:'minor',
    progs:[[[0,'m'],[8,'M'],[3,'M'],[10,'M']],[[0,'m'],[10,'M'],[8,'M'],[5,'m']],[[0,'m'],[5,'m'],[10,'M'],[7,'M']]],
    drums:'four',bass:'saw',lead:'saw',pad:'bright',arp:true,swing:0,rev:.22,delay:.25,drive:.2,
    pump:.22,riser:true,colors:['#06b6d4','#8b5cf6'],emoji:'🔥'},
  chiptune:{label:'Чиптюн',bpm:[140,164],scale:'major',
    progs:[[[0,'M'],[7,'M'],[9,'m'],[5,'M']],[[0,'M'],[5,'M'],[9,'m'],[7,'M']],[[0,'M'],[4,'m'],[9,'m'],[5,'M']]],
    drums:'chip',bass:'square',lead:'square',pad:'none',arp:true,swing:0,rev:.12,delay:.15,drive:0,
    voicePre:.30,colors:['#4ade80','#22d3ee'],emoji:'👾'},
  trap:{label:'Трэп',bpm:[136,150],scale:'phrygian',
    progs:[[[0,'m'],[0,'m'],[8,'M'],[10,'M']],[[0,'m'],[3,'M'],[8,'M'],[7,'M']],[[0,'m'],[10,'M'],[0,'m'],[8,'M']]],
    drums:'trap',bass:'808',lead:'bell',pad:'dark',arp:false,swing:0,rev:.2,delay:.15,drive:.3,
    colors:['#8b5cf6','#ec4899'],emoji:'🎤'},
  dnb:{label:'Драм-н-бейс',bpm:[168,174],scale:'minor',
    progs:[[[0,'m'],[8,'M'],[10,'M'],[3,'M']],[[0,'m'],[10,'M'],[5,'m'],[7,'M']],[[0,'m'],[3,'M'],[8,'M'],[10,'M']]],
    drums:'break',bass:'808',lead:'bell',pad:'dark',arp:false,swing:0,rev:.28,delay:.22,drive:.15,
    pump:.15,riser:true,colors:['#34d399','#22d3ee'],emoji:'⚡'},
  horror:{label:'Хоррор',bpm:[58,70],scale:'harmonic',
    progs:[[[0,'m'],[1,'M'],[0,'m'],[8,'M']],[[0,'m'],[8,'M'],[5,'m'],[1,'M']],[[0,'m'],[11,'m'],[5,'m'],[8,'M']]],
    drums:'none',bass:'long',lead:'bell',pad:'dark',arp:false,swing:0,rev:.5,delay:.2,drive:0,
    vinyl:true,shimmer:true,voicePre:.32,colors:['#94a3b8','#b91c1c'],emoji:'🕯'},
  ambient:{label:'Эмбиент',bpm:[56,68],scale:'dorian',
    progs:[[[0,'m7'],[5,'m7'],[10,'M7'],[3,'M7']],[[0,'M7'],[5,'M7'],[9,'m7'],[2,'m7']]],
    drums:'none',bass:'long',lead:'bell',pad:'strings',arp:false,swing:0,rev:.55,delay:.35,drive:0,
    shimmer:true,voicePre:.34,colors:['#38bdf8','#818cf8'],emoji:'🌌'},
  pop:{label:'Поп',bpm:[104,118],scale:'major',
    progs:[[[0,'M'],[7,'m'],[9,'m'],[5,'M']],[[0,'M'],[5,'M'],[9,'m'],[7,'M']],[[9,'m'],[5,'M'],[0,'M'],[7,'M']]],
    drums:'pop',bass:'saw',lead:'pluck',pad:'bright',arp:false,swing:0,rev:.25,delay:.18,drive:.1,
    pump:.12,colors:['#f472b6','#fb923c'],emoji:'✨'}
};
const GENRE_KEYS=Object.keys(GENRES);

/* ---------- настроение ---------- */
const MOODS={
  auto:{label:'Авто',scales:null,bright:0,revAdd:0,soft:0},
  dark:{label:'Мрачно',scales:['phrygian','harmonic'],bright:0,revAdd:.04,soft:0},
  sad:{label:'Грустно',scales:['minor'],bright:0,revAdd:.09,soft:.12},
  happy:{label:'Радостно',scales:['major'],bright:1,revAdd:0,soft:0},
  calm:{label:'Спокойно',scales:['dorian','major'],bright:.5,revAdd:.12,soft:.25},
  epic:{label:'Эпично',scales:['minor','harmonic'],bright:.4,revAdd:.14,soft:0,big:true}
};

/* ---------- барабанные паттерны (16 шагов на такт) ---------- */
const DRUMS={
  phonk:{kick:[[0,1],[7,.92],[10,.85]],snare:[[8,1]],hatC:[[0,.5],[2,.3],[4,.55],[6,.3],[8,.5],[10,.3],[12,.55],[14,.3]],hatO:[[15,.45]],cow:[[0,.55],[6,.4],[8,.55],[14,.4]]},
  trap:{kick:[[0,1],[7,.9],[10,.8]],snare:[[8,1]],hatC:[[0,.45],[1,.2],[2,.3],[3,.2],[4,.45],[5,.2],[6,.3],[7,.2],[8,.45],[9,.2],[10,.3],[11,.2],[12,.45],[13,.2],[14,.3],[15,.2]],hatO:[[3,.3],[11,.3]]},
  four:{kick:[[0,1],[4,.92],[8,1],[12,.92]],clap:[[4,.8],[12,.8]],hatC:[[2,.4],[6,.4],[10,.4],[14,.4]],hatO:[[6,.45],[14,.45]]},
  lofi:{kick:[[0,.85],[10,.65]],snare:[[4,.7],[12,.78]],hatC:[[0,.35],[2,.25],[4,.35],[6,.25],[8,.35],[10,.25],[12,.35],[14,.25]]},
  rock:{kick:[[0,1],[6,.7],[8,.95],[10,.6]],snare:[[4,.95],[12,1]],hatC:[[0,.45],[2,.35],[4,.45],[6,.35],[8,.45],[10,.35],[12,.45],[14,.35]]},
  chip:{kick:[[0,.9],[8,.9]],snare:[[4,.75],[12,.75]],hatC:[[0,.4],[2,.2],[4,.4],[6,.2],[8,.4],[10,.2],[12,.4],[14,.2]]},
  pop:{kick:[[0,1],[8,.9],[10,.7]],clap:[[4,.7],[12,.7]],hatC:[[0,.4],[2,.3],[4,.4],[6,.3],[8,.4],[10,.3],[12,.4],[14,.3]],hatO:[[14,.4]]},
  synth:{kick:[[0,1],[8,1]],snare:[[4,.9],[12,.9]],hatC:[[0,.4],[4,.4],[8,.4],[12,.4]],hatO:[[2,.5],[10,.5]]},
  epic:{kick:[[0,1],[8,.8]],perc:[[12,.45]]},
  break:{kick:[[0,1],[2.5,.85],[8,.9],[10.5,.8]],snare:[[4,.9],[12,1],[14,.45]],hatC:[[2,.35],[6,.3],[10,.35],[14,.3]],hatO:[[7,.4],[15,.35]]},
  none:null
};

/* ---------- структура секций ---------- */
const SECT={
  intro:{label:'Интро',drums:.45,bass:.7,pad:1,lead:0,arp:.5,energy:.55},
  verse:{label:'Куплет',drums:1,bass:1,pad:.85,lead:.55,arp:.85,energy:.8},
  chorus:{label:'Припев',drums:1,bass:1,pad:1,lead:1,arp:1,energy:1.05},
  bridge:{label:'Бридж',drums:.15,bass:.45,pad:1,lead:.3,arp:.6,energy:.55},
  outro:{label:'Аутро',drums:.3,bass:.5,pad:1,lead:.2,arp:.3,energy:.5}
};

/* ---------- парсер промпта ---------- */
const KW={
  phonk:['фонк','phonk','мэмфис','дрифт','тунинг','тачк'],
  synthwave:['синтвейв','ретро','аутран','неон','вэйв','вайб 80'],
  lofi:['лоу-фай','lofi','лофай','учеба','учёба','дождь','кофе','ночная смена'],
  rock:['рок','гитар','метал','панк','мотор','мотоцикл'],
  epic:['эпич','кино','финал','битва','босс','герой','оркестр','сражен'],
  edm:['edm','дэнс','танц','клуб','рейв','электро','вечеринка','дискотек'],
  chiptune:['8-бит','8 бит','8бит','чиптюн','денди','dendy','пиксель','игров'],
  trap:['трэп','trap','рэп','реп','флекс','флоу','микрофон'],
  dnb:['драм-н-бейс','драмнбейс','драм энд бейс','драм энд бэйс','dnb','d&b','drum n bass','drum&bass','drum\'n\'bass','джангл','брейкбит'],
  horror:['хоррор','horror','ужас','жутк','страшн','заброшен','скример','крипипаста','аномаль'],
  ambient:['эмбиент','спокой','медитац','сон','дыхан','звёзд','звезд'],
  pop:['поп','песня','хит','радио','весел','кавер']
};
const MOOD_KW={dark:['мрач','тёмн','темн','страх','тень','опасн','злой','город ночью','стелс','dark','gloomy'],
  sad:['груст','печаль','тоск','одинок','слез','дождлив','sad','melanchol'],
  happy:['весел','радост','счаст','праздн','смех','солнц','день рожд','happy','joyful','fun'],
  calm:['спокой','мягк','нежн','тих','релакс','вечер','calm','chill','relaxed','soft'],
  epic:['эпич','мощн','герой','велич','побед','триумф','epic','triumphant','heroic']};
const THEME_KW={love:['любов','любви','сердц','роман'],
  night:['ночь','ночной','фонар','город не спит'],
  space:['космос','планет','галакт','марс','ракет'],
  autumn:['осен','листья','сентябр','октябр','похолодал'],
  battle:['битв','войн','борьб','финал','босс','чемпион'],
  dream:['мечт','сон','снитс','засыпай'],
  winter:['зим','снег','ёлк','новый год','декабр','январ','мороз','снеговик','коньк'],
  friend:['дружб','друзья','подруг','команда','товарищ','одноклассник'],
  city:['улиц','трамвай','метро','витрин','двор','набереж','пробк'],
  road:['дорога','путь','путешеств','машин','скорость','гонк','шоссе','трасса']};

function parsePrompt(text){
  const t=(text||'').toLowerCase();
  let style=null,mood='auto',theme=null;
  for(const k of GENRE_KEYS){if(KW[k].some(w=>t.includes(w))){style=k;break;}}
  for(const m in MOOD_KW){if(MOOD_KW[m].some(w=>t.includes(w))){mood=m;break;}}
  const thOrder=['love','winter','night','city','space','battle','autumn','friend','dream','road'];
  for(const th of thOrder){if(THEME_KW[th].some(w=>t.includes(w))){theme=th;break;}}
  return {style,mood,theme};
}
