/** カスタマイズモード専用。既存リーグの保存キー／画面は変更しない。 */
export type AnnounceCategory = 'offense' | 'defense' | 'other';
export type TemplatePart = { id: string; label: string; text: string; tokens: string[] };
export type AnnounceItem = { id: string; label: string; category: AnnounceCategory; parts: TemplatePart[] };
const p = (id:string,label:string,text:string,tokens:string[]=[]):TemplatePart=>({id,label,text,tokens});
export const CUSTOM_IN_GAME_ITEMS:AnnounceItem[] = [
 {id:'startTime',label:'試合開始時刻の放送',category:'offense',parts:[p('main','読み上げ文章','この試合の 試合開始時刻は 【開始時刻】です。',['開始時刻','先攻チーム名','後攻チーム名'])]},
 {id:'batter',label:'打者紹介',category:'offense',parts:[p('leadoff','回の先頭打者','【回】回の【表裏】、【チーム名】の攻撃は、',['回','表裏','打順','守備位置','選手名（苗字）','選手名（フルネーム）','敬称','背番号','チーム名','回','表裏']),p('first','初回','【打順】番、【守備位置】、【選手名（苗字）】【敬称】。背番号【背番号】。',['打順','守備位置','選手名（苗字）','選手名（フルネーム）','敬称','背番号','チーム名','回','表裏']),p('later','2回目以降','【打順】番、【守備位置】、【選手名（苗字）】【敬称】。',['打順','守備位置','選手名（苗字）','選手名（フルネーム）','敬称','背番号','チーム名','回','表裏'])]},
 {id:'score',label:'得点',category:'offense',parts:[p('scored','得点時','【チーム名】の得点は、【得点】点です。',['回','表裏','チーム名','得点']),p('noScore','無得点時','【チーム名】の得点は、無得点です。',['回','表裏','チーム名','得点'])]},
 {id:'foul',label:'ファウルボールの注意',category:'offense',parts:[p('main','注意放送','ファウルボールの行方には、十分ご注意ください。')]},
 {id:'pinchHitter',label:'代打',category:'offense',parts:[p('leadoff','回の先頭打者','【回】回の【表裏】、先頭打者に代打を送ります。【交代前選手名（苗字）】【交代前敬称】に代わりまして、【交代後選手名（苗字）】【交代後敬称】。',['回','表裏','打順','交代前選手名（苗字）','交代前選手名（フルネーム）','交代前敬称','交代後選手名（苗字）','交代後選手名（フルネーム）','交代後敬称','交代後背番号','チーム名','回','表裏']),p('main','代打の案内','【回】回の【表裏】、【交代前選手名（苗字）】【交代前敬称】に代わりまして、\n【交代後選手名（苗字）】【交代後敬称】。',['打順','交代前選手名（苗字）','交代前選手名（フルネーム）','交代前敬称','交代後選手名（苗字）','交代後選手名（フルネーム）','交代後敬称','交代後背番号','チーム名','回','表裏'])]},
 {id:'pinchRunner',label:'代走',category:'offense',parts:[p('main','代走の案内','【交代前選手名（苗字）】【交代前敬称】に代わりまして、代走、【交代後選手名（苗字）】【交代後敬称】、背番号【交代後背番号】。',['交代前選手名（苗字）','交代前選手名（フルネーム）','交代前敬称','交代後選手名（苗字）','交代後選手名（フルネーム）','交代後敬称','交代後背番号','チーム名','1,2,3塁','ファースト,セカンド,サード'])]},
 {id:'courtesyRunner',label:'臨時代走',category:'offense',parts:[p('main','臨時代走の案内','臨時代走、【交代後選手名（苗字）】【交代後敬称】、背番号【交代後背番号】。',['交代後選手名（苗字）','交代後選手名（フルネーム）','交代後敬称','交代後背番号','交代前選手名（苗字）','交代前選手名（フルネーム）'])]},
 {id:'intentionalWalk',label:'申告敬遠',category:'offense',parts:[p('main','申告敬遠の案内','申告敬遠により、打者は一塁へ進みます。',['選手名（苗字）','選手名（フルネーム）','敬称','チーム名'])]},
 {id:'offenseReentry',label:'代打・代走でのリエントリー',category:'offense',parts:[p('main','リエントリーの案内','【打順】番 【交代前選手名（苗字）】【交代前敬称】に代わりまして【交代後選手名（苗字）】【交代後敬称】がリエントリーで戻ります。\nバッターは【交代後選手名（苗字）】【交代後敬称】。',['回','表裏','打順','交代前選手名（苗字）','交代前選手名（フルネーム）','交代前敬称','交代後選手名（苗字）','交代後選手名（フルネーム）','交代後敬称','交代後背番号','チーム名'])]},
 {id:'pitchCount',label:'投球数の放送',category:'defense',parts:[
 p('inningEnd','守備回終了時（合計投球数あり）','ただいまの回、【投手名（苗字）】【敬称】の投球数は【この回の投球数】球、合計【合計投球数】球です。',['投手名（苗字）','投手名（フルネーム）','敬称','この回の投球数','合計投球数','回','表裏']),
 p('inningEndNoTotal','守備回終了時（合計投球数なし）','ただいまの回、【投手名（苗字）】【敬称】の投球数は【この回の投球数】球です。',['投手名（苗字）','投手名（フルネーム）','敬称','この回の投球数','回','表裏']),
 p('limitAdvance','投球数・事前お知らせ','【投手名（苗字）】【敬称】の投球数は【合計投球数】球、残り10球です。',['投手名（苗字）','投手名（フルネーム）','敬称','合計投球数','投球上限']),
 p('limit','投球数・到達時','【投手名（苗字）】【敬称】の投球数が【投球上限】球に達しました。',['投手名（苗字）','投手名（フルネーム）','敬称','合計投球数','投球上限'])
 ]},
 {id:'defenseChange',label:'守備・選手交代',category:'defense',parts:[
 p('introPlayer','① 開始文：選手交代のみ','【チーム名】、選手の交代をお知らせいたします。',['チーム名']),
 p('introPosition','① 開始文：守備変更のみ','【チーム名】、シートの変更をお知らせいたします。',['チーム名']),
 p('introBoth','① 開始文：選手交代＋守備変更','【チーム名】、選手の交代並びにシートの変更をお知らせいたします。',['チーム名']),
 p('newPlayerSame','② 新しく出場する選手(同じ守備位置)','【交代前・守備位置】【交代前・選手名（苗字）】【交代前・敬称】に代わりまして【交代後・選手名（苗字）】【交代後・敬称】が入ります。',['交代前・守備位置','交代前・選手名（苗字）','交代前・選手名（フルネーム）','交代前・敬称','交代後・選手名（苗字）','交代後・選手名（フルネーム）','交代後・敬称','交代後・守備位置','交代後・背番号','交代前打順']),
 p('newPlayerDifferent','③ 新しく出場する選手(違う守備位置)','【交代前・守備位置】【交代前・選手名（苗字）】【交代前・敬称】に代わりまして【交代前打順】に【交代後・選手名（苗字）】【交代後・敬称】が入り　【交代後・守備位置】　へ',['交代前・守備位置','交代前・選手名（苗字）','交代前・選手名（フルネーム）','交代前・敬称','交代後・選手名（苗字）','交代後・選手名（フルネーム）','交代後・敬称','交代後・守備位置','交代後・背番号','交代前打順']),
 p('positionMove','③ 既存選手の守備移動','【移動前・守備位置】の【移動・選手名（苗字）】【移動・敬称】が【移動後・守備位置】に',['移動前・守備位置','移動・選手名（苗字）','移動・選手名（フルネーム）','移動・敬称','移動後・守備位置','交代前打順']),
 // 代打・代走から守備へ入る場面は、同じ選手が守備に残るか別選手へ交代するかで分ける。
 p('pinchHitStay','④ 代打からの守備交代：そのまま入る','先ほど代打いたしました【交代後・選手名（苗字）】【交代後・敬称】がそのまま【交代後・守備位置】に',['交代後・選手名（苗字）','交代後・選手名（フルネーム）','交代後・敬称','交代後・守備位置','交代後・背番号','交代前打順']),
 p('pinchHitReplace','⑤ 代打からの守備交代：選手交代','先ほど代打いたしました【交代前・選手名（苗字）】【交代前・敬称】に代わりまして、【交代後・選手名（苗字）】【交代後・敬称】が【交代後・守備位置】に',['交代前・選手名（苗字）','交代前・選手名（フルネーム）','交代前・敬称','交代後・選手名（苗字）','交代後・選手名（フルネーム）','交代後・敬称','交代後・守備位置','交代後・背番号','交代前打順']),
 p('pinchRunStay','⑥ 代走からの守備交代：そのまま入る','先ほど代走いたしました【交代後・選手名（苗字）】【交代後・敬称】がそのまま【交代後・守備位置】に',['交代後・選手名（苗字）','交代後・選手名（フルネーム）','交代後・敬称','交代後・守備位置','交代後・背番号','交代前打順']),
 p('pinchRunReplace','⑦ 代走からの守備交代：選手交代','先ほど代走いたしました【交代前・選手名（苗字）】【交代前・敬称】に代わりまして、【交代後・選手名（苗字）】【交代後・敬称】が【交代後・守備位置】に',['交代前・選手名（苗字）','交代前・選手名（フルネーム）','交代前・敬称','交代後・選手名（苗字）','交代後・選手名（フルネーム）','交代後・敬称','交代後・守備位置','交代後・背番号','交代前打順']),
 p('reentryFromPinch','⑧ 代打／代走からの守備リエントリー','先ほど代打（代走）いたしました【交代前・選手名（苗字）】【交代前・敬称】に代わりまして【交代後・選手名（苗字）】【交代後・敬称】がリエントリーで【交代後・守備位置】に入ります。',['交代前・選手名（苗字）','交代前・選手名（フルネーム）','交代前・敬称','交代後・選手名（苗字）','交代後・選手名（フルネーム）','交代後・敬称','交代後・守備位置','交代前打順']),
 p('reentryFromDefense','⑨ 守備からのリエントリー','【交代前・選手名（苗字）】【交代前・敬称】に代わりまして【交代後・選手名（苗字）】【交代後・敬称】がリエントリーで【交代後・守備位置】に入ります。',['交代前・選手名（苗字）','交代前・選手名（フルネーム）','交代前・敬称','交代後・選手名（苗字）','交代後・選手名（フルネーム）','交代後・敬称','交代後・守備位置','交代前打順']),
 p('middle','⑧ 途中の接続文','入り、'),p('last','⑨ 最後の接続文','入ります。'),
 p('battingIntro','⑩ 打順紹介の開始文','続きまして、変更後の打順をお知らせいたします。'),
 p('battingRow','⑪ 打順紹介（選手ごと）','【打順】番、【守備位置】、【選手名（苗字）】【敬称】、背番号【背番号】。',['打順','守備位置','選手名（苗字）','選手名（フルネーム）','敬称','背番号']),
 p('outro','⑫ 終了文','以上のように代わります。')
 ]},
 {id:'gameEnd',label:'試合終了',category:'other',parts:[p('main','試合終了の案内','ただいまをもちまして、【先攻チーム名】対【後攻チーム名】の試合は終了いたしました。',['先攻チーム名','後攻チーム名','先攻得点','後攻得点','勝利チーム名','終了時刻'])]},
 {id:'injuryPause',label:'試合中断（治療）',category:'other',parts:[p('pause','中断時','選手の治療のため、試合を一時中断いたします。'),p('resume','再開時','試合を再開いたします。中断時間は【中断時間】分です。',['中断時間'])]},
 {id:'ground',label:'グラウンド整備',category:'other',parts:[p('start','開始','これよりグラウンド整備を行います。'),p('end','終了','グラウンド整備、有難うございました。')]},
 {id:'water',label:'給水タイム',category:'other',parts:[p('start','開始','これより【給水時間】分間の給水タイムに入ります。',['給水時間']),p('end','終了','給水タイムを終了いたします。')]},
 {id:'tieBreak',label:'タイブレーク',category:'other',parts:[p('main','開始案内','【回（現在）】回より、タイブレーク方式で試合を行います。',['回（現在）','回（前の回）','アウト数','走者情報'])]},
 {id:'suspendedGame',label:'継続試合',category:'other',parts:[p('pause','継続試合の案内','本日の試合はここで中断し、継続試合といたします。')]},
 {id:'heat',label:'熱中症',category:'other',parts:[p('notice','注意喚起','熱中症予防のため、こまめな水分補給をお願いいたします。')]}
];
/** 旧保存データの変数を攻撃画面のみ移行する（守備画面は変更しない）。 */
export function migrateOffenseTokens(itemId:string,text:string):string {
 if(!['batter','pinchHitter','pinchRunner','courtesyRunner','intentionalWalk'].includes(itemId))return text;
 return text.replace(/【(交代前選手名|交代後選手名|選手名)】/g,(_match,name)=>`【${name}（苗字）】`);
}
/** 旧設定の【投手名】は従来と同じ苗字指定として引き継ぐ。 */
export function migratePitchTokens(itemId:string,text:string):string {
 return itemId==='pitchCount'?text.replace(/【投手名】/g,'【投手名（苗字）】'):text;
}
/** 従来のタイブレーク【回】は現在の回として扱う（既存編集文は保持）。 */
export function migrateTieBreakTokens(itemId:string,text:string):string {
 return itemId==='tieBreak'?text.replace(/【回】/g,'【回（現在）】'):text;
}
export type StartTimeTiming='afterFirstPitch'|'beforeSecondBatter'|'afterTopFirst'|'afterBottomFirst';
export const START_TIME_TIMINGS:{value:StartTimeTiming;label:string}[]=[
 {value:'afterFirstPitch',label:'1球投球後'},
 {value:'beforeSecondBatter',label:'2人目の打者の前'},
 {value:'afterTopFirst',label:'1回表終了後'},
 {value:'afterBottomFirst',label:'1回裏終了後'}
];
export type CustomInGameTexts = Record<string,Record<string,string>>;
export const initialCustomInGameTexts=():CustomInGameTexts=>Object.fromEntries(CUSTOM_IN_GAME_ITEMS.map(x=>[x.id,Object.fromEntries([...x.parts.map(t=>[t.id,t.text]),...(x.id==='startTime'?[['timing','afterFirstPitch']]:[]),...(x.id==='score'?[['noScoreEnabled','false']]:[])] )]));
const storageKey = (profileId:string) => `easyannounce:custom:inGame:v1:${profileId}`;
/** 旧版のリエントリー・守備交代の差し込み記号を新表記へ引き継ぐ。 */
export function migrateReentryNameTokens(itemId:string, value:string):string {
 if(itemId==='offenseReentry')return value
  .replace(/【交代前・選手名】/g,'【交代前選手名（苗字）】')
  .replace(/【交代後・選手名】/g,'【交代後選手名（苗字）】')
  .replace(/【交代前・敬称】/g,'【交代前敬称】')
  .replace(/【交代後・敬称】/g,'【交代後敬称】');
 if(itemId==='defenseChange')return value.replace(/【(交代前・選手名|交代後・選手名|移動・選手名|選手名)】/g,(_m,n)=>`【${n}（苗字）】`);
 return value;
}
export function loadCustomInGameTexts(profileId:string):CustomInGameTexts {
 const base=initialCustomInGameTexts();
 if(typeof window==='undefined')return base;
 try{const raw=localStorage.getItem(storageKey(profileId));if(!raw)return base;const obj=JSON.parse(raw);if(!obj||typeof obj!=='object')return base;
  for(const def of CUSTOM_IN_GAME_ITEMS){for(const part of def.parts){const t=obj?.[def.id]?.[part.id];if(typeof t==='string')base[def.id][part.id]= def.id==='startTime'&&part.id==='main'&&t==='この試合の 試合開始時刻は、【開始時刻】です。'?'この試合の 試合開始時刻は 【開始時刻】です。':migrateReentryNameTokens(def.id,migrateTieBreakTokens(def.id,migratePitchTokens(def.id,migrateOffenseTokens(def.id,t))));} if(def.id==='defenseChange'&&typeof obj?.defenseChange?.intro==='string'&&typeof obj?.defenseChange?.introPlayer!=='string')base.defenseChange.introPlayer=obj.defenseChange.intro;
  for(const part of def.parts){const m=obj?.[def.id]?.[customInGameMemoKey(part.id)];if(typeof m==='string')base[def.id][customInGameMemoKey(part.id)]=m;} if(def.id==='startTime'&&START_TIME_TIMINGS.some(x=>x.value===obj?.startTime?.timing))base.startTime.timing=obj.startTime.timing; if(def.id==='score'&&['true','false'].includes(obj?.score?.noScoreEnabled))base.score.noScoreEnabled=obj.score.noScoreEnabled;} return base;
 }catch{return base;}
}
export function saveCustomInGameTexts(profileId:string,texts:CustomInGameTexts){if(typeof window!=='undefined')localStorage.setItem(storageKey(profileId),JSON.stringify(texts));}
/** 読み上げメモは音声へ送らず、表示だけに使用する。各読み上げ文章ごとに保持。 */
export const customInGameMemoKey = (partId:string) => `memo:${partId}`;
/** 実際の試合画面でもこの変数置換規則を共通利用できる。*/
export const TOKEN_PATTERN=/【([^】]+)】/g;
export function unknownTokens(text:string,allowed:string[]){return Array.from(text.matchAll(TOKEN_PATTERN)).map(m=>m[1]).filter(t=>!allowed.includes(t));}
export function substituteTokens(text:string,data:Record<string,string>){return text.replace(TOKEN_PATTERN,(whole,token)=>Object.prototype.hasOwnProperty.call(data,token)?data[token]:whole);}
/** 守備交代は新規出場→既存守備移動→打順→終了で組み立てる。 */
export function buildDefenseChangeText(parts:Record<string,string>,args:{introVars:Record<string,string>;newPlayers:Record<string,string>[];positionMoves:Record<string,string>[];battingRows:Record<string,string>[];includeBatting?:boolean;includeOutro?:boolean;extraSegments?:string[];orderedChanges?:Array<{kind:"new"|"move";vars:Record<string,string>}>}){
 const renderNew=(v:Record<string,string>)=>substituteTokens((v['交代前・守備位置']===v['交代後・守備位置'] ? parts.newPlayerSame : parts.newPlayerDifferent) || parts.newPlayer || '',v);
 // カスタマイズ専用：同じ選手が同じ位置に移動する案内は一度だけ出す。
 // 交代記録の選手ID・移動前位置が違っていても、表示内容が同じなら重複扱い。
 // 後ろの案内を残すことで、途中/最後の接続文が正しく付き直される。
 const changesWithVars: Array<{kind:'new'|'move';vars:Record<string,string>}> =
  args.orderedChanges ?? [
   ...args.newPlayers.map(vars=>({kind:'new' as const,vars})),
   ...args.positionMoves.map(vars=>({kind:'move' as const,vars}))
  ];
 const normalizeName=(name:string)=>String(name??'')
  .replace(/<rt>[^<]*<\/rt>/g,'').replace(/<[^>]+>/g,'').replace(/\s+/g,'').trim();
 const seenMoveNames=new Set<string>();
 const uniqueChanges=changesWithVars.filter((change,index)=>{
  if(change.kind!=='move')return true;
  const name=normalizeName(change.vars['移動・選手名']||'');
  const toPos=String(change.vars['移動後・守備位置']||'').trim();
  if(!name||!toPos)return true;
  const key=`${name}=>${toPos}`;
  // 最後に現れた同じ移動を採用。最終文末の接続文も正常に付ける。
  if(changesWithVars.slice(index+1).some(next=>next.kind==='move' &&
   normalizeName(next.vars['移動・選手名']||'')===name &&
   String(next.vars['移動後・守備位置']||'').trim()===toPos))return false;
  if(seenMoveNames.has(key))return false;
  seenMoveNames.add(key);
  return true;
 });
 const ordered=uniqueChanges.map(c=>c.kind==='new'?renderNew(c.vars):substituteTokens(parts.positionMove||'',c.vars));
 const chunks=[...(args.extraSegments||[]),...ordered];
 // 最後の接続文の直前に句読点が残っている場合は取り除く。
 // 例：「セカンド、」＋「に入ります。」→「セカンドに入ります。」
 // 途中の接続文は従来の句読点を維持する。
 const changes=chunks.map((s,i)=>{
  const isLast=i===chunks.length-1;
  const connector=String(isLast?parts.last??'':parts.middle??'');
  // 文末が完結形で、後ろに変更が続くときは、動詞を連用形にして自然につなぐ。
  // 「入ります→入り、」「になります→になり、」「に代わります→に代わり、」など。
  // 最後の選手の完成文や、ユーザーが設定した本文の途中の語句は変更しない。
  const completed = /[。.!！]\s*$/.test(s);
  if (!isLast && completed) {
   const endings: Array<[RegExp,string]> = [
    [/に代わります[。.!！]\s*$/, 'に代わり'],
    [/になります[。.!！]\s*$/, 'になり'],
    [/に入ります[。.!！]\s*$/, 'に入り'],
    [/が入ります[。.!！]\s*$/, 'が入り'],
    [/入ります[。.!！]\s*$/, '入り'],
    [/に移ります[。.!！]\s*$/, 'に移り'],
    [/に戻ります[。.!！]\s*$/, 'に戻り'],
    [/へ移動します[。.!！]\s*$/, 'へ移動し'],
    [/移動します[。.!！]\s*$/, '移動し'],
    [/変更します[。.!！]\s*$/, '変更し'],
    [/交代します[。.!！]\s*$/, '交代し'],
    [/出場します[。.!！]\s*$/, '出場し'],
    [/担当します[。.!！]\s*$/, '担当し'],
    [/守ります[。.!！]\s*$/, '守り'],
    [/に就きます[。.!！]\s*$/, 'に就き'],
    [/につきます[。.!！]\s*$/, 'につき'],
    [/に入って[。.!！]\s*$/, 'に入り'],
   ];
   const ending = endings.find(([pattern]) => pattern.test(s));
   if (ending) {
    const [pattern, continuation] = ending;
    const middle = connector.trim();
    // 途中の接続文の既定値「入り、」は「になります」などに重ねず、
    // 文章側の動詞の連用形を優先する。
    const isDefaultJoin = !middle || /^[、，,。．.]+$/.test(middle) || /^(?:が)?(?:入り|入って)[、，,。．.]*$/.test(middle);
    const suffix = isDefaultJoin
      ? (middle.match(/[、，,]/)?.[0] || '、')
      : middle.replace(/^[、，,。．.]+/, '');
    return s.replace(pattern, continuation + suffix);
   }
   return s + '\n';
  }
  if (completed) return s;
  if(!isLast)return s+connector;
  const body=s.replace(/[、。，．,.]+\s*$/u,'').trimEnd();
  let tail=connector.replace(/^\s*[、。，．,.]+/u,'');
  // 『が入り センター へ』で文末になる場合は『が入りセンター。』とする。
  // 最後の接続文『入ります。』を付けず、守備位置の後の『へ』も取り除く。
  if(/が入り\s*[^。！？、，,]+\s*へ\s*$/.test(body) && /^(?:に)?入ります[。.!！]?\s*$/.test(tail)) {
   return body.replace(/\s*へ\s*$/,'').replace(/(が入り)\s+/,'$1').replace(/\s+/g,'')+'。';
  }
  // 文末が「に入り」「に入って」で、最後の接続文が「に入ります。」なら
  // 同じ動作を二度読ませず、最後の接続文だけを残す。
  // 例：セカンドに入り＋に入ります。→セカンドに入ります。
  //     ショートに入って＋に入ります。→ショートに入ります。
  if (/に(?:入り|入って)\s*$/.test(body) && /^に入ります(?:[。.!！])?\s*$/.test(tail)) {
   return body.replace(/に(?:入り|入って)\s*$/, '') + tail;
  }
  // 別のテンプレートにもともと『へ』があれば『へに入ります』を回避する。
  if(/へ$/.test(body))tail=tail.replace(/^に(?=入ります)/,'');
  return body+tail;
 }).join('');
 const batting=args.includeBatting!==false&&args.battingRows.length?[parts.battingIntro,...args.battingRows.map(v=>substituteTokens(parts.battingRow||'',v))].filter(Boolean).join('\n'):'';
 const newCount=args.newPlayers.length, movedCount=args.positionMoves.length;
 const hasDifferentPosition=args.newPlayers.some(v=>v['交代前・守備位置']!==v['交代後・守備位置']);
 const introId=newCount>0&&(movedCount>0||hasDifferentPosition)?'introBoth':newCount>0?'introPlayer':'introPosition';
 const intro=parts[introId]??parts.intro??'';
 // 文節の連結で読点が重なった場合は、設定プレビュー・実画面共通で1個にする。
 return [substituteTokens(intro,args.introVars),changes,batting,args.includeOutro!==false?parts.outro:''].filter(Boolean).join('\n').replace(/、(?:\s*、)+/g,'、');
}
