'use strict';
const fs=require('fs'),vm=require('vm'), assert=require('assert');
const source=fs.readFileSync(process.argv[2],'utf8');
const requests=[];
const fetchMock=(url,options={})=>new Promise((resolve,reject)=>{
  const rec={url,method:options.method,hasSignal:!!options.signal,hasAuthorization:!!options.headers?.has?.('Authorization'),finished:false};
  requests.push(rec);
  if(options.signal){
    options.signal.addEventListener('abort',()=>{rec.finished=true;reject(Object.assign(new Error('aborted'),{name:'AbortError'}));},{once:true});
  } else {
    setTimeout(()=>{rec.finished=true;resolve({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>true})},4600);
  }
});
const window={AESH_SUPABASE_CONFIG:{url:'https://test-project.supabase.co',publishableKey:'sb_publishable_12345678901234567890'},addEventListener(){},dispatchEvent(){}};
const storage={getItem(){return null},removeItem(){},setItem(){}};
const ctx={window,localStorage:storage,sessionStorage:storage,fetch:fetchMock,setTimeout,clearTimeout,Headers,AbortController,Event};vm.createContext(ctx);vm.runInContext(source,ctx);
const api=window.AESHCore;
(async()=>{
 const begin=Date.now();
 const read=api.publicWorks().then(()=>{throw Error('Public slow RPC unexpectedly succeeded')},e=>({error:e.message,elapsed:Date.now()-begin}));
 const write=api.submitReview('Someone','A valid review body').then(()=>({elapsed:Date.now()-begin}),e=>{throw Error('Safe write was aborted: '+e.message)});
 const [a,b]=await Promise.all([read,write]);
 assert(a.elapsed>=3500&&a.elapsed<4500,`public read timeout wrong: ${a.elapsed}`);
 assert(b.elapsed>=4500,`write was timed out unexpectedly: ${b.elapsed}`);
 assert(/به.موقع/.test(a.error),`wrong friendly error: ${a.error}`);
 assert.deepEqual(requests.map(x=>x.hasSignal),[true,false]);
 assert.deepEqual(requests.map(x=>x.method),['POST','POST']);
 assert.deepEqual(requests.map(x=>x.hasAuthorization),[false,false]);
 console.log(JSON.stringify({public_read_timeout_ms:a.elapsed,write_completed_ms:b.elapsed,signals:requests.map(x=>x.hasSignal),pass:true}));
})().catch(e=>{console.error(e);process.exit(1)});
