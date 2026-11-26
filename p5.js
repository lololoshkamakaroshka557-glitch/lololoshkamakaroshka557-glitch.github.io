"use strict";
/* ---------- синтез ---------- */
function makeNoise(ctx){
  if(ctx._nb)return ctx._nb;
  const sr=ctx.sampleRate,len=sr*2,b=ctx.createBuffer(1,len,sr),d=b.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  ctx._nb=b;return b;
}
function noiseSrc(ctx,t,dur){
  const s=ctx.createBufferSource();s.buffer=makeNoise(ctx);
  s.loop=true;s.loopStart=0;s.loopEnd=2;
  s.start(t);s.stop(t+dur+0.02);
  return s;
}
function makeIR(ctx,sec,decay){
  const sr=ctx.sampleRate,len=Math.max(64,Math.floor(sr*sec)),b=ctx.createBuffer(2,len,sr);
  for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay);}
  return b;
}
function makeShaper(ctx,k){
  const ws=ctx.createWaveShaper();const n=256,c=new Float32Array(n);
  for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(k*x)/Math.tanh(k);}
  ws.curve=c;return ws;
}
function vKick(ctx,bus,ev){
  const t=ev.t,o=ctx.createOscillator(),g=ctx.createGain();
  o.type='sine';
  o.frequency.setValueAtTime(155,t);
  o.frequency.exponentialRampToValueAtTime(44,t+0.09);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(1.15*ev.vel,t+0.004);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.34);
  o.connect(g).connect(bus);
  o.start(t);o.stop(t+0.42);
  const n=noiseSrc(ctx,t,0.02),ng=ctx.createGain(),hp=ctx.createBiquadFilter();
  hp.type='highpass';hp.frequency.value=3500;
  ng.gain.setValueAtTime(0.5*ev.vel,t);ng.gain.exponentialRampToValueAtTime(0.001,t+0.02);
  n.connect(hp).connect(ng).connect(bus);
}
function vSnare(ctx,bus,ev){
  const t=ev.t;
  const n=noiseSrc(ctx,t,0.2),bp=ctx.createBiquadFilter(),g=ctx.createGain();
  bp.type='bandpass';bp.frequency.value=1750;bp.Q.value=.7;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(.8*ev.vel,t+0.003);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
  n.connect(bp).connect(g).connect(bus);
  const o=ctx.createOscillator(),og=ctx.createGain();
  o.type='triangle';o.frequency.setValueAtTime(210,t);o.frequency.exponentialRampToValueAtTime(150,t+0.07);
  og.gain.setValueAtTime(.35*ev.vel,t);og.gain.exponentialRampToValueAtTime(.001,t+0.08);
  o.connect(og).connect(bus);o.start(t);o.stop(t+0.1);
}
function vClap(ctx,bus,ev){
  const t=ev.t;
  for(let i=0;i<3;i++){
    const tt=t+i*0.012,last=i===2;
    const n=noiseSrc(ctx,tt,last?0.22:0.05),bp=ctx.createBiquadFilter(),g=ctx.createGain();
    bp.type='bandpass';bp.frequency.value=1150;bp.Q.value=1.1;
    g.gain.setValueAtTime((last?.6:.4)*ev.vel,tt);
    g.gain.exponentialRampToValueAtTime(0.001,tt+(last?0.2:0.05));
    n.connect(bp).connect(g).connect(bus);
  }
}
function vHat(ctx,bus,ev){
  const t=ev.t,open=ev.name==='hatO',d=open?0.28:0.045;
  const n=noiseSrc(ctx,t,d+0.02),hp=ctx.createBiquadFilter(),g=ctx.createGain();
  hp.type='highpass';hp.frequency.value=open?7000:8500;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(0.28*ev.vel,t+0.002);
  g.gain.exponentialRampToValueAtTime(0.001,t+d);
  n.connect(hp).connect(g).connect(bus);
}
function vCow(ctx,bus,ev){
  const t=ev.t,g=ctx.createGain(),bp=ctx.createBiquadFilter();
  bp.type='bandpass';bp.frequency.value=800;bp.Q.value=2;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(.4*ev.vel,t+0.004);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.3);
  [540,800].forEach(f=>{
    const o=ctx.createOscillator();o.type='square';o.frequency.value=f;
    o.connect(bp);o.start(t);o.stop(t+0.32);
  });
  bp.connect(g).connect(bus);
}
function vPerc(ctx,bus,ev){
  const t=ev.t,n=noiseSrc(ctx,t,0.15),bp=ctx.createBiquadFilter(),g=ctx.createGain();
  bp.type='bandpass';bp.frequency.value=4200;bp.Q.value=1.4;
  g.gain.setValueAtTime(.4*ev.vel,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.13);
  n.connect(bp).connect(g).connect(bus);
}
function v808(ctx,bus,ev,drive){
  const t=ev.t,d=ev.dur||0.5;
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type='sine';
  const f0=midiToFreq(ev.midi);
  o.frequency.setValueAtTime(f0*1.5,t);
  o.frequency.exponentialRampToValueAtTime(f0,t+0.045);
  if(ev.glide)o.frequency.exponentialRampToValueAtTime(midiToFreq(ev.glide),t+d*0.85);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(0.8*ev.vel,t+0.008);
  g.gain.exponentialRampToValueAtTime(0.001,t+d);
  if(drive>0.05){const ws=makeShaper(ctx,2+drive*25);o.connect(g).connect(ws).connect(bus);}
  else{o.connect(g).connect(bus);}
  o.start(t);o.stop(t+d+0.05);
}
function vSawBass(ctx,bus,ev){
  const t=ev.t,d=ev.dur||0.2,o=ctx.createOscillator(),lp=ctx.createBiquadFilter(),g=ctx.createGain();
  o.type='sawtooth';o.frequency.value=midiToFreq(ev.midi);
  lp.type='lowpass';lp.Q.value=6;
  lp.frequency.setValueAtTime(750,t);lp.frequency.exponentialRampToValueAtTime(180,t+d);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(.55*ev.vel,t+0.006);
  g.gain.exponentialRampToValueAtTime(0.001,t+d);
  o.connect(lp).connect(g).connect(bus);o.start(t);o.stop(t+d+0.05);
}
function vLongBass(ctx,bus,ev){
  const t=ev.t,d=ev.dur||1,o1=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain();
  o1.type='sine';o2.type='triangle';
  o1.frequency.value=midiToFreq(ev.midi);o2.frequency.value=midiToFreq(ev.midi+12);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(.4*ev.vel,t+0.05);
  g.gain.setValueAtTime(.4*ev.vel,t+d*0.7);
  g.gain.exponentialRampToValueAtTime(0.001,t+d);
  o1.connect(g);o2.connect(g);g.connect(bus);
  o1.start(t);o1.stop(t+d+0.05);o2.start(t);o2.stop(t+d+0.05);
}
function vSquareBass(ctx,bus,ev){
  const t=ev.t,d=ev.dur||0.1,o=ctx.createOscillator(),g=ctx.createGain();
  o.type='square';o.frequency.value=midiToFreq(ev.midi);
  g.gain.setValueAtTime(.3*ev.vel,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);
  o.connect(g).connect(bus);o.start(t);o.stop(t+d+0.02);
}
function vLeadSaw(ctx,bus,ev){
  const t=ev.t,d=ev.dur||.3,g=ctx.createGain(),lp=ctx.createBiquadFilter();
  lp.type='lowpass';lp.Q.value=2;
  lp.frequency.setValueAtTime(2600,t);lp.frequency.exponentialRampToValueAtTime(900,t+d);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(.3*ev.vel,t+0.015);
  g.gain.setValueAtTime(.22*ev.vel,t+d*0.7);
  g.gain.exponentialRampToValueAtTime(0.001,t+d+0.12);
  [-8,0,8].forEach(dt=>{
    const o=ctx.createOscillator();o.type='sawtooth';
    o.frequency.value=midiToFreq(ev.midi);o.detune.value=dt;
    o.connect(lp);o.start(t);o.stop(t+d+0.15);
  });
  const lfo=ctx.createOscillator(),lg=ctx.createGain();
  if(d>0.6){
    lfo.frequency.value=5.2;lg.gain.value=5;
    lfo.connect(lg).connect(lp.detune);lfo.start(t);lfo.stop(t+d+0.15);
  }
  lp.connect(g).connect(bus);
}
function vPluck(ctx,bus,ev){
  const t=ev.t,d=Math.min(0.4,ev.dur||.25),o=ctx.createOscillator(),g=ctx.createGain();
  o.type='triangle';o.frequency.value=midiToFreq(ev.midi);
  g.gain.setValueAtTime(.5*ev.vel,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);
  o.connect(g).connect(bus);o.start(t);o.stop(t+d+0.03);
}
function vSquare(ctx,bus,ev){
  const t=ev.t,d=ev.dur||.15,o=ctx.createOscillator(),g=ctx.createGain();
  o.type='square';o.frequency.value=midiToFreq(ev.midi);
  g.gain.setValueAtTime(.24*ev.vel,t);
  g.gain.setValueAtTime(.24*ev.vel,t+d*0.8);
  g.gain.exponentialRampToValueAtTime(0.001,t+d);
  o.connect(g).connect(bus);o.start(t);o.stop(t+d+0.02);
}
function vBell(ctx,bus,ev){
  const t=ev.t,d=Math.min(2.2,(ev.dur||0.4)*1.6);
  const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain();
  o.type='sine';o.frequency.value=midiToFreq(ev.midi);
  o2.type='sine';o2.frequency.value=midiToFreq(ev.midi)*2.76;
  const g2=ctx.createGain();g2.gain.value=.25;
  g.gain.setValueAtTime(.4*ev.vel,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);
  o.connect(g);o2.connect(g2).connect(g);g.connect(bus);
  o.start(t);o.stop(t+d+0.05);o2.start(t);o2.stop(t+d+0.05);
}
function vGuitar(ctx,bus,ev){
  const t=ev.t,d=ev.dur||.3,ws=makeShaper(ctx,5),g=ctx.createGain();
  g.gain.setValueAtTime(.42*ev.vel,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);
  [0,12].forEach(semi=>{
    const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=midiToFreq(ev.midi+semi);
    o.connect(ws);o.start(t);o.stop(t+d+0.03);
  });
  ws.connect(g).connect(bus);
}
function vPad(ctx,bus,ev){
  const t=ev.t,d=ev.dur||1,g=ctx.createGain(),lp=ctx.createBiquadFilter();
  lp.type='lowpass';lp.frequency.value=1400;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(.16*ev.vel,t+Math.min(.5,d*0.4));
  g.gain.setValueAtTime(.16*ev.vel,t+d*0.75);
  g.gain.linearRampToValueAtTime(0.0001,t+d+0.4);
  [-7,7].forEach(dt=>{
    const o=ctx.createOscillator();o.type='sawtooth';
    o.frequency.value=midiToFreq(ev.midi);o.detune.value=dt;
    o.connect(lp);o.start(t);o.stop(t+d+0.45);
  });
  lp.connect(g).connect(bus);
}
function vStrings(ctx,bus,ev){
  const t=ev.t,d=ev.dur||1,g=ctx.createGain(),lp=ctx.createBiquadFilter();
  lp.type='lowpass';lp.frequency.value=1900;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(.13*ev.vel,t+Math.min(.3,d*0.3));
  g.gain.setValueAtTime(.13*ev.vel,t+d*0.8);
  g.gain.linearRampToValueAtTime(0.0001,t+d+0.5);
  [-11,-4,4,11].forEach(dt=>{
    const o=ctx.createOscillator();o.type='sawtooth';
    o.frequency.value=midiToFreq(ev.midi);o.detune.value=dt;
    o.connect(lp);o.start(t);o.stop(t+d+0.55);
  });
  lp.connect(g).connect(bus);
}
function vVinyl(ctx,bus,ev){
  const t=ev.t,d=ev.dur,n=noiseSrc(ctx,t,d),bp=ctx.createBiquadFilter(),g=ctx.createGain();
  bp.type='bandpass';bp.frequency.value=2600;bp.Q.value=.4;
  g.gain.value=.5*ev.vel;
  n.connect(bp).connect(g).connect(bus);
}
function vShimmer(ctx,bus,ev){
  const t=ev.t,d=ev.dur,g=ctx.createGain(),lp=ctx.createBiquadFilter();
  lp.type='lowpass';lp.frequency.value=5200;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(.05*ev.vel,t+d*0.5);
  g.gain.linearRampToValueAtTime(0.0001,t+d);
  const m=(ev.midi==null?72:ev.midi);
  [0,7,12].forEach(semi=>{
    const o=ctx.createOscillator();o.type='sine';o.frequency.value=midiToFreq(m+12+semi);
    o.connect(lp);o.start(t);o.stop(t+d+0.05);
  });
  lp.connect(g).connect(bus);
}
/* синт-вокал: формантный голос поёт мелодию (2 пилообразных + 3 форманты + вибрато) */
function vVocal(ctx,bus,ev,voiceType,preLvl){
  const t=ev.t,d=Math.min(1.4,ev.dur||0.35);
  /* вокал ведёт НАД мелодией: октава выше lead — иначе формантные пики перекрываются инструментом и голос неслышен */
  const f=midiToFreq(ev.midi+12);
  const fem=voiceType!=='male';
  const VOW={'а':[800,1150,2800],'о':[450,800,2830],'э':[600,1700,2600],'у':[325,700,2530]};
  const F=VOW[ev.vowel]||VOW['а'];
  const Fp=ev.prevVowel?(VOW[ev.prevVowel]||VOW['а']):null;
  const sc=fem?1.13:0.92;
  const o1=ctx.createOscillator(),o2=ctx.createOscillator();
  o1.type='sawtooth';o2.type='sawtooth';
  o1.frequency.value=f;o2.frequency.value=f;o2.detune.value=fem?8:-9;
  const vib=ctx.createOscillator();vib.type='sine';vib.frequency.value=5+((ev.midi%7)*.22);
  const vg=ctx.createGain();
  /* v2.1: вибрато заводится ПОСТЕПЕННО, как у певца: 0 → глубина за первые ~0.2-0.3с ноты */
  const vibD=Math.min(.3,Math.max(.12,d*.5));
  vg.gain.setValueAtTime(.0001,t);
  vg.gain.linearRampToValueAtTime(f*.011,t+vibD);
  vib.connect(vg);vg.connect(o1.frequency);vg.connect(o2.frequency);
  /* jitter: квазислучайные микровариации высоты ±~4 Гц — сумма нецелых синусов (детерминированно от события, без Math.random — иначе mix-health флюкнует вокруг порога клипа) */
  const jsum=ctx.createGain();jsum.gain.value=fem?1.0:0.85;
  [6.3,10.7,17.3].forEach(fr=>{
    const jo=ctx.createOscillator();jo.type='sine';jo.frequency.value=fr*(1+(ev.midi%5)*.013);
    jo.connect(jsum);jo.start(t);jo.stop(t+d+.12);
  });
  jsum.connect(o1.frequency);jsum.connect(o2.frequency);
  const pre=ctx.createGain();pre.gain.value=preLvl||.28; /* тихие жанры поднимают голос: GENRES.voicePre (эпик/лоу-фай/чиптюн .3, хоррор .32, эмбиент .34) — дифф-мин −16.8 дБ был в тихих жанрах */
  o1.connect(pre);o2.connect(pre);
  const sum=ctx.createGain();
  for(let i=0;i<3;i++){
    const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.Q.value=5+i*3;
    const g=ctx.createGain();g.gain.value=1/(1+i*1.2);
    /* скольжение формант: начало ноты стартует с формант ПРЕДЫДУЩЕЙ гласной — дифтонг-переход */
    if(Fp){
      bp.frequency.setValueAtTime(Fp[i]*sc,t);
      bp.frequency.exponentialRampToValueAtTime(F[i]*sc,t+Math.min(.09,d*.3));
    }else bp.frequency.value=F[i]*sc;
    pre.connect(bp).connect(g).connect(sum);
  }
  const env=ctx.createGain();
  /* v2.1: живая атака — нота начинается с лёгким несовпадением ±~14 мс (детерминированно от ноты), дыхание чуть опережает звук */
  const atk=(((ev.midi%5)-2)*.007);
  env.gain.setValueAtTime(0,t);
  env.gain.linearRampToValueAtTime(.9*ev.vel,t+Math.max(.048,.06+atk));
  env.gain.setValueAtTime(.9*ev.vel,t+d*.72);
  env.gain.exponentialRampToValueAtTime(.001,t+d+.04);
  /* v2.1: придыхание на атаке гласной — короткий шум «вдоха», окрашивается формантами через pre */
  const br=noiseSrc(ctx,t,.09),brf=ctx.createBiquadFilter(),brg=ctx.createGain();
  brf.type='bandpass';brf.frequency.value=3200;brf.Q.value=.9;
  brg.gain.setValueAtTime(.11*ev.vel,t);
  brg.gain.exponentialRampToValueAtTime(.001,t+.09);
  br.connect(brf).connect(brg).connect(pre);
  /* shimmer: микровариации громкости ±~1.2% — тоже детерминированные синусы (не зависят от порядка рендеров) */
  const ssum=ctx.createGain();ssum.gain.value=.004*ev.vel;
  [8.3,13.9].forEach(fr=>{
    const so=ctx.createOscillator();so.type='sine';so.frequency.value=fr*(1+(ev.midi%7)*.009);
    so.connect(ssum);so.start(t);so.stop(t+d+.12);
  });
  ssum.connect(env.gain);
  sum.connect(env).connect(bus);
  o1.start(t);o2.start(t);vib.start(t);
  o1.stop(t+d+.12);o2.stop(t+d+.12);vib.stop(t+d+.12);
}
function vRiser(ctx,bus,ev){
  const t=ev.t,d=ev.dur||2,n=noiseSrc(ctx,t,d+0.05),bp=ctx.createBiquadFilter(),g=ctx.createGain();
  bp.type='bandpass';bp.Q.value=1.2;
  bp.frequency.setValueAtTime(600,t);
  bp.frequency.exponentialRampToValueAtTime(6500,t+d);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.16*ev.vel,t+d*0.9);
  g.gain.linearRampToValueAtTime(0.0001,t+d);
  n.connect(bp).connect(g).connect(bus);
}
