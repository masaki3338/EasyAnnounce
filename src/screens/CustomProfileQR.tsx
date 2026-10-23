import React, {useEffect, useRef, useState} from 'react';
import QRCode from 'qrcode';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import {exportCustomProfile,importCustomProfile} from '../lib/customProfiles';

// QRは必ず1枚。初期値・冗長なプロパティを除外してgzip圧縮する。
// 容量を超えた場合は複数QRに分割せず、JSONでの共有を案内する。
import {initialCustomInGameTexts} from '../lib/customInGameTemplates';
import {defaultCondition,defaultTiming} from '../lib/customPreGameTemplates';

const QR_PREFIX = 'EA1:';
const QR_MAX_LENGTH = 2900; // QR version 40 / L の英数字以外（byte mode）の実用上限内
const toB64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const fromB64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const diff=(obj:any,defaults:Record<string,any>)=>{const result:Record<string,any>={};for(const [key,value] of Object.entries(obj||{})){if(JSON.stringify(value)!==JSON.stringify(defaults[key]))result[key]=value;}return Object.keys(result).length?result:null;};
const restore=(defaults:Record<string,any>,extra:any)=>({...defaults,...(extra&&typeof extra==='object'?extra:{})});
function pack(raw:string):string {
 const data=JSON.parse(raw);
 if(data?.format!=='easyannounce-custom-v1')throw new Error('設定形式が不正です');
 const defaultInGame=initialCustomInGameTexts();
 const inGame:Record<string,Record<string,string>>={};
 for(const [item,parts] of Object.entries(data.inGame||{})){
  if(!parts||typeof parts!=='object')continue;
  const changes=diff(parts,defaultInGame[item]||{});
  if(changes)inGame[item]=changes as Record<string,string>;
 }
 const preGame=Array.isArray(data.preGame)?data.preGame.map((item:any)=>{
  const {id,title,kind,enabled,target,condition,timing,segments,...other}=item;
  return [id,title,kind,enabled===false?0:1,target,
   diff(condition,defaultCondition()),diff(timing,defaultTiming()),
   (segments||[]).map((seg:any)=>{const {id,text,phase,condition,timing,...rest}=seg;return [id,text,phase||'',diff(condition,defaultCondition()),diff(timing,defaultTiming()),Object.keys(rest).length?rest:null]}),
   Object.keys(other).length?other:null];
 }):null;
 return JSON.stringify([1,String(data.profile?.name||'カスタマイズ'),preGame,inGame]);
}
function unpack(compact:string):string {
 const value=JSON.parse(compact);
 if(!Array.isArray(value)||value[0]!==1)throw new Error('対応していないQRコードです');
 const [,name,compactPre,changes]=value;
 const defaults=initialCustomInGameTexts();
 for(const [item,parts] of Object.entries(changes||{}))defaults[item]={...(defaults[item]||{}),...(parts as Record<string,string>)};
 const preGame=Array.isArray(compactPre)?compactPre.map((x:any[])=>{
  const [id,title,kind,enabled,target,condition,timing,segments,other]=x;
  return {...(other||{}),id,title,kind,enabled:enabled!==0,target,
   condition:restore(defaultCondition(),condition),timing:restore(defaultTiming(),timing),
   segments:(segments||[]).map((seg:any[])=>{
    const [sid,text,phase,sc,st,extra]=seg;
    return {...(extra||{}),id:sid,text,...(phase?{phase}:{}),condition:restore(defaultCondition(),sc),timing:restore(defaultTiming(),st)};
   })};
 }):null;
 return JSON.stringify({format:'easyannounce-custom-v1',profile:{name},preGame,inGame:defaults});
}
async function encode(raw:string):Promise<string>{
 const input=new TextEncoder().encode(pack(raw));
 const stream=new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
 const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
 const payload=QR_PREFIX+toB64(bytes);
 if(payload.length>QR_MAX_LENGTH)throw new Error(`圧縮後も1枚のQR容量を超えました（${payload.length}文字）。文章を短くするか、JSONファイルで共有してください。`);
 return payload;
}
async function decode(value:string):Promise<string>{
 if(!value.startsWith(QR_PREFIX))throw new Error('カスタマイズ設定のQRコードではありません');
 const bytes=fromB64(value.slice(QR_PREFIX.length));
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 return unpack(new TextDecoder().decode(await new Response(stream).arrayBuffer()));
}
export default function CustomProfileQR({profileId,onImported,onClose,onBeforeExport}:{profileId:string;onImported:(id:string)=>void;onClose:()=>void;onBeforeExport:()=>void}){
 const [mode,setMode]=useState<'show'|'scan'>('show');
 const [code,setCode]=useState('');
 const [qrUrl,setQrUrl]=useState('');
 const [status,setStatus]=useState('');
 const videoRef=useRef<HTMLVideoElement>(null);
 const scannerControlsRef=useRef<IScannerControls|null>(null);
 const scannerStreamRef=useRef<MediaStream|null>(null);
 const scannerTimerRef=useRef<number|null>(null);
 const scanHandledRef=useRef(false);
 const scanRef=useRef<(text:string)=>void>(()=>{});
 useEffect(()=>{if(mode!=='show')return;try{onBeforeExport();const raw=exportCustomProfile(profileId);setCode('');setQrUrl('');setStatus('');void encode(raw).then(setCode).catch(e=>setStatus(String(e.message||e)))}catch(e){setStatus(String(e))}},[mode,profileId]);
 useEffect(()=>{if(!code)return;void QRCode.toDataURL(code,{width:640,margin:3,errorCorrectionLevel:'L'}).then(setQrUrl).catch(e=>setStatus('QR生成失敗：'+String(e.message||e)))},[code]);
 const consume=async(text:string)=>{
  if(!text.startsWith(QR_PREFIX)){setStatus('カスタマイズ設定のQRコードではありません');return;}
  try {const raw=await decode(text);const p=importCustomProfile(raw);setStatus('読み込み完了: '+p.name);onImported(p.id)}
  catch(e){setStatus('復元エラー: '+String((e as Error).message||e))}
 };
 scanRef.current=(value:string)=>{
  if(scanHandledRef.current)return;
  scanHandledRef.current=true;
  void consume(value).finally(()=>{scanHandledRef.current=false;});
 };
 useEffect(()=>{
  if(mode!=='scan')return;
  let disposed=false;
  scanHandledRef.current=false;
  setStatus('');
  const stopScanner=()=>{
   if(scannerTimerRef.current!==null){window.clearInterval(scannerTimerRef.current);scannerTimerRef.current=null;}
   try{scannerControlsRef.current?.stop();}catch{}
   scannerControlsRef.current=null;
   scannerStreamRef.current?.getTracks().forEach(track=>{try{track.stop();}catch{}});
   scannerStreamRef.current=null;
   if(videoRef.current){try{videoRef.current.pause();videoRef.current.srcObject=null;}catch{}}
  };
  const startZxing=async()=>{
   if(disposed)return;
   const video=videoRef.current;
   if(!video)return;
   const reader=new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:60,delayBetweenScanSuccess:400});
   const controls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}},video,(result)=>{
    if(result&&!disposed)scanRef.current(result.getText());
   });
   if(disposed){controls.stop();return;}
   scannerControlsRef.current=controls;
  };
  const start=async()=>{
   const Detector=(window as any).BarcodeDetector;
   if(Detector&&navigator.mediaDevices?.getUserMedia){
    try{
     if(typeof Detector.getSupportedFormats==='function'){
      const supported:string[]=await Detector.getSupportedFormats();
      if(!supported.includes('qr_code'))throw new Error('unsupported');
     }
     const video=videoRef.current;
     if(!video||disposed)return;
     const detector=new Detector({formats:['qr_code']});
     const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
     if(disposed){media.getTracks().forEach(t=>t.stop());return;}
     scannerStreamRef.current=media;
     video.srcObject=media;
     await video.play();
     let elapsed=0;
     let busy=false;
     scannerTimerRef.current=window.setInterval(async()=>{
      if(disposed||busy||video.readyState<2||scanHandledRef.current)return;
      busy=true;
      elapsed+=150;
      try{const found=await detector.detect(video);if(found?.[0]?.rawValue)scanRef.current(String(found[0].rawValue));}catch{}
      finally{busy=false;}
      // 標準検出で読めない端末はチーム登録と同じZXingに切り替える。
      if(elapsed>=2500&&!disposed){
       stopScanner();
       try{await startZxing();}catch{if(!disposed)setStatus('QR読取カメラを開始できませんでした。カメラの権限を確認してください。');}
      }
     },150);
     return;
    }catch{stopScanner();}
   }
   try{await startZxing();}catch{if(!disposed)setStatus('カメラを使用できません。権限またはHTTPS接続を確認してください。');}
  };
  const timer=window.setTimeout(()=>{void start();},120);
  return ()=>{disposed=true;window.clearTimeout(timer);stopScanner();};
 },[mode]);
 const readQrImage=async(event:React.ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  const url=URL.createObjectURL(file);
  try{
   const img=new Image();
   await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('画像を開けません'));img.src=url;});
   const reader=new BrowserQRCodeReader();
   const result=await reader.decodeFromImageElement(img);
   scanRef.current(result.getText());
  }catch{setStatus('画像からQRコードを読み取れませんでした。QR全体が写った画像を選んでください。');}
  finally{URL.revokeObjectURL(url);}
 };
 return <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-3"><section className="w-full max-w-md max-h-[95dvh] overflow-y-auto rounded-2xl bg-slate-800 border border-white/25 p-4 text-white space-y-3"><div className="flex justify-between items-center"><h2 className="font-extrabold text-lg">カスタマイズ設定 QR共有</h2><button className="rounded-lg bg-white/20 px-3 py-2" onClick={onClose}>✕ 閉じる</button></div><div className="grid grid-cols-2 gap-2"><button className={'rounded-xl p-3 '+(mode==='show'?'bg-blue-600':'bg-slate-600')} onClick={()=>setMode('show')}>QRを表示</button><button className={'rounded-xl p-3 '+(mode==='scan'?'bg-blue-600':'bg-slate-600')} onClick={()=>setMode('scan')}>QRを読み込む</button></div>
 {mode==='show'?<><p className="text-sm">試合前・試合中の設定とカスタマイズ名を、圧縮した1枚のQRで共有します。通信不要です。</p>{qrUrl&&<img alt="設定共有QRコード（1枚）" src={qrUrl} className="mx-auto w-full max-w-[540px] rounded-xl bg-white p-2"/>}<p className="text-center text-sm">{qrUrl?'QRコード 1枚':status?'':'圧縮してQRを作成中…'}</p></>:<><p className="text-sm">相手端末に表示された1枚のQRコードを読み取ってください。</p><video ref={videoRef} muted playsInline className="w-full rounded-xl bg-black aspect-[4/3] object-cover"/><label className="block text-center rounded-xl bg-blue-600 px-4 py-3 font-bold cursor-pointer">🖼️ 画像からQRを読み取る<input type="file" accept="image/*" onChange={readQrImage} className="hidden"/></label></>}
 {status&&<p role="status" className="text-sm text-yellow-200 break-words">{status}</p>}</section></div>
}
