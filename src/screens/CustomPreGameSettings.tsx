import React,{useEffect,useRef,useState} from 'react';
import {COMMON_TOKENS,PRE_GAME_CATALOG,defaultCondition,defaultTiming,fromCatalog,loadPreGameItems,savePreGameItems,renderPreGameText,validatePreGameText,type PreGameItem,type PreGameSegment,type PreGameCondition} from '../lib/customPreGameTemplates';
import {getActiveCustomProfileId,getCustomProfiles,createCustomProfile,setActiveCustomProfileId,renameCustomProfile,exportCustomProfile,importCustomProfile,type CustomProfile} from '../lib/customProfiles';
import {speak,stop} from '../lib/tts';
import CustomProfileQR from './CustomProfileQR';
const sample:Record<string,string>={'チーム名':'東京ジュニア','先攻チーム名':'東京ジュニア','後攻チーム名':'横浜ジュニア','大会名':'学童全国大会','試合番号':'1','開始予定時刻':'9時30分','開始時刻':'9時35分','選手名':'山田太郎','選手名（苗字）':'山田','選手名（フルネーム）':'山田太郎','控え選手名（苗字）':'佐藤、鈴木','控え選手名（フルネーム）':'佐藤次郎、鈴木花子','選手敬称':'くん','打順':'4','守備位置':'ショート','背番号':'6','監督名':'鈴木一郎','審判名':'佐藤次郎','審判役割':'球審','残り分数':'2','ノック時間':'7','回':'1','表裏':'裏','1塁側チーム名':'東京ジュニア','3塁側チーム名':'横浜ジュニア'};
// 設定画面でも実画面と同じ単位（打順は9人、控えは1人ずつ）で仮データ展開する。
const sampleLineup=[
 ['山田','太郎','ショート','6'],['田中','一郎','セカンド','4'],['高橋','健太','ピッチャー','1'],
 ['小林','大輔','ファースト','3'],['渡辺','翔','キャッチャー','2'],['伊藤','大地','サード','5'],
 ['中村','陽介','レフト','7'],['加藤','拓海','センター','8'],['吉田','海斗','ライト','9']
];
const sampleBench=[
 {last:'佐藤',first:'次郎',number:'12',honorific:'くん'},
 {last:'鈴木',first:'花子',number:'14',honorific:'さん'}
];
const makePreview=(template:string):string=>{
 const lineupToken=/【(?:打順|選手名|選手名（苗字）|選手名（フルネーム）|選手敬称|守備位置|背番号)】/;
 const benchToken=/【控え選手名（(?:苗字|フルネーム)）】/;
 const rows:string[]=[];
 for(const line of template.split('\n')){
  if(benchToken.test(line)){
   for(const p of sampleBench){
    const hasHonorific=line.includes('【選手敬称】');
    const hasNumber=line.includes('【背番号】');
    const rendered=renderPreGameText(line,{...sample,'控え選手名（苗字）':p.last,'控え選手名（フルネーム）':p.last+p.first,'選手敬称':p.honorific,'背番号':p.number});
    rows.push(rendered+(hasHonorific?'':p.honorific)+(hasNumber?'':`、背番号${p.number}`));
   }
  }else if(lineupToken.test(line)&&line.includes('【打順】')){
   sampleLineup.forEach(([last,first,pos,number],i)=>rows.push(renderPreGameText(line,{...sample,'打順':String(i+1),'選手名':last+first,'選手名（苗字）':last,'選手名（フルネーム）':last+first,'選手敬称':'くん','守備位置':pos,'背番号':number})));
  }else rows.push(renderPreGameText(line,sample));
 }
 return rows.join('\n');
};
const btn='rounded-xl px-3 py-2 font-semibold active:scale-[.98] border border-white/15';
const select='w-full min-h-11 rounded-xl bg-slate-700 text-white border border-white/20 px-3 py-2';
const input='w-full min-h-11 rounded-xl bg-white text-slate-900 px-3 py-2';
const nextId=()=>`segment-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
export default function CustomPreGameSettings({onBack}:{onBack?:()=>void}){
 const [profiles,setProfiles]=useState<CustomProfile[]>(getCustomProfiles);
 const [profileId,setProfileId]=useState(getActiveCustomProfileId);
 const [items,setItems]=useState<PreGameItem[]>(()=>loadPreGameItems(getActiveCustomProfileId()));
 const [selected,setSelected]=useState<string|null>(null);
 const [catalog,setCatalog]=useState(false);
 const [dirty,setDirty]=useState(false);
 const [status,setStatus]=useState('');
 const [newName,setNewName]=useState('');
 const [showQR,setShowQR]=useState(false);
 const importRef=useRef<HTMLInputElement>(null);
 const [segmentId,setSegmentId]=useState<string|null>(null);
 const textRef=useRef<HTMLTextAreaElement>(null);
 const item=items.find(x=>x.id===selected);
 const segment=item?.segments.find(s=>s.id===segmentId)||item?.segments[0];
 useEffect(()=>{setItems(loadPreGameItems(profileId));setSelected(null);setSegmentId(null);setDirty(false);setActiveCustomProfileId(profileId)},[profileId]);
 const update=(fn:(old:PreGameItem[])=>PreGameItem[])=>{setItems(old=>fn(old));setDirty(true);setStatus('未保存の変更があります')};
 const patch=(value:Partial<PreGameItem>)=>update(old=>old.map(x=>x.id===selected?{...x,...value}:x));
 const patchSegment=(value:Partial<PreGameSegment>)=>{if(!segment)return;patch({segments:item!.segments.map(x=>x.id===segment.id?{...x,...value}:x)})};
  const save=()=>{try{savePreGameItems(profileId,items);setDirty(false);setStatus('保存しました')}catch{setStatus('保存に失敗しました')}};
 const move=(id:string,dir:number)=>update(old=>{const a=[...old],i=a.findIndex(x=>x.id===id),j=i+dir;if(j<0||j>=a.length)return old;[a[i],a[j]]=[a[j],a[i]];return a});
 const add=(index:number)=>{const a=fromCatalog(index);update(old=>[...old,a]);setCatalog(false);setSelected(a.id);setSegmentId(a.segments[0].id)};
 const insertToken=(token:string)=>{if(!segment)return;const txt=segment.text,box=textRef.current,from=box?.selectionStart??txt.length,to=box?.selectionEnd??from;patchSegment({text:txt.slice(0,from)+'【'+token+'】'+txt.slice(to)});requestAnimationFrame(()=>{box?.focus();box?.setSelectionRange(from+token.length+2,from+token.length+2)})};
 const preview=segment?makePreview(segment.text):'';
 const bad=segment?validatePreGameText(segment.text):[];
 const testVoice=async()=>{if(!segment||bad.length)return;try{stop();const text=preview.replace(/山田太郎/g,'やまだ、たろう').replace(/佐藤次郎/g,'さとう、じろう').replace(/鈴木花子/g,'すずき、はなこ');await speak(text)}catch{setStatus('読み上げに失敗しました')}};
 const addProfile=()=>{if(dirty){savePreGameItems(profileId,items);setDirty(false)}const profile=createCustomProfile(newName||'新しいカスタマイズ',profileId);setProfiles(getCustomProfiles());setNewName('');setProfileId(profile.id)};
 const downloadProfile=()=>{if(dirty){savePreGameItems(profileId,items);setDirty(false);setStatus('保存しました')}const raw=exportCustomProfile(profileId);if(!raw)return;const blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`easyannounce-${profileId}.json`;a.click();URL.revokeObjectURL(url)};
 const importProfile=async(file?:File)=>{if(!file)return;try{const raw=await file.text();const profile=importCustomProfile(raw);setProfiles(getCustomProfiles());setProfileId(profile.id);setItems(loadPreGameItems(profile.id));setDirty(false);setStatus('カスタマイズ設定一式を読み込みました')}catch(e){setStatus('読み込み失敗: '+String((e as Error).message||e))}finally{if(importRef.current)importRef.current.value=''}};
 const switchProfile=(id:string)=>{if(dirty&&!window.confirm('未保存の変更があります。カスタマイズを切り替えますか？'))return;setProfileId(id)};
 const removeItem=(x:PreGameItem)=>{if(!window.confirm('「'+x.title+'」を削除しますか？\n削除後は保存すると確定します。'))return;update(old=>old.filter(z=>z.id!==x.id));if(selected===x.id){setSelected(null);setSegmentId(null)}};
 return <main className="mx-auto w-full max-w-3xl px-3 py-4 text-white space-y-4 pb-24">
  <header className="flex items-center gap-3"><button className={btn+' bg-white/10'} onClick={()=>{if(dirty&&!window.confirm('未保存の変更があります。戻りますか？'))return;stop();onBack?.()}}>← 戻る</button><div><h1 className="text-xl font-extrabold">試合前アナウンス設定</h1><p className="text-xs opacity-75">カスタマイズモード専用・スマホ／タブレット対応</p></div></header>
  <section className="rounded-2xl bg-white/10 p-3 space-y-3 border border-white/15"><label className="font-bold text-sm">カスタマイズ設定</label><select className={select} value={profileId} onChange={e=>switchProfile(e.target.value)}>{profiles.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select><div className="flex gap-2"><input className={input+' flex-1 min-w-0'} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="新しいカスタマイズ名"/><button className={btn+' bg-blue-600 shrink-0'} onClick={addProfile}>複製して作成</button></div><div className="flex gap-2 flex-wrap"><button className={btn+' bg-white/10 text-sm'} onClick={()=>{const next=prompt('カスタマイズ名を変更',profiles.find(p=>p.id===profileId)?.name||'');if(next?.trim()){renameCustomProfile(profileId,next);setProfiles(getCustomProfiles())}}}>名前を変更</button><button className={btn+' bg-white/10 text-sm'} onClick={downloadProfile}>設定一式を書き出す（試合前＋試合中）</button><button className={btn+' bg-sky-700 text-sm'} onClick={()=>setShowQR(true)}>QRコード表示・読み込み</button><button className={btn+' bg-white/10 text-sm'} onClick={()=>importRef.current?.click()}>設定一式を読み込む</button><input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={e=>void importProfile(e.target.files?.[0])}/></div><p className="text-xs opacity-75">試合前・試合中の文章と進行順など、カスタマイズ設定のすべてを保存・書き出します。読み込み時は新しいカスタマイズとして登録します。</p></section>
  {!item?<><section className="rounded-2xl bg-white/10 p-3 space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold">進行項目（{items.length}件）</h2><button className={btn+' bg-emerald-600 text-sm'} onClick={()=>setCatalog(!catalog)}>＋ 項目を追加</button></div><p className="text-xs opacity-75">上から順に表示。項目名・順序・表示条件・タイミングのメモ・読み上げ文章を変更できます。</p>{catalog&&<div className="rounded-xl bg-slate-700 p-3 space-y-2"><p className="font-bold">テンプレートから追加</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{PRE_GAME_CATALOG.map((c,i)=><button key={i} className={btn+' bg-slate-600 text-left text-sm'} onClick={()=>add(i)}>＋ {c.title}</button>)}</div></div>}{items.map((x,i)=><div key={x.id} className="rounded-xl bg-slate-800 border border-white/15 p-3 flex gap-2 items-center"><input type="checkbox" checked={x.enabled} onChange={e=>update(old=>old.map(z=>z.id===x.id?{...z,enabled:e.target.checked}:z))} aria-label="表示する" className="h-5 w-5"/><button className="flex-1 text-left min-w-0" onClick={()=>{setSelected(x.id);setSegmentId(x.segments[0]?.id||null)}}><span className="font-bold text-sm">{i+1}. {x.title}</span><p className="text-xs opacity-60">読み上げ文章を編集できます</p></button><div className="flex flex-col gap-1"><button className="bg-white/10 rounded px-2" disabled={i===0} onClick={()=>move(x.id,-1)}>↑</button><button className="bg-white/10 rounded px-2" disabled={i===items.length-1} onClick={()=>move(x.id,1)}>↓</button></div><button className="px-2 py-2 bg-blue-700 rounded-lg" onClick={()=>{setSelected(x.id);setSegmentId(x.segments[0]?.id||null)}}>編集</button><button className="px-2 py-2 bg-rose-700 rounded-lg" onClick={()=>removeItem(x)}>削除</button></div>)}</section><button className={btn+' w-full bg-blue-600 py-3'} onClick={save}>進行表を保存</button></>:
  <section className="rounded-2xl bg-white/10 p-3 space-y-4"><button className={btn+' bg-white/10'} onClick={()=>{stop();setSelected(null)}}>← 項目一覧に戻る</button><label className="block space-y-1"><span className="text-xs font-bold">項目名</span><input className={input} value={item.title} onChange={e=>patch({title:e.target.value})}/></label><div className="space-y-2"><h3 className="font-bold">読み上げ文章</h3>{(item.kind==='sheetKnock'||item.kind==='warmup') ? <div className="grid grid-cols-3 gap-2">{(['start','notice','end'] as const).map((phase,i)=>{const seg=item.segments.find(s=>s.phase===phase)||item.segments[i];return <button key={phase} className={btn+' text-xs '+(seg?.id===segment?.id?'bg-blue-700':'bg-slate-700')} onClick={()=>seg&&setSegmentId(seg.id)}>{[item.kind==='warmup'?'開始':'開始・準備','残り時間','終了'][i]}</button>})}</div>:<p className="text-xs opacity-75">文章は1件だけ設定できます。</p>}</div>
   {segment&&<><textarea ref={textRef} rows={5} className={input+' leading-7'} value={segment.text} onChange={e=>patchSegment({text:e.target.value})}/><div className="flex gap-2 flex-wrap">{COMMON_TOKENS.map(t=><button key={t} className={btn+' text-xs bg-slate-700'} onClick={()=>insertToken(t)}>＋{t}</button>)}</div>{bad.length>0&&<p className="text-yellow-300 text-sm">未対応の差し込み項目: {bad.join('、')}</p>}   <div className="rounded-xl border border-rose-400/60 bg-rose-100 p-3 text-slate-900 space-y-2"><p className="font-bold text-rose-700">🎤 アナウンス文言プレビュー</p><p className="whitespace-pre-wrap leading-8">{preview}</p><div className="grid grid-cols-2 gap-2"><button className="rounded-xl bg-blue-600 text-white p-3 font-bold" onClick={testVoice}>🔊 読み上げ</button><button className="rounded-xl bg-rose-600 text-white p-3 font-bold" onClick={()=>stop()}>■ 停止</button></div><p className="text-xs text-slate-600">ここでは仮データを表示。選手名のルビは実試合への連動時に登録ふりがなから生成します。</p></div>
   </>}
   {item.kind==='warmup'&&<div className="rounded-xl bg-slate-800 p-3 space-y-3"><h3 className="font-bold">ウォーミングアップ時間設定</h3><div className="grid grid-cols-2 gap-3"><label className="text-sm">時間（分）<select className={select} value={item.timerSettings?.minutes??10} onChange={e=>{const minutes=Number(e.target.value);patch({timerSettings:{minutes,noticeMinutes:Math.min(minutes,item.timerSettings?.noticeMinutes??2)}})}}>{Array.from({length:30},(_,i)=>i+1).map(x=><option key={x} value={x}>{x}分</option>)}</select></label><label className="text-sm">残り時間のお知らせ<select className={select} value={item.timerSettings?.noticeMinutes??2} onChange={e=>patch({timerSettings:{minutes:item.timerSettings?.minutes??10,noticeMinutes:Number(e.target.value)}})}><option value={0}>なし</option>{Array.from({length:(item.timerSettings?.minutes??10)-1},(_,i)=>i+1).map(x=><option key={x} value={x}>残り{x}分</option>)}</select></label></div><p className="text-xs opacity-75">この設定もカスタマイズ設定一式に保存されます。</p></div>}
   <div className="space-y-3 rounded-xl bg-slate-800 p-3">
    <h3 className="font-bold">表示条件</h3>
    <ConditionEditor condition={item.condition} onChange={c=>patch({condition:c})}/>
    <label className="block text-sm font-bold">タイミングのメモ
     <textarea className={input+' mt-2 min-h-20 leading-relaxed'} rows={2} value={item.timing?.note||''} onChange={e=>patch({timing:{...defaultTiming(),...item.timing,note:e.target.value}})} placeholder="例：審判員が集まったら" />
    </label>
    <p className="text-xs opacity-75">入力したメモは試合前の進行画面に薄黄色の背景で表示します（音声では読み上げません）。</p>
   </div>
   <button className={btn+' w-full bg-blue-600 py-3'} onClick={save}>変更を保存</button></section>}
  {showQR&&<CustomProfileQR profileId={profileId} onBeforeExport={()=>{if(dirty){savePreGameItems(profileId,items);setDirty(false)}}} onImported={id=>{setProfiles(getCustomProfiles());setProfileId(id);setItems(loadPreGameItems(id));setDirty(false);setShowQR(false);setStatus("QRコードから試合前・試合中の設定を読み込みました")}} onClose={()=>setShowQR(false)}/>}
  <div className="sticky bottom-2 rounded-xl bg-slate-900/95 border border-white/20 p-2 flex justify-between items-center gap-2"><span className={'text-sm '+(dirty?'text-yellow-200':'text-emerald-300')}>{status||(dirty?'未保存':'保存済み')}</span><button className={btn+' bg-emerald-600 shrink-0'} onClick={save}>保存</button></div>
 </main>
}
function ConditionEditor({condition:c,onChange}:{condition:PreGameCondition;onChange:(c:PreGameCondition)=>void}){
 const upd=(v:Partial<PreGameCondition>)=>onChange({...c,...v});
 return <div className="space-y-3 text-sm">
  <label className="block">表示するチーム
   <select className={select} value={c.team} onChange={e=>upd({team:e.target.value as PreGameCondition['team']})}>
    <option value="any">指定なし</option><option value="top">先攻</option><option value="bottom">後攻</option><option value="firstBase">1塁側</option><option value="thirdBase">3塁側</option>
   </select>
  </label>

 </div>;
}
