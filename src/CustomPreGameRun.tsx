import React, {useEffect,useMemo,useRef,useState} from 'react';
import localForage from 'localforage';
import {getActiveCustomProfileId,getCustomProfiles} from './lib/customProfiles';
import {loadPreGameItems,savePreGameItems,matchesPreGameCondition,type PreGameItem, type PreGameSegment} from './lib/customPreGameTemplates';
import {speak,stop,preserveNameReading} from './lib/tts';
import type {ScreenType} from './App';

type Player={id:number;lastName?:string;firstName?:string;lastNameKana?:string;firstNameKana?:string;number?:string;isFemale?:boolean};
type Team={name:string;kana:string;players:Player[];assignments:Record<string,number|null>;order:{id:number}[];benchOutIds:number[]};
const POS:Record<string,string>={投:'ピッチャー',捕:'キャッチャー',一:'ファースト',二:'セカンド',三:'サード',遊:'ショート',左:'レフト',中:'センター',右:'ライト',指:'指名打者'};
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ruby=(text:string,kana?:string)=>kana?`<ruby>${esc(text)}<rt>${esc(kana)}</rt></ruby>`:esc(text);
const playerSurname=(p:Player)=>ruby(p.lastName||'',p.lastNameKana);
const playerName=(p:Player)=>playerSurname(p)+(p.firstName? '、'+ruby(p.firstName,p.firstNameKana):'');
const playerSpeech=(p:Player)=>[preserveNameReading(p.lastNameKana||p.lastName||''),preserveNameReading(p.firstNameKana||p.firstName||'')].filter(Boolean).join('、');
const tokenPattern=/【([^】]+)】/g;
const replaceTokens=(source:string,vars:Record<string,string>)=>source.split(tokenPattern).map((part,i)=>i%2===0?esc(part):(Object.prototype.hasOwnProperty.call(vars,part)?vars[part]:esc('【'+part+'】'))).join('');
const speakingFromHtml=(html:string)=>{const el=document.createElement('div');el.innerHTML=html.replace(/<br\s*\/?\s*>/gi,'\n');el.querySelectorAll('ruby').forEach(r=>{const kana=r.querySelector('rt')?.textContent||'';const visible=Array.from(r.childNodes).filter(n=>n.nodeName!=='RT').map(n=>n.textContent||'').join('');r.replaceWith(preserveNameReading(kana||visible));});return el.textContent||'';};
const getPos=(team:Team,id:number)=>POS[Object.entries(team.assignments).find(([,pid])=>pid===id)?.[0]||'']||'指名打者';
const emptyTeam=():Team=>({name:'',kana:'',players:[],assignments:{},order:[],benchOutIds:[]});
export default function CustomPreGameRun({onNavigate,onBack}:{onNavigate:(s:ScreenType)=>void;onBack:()=>void}){
 const [items,setItems]=useState<PreGameItem[]>([]);
 const [match,setMatch]=useState<any>({});
 const [top,setTop]=useState<Team>(emptyTeam);
 const [bottom,setBottom]=useState<Team>(emptyTeam);
 const [side,setSide]=useState<'top'|'bottom'>('top');
 const [completed,setCompleted]=useState<Record<string,number>>({});
 const [playing,setPlaying]=useState('');
 const [detailId,setDetailId]=useState<string|null>(null);
 const [ready,setReady]=useState(false);
 const [timerPopup,setTimerPopup]=useState<{itemId:string;phase:'notice'|'end';kind:'warmup'|'sheetKnock';timerKey:string}|null>(null);
 const popupSeen=useRef<Record<string,boolean>>({});
 const [profileName,setProfileName]=useState('');
 const session=useRef(0);
 useEffect(()=>{let live=true;(async()=>{
  const id=getActiveCustomProfileId();const all=loadPreGameItems(id);const mi=await localForage.getItem<any>('matchInfo')||{};
  const self=await localForage.getItem<any>('team'); const store=await localForage.getItem<any>('teamRegisterStore');
  const folder=(teamId:any)=>store?.teams?.find((x:any)=>String(x.id)===String(teamId));
  const make=async (raw:any,teamId?:any):Promise<Team>=>{
   const t=raw?.team||raw||{};
   const order=await localForage.getItem<any>(teamId!=null?`startingBattingOrder_${teamId}`:'startingBattingOrder');
   const assigns=await localForage.getItem<any>(teamId!=null?`startingassignments_${teamId}`:'startingassignments');
   const benchOut=await localForage.getItem<any>(teamId!=null?`startingBenchOutIds_${teamId}`:'startingBenchOutIds');
   return {name:String(t.name||raw?.teamName||raw?.name||''),kana:String(t.furigana||t.nameKana||t.name||''),players:Array.isArray(t.players)?t.players:[],assignments:assigns||{},order:Array.isArray(order)?order:[],benchOutIds:Array.isArray(benchOut)?benchOut.map(Number):[]};
  };
  let topTeam:Team,bottomTeam:Team;
  if(mi.announcementMode==='single'){
   const first=await make(folder(mi.firstBaseTeamId),mi.firstBaseTeamId);
   const third=await make(folder(mi.thirdBaseTeamId),mi.thirdBaseTeamId);
   [topTeam,bottomTeam]=mi.battingFirstSide==='third'?[third,first]:[first,third];
  }else{
   const selfTeam=await make(self);
   const other=emptyTeam();other.name=String(mi.opponentTeam||mi.opponentTeamName||'対戦チーム');other.kana=String(mi.opponentTeamFurigana||other.name);
   [topTeam,bottomTeam]=mi.isHome?[other,selfTeam]:[selfTeam,other];
  }
  if(!live)return;
  setItems(all);setMatch(mi);setTop(topTeam);setBottom(bottomTeam);setSide(mi.isHome?'bottom':'top');
  setProfileName(getCustomProfiles().find(x=>x.id===id)?.name||'カスタマイズ');setReady(true);
 })().catch(e=>{console.error('[CustomPreGameRun]',e);setReady(true)});return()=>{live=false;session.current++;stop()};},[]);
 // 既存画面への遷移をなくし、カスタマイズ専用の同一進行画面上で操作する。
 const [knockMinutes,setKnockMinutes]=useState(7);
 const [noticeMinutes,setNoticeMinutes]=useState(2);
 const [knockSides,setKnockSides]=useState<Record<'top'|'bottom',{remaining:number;running:boolean;deadline:number|null;noticed:boolean;ended:boolean}>>({
  top:{remaining:420,running:false,deadline:null,noticed:false,ended:false},
  bottom:{remaining:420,running:false,deadline:null,noticed:false,ended:false}
 });
 useEffect(()=>{let mounted=true;(async()=>{
  const v=await localForage.getItem<any>('sheetKnockTimerSettings:custom');
  if(!mounted)return;
  const minutes=Math.max(1,Math.min(30,Number(v?.knockMinutes)||7));
  const notice=Math.max(0,Math.min(minutes,(v?.noticeMinutes===undefined?2:Number(v.noticeMinutes))));
  setKnockMinutes(minutes);setNoticeMinutes(notice);
  setKnockSides({top:{remaining:minutes*60,running:false,deadline:null,noticed:false,ended:false},bottom:{remaining:minutes*60,running:false,deadline:null,noticed:false,ended:false}});
 })().catch(console.error);return()=>{mounted=false};},[]);
 useEffect(()=>{
  const timer=window.setInterval(()=>setKnockSides(prev=>{
   let change=false;
   const next={...prev};
   (['top','bottom'] as const).forEach(k=>{
    const v=prev[k];if(!v.running||v.deadline===null)return;
    const remaining=Math.max(0,Math.ceil((v.deadline-Date.now())/1000));
    const noticed=v.noticed||(noticeMinutes>0&&remaining<=noticeMinutes*60);
    const ended=remaining===0;
    if(v.remaining!==remaining||v.noticed!==noticed||v.ended!==ended){next[k]={...v,remaining,noticed,ended,running:!ended,deadline:ended?null:v.deadline};change=true;}
   });
   return change?next:prev;
  }),250);
  return()=>window.clearInterval(timer);
 },[noticeMinutes]);
 const changeKnock=(k:'top'|'bottom',command:'start'|'pause'|'reset')=>{
  setKnockSides(prev=>{
   const v=prev[k];
   if(command==='reset')return {...prev,[k]:{remaining:knockMinutes*60,running:false,deadline:null,noticed:false,ended:false}};
   if(command==='pause')return {...prev,[k]:{...v,remaining:v.deadline!==null?Math.max(0,Math.ceil((v.deadline-Date.now())/1000)):v.remaining,running:false,deadline:null}};
   const secs=v.remaining>0?v.remaining:knockMinutes*60;
   return {...prev,[k]:{...v,remaining:secs,running:true,deadline:Date.now()+secs*1000,ended:false}};
  });
 };
 const formatClock=(n:number)=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
 type WarmTimer={remaining:number;running:boolean;deadline:number|null;noticed:boolean;ended:boolean};
 const [warmTimers,setWarmTimers]=useState<Record<string,WarmTimer>>({});
 const getWarmTimer=(item:PreGameItem):WarmTimer=>warmTimers[item.id]||{remaining:(item.timerSettings?.minutes??10)*60,running:false,deadline:null,noticed:false,ended:false};
 useEffect(()=>{const timer=window.setInterval(()=>setWarmTimers(prev=>{
  let changed=false;const next={...prev};
  for(const [id,v] of Object.entries(prev)){
   if(!v.running||v.deadline==null)continue;
   const item=items.find(x=>x.id===id);const notice=item?.timerSettings?.noticeMinutes??2;
   const remaining=Math.max(0,Math.ceil((v.deadline-Date.now())/1000));
   const noticed=v.noticed||(notice>0&&remaining<=notice*60);const ended=remaining===0;
   if(remaining!==v.remaining||noticed!==v.noticed||ended!==v.ended){next[id]={...v,remaining,noticed,ended,running:!ended,deadline:ended?null:v.deadline};changed=true;}
  }
  return changed?next:prev;
 }),250);return()=>window.clearInterval(timer)},[items]);
 const changeWarm=(item:PreGameItem,command:'start'|'pause'|'reset')=>setWarmTimers(prev=>{
  const v=prev[item.id]||{remaining:(item.timerSettings?.minutes??10)*60,running:false,deadline:null,noticed:false,ended:false};
  if(command==='reset')return {...prev,[item.id]:{remaining:(item.timerSettings?.minutes??10)*60,running:false,deadline:null,noticed:false,ended:false}};
  if(command==='pause')return {...prev,[item.id]:{...v,remaining:v.deadline!=null?Math.max(0,Math.ceil((v.deadline-Date.now())/1000)):v.remaining,running:false,deadline:null}};
  const remaining=v.remaining>0?v.remaining:(item.timerSettings?.minutes??10)*60;
  return {...prev,[item.id]:{...v,remaining,running:true,deadline:Date.now()+remaining*1000,ended:false}};
 });
 const updateWarmSettings=(item:PreGameItem,minutes:number,noticeMinutes:number)=>{
  const m=Math.max(1,Math.min(30,minutes));const n=Math.max(0,Math.min(m-1,noticeMinutes));
  const updated=items.map(x=>x.id===item.id?{...x,timerSettings:{minutes:m,noticeMinutes:n}}:x);
  setItems(updated);savePreGameItems(getActiveCustomProfileId(),updated);
  setWarmTimers(prev=>({...prev,[item.id]:{remaining:m*60,running:false,deadline:null,noticed:false,ended:false}}));
 };
 const renderWarmTimer=(item:PreGameItem)=>{
  const current=getWarmTimer(item);const minutes=item.timerSettings?.minutes??10;const notice=item.timerSettings?.noticeMinutes??2;
  return <div className="rounded-xl border border-sky-300/40 bg-slate-900/55 px-3 py-3 space-y-3">
   <div className="flex justify-between items-center gap-3"><div className="font-bold">⏱ ウォーミングアップタイマー</div><div className="text-3xl font-black tabular-nums">{formatClock(current.remaining)}</div></div>
   <div className="grid grid-cols-2 gap-2 text-xs"><label>ウォーミングアップ時間<select className="block w-full bg-slate-700 border border-white/20 p-3 rounded-lg mt-1" value={minutes} disabled={current.running} onChange={e=>updateWarmSettings(item,Number(e.target.value),notice)}>{Array.from({length:30},(_,i)=>i+1).map(x=><option key={x} value={x}>{x}分</option>)}</select></label><label>残り時間のお知らせ<select className="block w-full bg-slate-700 border border-white/20 p-3 rounded-lg mt-1" value={Math.min(minutes-1,notice)} disabled={current.running} onChange={e=>updateWarmSettings(item,minutes,Number(e.target.value))}><option value={0}>なし</option>{Array.from({length:minutes-1},(_,i)=>i+1).map(x=><option key={x} value={x}>残り{x}分</option>)}</select></label></div>
   <div className="grid grid-cols-2 gap-2"><button className="rounded-xl bg-emerald-600 py-3 font-bold" onClick={()=>changeWarm(item,current.running?'pause':'start')}>{current.running?'一時停止':'開始・再開'}</button><button className="rounded-xl bg-slate-600 py-3 font-bold" onClick={()=>changeWarm(item,'reset')}>リセット</button></div>
   {current.noticed&&current.remaining>0&&<div className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">残り{notice}分です。残り時間のアナウンスをご確認ください。</div>}
   {current.ended&&<div className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-sm font-bold text-rose-950">ウォーミングアップ時間が終了しました。終了アナウンスをご確認ください。</div>}
  </div>
 };

 const getKnockSide=(item:PreGameItem):'top'|'bottom'=>item.target==='top'?'top':item.target==='bottom'?'bottom':side;
 const isKnockStart=(item:PreGameItem)=>item.kind==='sheetKnock'&&(/開始|準備|シートノック[（(]/.test(item.title))&&!/残り|終了/.test(item.title);
 const renderKnockTimer=(item:PreGameItem)=>{
  const k=getKnockSide(item);const current=knockSides[k];
  const updateTimerSettings=async (minutes:number,notice:number)=>{
   const m=Math.max(1,Math.min(30,minutes));const n=Math.max(0,Math.min(m,notice));
   setKnockMinutes(m);setNoticeMinutes(n);
   setKnockSides(prev=>({
    top:prev.top.running?prev.top:{...prev.top,remaining:m*60,noticed:false,ended:false},
    bottom:prev.bottom.running?prev.bottom:{...prev.bottom,remaining:m*60,noticed:false,ended:false}
   }));
   await localForage.setItem('sheetKnockTimerSettings:custom',{knockMinutes:m,noticeMinutes:n});
  };
  return <div className="rounded-xl border border-sky-300/40 bg-slate-900/55 px-3 py-3 space-y-3">
   <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold">⏱ シートノックタイマー（{k==='top'?'先攻':'後攻'}）</div><p className="text-xs text-white/70">{knockMinutes}分／残り{noticeMinutes}分でお知らせ</p></div><div className="text-3xl font-black tabular-nums">{formatClock(current.remaining)}</div></div>
   <div className="grid grid-cols-2 gap-2 text-xs"><label className="space-y-1">ノック時間（1～30分）<select aria-label="ノック時間" value={knockMinutes} disabled={knockSides.top.running||knockSides.bottom.running} onChange={e=>void updateTimerSettings(Number(e.target.value),noticeMinutes)} className="block w-full bg-slate-700 border border-white/20 p-2 rounded-lg">{Array.from({length:30},(_,i)=>i+1).map(x=><option key={x} value={x}>{x}分</option>)}</select></label><label className="space-y-1">残り時間のお知らせ<select aria-label="残り時間のお知らせ" value={noticeMinutes} disabled={knockSides.top.running||knockSides.bottom.running} onChange={e=>void updateTimerSettings(knockMinutes,Number(e.target.value))} className="block w-full bg-slate-700 border border-white/20 p-2 rounded-lg">{Array.from({length:knockMinutes+1},(_,i)=>i).map(x=><option key={x} value={x}>{x===0?'なし':`${x}分`}</option>)}</select></label></div>
   <div className="grid grid-cols-2 gap-2"><button type="button" className="rounded-xl bg-emerald-600 py-3 font-bold" onClick={()=>changeKnock(k,current.running?'pause':'start')}>{current.running?'一時停止':'開始・再開'}</button><button type="button" className="rounded-xl bg-slate-600 py-3 font-bold" onClick={()=>changeKnock(k,'reset')}>リセット</button></div>
   {current.noticed&&current.remaining>0&&<div className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">残り{noticeMinutes}分以下です。「残り時間」のアナウンスを確認してください。</div>}
   {current.ended&&<div className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-sm font-bold text-rose-950">ノック時間が終了しました。「終了案内」を読み上げてください。</div>}
  </div>
 };
 const current=side==='top'?top:bottom;
 const vars=useMemo(()=>({
  'チーム名':current.name,'先攻チーム名':top.name,'後攻チーム名':bottom.name,'大会名':String(match.tournamentName||''),
  '試合番号':String(match.matchNumber||''),'開始予定時刻':String(match.startTime||match.scheduledStartTime||''),
  '開始時刻':String(match.actualStartTime||match.startTime||''),'残り分数':String(noticeMinutes),'ノック時間':String(knockMinutes),
  '回':'1','表裏':'表','1塁側チーム名':match.battingFirstSide==='third'?bottom.name:top.name,
  '3塁側チーム名':match.battingFirstSide==='third'?top.name:bottom.name,
  '監督名':'','選手名':'','選手名（苗字）':'','選手名（フルネーム）':'','控え選手名（苗字）':'','控え選手名（フルネーム）':'','選手敬称':'','打順':'','守備位置':'','背番号':'','審判名':'','審判役割':''
 }),[current,top,bottom,match,knockMinutes,noticeMinutes]);
 const buildSegment=(item:PreGameItem,seg:PreGameSegment)=>{
  const selectedTeam=item.condition?.team||'any';const team=selectedTeam==='top'?top:selectedTeam==='bottom'?bottom:current;
  const basic={...vars,'チーム名':team.name,'残り分数':String(item.kind==='warmup'?(item.timerSettings?.noticeMinutes??2):noticeMinutes)};
  const template=seg.text;
  // 控えはスタメン・守備配置・ベンチ外を除外して抽出する。
  const benchOutIds=new Set<number>(team.benchOutIds);
    // メンバーのベンチ外情報が利用できる場合はそのフラグも反映。
  const benchPlayers=team.players.filter(p=>!team.order.some(x=>Number(x.id)===Number(p.id))&&!Object.values(team.assignments).some(id=>Number(id)===Number(p.id))&&!benchOutIds.has(Number(p.id))&&!(p as any).isBenchOut);
  const currentPlayer=team.order.map(x=>team.players.find(p=>Number(p.id)===Number(x.id))).find(Boolean)||team.players[0];
  const values={...basic,
    '選手名（苗字）':currentPlayer?playerSurname(currentPlayer):'',
    '選手名（フルネーム）':currentPlayer?playerName(currentPlayer):'',
    '控え選手名（苗字）':benchPlayers.map(playerSurname).join('、'),
    '控え選手名（フルネーム）':benchPlayers.map(playerName).join('、')};
  // 【打順】は先発9名分、控え選手名はベンチ入り選手を1人1行で展開する。
  // 各行を独立に処理し、控え選手が9番打者の繰り返しに混ざらないようにする。
  const hasLineupToken=/【(?:打順|選手名|選手名（苗字）|選手名（フルネーム）|選手敬称|守備位置|背番号)】/;
  const hasBenchToken=/【控え選手名（(?:苗字|フルネーム)）】/;
  if(hasLineupToken.test(template)||hasBenchToken.test(template)){
    const lines=template.split('\n');
    const output:string[]=[];
    for(const line of lines){
      const benchMatch=line.match(/【控え選手名（(苗字|フルネーム)）】/);
      if(benchMatch){
        const full=benchMatch[1]==='フルネーム';
        for(const p of benchPlayers){
          // テンプレート内に敬称や背番号が無ければ自動で付加する。
          const includesHonor=line.includes('【選手敬称】');
          const includesNumber=line.includes('【背番号】');
          const name=full?playerName(p):playerSurname(p);
          const rendered=replaceTokens(line,{
            ...values,
            '控え選手名（苗字）':name,
            '控え選手名（フルネーム）':name,
            '選手敬称':p.isFemale?'さん':'くん',
            '背番号':String(p.number??'')
          });
          const suffix=(includesHonor?'':p.isFemale?'さん':'くん')+
            (includesNumber||!String(p.number??'').trim()?'':`、背番号${esc(String(p.number))}`);
          output.push(rendered+suffix);
        }
        continue;
      }
      if(hasLineupToken.test(line)&&(item.kind==='lineup'||line.includes('【打順】'))){
        const players=team.order.slice(0,9).map(x=>team.players.find(p=>Number(p.id)===Number(x.id))).filter((p):p is Player=>!!p);
        for(const [i,p] of players.entries()){
          output.push(replaceTokens(line,{
            ...values,'選手名':playerName(p),'選手名（苗字）':playerSurname(p),
            '選手名（フルネーム）':playerName(p),'選手敬称':p.isFemale?'さん':'くん',
            '打順':String(i+1),'守備位置':getPos(team,p.id),'背番号':String(p.number??'')
          }));
        }
        continue;
      }
      if(hasLineupToken.test(line)&&(item.kind==='defense'||item.kind==='seat')){
        const players=team.players.filter(p=>Object.values(team.assignments).some(id=>Number(id)===Number(p.id)));
        for(const p of players){
          const orderIndex=team.order.findIndex(x=>Number(x.id)===Number(p.id));
          output.push(replaceTokens(line,{...values,'選手名':playerName(p),'選手名（苗字）':playerSurname(p),
            '選手名（フルネーム）':playerName(p),'選手敬称':p.isFemale?'さん':'くん',
            '打順':orderIndex>=0?String(orderIndex+1):'', '守備位置':getPos(team,p.id),'背番号':String(p.number??'')}));
        }
        continue;
      }
      output.push(replaceTokens(line,values));
    }
    return output.join('\n');
  }
  const hasUmpire=/【(?:審判名|審判役割)】/.test(template);
  if(item.kind==='umpires'&&hasUmpire&&Array.isArray(match.umpires)&&match.umpires.length){
   const pos=template.search(/【(?:審判名|審判役割)】/);const lineStart=template.lastIndexOf('\n',pos)+1;
   return replaceTokens(template.slice(0,lineStart),basic)+match.umpires.map((u:any)=>replaceTokens(template.slice(lineStart),{...basic,'審判名':ruby(String(u.name||''),String(u.furigana||'')),'審判役割':String(u.role||'')})).join('\n');
  }
  return replaceTokens(template,values);
 };
 const context=(item:PreGameItem)=>({team:side,announcementMode:match.announcementMode==='single'?'single':'normal',matchNo:Number(match.matchNumber)||undefined,firstTime:!completed[item.id],hasData:!!current.name});
 const filtered=items.filter(item=>{if(!item.enabled)return false;const target=item.condition?.team&&item.condition.team!=='any'?item.condition.team:(item.target||'any');const ownBase=(match.benchSide==='3塁側'?'thirdBase':'firstBase');return (target==='any'||target===side||target===ownBase);});
 // タイマーの通知フラグが初めて立った瞬間に、該当するアナウンスをポップアップ表示する。
 // 画面再描画や一時停止では二重に開かず、リセット後は再通知可能。
 useEffect(()=>{
  const activeItem=items.find(x=>x.id===detailId);
  if(!activeItem||!['warmup','sheetKnock'].includes(activeItem.kind))return;
  const timerKey=activeItem.kind==='warmup'?`warm:${activeItem.id}`:`knock:${getKnockSide(activeItem)}`;
  const timerState=activeItem.kind==='warmup'?getWarmTimer(activeItem):knockSides[getKnockSide(activeItem)];
  const configuredNotice=activeItem.kind==='warmup'?(activeItem.timerSettings?.noticeMinutes??2):noticeMinutes;
  for(const phase of ['notice','end'] as const){
   const key=`${timerKey}:${phase}`;
   const triggered=phase==='notice'?configuredNotice>0&&timerState.noticed:timerState.ended;
   if(!triggered){delete popupSeen.current[key];continue;}
   if(!popupSeen.current[key]){
    popupSeen.current[key]=true;
    setTimerPopup({itemId:activeItem.id,phase,kind:activeItem.kind as 'warmup'|'sheetKnock',timerKey});
   }
  }
 },[knockSides,warmTimers,detailId,items,noticeMinutes,side]);
 useEffect(()=>{if(timerPopup&&detailId!==timerPopup.itemId){stop();setTimerPopup(null)}},[detailId,timerPopup]);
 const stopAudio=()=>{session.current++;stop();setPlaying('')};
 const play=async(item:PreGameItem,seg:PreGameSegment,html:string)=>{
  stopAudio();const n=++session.current;setPlaying(seg.id);
  try{await speak(speakingFromHtml(html));if(n===session.current)setCompleted(prev=>({...prev,[item.id]:(prev[item.id]||0)+1}));}catch(e){console.error(e)}finally{if(n===session.current)setPlaying('')}
 };

 return <div className="min-h-[100svh] bg-gradient-to-b from-gray-900 to-gray-800 text-white px-3 sm:px-6 py-5 pb-24"><main className="max-w-3xl mx-auto space-y-4">
  <header><h1 className="text-2xl sm:text-3xl font-extrabold text-center">🎤 試合前アナウンス</h1><p className="text-center text-sky-200 text-sm mt-2">カスタマイズ：{profileName}</p></header>
  <div className="rounded-2xl bg-white/10 border border-sky-300/20 p-3 text-center font-bold">自チーム：{side==='top'?'先攻':'後攻'} {current.name||'未設定'}</div>
  {!ready&&<p>試合情報を読み込み中...</p>}
  {ready&&filtered.length===0&&<p className="rounded-xl bg-white/10 p-4">現在の条件に一致する項目がありません。カスタマイズ設定の表示条件をご確認ください。</p>}
  {detailId ? (()=>{
   const currentItem=filtered.find(x=>x.id===detailId);
   if(!currentItem)return <button onClick={()=>setDetailId(null)}>← 一覧に戻る</button>;
   const isKnock=currentItem.kind==='sheetKnock';const isWarm=currentItem.kind==='warmup';const isTriple=isKnock||isWarm;
   const relatedSegments=currentItem.segments.filter(seg=>{const t=seg.condition?.team||'any';return t==='any'||t===side||t===(match.benchSide==='3塁側'?'thirdBase':'firstBase');});
   const parts=isTriple?(['start','notice','end'] as const).map(phase=>({phase,segments:relatedSegments.filter(s=>(s.phase||'start')===phase)})):[];
   return <section className="space-y-4">
    <h2 className="text-2xl font-extrabold text-center">{currentItem.title}</h2>
    {currentItem.timing?.note?.trim()&&<div className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-3 text-amber-950"><div className="text-xs font-bold mb-1">🕒 タイミングのメモ</div><div className="whitespace-pre-wrap">{currentItem.timing.note}</div></div>}
    {isKnock&&renderKnockTimer(currentItem)}
    {isWarm&&renderWarmTimer(currentItem)}
    {(isTriple?parts:[{phase:'other',segments:relatedSegments}]).map(block=><div key={block.phase} className="space-y-3">
      {isTriple&&<h3 className="rounded-xl bg-sky-900/60 px-4 py-3 font-extrabold">{block.phase==='start'?(isWarm?'① 開始アナウンス':'① 準備・開始アナウンス'):block.phase==='notice'?'② 残り時間アナウンス':'③ 終了アナウンス'}</h3>}
      {block.segments.filter(seg=>!(isWarm&&seg.phase==='notice'&&(currentItem.timerSettings?.noticeMinutes??2)===0)).map(seg=>{const html=buildSegment(currentItem,seg);const missing=[...html.matchAll(/【([^】]+)】/g)].map(x=>x[1]);return <div key={seg.id} className="rounded-xl border border-rose-400/60 bg-gradient-to-br from-rose-600/50 to-rose-400/25 p-3 space-y-3">
       <div className="whitespace-pre-line font-semibold leading-9 break-words" dangerouslySetInnerHTML={{__html:html.replace(/\n/g,'<br/>')}}/>
       {!!missing.length&&<p className="text-xs text-amber-200">未設定の差し込み項目：{[...new Set(missing)].join('、')}</p>}
       <div className="grid grid-cols-2 gap-2"><button disabled={!!missing.length||!html.trim()} onClick={()=>void play(currentItem,seg,html)} className="rounded-xl bg-blue-600 py-3 font-bold disabled:opacity-50">🔊 読み上げ</button><button onPointerDown={stopAudio} onClick={stopAudio} className="rounded-xl bg-gray-600 py-3 font-bold">■ 停止</button></div>
      </div>})}
     </div>)}
    <button className="w-full rounded-xl bg-white text-gray-900 py-3 font-bold" onClick={()=>{stopAudio();setDetailId(null)}}>← 一覧に戻る</button>
   </section>;
  })() : filtered.map((item,i)=><button key={item.id} type="button" onClick={()=>{stopAudio();setDetailId(item.id)}} className="w-full rounded-2xl bg-slate-700/65 border border-white/15 p-4 flex items-center gap-3 text-left min-h-20 active:scale-[.99]">
    <span className="bg-sky-500 rounded-full w-9 h-9 shrink-0 flex items-center justify-center font-bold">{i+1}</span>
    <span className="flex-1 min-w-0"><span className="font-bold text-base sm:text-lg block">{item.title}</span>{item.timing?.note?.trim()&&<span className="block mt-1 rounded-lg bg-amber-100 text-amber-950 px-2 py-1 text-sm whitespace-pre-wrap">🕒 {item.timing.note}</span>}</span>
    <span className="text-white/70 text-xl">›</span>
   </button>)}
  {!detailId&&<button onClick={()=>{stopAudio();onBack()}} className="w-full rounded-2xl bg-white text-slate-900 py-4 font-bold">← 試合開始画面に戻る</button>}
  {timerPopup&&(()=>{
   const popupItem=items.find(x=>x.id===timerPopup.itemId);
   if(!popupItem)return null;
   const selected=popupItem.segments.find(seg=>(seg.phase||'start')===timerPopup.phase&&((seg.condition?.team||'any')==='any'||(seg.condition?.team||'any')===side));
   const isNotice=timerPopup.phase==='notice';
   const remainingText=popupItem.kind==='warmup'?(popupItem.timerSettings?.noticeMinutes??2):noticeMinutes;
   const fallback=isNotice?`${popupItem.kind==='warmup'?'ウォーミングアップ':'ノック'}時間、残り${remainingText}分です。`:popupItem.kind==='warmup'?'ウォーミングアップを終了してください。':'ノックを終了してください。';
   const textHtml=selected?buildSegment(popupItem,selected):esc(fallback);
   const unresolved=/【[^】]+】/.test(textHtml);
   return <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/75 px-3 py-5" role="dialog" aria-modal="true" aria-label={isNotice?'残り時間のお知らせ':'タイマー終了のお知らせ'}>
    <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border-2 border-rose-400 bg-rose-700 p-5 sm:p-7 text-white shadow-2xl space-y-4">
     <h2 className="text-xl sm:text-2xl font-extrabold text-center">{isNotice?`⏱ 残り${remainingText}分のお知らせ`:'⏰ 終了のお知らせ'}</h2>
     <p className="text-center font-bold text-sm text-rose-100">{popupItem.title}</p>
     <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-5 text-lg font-semibold leading-loose whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{__html:textHtml.replace(/\n/g,'<br/>')}} />
     {unresolved&&<p className="text-sm text-amber-100">差し込みに必要なデータが未設定です。</p>}
     <div className="grid grid-cols-2 gap-3">
      <button type="button" className="rounded-xl bg-blue-600 py-3 font-bold disabled:opacity-50" disabled={unresolved||!textHtml.trim()} onClick={()=>{if(selected)void play(popupItem,selected,textHtml);else {stopAudio();const n=++session.current;setPlaying('popup');void speak(speakingFromHtml(textHtml)).finally(()=>{if(session.current===n)setPlaying('')});}}}>🔊 読み上げ</button>
      <button type="button" className="rounded-xl bg-slate-600 py-3 font-bold" onPointerDown={stopAudio} onClick={stopAudio}>■ 停止</button>
     </div>
     <button type="button" className="w-full rounded-xl bg-white py-3 text-lg font-extrabold text-rose-800" onClick={()=>{stopAudio();setTimerPopup(null)}}>OK（閉じる）</button>
    </div>
   </div>;
  })()}
 </main></div>
}
