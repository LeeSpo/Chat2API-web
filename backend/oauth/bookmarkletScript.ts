import type { ProviderType } from './types'
import { deepseekBookmarklet } from '../providers/deepseek/bookmarklet'
import { glmBookmarklet } from '../providers/glm/bookmarklet'
import { kimiBookmarklet } from '../providers/kimi/bookmarklet'
import { minimaxBookmarklet } from '../providers/minimax/bookmarklet'
import { mimoBookmarklet } from '../providers/mimo/bookmarklet'
import { perplexityBookmarklet } from '../providers/perplexity/bookmarklet'
import { qwenBookmarklet } from '../providers/qwen/bookmarklet'
import { zaiBookmarklet } from '../providers/zai/bookmarklet'

export interface ProviderTokenSpec {
  storageType: 'localStorage' | 'cookie'
  tokenKey: string
  tokenField?: string
  extras?: Array<{
    sourceKey: string
    storageType?: 'localStorage' | 'cookie'
    field: string
    required?: boolean
  }>
  originLabel: string
  expectedOrigin?: string
}

export const PROVIDER_TOKEN_SPECS: Record<ProviderType, ProviderTokenSpec> = {
  deepseek: deepseekBookmarklet,
  glm: glmBookmarklet,
  kimi: kimiBookmarklet,
  minimax: minimaxBookmarklet,
  qwen: qwenBookmarklet,
  'qwen-ai': {
    storageType: 'localStorage',
    tokenKey: 'token',
    tokenField: 'token',
    extras: [
      { sourceKey: '*', storageType: 'cookie', field: 'cookies' },
    ],
    originLabel: 'Qwen Chat',
    expectedOrigin: 'https://chat.qwen.ai',
  },
  zai: zaiBookmarklet,
  mimo: mimoBookmarklet,
  perplexity: perplexityBookmarklet,
}

export function getTokenSpec(providerType: ProviderType): ProviderTokenSpec | undefined {
  return PROVIDER_TOKEN_SPECS[providerType]
}

export interface BookmarkletBuildOptions {
  ticket: string
  ingestUrl: string
  providerType: ProviderType
  spec: ProviderTokenSpec
}

export function buildBookmarkletSource(opts: BookmarkletBuildOptions): string {
  const config = {
    ticket: opts.ticket,
    ingestUrl: opts.ingestUrl,
    providerType: opts.providerType,
    storageType: opts.spec.storageType,
    tokenKey: opts.spec.tokenKey,
    tokenField: opts.spec.tokenField || 'token',
    originLabel: opts.spec.originLabel,
    extras: opts.spec.extras || [],
  }

  const configLiteral = JSON.stringify(config).replace(/<\//g, '<\\/')

  const body = [
    '(function(){',
    'var CFG=' + configLiteral + ';',
    'function readCookie(name){',
    '  var m=document.cookie.match(new RegExp("(?:^|; )"+name.replace(/[.$?*|{}()\\[\\]\\\\\\/\\+\\^]/g,"\\\\$&")+"=([^;]*)"));',
    '  return m?decodeURIComponent(m[1]):null;',
    '}',
    'function read(storage,key){',
    '  try{',
    '    if(key==="*")return document.cookie;',
    '    if(storage==="cookie")return readCookie(key);',
    '    return window.localStorage.getItem(key);',
    '  }catch(e){return null;}',
    '}',
    'var primary=read(CFG.storageType,CFG.tokenKey);',
    'if(!primary){',
    '  alert("Chat2API: could not find "+CFG.tokenKey+" in "+CFG.storageType+" for "+CFG.originLabel+".\\n\\nMake sure you are logged in on this page first.");',
    '  return;',
    '}',
    'var payload={ticket:CFG.ticket,providerType:CFG.providerType,credentials:{}};',
    'payload.credentials[CFG.tokenField]=primary;',
    'for(var i=0;i<CFG.extras.length;i++){',
    '  var ex=CFG.extras[i];',
    '  var v=read(ex.storageType||CFG.storageType,ex.sourceKey);',
    '  if(!v&&ex.required){',
    '    alert("Chat2API: missing "+ex.sourceKey+" in "+(ex.storageType||CFG.storageType)+" for "+CFG.originLabel+".");',
    '    return;',
    '  }',
    '  if(v)payload.credentials[ex.field]=v;',
    '}',
    'fetch(CFG.ingestUrl,{',
    '  method:"POST",',
    '  mode:"cors",',
    '  credentials:"omit",',
    '  headers:{"Content-Type":"application/json"},',
    '  body:JSON.stringify(payload)',
    '}).then(function(r){return r.json().then(function(j){return{ok:r.ok,body:j};});})',
    '.then(function(res){',
    '  if(res.ok&&res.body&&res.body.success){',
    '    alert("Chat2API: token sent. You can switch back to the Chat2API tab.");',
    '  }else{',
    '    var msg=(res.body&&res.body.error&&res.body.error.message)||"Chat2API rejected the token.";',
    '    alert("Chat2API: "+msg);',
    '  }',
    '}).catch(function(err){',
    '  alert("Chat2API: network error - "+(err&&err.message?err.message:err));',
    '});',
    '})();',
  ].join('')

  return body
}

export function buildBookmarkletHref(opts: BookmarkletBuildOptions): string {
  return 'javascript:' + encodeURI(buildBookmarkletSource(opts))
}
