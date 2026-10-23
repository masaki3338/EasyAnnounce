import { speak as ttsSpeak, stop as ttsStop } from '../lib/tts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildDefenseChangeText, CUSTOM_IN_GAME_ITEMS, initialCustomInGameTexts, loadCustomInGameTexts, saveCustomInGameTexts, customInGameMemoKey, substituteTokens, unknownTokens, START_TIME_TIMINGS, type AnnounceCategory, type CustomInGameTexts } from '../lib/customInGameTemplates';

type Props={profileId:string; profileName?:string; onBack?:()=>void};
const LABELS:{id:AnnounceCategory;label:string}[]=[{id:'offense',label:'攻撃画面'},{id:'defense',label:'守備画面'},{id:'other',label:'その他'}];
const samples:Record<string,string>={
 '得点':'1','開始時刻':'9時00分','先攻チーム名':'東京ジュニア','後攻チーム名':'横浜ジュニア','打順':'4','守備位置':'ショート','選手名':'山田太郎','選手名（苗字）':'山田','選手名（フルネーム）':'山田太郎','敬称':'くん','背番号':'6','チーム名':'東京ジュニア',
 '交代前選手名':'山田太郎','交代前選手名（苗字）':'山田','交代前選手名（フルネーム）':'山田太郎','交代前敬称':'くん','交代後選手名':'佐藤一郎','交代後選手名（苗字）':'佐藤','交代後選手名（フルネーム）':'佐藤一郎','交代後敬称':'くん','交代後背番号':'12',
 '1,2,3塁':'1塁','ファースト,セカンド,サード':'ファースト',
 '投手名':'山田','投手名（苗字）':'山田','投手名（フルネーム）':'山田太郎','この回の投球数':'16','合計投球数':'70','投球上限':'70','回':'3','表裏':'表',
 '交代前打順':'4番','交代前・守備位置':'ピッチャー','交代前・選手名':'山田太郎','交代前・敬称':'くん','交代後・選手名':'佐藤一郎','交代後・敬称':'くん','交代後・守備位置':'ピッチャー','交代後・背番号':'12',
 '移動前・守備位置':'ショート','移動・選手名':'鈴木次郎','移動・敬称':'くん','移動後・守備位置':'セカンド',
 '中断時間':'3','先攻得点':'3','後攻得点':'4','勝利チーム名':'横浜ジュニア','給水時間':'3','アウト数':'無死','走者情報':'一塁・二塁'
};
const button='rounded-xl px-3 py-2 font-semibold active:scale-[0.99] transition';
/** 試合中の固定項目を編集する専用画面。マウントは custom 選択時のみ行うこと。 */
export default function CustomInGameSettings({profileId,profileName,onBack}:Props){
 const [category,setCategory]=useState<AnnounceCategory>('offense');
 const [itemId,setItemId]=useState<string|null>(null);
 const [partId,setPartId]=useState<string|null>(null);
 const [texts,setTexts]=useState<CustomInGameTexts>(()=>loadCustomInGameTexts(profileId));
 const [dirty,setDirty]=useState(false);
 const [saved,setSaved]=useState(false);
 const [speechError,setSpeechError]=useState('');
 const textareaRef=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{setTexts(loadCustomInGameTexts(profileId));setItemId(null);setPartId(null);setDirty(false);setSaved(false);},[profileId]);
 useEffect(()=>()=>{ttsStop();},[]);
 const item=CUSTOM_IN_GAME_ITEMS.find(x=>x.id===itemId)||null;
 const part=item?.parts.find(x=>x.id===partId)||item?.parts[0]||null;
 const text=item&&part?texts[item.id]?.[part.id]??part.text:'';
 const memo=item&&part?texts[item.id]?.[customInGameMemoKey(part.id)]||'':'';
 const previewMemo=useMemo(()=>substituteTokens(memo,samples),[memo]);
 const preview=useMemo(()=>substituteTokens(text, item?.id==='defenseChange' && part?.id==='newPlayerDifferent' ? {...samples,'交代後・守備位置':'センター'} : samples),[text,item?.id,part?.id]);
 const example=useMemo(()=>{
  if(item?.id==='defenseChange'){
   // 選択している行だけでなく、開始文・交代内容・接続文・打順・終了文を
   // すべて現在編集中の設定から取得して通しで組み立てる。
   const parts=texts.defenseChange||{};
   const selectedId=part?.id||'';
   // 同じ守備位置は「選手交代のみ」、違う守備位置は「交代＋シート変更」の例を示す。
   const style=selectedId==='introPlayer'||selectedId==='newPlayerSame'?'player':selectedId==='introPosition'||selectedId==='positionMove'?'position':'both';
   const connectorExample=selectedId==='last';
   const middleExample=selectedId==='middle';
   const simpleExample=['battingIntro','battingRow','outro'].includes(selectedId);
   const includePlayer=connectorExample||simpleExample||style!=='position';
   const includePosition=connectorExample||(style!=='player' && selectedId!=='newPlayerDifferent' && !simpleExample);
   const battingSample={...samples,'打順':'4','守備位置':'ピッチャー','選手名':'佐藤一郎','敬称':'くん','背番号':'12'};
   // ④/⑤ は各場面の文章を、他の設定済みの接続文・打順文と組み合わせて通し表示。
   const isNewPlayerPart=part?.id==='newPlayerSame'||part?.id==='newPlayerDifferent';
   const isPinchPart=!!part?.id&&['pinchHitStay','pinchHitReplace','pinchRunStay','pinchRunReplace'].includes(part.id);
   const extraSegments=isPinchPart?[substituteTokens(parts[part!.id]||'',samples)]:[];
   // 「途中の接続文」は、2人の守備移動をつないだ例で確認する。
   // 1人目には途中の接続文、2人目には最後の接続文を適用する。
   if(middleExample){
    return buildDefenseChangeText(parts,{
     introVars:samples,
     newPlayers:[],
     positionMoves:[
      {...samples,'移動前・守備位置':'ショート','移動・選手名':'鈴木次郎','移動・敬称':'くん','移動後・守備位置':'セカンド','交代前打順':'6番'},
      {...samples,'移動前・守備位置':'セカンド','移動・選手名':'高橋三郎','移動・敬称':'くん','移動後・守備位置':'ショート','交代前打順':'8番'}
     ],
     battingRows:[],includeBatting:false,includeOutro:false
    });
   }
   return buildDefenseChangeText(parts,{
    introVars:samples,
    newPlayers:isPinchPart?[]:includePlayer?[isNewPlayerPart&&part?.id==='newPlayerDifferent'?{...samples,'交代後・守備位置':'センター'}:samples]:[],
    // 接続文は選手交代＋守備移動の2人で、打順・終了文は1人の交代で確認。
    // 守備位置のみ変更する例では、2人がポジションを入れ替える流れを示す。
    // 例：ショート鈴木次郎 → セカンド、セカンド高橋三郎 → ショート。
    positionMoves:isPinchPart?[]:includePosition?(selectedId==='positionMove' ? [
      {...samples,'移動前・守備位置':'ショート','移動・選手名':'鈴木次郎','移動・敬称':'くん','移動後・守備位置':'セカンド','交代前打順':'6番'},
      {...samples,'移動前・守備位置':'セカンド','移動・選手名':'高橋三郎','移動・敬称':'くん','移動後・守備位置':'ショート','交代前打順':'8番'}
    ] : [samples]):[],
    extraSegments,
    battingRows:[battingSample],
    includeBatting:true,
    includeOutro:true
   });
  }
  if(item?.id==='pitchCount'){
   // 投球数は4種類がそれぞれ別場面のため、選択中の通知文を表示する。
   // ただし選択中以外の文章も含め、設定値を常に texts から取得する。
   return substituteTokens(texts.pitchCount?.[part?.id||'']||'',samples);
  }
  return '';
 },[item?.id,part?.id,texts]);

 const bad=part?unknownTokens(text,part.tokens):[];
 const setText=(next:string)=>{if(!item||!part)return;setTexts(prev=>({...prev,[item.id]:{...prev[item.id],[part.id]:next}}));setDirty(true);setSaved(false)};
 const setMemo=(next:string)=>{if(!item||!part)return;setTexts(prev=>({...prev,[item.id]:{...prev[item.id],[customInGameMemoKey(part.id)]:next}}));setDirty(true);setSaved(false)};
 const insert=(token:string)=>{
  const area=textareaRef.current;const start=area?.selectionStart??text.length;const end=area?.selectionEnd??start;
  setText(text.slice(0,start)+`【${token}】`+text.slice(end));
  requestAnimationFrame(()=>{area?.focus();area?.setSelectionRange(start+token.length+2,start+token.length+2)});
 };
 const save=()=>{try{saveCustomInGameTexts(profileId,texts);setDirty(false);setSaved(true)}catch{setSpeechError('保存に失敗しました。ブラウザの保存領域をご確認ください。')}};
 const stop=()=>{ttsStop()};
 const speak=async()=>{setSpeechError('');if(bad.length){setSpeechError('未対応の差し込み項目があります。文章を確認してください。');return;}
   try {stop();await ttsSpeak(preview.replace(/山田太郎/g,'やまだ、たろう').replace(/佐藤一郎/g,'さとう、いちろう').replace(/鈴木次郎/g,'すずき、じろう'));}
   catch {setSpeechError('読み上げに失敗しました。音声設定をご確認ください。');}
 };
 return <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 text-white sm:px-5">
  <div className="flex items-center gap-3">{onBack&&<button className={button+' bg-white/15'} onClick={onBack}>戻る</button>}<div><h1 className="text-xl font-bold">試合中アナウンス設定</h1><p className="text-xs opacity-75">カスタマイズ専用 / {profileName||profileId}</p></div></div>
  <div className="grid grid-cols-3 gap-2">{LABELS.map(c=><button key={c.id} onClick={()=>{setCategory(c.id);setItemId(null);setPartId(null);stop()}} className={button+' text-sm '+(category===c.id?'bg-blue-600':'bg-white/15')}>{c.label}</button>)}</div>
  {!item?<div className="space-y-2">{CUSTOM_IN_GAME_ITEMS.filter(x=>x.category===category).map(x=><button key={x.id} className="flex w-full items-center justify-between rounded-xl border border-white/20 bg-white/10 px-4 py-4 text-left" onClick={()=>{setItemId(x.id);setPartId(x.parts[0].id)}}><span className="font-semibold">{x.label}</span><span className="opacity-70">›</span></button>)}</div>:
  <div className="space-y-4">
   <button className={button+' bg-white/15'} onClick={()=>{setItemId(null);setPartId(null);stop()}}>← {LABELS.find(x=>x.id===category)?.label}に戻る</button>
   <h2 className="text-lg font-bold">{item.label}</h2>
   {item.id==='intentionalWalk'&&<p className="text-xs opacity-75">この項目は攻撃画面の「その他」に配置されます。</p>}
   {item.id!=='startTime'&&item.id!=='suspendedGame'&&item.id!=='heat'&&<div className="space-y-2">{item.parts.map(p=><button key={p.id} onClick={()=>setPartId(p.id)} className={'w-full rounded-xl border px-3 py-3 text-left text-sm '+(part?.id===p.id?'border-blue-300 bg-blue-600/40':'border-white/20 bg-white/10')}>{p.label}</button>)}</div>}
   {item.id==='score'&&<label className="block space-y-2"><span className="font-semibold">無得点時の読み上げ</span><select className="w-full rounded-xl bg-white p-3 text-gray-900" value={texts.score?.noScoreEnabled||'false'} onChange={e=>{setTexts(prev=>({...prev,score:{...prev.score,noScoreEnabled:e.target.value}}));setDirty(true);setSaved(false)}}><option value="false">読み上げなし</option><option value="true">読み上げあり</option></select><p className="text-xs opacity-75">読み上げなしの場合、無得点時の文章は保存されますが、実際の放送では表示しません。</p></label>}
   {item.id==='startTime'&&<label className="block space-y-2"><span className="font-semibold">表示タイミング</span><select className="w-full rounded-xl bg-white p-3 text-gray-900" value={texts.startTime?.timing||'afterFirstPitch'} onChange={e=>{setTexts(prev=>({...prev,startTime:{...prev.startTime,timing:e.target.value}}));setDirty(true);setSaved(false)}}>{START_TIME_TIMINGS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>}
   <label className="block space-y-2"><span className="font-semibold">読み上げ文章</span><textarea ref={textareaRef} value={text} onChange={e=>setText(e.target.value)} rows={5} className="w-full rounded-xl bg-white p-3 text-base text-gray-900" spellCheck={false}/></label>
   <label className="block space-y-2"><span className="font-semibold">読み上げメモ（任意・読み上げません）</span><textarea value={memo} onChange={e=>setMemo(e.target.value)} rows={2} placeholder="例：ファールボールがバックネット裏、観客席などへ飛んだ時" className="w-full rounded-xl bg-white p-3 text-base text-gray-900"/><span className="text-xs opacity-75">入力した場合のみ、アナウンスの上に薄黄色で表示します。</span></label>
   {!!part?.tokens.length&&<div className="space-y-2"><p className="text-sm font-semibold">差し込み項目（カーソル位置へ挿入）</p><div className="flex flex-wrap gap-2">{part.tokens.map(t=><button key={t} className={button+' border border-white/30 bg-white/10 text-sm'} onClick={()=>insert(t)}>＋{t}</button>)}</div></div>}
   {!!bad.length&&<p className="rounded-lg bg-red-700/60 p-3 text-sm">未対応の差し込み項目：{Array.from(new Set(bad)).join('、')}</p>}
   <div className="rounded-xl border border-rose-300/30 bg-rose-950/35 p-3 space-y-3"><h3 className="font-bold">🎙 アナウンス文言プレビュー</h3>{previewMemo.trim()&&<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">⚠️ {previewMemo}</div>}<p className="whitespace-pre-wrap leading-7">{preview||'（文章が空です）'}</p><div className="grid grid-cols-2 gap-2"><button className={button+' bg-blue-600'} onClick={speak}>🔊 読み上げ</button><button className={button+' bg-rose-600'} onClick={stop}>■ 停止</button></div>{speechError&&<p className="text-xs text-yellow-200">{speechError}</p>}</div>
   {(item.id==='defenseChange'||item.id==='pitchCount')&&<div className="rounded-xl border border-sky-300/30 bg-sky-950/30 p-3 space-y-2"><h3 className="font-bold">例題文章（選択行に合わせた通しの文章）</h3><p className="whitespace-pre-wrap leading-7">{example||'（文章が空です）'}</p></div>}
   {item.id==='defenseChange'&&<p className="rounded-xl bg-white/10 p-3 text-sm leading-6">例題の開始文は選択した種類（選手交代のみ／守備変更のみ／両方）に合わせて変わります。実際の試合では選手交代データに応じて開始文を自動選択します。</p>}
  </div>}
  <div className="sticky bottom-2 rounded-xl bg-slate-900/95 p-2 shadow-xl"><button className={button+' w-full '+(dirty?'bg-emerald-600':'bg-blue-700')} disabled={!!bad.length} onClick={save}>{dirty?'カスタマイズ設定に保存':'保存済み（再保存）'}</button>{saved&&<p className="mt-1 text-center text-xs text-green-200">この端末に保存しました</p>}</div>
  <p className="text-xs opacity-65">試合中アナウンスの項目名・項目数・画面配置は固定です。保存先はカスタマイズ設定IDごとに独立しています。試合画面への接続は別途必要です。</p>
 </div>;
}
