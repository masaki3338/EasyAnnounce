import React, {useEffect, useRef, useState} from 'react';
import QRCode from 'qrcode';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import {exportCustomProfile,importCustomProfile,getCustomProfiles,getActiveCustomProfileId,setActiveCustomProfileId,createCustomProfile,renameCustomProfile,deleteCustomProfile,overwriteCustomProfileSettings,type CustomProfile} from '../lib/customProfiles';

// QRは必ず1枚。初期値・冗長なプロパティを除外してgzip圧縮する。
// 容量を超えた場合は複数QRに分割しない。
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
 if(payload.length>QR_MAX_LENGTH)throw new Error(`圧縮後も1枚のQR容量を超えました（${payload.length}文字）。文章を短くしてから再度お試しください。`);
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
 const [profiles,setProfiles]=useState<CustomProfile[]>(getCustomProfiles);
 const [selectedId,setSelectedId]=useState(()=>getActiveCustomProfileId());
 const [newName,setNewName]=useState('');
 const [dialog,setDialog]=useState<null|{kind:'overwrite'|'delete'|'rename';id:string;name:string}>(null);
 const [renameValue,setRenameValue]=useState('');
 const refreshProfiles=()=>setProfiles(getCustomProfiles());
 const selectProfile=(id:string)=>{setSelectedId(id);setActiveCustomProfileId(id);setStatus('');};
 const performOverwrite=(targetId:string,name:string)=>{
  try{
   onBeforeExport();
   overwriteCustomProfileSettings(selectedId,targetId);
   setActiveCustomProfileId(targetId);
   setSelectedId(targetId);
   refreshProfiles();
   onImported(targetId);
   setNewName('');
   setStatus(`「${name}」の試合前・試合中の設定を上書きしました`);
  }catch(e){setStatus('上書きに失敗しました: '+String((e as Error).message||e));}
 };
 const registerProfile=()=>{
  const name=newName.trim();
  if(!name){setStatus('新しく登録する設定名を入力してください');return;}
  try{
   onBeforeExport();
   const existing=getCustomProfiles().find(p=>p.name.trim()===name);
   if(existing){setDialog({kind:'overwrite',id:existing.id,name:existing.name});return;}
   const p=createCustomProfile(name,selectedId);
   refreshProfiles();setSelectedId(p.id);onImported(p.id);setNewName('');
   setStatus(`「${name}」を登録しました`);
  }catch(e){setStatus('登録に失敗しました: '+String((e as Error).message||e));}
 };
 const removeProfile=()=>{
  const list=getCustomProfiles();
  const current=list.find(p=>p.id===selectedId);
  if(!current)return;
  if(list.length<=1){setStatus('最後の設定グループは削除できません');return;}
  setDialog({kind:'delete',id:current.id,name:current.name});
 };
 const renameProfile=()=>{
  const current=profiles.find(x=>x.id===selectedId);
  if(!current)return;
  setRenameValue(current.name);
  setDialog({kind:'rename',id:current.id,name:current.name});
 };
 const confirmDialog=()=>{
  if(!dialog)return;
  const currentDialog=dialog;
  setDialog(null);
  if(currentDialog.kind==='overwrite'){
   performOverwrite(currentDialog.id,currentDialog.name);
   return;
  }
  if(currentDialog.kind==='delete'){
   try{
    const list=getCustomProfiles();
    if(list.length<=1){setStatus('最後の設定グループは削除できません');return;}
    const next=list.find(p=>p.id!==currentDialog.id);
    if(!next){setStatus('切替先の設定が見つかりません');return;}
    deleteCustomProfile(currentDialog.id);
    setActiveCustomProfileId(next.id);
    setSelectedId(next.id);
    refreshProfiles();
    onImported(next.id);
    setStatus(`「${currentDialog.name}」を削除しました`);
   }catch(e){setStatus('削除に失敗しました: '+String((e as Error).message||e));}
   return;
  }
  const name=renameValue.trim();
  if(!name){setStatus('変更後の設定名を入力してください');return;}
  if(getCustomProfiles().some(p=>p.id!==currentDialog.id&&p.name.trim()===name)){
   setStatus('同じ名前の設定グループが存在します。別の名前を指定してください');
   return;
  }
  try{renameCustomProfile(currentDialog.id,name);refreshProfiles();setStatus(`「${name}」に名前を変更しました`);}
  catch(e){setStatus('名前変更に失敗しました: '+String((e as Error).message||e));}
 };
 const [code,setCode]=useState('');
 const [qrUrl,setQrUrl]=useState('');
 const [status,setStatus]=useState('');
 const videoRef=useRef<HTMLVideoElement>(null);
 const scannerControlsRef=useRef<IScannerControls|null>(null);
 const scannerStreamRef=useRef<MediaStream|null>(null);
 const scannerTimerRef=useRef<number|null>(null);
 const scanHandledRef=useRef(false);
 const scanRef=useRef<(text:string)=>void>(()=>{});
 useEffect(()=>{if(mode!=='show')return;try{onBeforeExport();const raw=exportCustomProfile(selectedId);setCode('');setQrUrl('');setStatus('');void encode(raw).then(setCode).catch(e=>setStatus(String(e.message||e)))}catch(e){setStatus(String(e))}},[mode,selectedId]);
 useEffect(()=>{if(!code)return;void QRCode.toDataURL(code,{width:640,margin:3,errorCorrectionLevel:'L'}).then(setQrUrl).catch(e=>setStatus('QR生成失敗：'+String(e.message||e)))},[code]);
 const consume=async(text:string)=>{
  if(!text.startsWith(QR_PREFIX)){setStatus('カスタマイズ設定のQRコードではありません');return;}
  try {const raw=await decode(text);const p=importCustomProfile(raw);refreshProfiles();setSelectedId(p.id);setStatus('読み込み完了: '+p.name);onImported(p.id)}
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
 return <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-3"><section className="w-full max-w-md max-h-[95dvh] overflow-y-auto rounded-2xl bg-slate-800 border border-white/25 p-4 text-white space-y-3"><div className="flex justify-between items-center"><h2 className="font-extrabold text-lg">カスタマイズ設定 QR共有</h2><button className="rounded-lg bg-white/20 px-3 py-2" onClick={onClose}>✕ 閉じる</button></div><div className="rounded-xl border border-white/20 bg-slate-700/70 p-3 space-y-3"><label className="block text-sm font-bold">カスタマイズ設定グループ<select className="mt-1 w-full rounded-xl bg-slate-800 border border-white/20 p-3 text-white" value={selectedId} onChange={e=>selectProfile(e.target.value)}>{profiles.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div className="flex gap-2"><input aria-label="新しく登録するカスタマイズ名" placeholder="新しく登録する設定名" className="min-w-0 flex-1 rounded-lg bg-white p-2 text-slate-900" value={newName} onChange={e=>setNewName(e.target.value)}/><button type="button" onClick={registerProfile} className="rounded-lg bg-blue-600 px-3 py-2 font-bold">登録</button></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={renameProfile} className="rounded-lg bg-slate-600 p-2 font-bold">名前を変更</button><button type="button" onClick={removeProfile} disabled={profiles.length<=1} className="rounded-lg bg-red-700 p-2 font-bold disabled:opacity-40 disabled:cursor-not-allowed">選択中の設定を削除</button></div><p className="text-xs text-slate-200">現在選択中のグループは自動保存されます。「登録」は、その時点の試合前・試合中の設定を保存します。同じ名前がある場合は上書き確認を表示します。QRから読み込んだ設定も新しいグループとして保存します。</p></div><div className="grid grid-cols-2 gap-2"><button className={'rounded-xl p-3 '+(mode==='show'?'bg-blue-600':'bg-slate-600')} onClick={()=>setMode('show')}>QRを表示</button><button className={'rounded-xl p-3 '+(mode==='scan'?'bg-blue-600':'bg-slate-600')} onClick={()=>setMode('scan')}>QRを読み込む</button></div>
 {mode==='show'?<><p className="text-sm">試合前・試合中に設定したアナウンス内容を、QRコードでほかの端末に引き継げます。</p>{qrUrl&&<img alt="設定共有QRコード（1枚）" src={qrUrl} className="mx-auto w-full max-w-[540px] rounded-xl bg-white p-2"/>}<p className="text-center text-sm">{qrUrl?'QRコード 1枚':status?'':'圧縮してQRを作成中…'}</p></>:<><p className="text-sm">相手端末に表示された1枚のQRコードを読み取ってください。</p><video ref={videoRef} muted playsInline className="w-full rounded-xl bg-black aspect-[4/3] object-cover"/><label className="block text-center rounded-xl bg-blue-600 px-4 py-3 font-bold cursor-pointer">🖼️ 画像からQRを読み取る<input type="file" accept="image/*" onChange={readQrImage} className="hidden"/></label></>}
 {status&&<p role="status" className="text-sm text-yellow-200 break-words">{status}</p>}</section>
 {dialog&&<div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}>
  <section role="dialog" aria-modal="true" aria-labelledby="custom-profile-dialog-title" className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl">
   <div className={'flex items-center gap-3 px-5 py-4 text-white '+(dialog.kind==='delete'?'bg-rose-600':'bg-blue-600')}>
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-xl">{dialog.kind==='rename'?'✎':dialog.kind==='delete'?'🗑':'↻'}</span>
    <h3 id="custom-profile-dialog-title" className="text-lg font-extrabold">{dialog.kind==='rename'?'設定名の変更':dialog.kind==='delete'?'設定グループの削除':'既存の設定を上書き'}</h3>
   </div>
   <div className="space-y-3 px-5 py-5">
    {dialog.kind==='rename'?<><p className="text-sm">「{dialog.name}」の名前を変更します。</p><label className="block text-sm font-bold">新しい設定名<input autoFocus type="text" value={renameValue} onChange={e=>setRenameValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')confirmDialog()}} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-blue-500"/></label></>:
     dialog.kind==='delete'?<><p className="font-bold break-words">「{dialog.name}」を削除しますか？</p><p className="rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-800">試合前・試合中の保存済み設定も削除されます。この操作は元に戻せません。</p></>:
     <><p className="font-bold break-words">「{dialog.name}」は既に登録されています。</p><p className="rounded-lg bg-blue-50 px-3 py-3 text-sm text-blue-900">現在の試合前・試合中の設定で、登録済みの内容を上書きしますか？</p></>}
   </div>
   <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
    <button type="button" onClick={()=>setDialog(null)} className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 py-3 font-bold text-slate-700">キャンセル</button>
    <button type="button" onClick={confirmDialog} disabled={dialog.kind==='rename'&&!renameValue.trim()} className={'min-h-12 rounded-xl px-3 py-3 font-bold text-white disabled:opacity-40 '+(dialog.kind==='delete'?'bg-rose-600':'bg-blue-600')}>{dialog.kind==='rename'?'変更する':dialog.kind==='delete'?'削除する':'上書きする'}</button>
   </div>
  </section>
 </div>}</div>
}
