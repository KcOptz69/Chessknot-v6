// Per-tab match preferences survive reload without affecting the other player.
export function readMatchNotice<T>(key:string,fallback:T):T{try{const value=sessionStorage.getItem('chessknot-notice:'+key);return value===null?fallback:JSON.parse(value);}catch{return fallback;}}
export function writeMatchNotice(key:string,value:unknown){try{sessionStorage.setItem('chessknot-notice:'+key,JSON.stringify(value));}catch{/* Storage may be disabled. */}}
