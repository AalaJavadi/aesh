/* AESH v4 final: same-tab editor bridge. Loaded by the existing /editor/ document
   only when its normal editor is embedded on a public page. All editing,
   password verification and ZIP export continue to run in the original editor. */
(function(){
 'use strict';
 if(new URLSearchParams(location.search).get('inline')!=='1'||parent===window)return;
 const CHANNEL='aesh-inline-editor-v1';
 let workspace=false,everEdited=false;
 const modalIDs=['loginModal','reauthModal','pwModal','itemModal','personModal','portfolioModal','seoModal'];
 const send=(type)=>parent.postMessage({channel:CHANNEL,type},location.origin);
 const sendDraftSaved=(ok)=>parent.postMessage({channel:CHANNEL,type:'draft-saved',ok},location.origin);
 const get=id=>document.getElementById(id);
 const anyModal=()=>modalIDs.some(id=>get(id)?.classList.contains('show'));
 function update(){
   const panel=get('editPanel');
   const editing=!!panel?.classList.contains('show');
   const modal=anyModal();
   const preview=!!get('editorPreviewReturn')?.classList.contains('show');
   if(editing)everEdited=true;
   // Native preview needs the full page; do not leave a blank floating iframe.
   if(preview)workspace=true;
   document.body.classList.toggle('aesh-inline-panel',!workspace);
   document.body.classList.toggle('aesh-inline-modal',!workspace&&modal);
   send(workspace&&(editing||preview)?'workspace':modal?'modal':editing?'panel':everEdited?'dismiss':'idle');
 }
 function mode(next){
   workspace=!!next;
   update();
   if(workspace)window.scrollTo(0,0);
 }
 function init(){
   // The bridge controls are injected only during editing, not into any public page.
   const panel=get('editPanel');
   if(!panel)return;
   const controls=document.createElement('div');
   controls.id='aesh-inline-controls';
   controls.setAttribute('data-noedit','');
   controls.setAttribute('data-aesh-bridge-control','');
   controls.innerHTML='<button type="button" id="aesh-inline-workspace" aria-label="ویرایش مستقیم صفحه">نمایش صفحه برای ویرایش</button><button type="button" id="aesh-inline-hide" aria-label="بستن پنل ویرایش">بستن پنل ×</button>';
   panel.insertBefore(controls,panel.firstChild);
   get('aesh-inline-workspace').addEventListener('click',()=>mode(!workspace));
   get('aesh-inline-hide').addEventListener('click',()=>send('dismiss'));
   // Switch to full-page editing before the native preview hides its panel.
   document.addEventListener('click',e=>{
     if(e.target.closest?.('[onclick="previewEditorChanges()"]')&&get('editPanel')?.classList.contains('show')){
       workspace=true;update();
     }
   },true);
   const observer=new MutationObserver(update);
   for(const id of [...modalIDs,'editPanel','editorPreviewReturn']){
     const el=get(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['class']});
   }
   addEventListener('message',e=>{
     if(e.source!==parent||e.origin!==location.origin||e.data?.channel!==CHANNEL)return;
     if(e.data.type==='open'){
       if(!get('editPanel')?.classList.contains('show')&&!anyModal()&&typeof toggleEdit==='function')toggleEdit();
       update();
     } else if(e.data.type==='persist-before-navigation'){
       if(typeof saveEditorDraft!=='function'||!get('editPanel')?.classList.contains('show')){
         sendDraftSaved(true);return;
       }
       Promise.resolve(saveEditorDraft()).then(ok=>sendDraftSaved(!!ok),()=>sendDraftSaved(false));
     } else if(e.data.type==='workspace')mode(!!e.data.open);
   });
   // A small control in workspace mode also allows returning to the floating panel.
   const back=document.createElement('button');
   back.id='aesh-inline-return';back.type='button';back.textContent='بازگشت به پنل شناور';
   back.setAttribute('data-aesh-bridge-control','');
   back.addEventListener('click',()=>mode(false));
   document.body.appendChild(back);
   const syncBack=()=>{back.hidden=!workspace;get('aesh-inline-workspace').textContent=workspace?'بازگشت به پنل شناور':'نمایش صفحه برای ویرایش';};
   // Keep button state correct when modes are switched or modal state changes.
   const stateObserver=new MutationObserver(syncBack);
   stateObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
   document.body.classList.toggle('aesh-inline-panel',true);
   syncBack();update();
   // Editor-export prompts for the initial password shortly after site-ready.
   setTimeout(update,250);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
