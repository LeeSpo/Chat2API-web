import type { ProviderType } from './types'
import { deepseekBookmarklet } from '../providers/deepseek/bookmarklet'
import { glmBookmarklet } from '../providers/glm/bookmarklet'
import { kimiBookmarklet } from '../providers/kimi/bookmarklet'
import { minimaxBookmarklet } from '../providers/minimax/bookmarklet'
import { mimoBookmarklet } from '../providers/mimo/bookmarklet'
import { perplexityBookmarklet } from '../providers/perplexity/bookmarklet'
import { qwenBookmarklet } from '../providers/qwen/bookmarklet'
import { zaiBookmarklet } from '../providers/zai/bookmarklet'
import { qwenAiBookmarklet } from '../providers/qwen-ai/bookmarklet'

export interface ProviderTokenSpec {
  storageType: 'localStorage' | 'cookie' | 'runtime'
  tokenKey: string
  tokenField?: string
  /** How the stored primary value should be converted before it is sent. */
  valueEncoding?: 'raw' | 'json-value-or-raw'
  extras?: Array<{
    sourceKey: string
    storageType?: 'localStorage' | 'cookie' | 'runtime'
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
  'qwen-ai': qwenAiBookmarklet,
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
    valueEncoding: opts.spec.valueEncoding || 'raw',
    originLabel: opts.spec.originLabel,
    extras: opts.spec.extras || [],
  }

  const configLiteral = JSON.stringify(config).replace(/<\//g, '<\\/')

  const body = [
    '(function(){',
    'var CFG=' + configLiteral + ';',
    'function bridgePost(url,body){',
    '  return fetch(url,{method:"POST",mode:"cors",credentials:"omit",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});',
    '}',
    'function bridgeBase64(bytes){',
    '  var binary="";var step=32768;',
    '  for(var i=0;i<bytes.length;i+=step)binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+step,bytes.length)));',
    '  return btoa(binary);',
    '}',
    'function startQwenBridge(info){',
    '  if(!info||!info.token||!info.nextUrl||!info.eventUrl)return;',
    '  var generation=(window.__chat2apiQwenBridgeGeneration||0)+1;',
    '  window.__chat2apiQwenBridgeGeneration=generation;',
    '  var badge=document.getElementById("chat2api-qwen-bridge-status");',
    '  if(!badge){badge=document.createElement("div");badge.id="chat2api-qwen-bridge-status";badge.style.cssText="position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:7px 10px;border-radius:8px;background:#166534;color:white;font:12px/1.3 sans-serif;box-shadow:0 2px 10px #0004";document.body.appendChild(badge);}',
    '  badge.textContent="Chat2API bridge: connected";',
    '  function event(taskId,type,data){return bridgePost(info.eventUrl,{bridgeToken:info.token,event:Object.assign({taskId:taskId,type:type},data||{})});}',
    '  function handle(task){',
    '    return fetch(task.path,{method:task.method||"POST",credentials:"include",headers:task.headers||{},body:task.payload})',
    '      .then(function(r){',
    '        return event(task.id,"start",{status:r.status,headers:{"content-type":r.headers.get("content-type")||"","retry-after":r.headers.get("retry-after")||""}})',
    '          .then(function(){',
    '            if(!r.body||!r.body.getReader)return r.arrayBuffer().then(function(v){return event(task.id,"chunk",{data:bridgeBase64(new Uint8Array(v))});});',
    '            var reader=r.body.getReader();',
    '            function read(){return reader.read().then(function(part){if(part.done)return;if(part.value&&part.value.length)return event(task.id,"chunk",{data:bridgeBase64(part.value)}).then(read);return read();});}',
    '            return read();',
    '          }).then(function(){return event(task.id,"end");});',
    '      }).catch(function(err){return event(task.id,"error",{message:String(err&&err.message||err).slice(0,300)});});',
    '  }',
    '  function poll(){',
    '    if(window.__chat2apiQwenBridgeGeneration!==generation)return;',
    '    bridgePost(info.nextUrl,{bridgeToken:info.token}).then(function(r){',
    '      if(r.status===204)return null;',
    '      if(r.status===410)throw new Error("bridge expired");',
    '      return r.json().then(function(v){return v&&v.data&&v.data.task||null;});',
    '    }).then(function(task){return task?handle(task):null;}).then(poll).catch(function(err){',
    '      if(window.__chat2apiQwenBridgeGeneration!==generation)return;',
    '      badge.textContent="Chat2API bridge: reconnecting";badge.style.background="#92400e";',
    '      setTimeout(function(){badge.textContent="Chat2API bridge: connected";badge.style.background="#166534";poll();},1500);',
    '    });',
    '  }',
    '  poll();',
    '}',
    'function readCookie(name){',
    '  var m=document.cookie.match(new RegExp("(?:^|; )"+name.replace(/[.$?*|{}()\\[\\]\\\\\\/\\+\\^]/g,"\\\\$&")+"=([^;]*)"));',
    '  return m?decodeURIComponent(m[1]):null;',
    '}',
    'function read(storage,key){',
    '  try{',
    '    if(key==="*")return document.cookie;',
    '    if(storage==="runtime"&&key==="baxiaUidToken")return window.__baxia__?.getFYModule?.getUidToken?.()||null;',
    '    if(storage==="runtime"&&key==="baxiaVersion")return window.baxiaCommon?.version||null;',
    '    if(storage==="runtime"&&key==="qwenWebVersion"){',
    '      var nodes=document.querySelectorAll("script[src],link[href]");',
    '      for(var ni=0;ni<nodes.length;ni++){var asset=nodes[ni].src||nodes[ni].href||"";var vm=asset.match(/\\/qwen-chat-fe\\/([^/]+)\\//);if(vm)return vm[1];}',
    '      return null;',
    '    }',
    '    if(storage==="runtime"&&key==="browserUserAgent")return navigator.userAgent||null;',
    '    if(storage==="runtime"&&key==="browserAcceptLanguage")return (navigator.languages&&navigator.languages.length)?navigator.languages.map(function(v,i){return i?v+";q="+Math.max(0.1,1-i*0.1).toFixed(1):v;}).join(","):navigator.language||null;',
    '    if(storage==="runtime"&&key==="browserPlatform")return navigator.userAgentData?.platform||navigator.platform||null;',
    '    if(storage==="runtime"&&key==="browserSecChUa")return navigator.userAgentData?.brands?.map(function(v){return "\\\""+v.brand.replace(/\\\"/g,"")+"\\\";v=\\\""+v.version.replace(/\\\"/g,"")+"\\\"";}).join(", ")||null;',
    '    if(storage==="runtime"&&key==="browserSecChUaMobile")return navigator.userAgentData?.mobile?"?1":"?0";',
    '    if(storage==="cookie")return readCookie(key);',
    '    return window.localStorage.getItem(key);',
    '  }catch(e){return null;}',
    '}',
    'function decodePrimary(value){',
    '  if(!value||CFG.valueEncoding!=="json-value-or-raw")return value;',
    '  try{',
    '    var parsed=JSON.parse(value);',
    '    return parsed&&typeof parsed.value==="string"&&parsed.value?parsed.value:null;',
    '  }catch(e){return value;}',
    '}',
    'var primary=decodePrimary(read(CFG.storageType,CFG.tokenKey));',
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
    '    var bridge=res.body.data&&res.body.data.bridge;',
    '    if(CFG.providerType==="qwen-ai"&&bridge){startQwenBridge(bridge);alert("Chat2API: account imported and browser bridge connected. Keep this Qwen tab open while using the API.");}',
    '    else alert("Chat2API: token sent. You can switch back to the Chat2API tab.");',
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
