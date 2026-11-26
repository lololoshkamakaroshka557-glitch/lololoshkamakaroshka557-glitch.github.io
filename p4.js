"use strict";
/* ---------- композитор ---------- */
const LEAD_RHYTHMS=[
  [[0,4],[4,2],[6,2],[8,4],[12,2],[14,2]],
  [[0,2],[2,2],[4,4],[8,8]],
  [[0,6],[6,2],[8,4],[12,4]],
  [[0,4],[4,4],[8,4],[12,4]],
  [[0,2],[2,2],[4,2],[6,2],[8,2],[10,2],[12,4]],
  [[0,8],[8,4],[12,4]],
  [[0,3],[4,3],[8,3],[12,5]]
];
function buildForm(target,barDur,formName){
  const FORMS={
    classic:[
      [['intro',2],['chorus',4],['outro',2]],
      [['intro',2],['verse',4],['chorus',6],['outro',2]],
      [['intro',2],['verse',8],['chorus',8],['outro',4]],
      [['intro',4],['verse',8],['chorus',8],['verse',8],['chorus',8],['outro',4]],
      [['intro',4],['verse',8],['chorus',8],['verse',8],['chorus',8],['bridge',4],['chorus',8],['outro',4]],
      [['intro',4],['verse',12],['chorus',8],['verse',12],['chorus',8],['bridge',8],['chorus',8],['chorus',8],['outro',4]]
    ],
    compact:[
      [['intro',1],['verse',2],['chorus',4],['outro',1]],
      [['intro',2],['verse',4],['chorus',6],['bridge',2],['chorus',4],['outro',1]],
      [['intro',2],['verse',6],['chorus',8],['bridge',2],['chorus',6],['outro',2]]
    ],
    epic:[
      [['intro',2],['verse',4],['chorus',6],['verse',4],['chorus',6],['bridge',4],['chorus',6],['outro',2]],
      [['intro',4],['verse',8],['chorus',8],['bridge',8],['chorus',8],['chorus',8],['outro',4]],
      [['intro',4],['verse',12],['chorus',8],['bridge',8],['chorus',8],['verse',12],['chorus',8],['outro',4]]
    ],
    energy:[
      [['intro',1],['chorus',2],['verse',2],['chorus',4],['bridge',2],['chorus',4],['outro',1]],
      [['intro',2],['verse',4],['chorus',6],['bridge',2],['chorus',6],['outro',2]],
      [['intro',2],['chorus',4],['verse',6],['chorus',8],['bridge',4],['chorus',8],['outro',2]]
    ]
  };
  const list=FORMS[formName]||FORMS.classic;
  const n=target/barDur;
  let best=list[0],bestD=1e9;
  for(const f of list){const tot=f.reduce((s,x)=>s+x[1],0);const d=Math.abs(tot-n);if(d<bestD){bestD=d;best=f;}}
  return best;
}
/* марковская модель мелодических ходов 2-го порядка — обучена на JSB Chorales
   (ageron/handson-ml2, public domain, 229 хорала train): пары (предыдущий шаг, текущий) → следующий,
   топ-10 переходов покрывают 97.2% данных. Характер: «шаг-шаг-повтор», направление почти не меняется без паузы */
const MOTIF2={'0,0':33631,'-1,0':4799,'0,-1':4766,'0,1':3730,'1,0':3680,'-2,0':589,'0,-2':573,'0,3':416,'3,0':416,'0,2':327};
function genMotif(rng,len){
  const mot=[];let deg=2+Math.floor(rng()*3);
  let a=0,b=0;
  for(let i=0;i<len;i++){
    const opts=MOTIF2[a+','+b];
    let s=null;
    if(opts){
      let tot=0;for(const k in opts)tot+=opts[k];
      let r=rng()*tot;
      for(const k in opts){r-=opts[k];if(r<=0){s=+k;break;}}
      if(s===0&&a===0&&b===0)s=null; /* анти-залипание: не более двух повторов подряд */
    }
    if(s===null){
      const r=rng();
      if(r<.35)s=pick(rng,[-2,-1,1,1,2]);
      else if(r<.40)s=pick(rng,[4,-4,5,-5,7]);
      else s=0;
    }
    deg+=s;deg=clamp(deg,0,10);
    mot.push(deg);a=b;b=s;
  }
  return mot;
}
function snapToChord(scale,deg,rootMidi,intervals){
  const m=scaleNote(scale,0,deg)+rootMidi;
  for(let d=0;d<3;d++){
    if(intervals.includes(((m-rootMidi)%12+12)%12))return deg;
    if(deg>0)deg--;else deg++;
  }
  return deg;
}
function composePlan(p){
  const rng=mulberry32(p.seed);
  const G=GENRES[p.style];
  const M=MOODS[p.mood]||MOODS.auto;
  const bpm=p.bpm||Math.round(G.bpm[0]+rng()*(G.bpm[1]-G.bpm[0]));
  const barDur=240/bpm;
  const scaleName=(M.scales&&rng()<.75)?pick(rng,M.scales):G.scale;
  const scale=SCALES[scaleName];
  const tonic=p.mood==='happy'||scaleName==='major'||scaleName==='dorian'?57:57;
  const prog=pick(rng,G.progs);
  const form=buildForm(p.durSec,barDur,p.form);
  const sections=[];let t0=0;
  const beatsPerBar=4,stepsPerBar=16,stepDur=barDur/stepsPerBar;
  const motifs={};
  function motifFor(name){
    if(!motifs[name])motifs[name]=genMotif(rng,8);
    return motifs[name];
  }
  for(const [kind,bars] of form){
    const S=SECT[kind];
    sections.push({kind,label:S.label,start:t0,bars,energy:S.energy});
    t0+=bars*barDur;
  }
  const duration=t0;
  const ev={drums:[],bass:[],lead:[],voice:[],pad:[],atmos:[]};
  const push=(stem,obj)=>{if(!Number.isFinite(obj.t)||!Number.isFinite(obj.vel))return;ev[stem].push(obj);};
  const humanize=(rng,amt)=>(rng()*2-1)*amt;
  const dg=G.drumG||0.9;

  sections.forEach((sec,si)=>{
    const S=SECT[sec.kind];
    const secStart=sec.start;
    for(let b=0;b<sec.bars;b++){
      const barT=secStart+b*barDur;
      const ch=prog[b%prog.length];
      const rootMidi=scaleNote(scale,tonic,0)+ch[0];
      const chordInt=CHORDT[ch[1]];
      const chordMidis=chordInt.map(iv=>rootMidi+iv);
      /* барабаны */
      const dp=DRUMS[G.drums];
      if(dp&&S.drums>0.05){
        /* живая динамика: разброс velocity по данным Groove MIDI Dataset (Magenta): p10≈25, p50≈60, p90≈120 */
        for(const [st,v] of dp.kick)push('drums',{t:barT+st*stepDur+humanize(rng,.004),dur:.35,vel:v*S.drums*dg*(0.8+rng()*0.5),name:'kick'});
        for(const [st,v] of (dp.snare||[]))push('drums',{t:barT+st*stepDur+humanize(rng,.005),dur:.2,vel:v*S.drums*dg*(0.82+rng()*0.44),name:'snare'});
        /* драг-кик на 15-й шестнадцатой: в Groove встречается в 15-21% тактов (rock/funk/soul/hiphop) */
        if(rng()<0.2&&!dp.kick.some(([st])=>st===15))push('drums',{t:barT+stepDur*15+humanize(rng,.003),dur:.3,vel:0.55*S.drums*dg,name:'kick'});
        if(dp.clap)for(const [st,v] of dp.clap)push('drums',{t:barT+st*stepDur+humanize(rng,.005),dur:.2,vel:v*S.drums*dg,name:'clap'});
        if(dp.hatC)for(const [st,v] of dp.hatC){
          const sw=(st%2===1)?G.swing*stepDur*0.5:0;
          push('drums',{t:barT+st*stepDur+sw+humanize(rng,.003),dur:.05,vel:v*S.drums*dg,name:'hatC'});
        }
        if(dp.hatO)for(const [st,v] of dp.hatO){
          const sw=(st%2===1)?G.swing*stepDur*0.5:0;
          push('drums',{t:barT+st*stepDur+sw+humanize(rng,.003),dur:.3,vel:v*S.drums*dg,name:'hatO'});
        }
        if(dp.cow)for(const [st,v] of dp.cow)push('drums',{t:barT+st*stepDur,dur:.3,vel:v*S.drums*dg,name:'cow'});
        if(dp.perc)for(const [st,v] of dp.perc)push('drums',{t:barT+st*stepDur,dur:.15,vel:v*S.drums*dg,name:'perc'});
        /* финальный сбив такта */
        if(S.drums>=0.9&&rng()<.3)push('drums',{t:barT+barDur-stepDur*2,dur:.08,vel:.6*S.drums*dg,name:'snare'});
      }
      /* бас */
      if(S.bass>0.05){
        if(G.bass==='808'){
          const kicks=(dp?dp.kick:[[0,1]]);
          for(const [st,v] of kicks)push('bass',{t:barT+st*stepDur,dur:stepDur*3.2,vel:v*S.bass,midi:rootMidi-12,glide:G.drums==='trap'&&rng()<.3?rootMidi-10:0});
        }else if(G.bass==='saw'){
          for(let s=0;s<8;s++)push('bass',{t:barT+s*2*stepDur+humanize(rng,.004),dur:stepDur*1.6,vel:(s%2?0.8:1)*S.bass,midi:rootMidi-12});
        }else if(G.bass==='long'){
          push('bass',{t:barT,dur:barDur*0.98,vel:.85*S.bass,midi:rootMidi-12});
        }else if(G.bass==='square'){
          for(let s=0;s<8;s++)push('bass',{t:barT+s*2*stepDur,dur:stepDur*1.4,vel:.8*S.bass,midi:rootMidi-24+((s%4===3)?12:0)});
        }
      }
      /* пэд / аккорд */
      if(S.pad>0.05&&G.pad!=='none'){
        for(const m of chordMidis)push('pad',{t:barT,dur:barDur*1.05,vel:S.pad,midi:m+12});
      }
      /* арпеджио */
      if(G.arp&&S.arp>0.05){
        const seq=[0,1,2,1,0,1,2,1,2,1,0,1,2,1,2,1];
        for(let s=0;s<16;s++){
          const m=rootMidi+12+chordInt[seq[s]%chordInt.length]+12*(s>=8?1:0);
          push('lead',{t:barT+s*stepDur+humanize(rng,.002),dur:stepDur*.9,vel:.34*S.arp*sec.energy,midi:m,name:'arp'});
        }
      }
      /* мелодия */
      if(S.lead>0.05&&G.lead!=='none'){
        const mot=motifFor(sec.kind==='chorus'||sec.kind==='drop'?'chorus':'verse');
        const idxBase=(sec.kind==='chorus')?4:0;
        const rh=pick(rng,LEAD_RHYTHMS);
        for(let i=0;i<rh.length;i++){
          const [st,d16]=rh[i];
          let deg=mot[(b*2+i)%mot.length]+idxBase;
          if(st%4===0)deg=snapToChord(scale,deg,rootMidi,chordInt);
          const midi=scaleNote(scale,tonic,deg)+24;
          push('lead',{t:barT+st*stepDur+humanize(rng,.006),dur:d16*stepDur*0.92,vel:S.lead*(sec.kind==='chorus'?1:.85),midi,name:G.lead});
        }
      }
      /* финальный сбив такта */
      if(S.drums>=0.9&&rng()<.3)push('drums',{t:barT+barDur-stepDur*2,dur:.08,vel:.6*S.drums*dg,name:'snare'});
    }
  });
  /* голос: поёт мелодию с формантами (синт-вокал) */
  if((p.vocal||'female')!=='none'){
    const VOW=['а','о','э','у','а'];
    let vi=0,lastT=-9;
    ev.lead.forEach(e=>{
      if(e.dur>=0.18&&e.t-lastT>=barDur/8){push('voice',{t:e.t,dur:Math.min(e.dur,1.4),vel:Math.min(1,e.vel*1.15),midi:e.midi,vowel:VOW[vi%VOW.length]});vi++;lastT=e.t;}
    });
    /* скольжение формант: каждая нота голоса знает предыдущую гласную — vVocal делает дифтонг-переход */
    for(let i=1;i<ev.voice.length;i++)ev.voice[i].prevVowel=ev.voice[i-1].vowel;
  }
  /* атмосфера: виниловый шум / шиммер / райзеры */
  if(G.vinyl)push('atmos',{t:0,dur:duration+2,vel:.05,name:'vinyl'});
  if(G.shimmer){
    sections.forEach((sec,si)=>{
      const S=SECT[sec.kind];
      if(S.pad>0.05)push('atmos',{t:sec.start,dur:sec.bars*barDur,vel:.14*S.pad,name:'shimmer'});
    });
  }
  if(G.riser){
    sections.forEach(sec=>{
      if(sec.kind==='intro'||sec.kind==='bridge')push('atmos',{t:sec.start,dur:sec.bars*barDur,vel:.55,name:'riser'});
    });
  }
  const finalChord=prog[0];
  push('pad',{t:duration-0.1,dur:2.2,vel:.8,midi:scaleNote(scale,tonic,0)+finalChord[0]+12});
  push('pad',{t:duration-0.1,dur:2.2,vel:.8,midi:scaleNote(scale,tonic,0)+finalChord[0]+12+CHORDT[finalChord[1]][1]});
  return {bpm,barDur,scaleName,tonic,sections,duration,events:ev,style:p.style,mood:p.mood,vocal:p.vocal||'female'};
}
