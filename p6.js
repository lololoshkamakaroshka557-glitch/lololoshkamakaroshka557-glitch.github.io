"use strict";
/* ---------- рендер трека ---------- */
const STEM_DEF=[
  {key:'drums',label:'Барабаны',labelEn:'Drums',send:0.12},
  {key:'bass',label:'Бас',labelEn:'Bass',send:0.04},
  {key:'lead',label:'Мелодия',labelEn:'Melody',send:0.4},
  {key:'voice',label:'Голос',labelEn:'Voice',send:0.3},
  {key:'pad',label:'Пэды',labelEn:'Pads',send:0.55},
  {key:'atmos',label:'Атмосфера',labelEn:'Atmosphere',send:0.45}
];
const stemLabel=s=>(CUR_LANG==='en'&&s.labelEn)?s.labelEn:s.label;
async function renderTrack(plan,mix,isRetry){
  const G=GENRES[plan.style];
  const sr=44100,dur=plan.duration+2.6;
  const ctx=new OfflineAudioContext(2,Math.ceil(dur*sr),sr);
  const master=ctx.createGain();master.gain.value=0.78;
  master.gain.setValueAtTime(0.0001,0);
  master.gain.linearRampToValueAtTime(0.78,0.35);
  master.gain.setValueAtTime(0.78,Math.max(0.4,dur-1.2));
  master.gain.linearRampToValueAtTime(0.0001,dur-0.05);
  const comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-16;comp.ratio.value=4;comp.attack.value=0.004;comp.release.value=0.16;
  const limiter=makeShaper(ctx,1.5); /* мягкий клип-лимитер: пик <= 1 */
  master.connect(comp).connect(limiter).connect(ctx.destination);
  const reverb=ctx.createConvolver();reverb.buffer=makeIR(ctx,2.2+MoodRevAdd(plan.mood),2.5);
  const revGain=ctx.createGain();revGain.gain.value=1.0;
  reverb.connect(revGain).connect(comp);
  const buses={};
  for(const st of STEM_DEF){
    const b=ctx.createGain();
    const base=(mix.mutes&&mix.mutes[st.key])?0:(mix.gains[st.key]!=null?mix.gains[st.key]:1);
    b.gain.value=base;
    b.connect(master);
    const send=ctx.createGain();send.gain.value=st.send*G.rev*2.2;
    b.connect(send).connect(reverb);
    buses[st.key]=b;
  }
  if(G.pump){
    const lfo=ctx.createOscillator();lfo.type='sine';lfo.frequency.value=plan.bpm/60;
    const pbase=buses.pad.gain.value;
    buses.pad.gain.value=pbase*(1-G.pump);
    const lg=ctx.createGain();lg.gain.value=pbase*G.pump;
    lfo.connect(lg).connect(buses.pad.gain);
    lfo.start(0);lfo.stop(dur);
  }
  const bassDrive=G.drive>0.05?G.drive:0;
  const delay=ctx.createDelay(1.5);delay.delayTime.value=plan.barDur*0.75;
  const fb=ctx.createGain();fb.gain.value=0.32;
  const dWet=ctx.createGain();dWet.gain.value=G.delay;
  delay.connect(fb).connect(delay);delay.connect(dWet).connect(buses.lead);
  const leadSendDelay=ctx.createGain();leadSendDelay.gain.value=1;
  buses.lead.connect(leadSendDelay).connect(delay);
  const F={
    kick:vKick,snare:vSnare,clap:vClap,hatC:vHat,hatO:vHat,cow:vCow,perc:vPerc
  };
  for(const e of plan.events.drums){if(!(e.t>=0))e.t=0;(F[e.name]||vPerc)(ctx,buses.drums,e);}
  for(const e of plan.events.bass){
    if(!(e.t>=0))e.t=0;
    if(G.bass==='808')v808(ctx,buses.bass,e,bassDrive);
    else if(G.bass==='saw')vSawBass(ctx,buses.bass,e);
    else if(G.bass==='long')vLongBass(ctx,buses.bass,e);
    else if(G.bass==='square')vSquareBass(ctx,buses.bass,e);
  }
  /* вокал ведёт: пока поёт голос — мелодия приглушается (детерминированный ducking по плану) */
  const voiceOn=mix.gains.voice>0&&(plan.events.voice||[]).length>0;
  if(voiceOn){
    const lg=buses.lead.gain;
    lg.setValueAtTime(mix.gains.lead,0);
    for(const e of plan.events.voice){
      const t0=Math.max(0.01,e.t-0.03),t1=Math.max(t0+0.02,e.t+(e.dur||0.3)*0.9),t2=t1+0.10;
      lg.linearRampToValueAtTime(mix.gains.lead,t0);
      lg.linearRampToValueAtTime(mix.gains.lead*0.4,t0+0.05);
      lg.setValueAtTime(mix.gains.lead*0.4,t1);
      lg.linearRampToValueAtTime(mix.gains.lead,t2);
    }
  }
  for(const e of plan.events.lead){
    if(!(e.t>=0))e.t=0;
    if(e.name==='arp')vPluck(ctx,buses.lead,e);
    else if(G.lead==='saw')vLeadSaw(ctx,buses.lead,e);
    else if(G.lead==='pluck')vPluck(ctx,buses.lead,e);
    else if(G.lead==='square')vSquare(ctx,buses.lead,e);
    else if(G.lead==='bell')vBell(ctx,buses.lead,e);
    else if(G.lead==='guitar')vGuitar(ctx,buses.lead,e);
  }
  for(const e of plan.events.pad){
    if(!(e.t>=0))e.t=0;
    if(G.pad==='strings')vStrings(ctx,buses.pad,e);
    else vPad(ctx,buses.pad,e);
  }
  for(const e of plan.events.voice||[]){
    if(!(e.t>=0))e.t=0;
    vVocal(ctx,buses.voice,e,plan.vocal||'female',G.voicePre||.28);
  }
  for(const e of plan.events.atmos){
    if(!(e.t>=0))e.t=0;
    if(e.name==='vinyl')vVinyl(ctx,buses.atmos,e);
    else if(e.name==='shimmer')vShimmer(ctx,buses.atmos,e);
    else if(e.name==='riser')vRiser(ctx,buses.atmos,e);
  }
  /* страховка от тихих сбоев среды: если сигнал аномально пуст при живых событиях — один повтор */
  const result=await ctx.startRendering();
  if(!isRetry){
    try{
      let peak=0;const dd=result.getChannelData(0);
      for(let i=0;i<dd.length;i+=97){const v=Math.abs(dd[i]);if(v>peak)peak=v;if(peak>0.005)break;}
      const hasEvents=plan.events.drums.length+plan.events.bass.length+plan.events.lead.length+plan.events.pad.length;
      if(peak<0.005&&hasEvents>0)return await renderTrack(plan,mix,true);
    }catch(e){/* пик не критичен */}
  }
  return result;
}
function MoodRevAdd(mood){return (MOODS[mood]&&MOODS[mood].revAdd)||0;}

/* ---------- WAV-экспорт ---------- */
function encodeWAV(buffer){
  const sr=buffer.sampleRate,numCh=buffer.numberOfChannels,len=buffer.length;
  const bytes=44+len*numCh*2;
  const ab=new ArrayBuffer(bytes),v=new DataView(ab);
  const wstr=(off,s)=>{for(let i=0;i<s.length;i++)v.setUint8(off+i,s.charCodeAt(i));};
  wstr(0,'RIFF');v.setUint32(4,bytes-8,true);wstr(8,'WAVE');
  wstr(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,numCh,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*numCh*2,true);v.setUint16(32,numCh*2,true);v.setUint16(34,16,true);
  wstr(36,'data');v.setUint32(40,len*numCh*2,true);
  let off=44;
  const chans=[];for(let c=0;c<numCh;c++)chans.push(buffer.getChannelData(c));
  for(let i=0;i<len;i++)for(let c=0;c<numCh;c++){
    let s=Math.max(-1,Math.min(1,chans[c][i]));
    v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;
  }
  return new Blob([ab],{type:'audio/wav'});
}
/* ---------- MIDI-экспорт (мелодия) ---------- */
function vlqPush(track,v){
  const stack=[v&127];v=Math.floor(v/7);
  while(v>0){stack.unshift((v&127)|128);v=Math.floor(v/7);}
  stack.forEach(x=>track.push(x));
}
function buildMIDI(plan){
  const PPQ=480,spb=60/plan.bpm;
  const toTick=s=>Math.max(0,Math.round(s/spb*PPQ));
  const items=[];
  plan.events.lead.forEach(e=>{
    if(e.name==='arp')return;
    const note=clamp(Math.round(e.midi),0,127);
    items.push({t:toTick(e.t),ord:0,bytes:[0x90,note,clamp(Math.round(e.vel*112+15),1,127)]});
    items.push({t:Math.max(toTick(e.t)+1,toTick(e.t+e.dur)),ord:1,bytes:[0x80,note,0]});
  });
  items.sort((a,b)=>a.t-b.t||a.ord-b.ord);
  const track=[];let last=0;
  const mpqn=Math.round(60000000/plan.bpm);
  vlqPush(track,0);
  track.push(0xFF,0x51,0x03,(mpqn>>16)&255,(mpqn>>8)&255,mpqn&255);
  for(const it of items){vlqPush(track,it.t-last);last=it.t;it.bytes.forEach(x=>track.push(x));}
  vlqPush(track,0);track.push(0xFF,0x2F,0x00);
  const head=[0x4D,0x54,0x68,0x64,0,0,0,6,0,0,0,1,(PPQ>>8)&255,PPQ&255];
  const trkLen=track.length;
  const all=head.concat([0x4D,0x54,0x72,0x6B,(trkLen>>24)&255,(trkLen>>16)&255,(trkLen>>8)&255,trkLen&255],track);
  return new Blob([new Uint8Array(all)],{type:'audio/midi'});
}
function computePeaks(buffer,n){
  const ch=buffer.getChannelData(0),block=Math.floor(ch.length/n),peaks=new Float32Array(n);
  for(let i=0;i<n;i++){
    let m=0;const s=i*block;
    for(let j=0;j<block;j+=16){const a=Math.abs(ch[s+j]);if(a>m)m=a;}
    peaks[i]=m;
  }
  let mx=0;for(let i=0;i<n;i++)if(peaks[i]>mx)mx=peaks[i];
  if(mx>0)for(let i=0;i<n;i++)peaks[i]/=mx;
  return peaks;
}
