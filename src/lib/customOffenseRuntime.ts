import { getLeagueMode } from "./leagueSettings";
import { getActiveCustomProfileId } from "./customProfiles";
import { loadCustomInGameTexts, substituteTokens, type StartTimeTiming } from "./customInGameTemplates";

/** カスタマイズモード専用。既存3連盟ではnullを返す。 */
export function customOffenseText(item: string, part: string, vars: Record<string,string>): string | null {
  if (getLeagueMode() !== "custom") return null;
  const settings = loadCustomInGameTexts(getActiveCustomProfileId());
  const source = settings[item]?.[part];
  if (typeof source !== 'string') return null;
  return substituteTokens(escapeHtml(source), vars);
}
function escapeHtml(value:unknown):string {return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function ruby(value:unknown, kana:unknown) {const name=escapeHtml(value);const reading=escapeHtml(kana);return reading?`<ruby>${name}<rt>${reading}</rt></ruby>`:name;}
export function customPlayerVars(player:any,prefix='選手名'):Record<string,string> {
  const last=ruby(player?.lastName,player?.lastNameKana);
  const first=ruby(player?.firstName,player?.firstNameKana);
  return { [`${prefix}（苗字）`]:last,[`${prefix}（フルネーム）`]:last+(first?'、'+first:''),[prefix]:last };
}
export function customBatterHtml(args:{player:any;index:number;position:string;inning:number;isTop:boolean;isLeading:boolean;isChecked:boolean;teamName:string}):string|null {
  const {player,index,position,inning,isTop,isLeading,isChecked,teamName}=args;
  const vars={...customPlayerVars(player),'敬称':player?.isFemale?'さん':'くん','打順':String(index+1),'守備位置':position,'背番号':String(player?.number??''),'回':String(inning),'表裏':isTop?'表':'裏','チーム名':escapeHtml(teamName)};
  // 回の先頭は通常紹介より優先。未設定なら従来どおりの本文へフォールバック。
  const main=customOffenseText('batter',isChecked?'later':'first',vars);
  const heading=isLeading?customOffenseText('batter','leadoff',vars):null;
  if(main===null&&heading===null)return null;
  return [heading,main].filter(Boolean).join('\n').replace(/\n/g,'<br />');
}
export function customIntentionalWalkHtml(batter:any, fallback:string):string {
  const vars={...customPlayerVars(batter),'敬称':batter?.isFemale?'さん':'くん','チーム名':''};
  const text=customOffenseText('intentionalWalk','main',vars);
  return text===null?fallback:text;
}

/** 試合開始時刻のカスタマイズ設定（既存3リーグには影響なし）。 */
export function customStartTimeTiming():StartTimeTiming|null {
 if(getLeagueMode()!=='custom')return null;
 const v=loadCustomInGameTexts(getActiveCustomProfileId()).startTime?.timing;
 return v==='afterFirstPitch'||v==='beforeSecondBatter'||v==='afterTopFirst'||v==='afterBottomFirst'?v:'afterFirstPitch';
}
export function customStartTimeMessage(value:string):string|null {
 return customOffenseText('startTime','main',{'開始時刻':value});
}

/** 得点アナウンス。0点時の初期設定は読み上げなし。 */
export function customScoreEnabledWhenZero(): boolean {
  if (getLeagueMode() !== 'custom') return false;
  return loadCustomInGameTexts(getActiveCustomProfileId()).score?.noScoreEnabled === 'true';
}
export function customScoreAnnouncement(args: { score:number; inning:number; isTop:boolean; teamName:string }):string|null {
  return customOffenseText('score', args.score > 0 ? 'scored' : 'noScore', {
    '回':String(args.inning), '表裏':args.isTop?'表':'裏',
    'チーム名':args.teamName, '得点':String(args.score)
  });
}

/** カスタマイズ中の各放送文に添える表示専用メモ。読み上げ音声には渡さない。 */
export function customAnnouncementMemo(item:string,part:string,vars:Record<string,string>={}):string {
 if(getLeagueMode()!=='custom')return '';
 const itemData=loadCustomInGameTexts(getActiveCustomProfileId())[item];
 const memo=String(itemData?.[`memo:${part}`]??'');
 return substituteTokens(memo,vars).trim();
}
