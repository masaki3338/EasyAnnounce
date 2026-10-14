import React, { useEffect, useRef, useState } from "react";
import localForage from "localforage";
import { speak, stop, prefetchTTS } from "./lib/tts";

// 関東連盟：1回目 1塁キャッチボール／3塁トス、2回目は交代。各7分・残り${noticeMinutes}分。
// 既存Warmup.tsxに一切手を加えずリトルシニア専用にする。
type TeamInfo = { name: string; reading: string };
const emptyTeam: TeamInfo = { name: "チーム未登録", reading: "チーム未登録" };
const SETTINGS_KEY = "senior:warmupTimerSettings";
type Phase = 1 | 2;

const Mic = () => <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3zm-7-3h2a5 5 0 0010 0h2a7 7 0 01-6 6.9V20h3v2H8v-2h3v-2.1A7 7 0 015 11z"/></svg>;

function Announcement({ display, spoken, id, active, onSpeak, onStop }: {display:string;spoken:string;id:string;active:string|null;onSpeak:(id:string, text:string)=>void;onStop:()=>void}) {
  return <div className="rounded-2xl p-4 border border-rose-500/80 bg-gradient-to-br from-rose-600/45 to-rose-400/25 shadow-lg">
    <p className="whitespace-pre-wrap text-white font-semibold leading-relaxed">{display}</p>
    <div className="grid grid-cols-2 gap-2 mt-3">
      <button onClick={() => onSpeak(id, spoken)} className={`rounded-lg py-3 text-white font-bold flex items-center justify-center gap-2 ${active === id ? "bg-green-600" : "bg-blue-600"}`}><Mic/> 読み上げ</button>
      <button onClick={onStop} disabled={active !== id} className="rounded-lg py-3 bg-gray-600 text-white font-bold disabled:opacity-40">停止</button>
    </div>
  </div>;
}

function useClock(duration:number, notice:number) {
  const [remaining, setRemaining] = useState(duration);
  const [running, setRunning] = useState(false);
  const [noticeShown, setNoticeShown] = useState(false);
  const [endShown, setEndShown] = useState(false);
  const deadline = useRef<number | null>(null);
  const remainingRef = useRef(duration);
  const last = useRef(duration);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const r = Math.max(0, Math.ceil(((deadline.current ?? Date.now()) - Date.now()) / 1000));
      setRemaining(r); remainingRef.current = r;
      if (last.current > notice && r <= notice && r > 0) setNoticeShown(true);
      if (last.current > 0 && r === 0) { setEndShown(true); setRunning(false); deadline.current = null; }
      last.current = r;
    };
    const timer = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(timer);
  }, [running]);
  return {
    remaining, running, noticeShown, endShown,
    start: () => { deadline.current = Date.now() + remainingRef.current * 1000; last.current = remainingRef.current; setRunning(true); },
    pause: () => { if (deadline.current) { const v = Math.max(0, Math.ceil((deadline.current - Date.now())/1000)); remainingRef.current=v; setRemaining(v); } deadline.current=null; setRunning(false); },
    reset: () => { deadline.current=null; remainingRef.current=duration; last.current=duration; setRemaining(duration); setRunning(false); setNoticeShown(false); setEndShown(false); },
    clearNotice: () => setNoticeShown(false), clearEnd: () => setEndShown(false),
  };
}
const format = (time:number) => `${Math.floor(time/60)}:${String(time%60).padStart(2,"0")}`;

const SeniorWarmup: React.FC<{onBack:()=>void}> = ({onBack}) => {
  const [first,setFirst] = useState<TeamInfo>(emptyTeam);
  const [third,setThird] = useState<TeamInfo>(emptyTeam);
  const [active,setActive] = useState<string|null>(null);
  const session = useRef(0);
  const [warmupMinutes,setWarmupMinutes] = useState(7);
  const [noticeMinutes,setNoticeMinutes] = useState(2);
  const clock1 = useClock(warmupMinutes*60,noticeMinutes*60);
  const clock2 = useClock(warmupMinutes*60,noticeMinutes*60);
  useEffect(()=>{void localForage.getItem<{warmupMinutes:number;noticeMinutes:number}>(SETTINGS_KEY).then(v=>{
    if(!v)return;setWarmupMinutes(Math.max(1,Math.min(30,v.warmupMinutes||7)));
    setNoticeMinutes(Math.max(0,Math.min(30,v.noticeMinutes??2)));
  });},[]);
  const applySettings=async()=>{
    clock1.reset();clock2.reset();
    await localForage.setItem(SETTINGS_KEY,{warmupMinutes,noticeMinutes});
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      const [mi, team, store] = await Promise.all([localForage.getItem<any>("matchInfo"),localForage.getItem<any>("team"),localForage.getItem<any>("teamRegisterStore")]);
      const fromFolder = (id:any) => {
        const folder = store?.teams?.find((t:any)=>String(t.id)===String(id));
        return {name:folder?.team?.name || folder?.teamName || folder?.name || "",reading:folder?.team?.furigana || folder?.team?.nameKana || folder?.furigana || ""};
      };
      let one:TeamInfo, three:TeamInfo;
      if (mi?.announcementMode === "single") {
        const f=fromFolder(mi.firstBaseTeamId), t=fromFolder(mi.thirdBaseTeamId);
        one={name:mi.firstBaseTeamName || f.name || "1塁側チーム",reading:f.reading || mi.firstBaseTeamName || f.name || "1塁側チーム"};
        three={name:mi.thirdBaseTeamName || t.name || "3塁側チーム",reading:t.reading || mi.thirdBaseTeamName || t.name || "3塁側チーム"};
      } else {
        const self={name:team?.name || "自チーム",reading:team?.furigana || team?.nameKana || team?.name || "自チーム"};
        const other={name:mi?.opponentTeam || mi?.opponentTeamName || "相手チーム",reading:mi?.opponentTeamFurigana || mi?.opponentTeam || mi?.opponentTeamName || "相手チーム"};
        one=mi?.benchSide === "3塁側" ? other : self;
        three=mi?.benchSide === "3塁側" ? self : other;
      }
      if (alive) {setFirst(one);setThird(three);}
    })();
    return () => {alive=false; session.current+=1;stop();};
  }, []);
  const say = (id:string,text:string) => {
    stop(); const n=++session.current; setActive(id);
    void speak(text,{progressive:true,cache:true}).finally(()=>{if(session.current===n) setActive(null);});
  };
  const stopVoice=()=>{++session.current;stop();setActive(null);};
  const phases = [
    {n:1 as Phase, clock:clock1, display:`1塁側${first.name}はキャッチボールを、\n3塁側${third.name}はトスバッティングを開始してください。\n時間は${warmupMinutes}分以内です。`,spoken:`1塁側${first.reading}はキャッチボールを、3塁側${third.reading}はトスバッティングを開始してください。時間は${warmupMinutes}分以内です。`},
    {n:2 as Phase, clock:clock2, display:`1塁側${first.name}はトスバッティングを、\n3塁側${third.name}はキャッチボールを開始してください。\n時間は${warmupMinutes}分以内です。`,spoken:`1塁側${first.reading}はトスバッティングを、3塁側${third.reading}はキャッチボールを開始してください。時間は${warmupMinutes}分以内です。`},
  ];
  useEffect(()=>{if(first.name === "チーム未登録" || third.name === "チーム未登録")return; phases.forEach(p=>{void prefetchTTS(p.spoken).catch(()=>{});});},[first,third]);
  const card=(p:typeof phases[number])=><section key={p.n} className="rounded-2xl border border-sky-300/40 bg-sky-400/10 p-4 space-y-3">
    <h2 className="font-bold text-lg">{p.n}回目</h2>
    <Announcement display={p.display} spoken={p.spoken} id={`start${p.n}`} active={active} onSpeak={say} onStop={stopVoice}/>
    <div className="rounded-xl bg-white/10 p-3">
      <p className="text-sm opacity-80">タイマー（{warmupMinutes}分）</p>
      <p className="text-4xl font-black tabular-nums my-2">{format(p.clock.remaining)}</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={p.clock.running?p.clock.pause:p.clock.start} className={`rounded-lg py-3 font-bold ${p.clock.running?"bg-amber-600":"bg-green-600"}`}>{p.clock.running?"一時停止":"START"}</button>
        <button onClick={p.clock.reset} className="bg-gray-600 rounded-lg py-3 font-bold">RESET</button>
      </div>
    </div>
    <Announcement display={`残り時間${noticeMinutes}分です。`} spoken={`残り時間${noticeMinutes}分です。`} id={`manual-notice${p.n}`} active={active} onSpeak={say} onStop={stopVoice}/>
    <Announcement display="終了してください。" spoken="終了してください。" id={`manual-end${p.n}`} active={active} onSpeak={say} onStop={stopVoice}/>
  </section>;
  const modal = (clock:ReturnType<typeof useClock>, id:string, end:boolean) => <div className="fixed inset-0 z-50 bg-black/75 grid place-items-center p-4"><div className="bg-white text-gray-900 rounded-2xl p-5 w-full max-w-sm space-y-3"><h2 className="text-lg font-bold">{end?"ウォーミングアップ終了":"残り時間のお知らせ"}</h2><p className="font-semibold">{end?"終了してください。":`残り時間${noticeMinutes}分です。`}</p><div className="grid grid-cols-2 gap-2"><button className="bg-blue-600 text-white py-3 rounded-lg font-bold" onClick={()=>say(id,end?"終了してください。":`残り時間${noticeMinutes}分です。`)}>🎤 読み上げ</button><button className="bg-gray-600 text-white py-3 rounded-lg font-bold" onClick={stopVoice}>停止</button></div><button className="w-full bg-gray-200 py-3 rounded-lg font-bold" onClick={()=>{stopVoice();end?clock.clearEnd():clock.clearNotice();}}>OK</button></div></div>;
  return <div className="min-h-[100dvh] bg-gradient-to-b from-gray-900 to-gray-800 text-white p-4 sm:p-6" style={{paddingBottom:"max(20px,env(safe-area-inset-bottom))"}}><div className="max-w-2xl mx-auto space-y-4">
    <header className="text-center"><h1 className="text-2xl sm:text-3xl font-extrabold">🏃 ウォーミングアップ</h1><p className="text-sm opacity-80 mt-2">リトルシニア／関東連盟基準</p></header>
    <div className="rounded-2xl border border-amber-300/50 bg-amber-400/10 p-4 text-sm">1塁側・3塁側でキャッチボールとトスバッティングを交代で実施。各{warmupMinutes}分、残り{noticeMinutes}分で案内します。</div>
    <section className="rounded-2xl bg-white/10 border border-white/20 p-4 space-y-3">
      <h2 className="font-bold">タイマー時間設定（1回目・2回目共通）</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">実施時間（分）<input type="number" min={1} max={30} value={warmupMinutes} onChange={e=>setWarmupMinutes(Math.max(1,Math.min(30,Number(e.target.value)||1)))} className="w-full mt-1 bg-white text-gray-900 rounded-lg px-3 py-2" /></label>
        <label className="text-sm">残り時間案内（分）<input type="number" min={0} max={warmupMinutes} value={noticeMinutes} onChange={e=>setNoticeMinutes(Math.max(0,Math.min(warmupMinutes,Number(e.target.value)||0)))} className="w-full mt-1 bg-white text-gray-900 rounded-lg px-3 py-2" /></label>
      </div>
      <button className="bg-blue-600 px-4 py-3 rounded-xl font-bold w-full" onClick={()=>void applySettings()} disabled={clock1.running||clock2.running}>時間設定を反映・保存</button>
      <p className="text-xs text-white/70">時間を変更したら「反映・保存」を押してください。タイマー動作中は変更できません。</p>
    </section>
    {phases.map(card)}
    <button className="w-full py-4 rounded-xl bg-white text-gray-900 font-bold" onClick={()=>{stopVoice();onBack();}}>← 試合前アナウンスに戻る</button>
  </div>
  {clock1.noticeShown && modal(clock1,"noticeModal1",false)}
  {clock1.endShown && modal(clock1,"endModal1",true)}
  {clock2.noticeShown && modal(clock2,"noticeModal2",false)}
  {clock2.endShown && modal(clock2,"endModal2",true)}
  </div>;
};
export default SeniorWarmup;
