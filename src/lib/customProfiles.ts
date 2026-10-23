/** カスタマイズ専用のカスタマイズ設定。既存の連盟保存キーと分離する。 */
export type CustomProfile={id:string;name:string;createdAt:number};
const LIST='easyannounce:custom:profiles:v1';
const ACTIVE='easyannounce:custom:activeProfileId';
const initial:CustomProfile={id:'gakudo-default',name:'学童野球（初期設定）',createdAt:0};
export function getCustomProfiles():CustomProfile[]{
 if(typeof window==='undefined')return [initial];
 try{const parsed=JSON.parse(localStorage.getItem(LIST)||'null');if(Array.isArray(parsed)&&parsed.length)return parsed.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string');}catch{}
 return [initial];
}
export function getActiveCustomProfileId(){if(typeof window==='undefined')return initial.id;const p=getCustomProfiles();const id=localStorage.getItem(ACTIVE);return p.some(x=>x.id===id)?id!:p[0].id;}
export function setActiveCustomProfileId(id:string){if(getCustomProfiles().some(x=>x.id===id))localStorage.setItem(ACTIVE,id);}
export function createCustomProfile(name:string,sourceId?:string):CustomProfile{
 const profiles=getCustomProfiles();const id=`custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
 const next={id,name:name.trim()||'新しいカスタマイズ',createdAt:Date.now()};localStorage.setItem(LIST,JSON.stringify([...profiles,next]));
 if(sourceId){for(const prefix of ['easyannounce:custom:inGame:v1:','easyannounce:custom:preGame:v1:']){const raw=localStorage.getItem(prefix+sourceId);if(raw!==null)localStorage.setItem(prefix+id,raw);}}
 setActiveCustomProfileId(id);return next;
}
export function renameCustomProfile(id:string,name:string){const profiles=getCustomProfiles().map(x=>x.id===id?{...x,name:name.trim()||x.name}:x);localStorage.setItem(LIST,JSON.stringify(profiles));}
export function deleteCustomProfile(id:string){const profiles=getCustomProfiles().filter(x=>x.id!==id);localStorage.setItem(LIST,JSON.stringify(profiles.length?profiles:[initial]));for(const prefix of ['easyannounce:custom:inGame:v1:','easyannounce:custom:preGame:v1:'])localStorage.removeItem(prefix+id);if(getActiveCustomProfileId()===id)setActiveCustomProfileId(getCustomProfiles()[0].id);}
export function exportCustomProfile(id:string){const profile=getCustomProfiles().find(p=>p.id===id);if(!profile)return '';return JSON.stringify({format:'easyannounce-custom-v1',profile,preGame:JSON.parse(localStorage.getItem('easyannounce:custom:preGame:v1:'+id)||'null'),inGame:JSON.parse(localStorage.getItem('easyannounce:custom:inGame:v1:'+id)||'null')},null,2);}

/** ファイルを安全に検証して、全設定を新しいプロファイルとして読み込む。既存設定は上書きしない。 */
export function importCustomProfile(raw:string):CustomProfile{
 const data=JSON.parse(raw);
 if(data?.format!=='easyannounce-custom-v1'||!data.profile||typeof data.profile.name!=='string')throw new Error('Easyアナウンスの設定ファイルではありません');
 if(data.preGame!==null&&data.preGame!==undefined&&!Array.isArray(data.preGame))throw new Error('試合前データの形式が不正です');
 if(data.inGame!==null&&data.inGame!==undefined&&(typeof data.inGame!=='object'||Array.isArray(data.inGame)))throw new Error('試合中データの形式が不正です');
 const profile=createCustomProfile(data.profile.name);
 if(data.preGame!=null)localStorage.setItem('easyannounce:custom:preGame:v1:'+profile.id,JSON.stringify(data.preGame));
 if(data.inGame!=null)localStorage.setItem('easyannounce:custom:inGame:v1:'+profile.id,JSON.stringify(data.inGame));
 return profile;
}
