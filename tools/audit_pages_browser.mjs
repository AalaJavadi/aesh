/* Diagnostic only. Run in GitHub's isolated staging-branch action with Playwright.
   No login, no write requests, no Cloudflare/DNS/Supabase changes. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'artifacts','browser-audit');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.xml':'application/xml'};
const server=createServer(async(req,res)=>{
 try{
  const raw=new URL(req.url,'http://127.0.0.1/').pathname;
  const decoded=decodeURIComponent(raw);
  const filename=path.resolve(root,'.'+decoded,(decoded.endsWith('/')?'index.html':''));
  if(!filename.startsWith(root+path.sep))throw Error('unsafe route');
  const data=await readFile(filename);
  res.writeHead(200,{'content-type':MIME[path.extname(filename)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'}).end(data);
 }catch{res.writeHead(404,{'content-type':'text/plain'}).end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
await mkdir(output,{recursive:true});
const examples=[];
for(const section of ['teacher','student','work']){
 const directories=(await readdir(path.join(root,section),{withFileTypes:true})).filter(x=>x.isDirectory());
 const selected=directories.find(x=>!x.name.startsWith('.'));
 if(selected)examples.push('/'+section+'/'+encodeURIComponent(selected.name)+'/');
}
const routes=['/','/teachers/','/students/','/portfolio/','/blog/','/members/',...examples];
const outcomes=[];
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const device of [{name:'desktop',width:1366,height:768},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:device,deviceScaleFactor:1,locale:'fa-IR',javaScriptEnabled:true});
  for(const offline of [false,true]){
   for(const route of routes){
    const page=await context.newPage();const failures=[];
    if(offline)await page.route(/^https:\/\/[^/]*\.supabase\.co\//,r=>r.abort('failed'));
    page.on('pageerror',e=>failures.push(String(e.message).slice(0,150)));
    const started=Date.now();let response=null;
    let error='';
    try{response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:18000});
      await page.waitForTimeout(1200);
    }catch(e){error=String(e.message).slice(0,160);}
    const metrics=await page.evaluate(()=>{
      const navigation=performance.getEntriesByType('navigation')[0];
      const paint=performance.getEntriesByType('paint');
      const fcp=paint.find(p=>p.name==='first-contentful-paint');
      const body=document.body;
      return {title:document.title,bodyChars:(body?.innerText||'').trim().length,elementCount:body?.querySelectorAll('*').length||0,
        documentReady:document.readyState,domContentLoadedMs:Math.round(navigation?.domContentLoadedEventEnd||0),
        firstContentfulPaintMs:fcp?Math.round(fcp.startTime):null,
        horizontalOverflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth)};
    }).catch(()=>({bodyChars:0}));
    const key=device.name+'-'+(offline?'no-supabase':'normal')+'-'+route.replace(/[^a-z0-9]/gi,'-').slice(0,70);
    await page.screenshot({path:path.join(output,key+'.png'),fullPage:false}).catch(()=>{});
    outcomes.push({route,device:device.name,supabaseOffline:offline,status:response?.status()||0,elapsedMs:Date.now()-started,...metrics,errors:failures,error});
    console.log('AUDIT',device.name,offline?'no-supabase':'normal',route,'status',response?.status()||'none','chars',metrics.bodyChars,'fcp',metrics.firstContentfulPaintMs);
    await page.close();
   }
  }
  await context.close();
 }
 const url=process.env.AESH_BASELINE_URL||'https://aesh.ir';
 const baselineContext=await browser.newContext();
 for(const route of ['/teachers/','/students/','/portfolio/']){
  const page=await baselineContext.newPage();let error='';const started=Date.now(),target=url+route;
  try{const r=await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});
      outcomes.push({baseline:target,status:r?.status()||0,domReadyMs:Date.now()-started});}
  catch(e){error=String(e.message).slice(0,180);outcomes.push({baseline:target,error});}
  await page.close();
 }
 await baselineContext.close();
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
const report={date:new Date().toISOString(),note:'Actual GitHub-hosted Chromium environment; NOT Iran-network RUM and NOT Production deployment',routes:outcomes};
await writeFile(path.join(output,'aesh-browser-audit.json'),JSON.stringify(report,null,2));
const bad=outcomes.filter(x=>x.route&&(x.status!==200||x.bodyChars<40));
console.log('BROWSER AUDIT:',outcomes.length,'checks, failed basic page visibility:',bad.length);
if(bad.length)process.exitCode=1;
