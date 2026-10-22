/* AESH 5: common browser-side upload optimizer, never alters archived assets.
 * Note: real enforcement must also happen in Supabase Storage (migration 002).
 */
(function(){
 'use strict';
 const LIMIT=100000;
 const TYPES=['image/jpeg','image/png','image/webp'];
 const MAX_INPUT=20*1024*1024;
 function decode(file){return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file), img=new Image();
   img.onload=()=>{URL.revokeObjectURL(url);if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>48000000)
       reject(new Error('ابعاد تصویر معتبر نیست یا بیش از حد بزرگ است.'));else resolve(img);};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('تصویر خراب است یا مرورگر از آن پشتیبانی نمی‌کند.'));};
   img.src=url;
 });}
 function blobFor(canvas,quality){return new Promise((resolve,reject)=>{
   canvas.toBlob(blob=>blob&&blob.type==='image/webp'?resolve(blob):reject(new Error('خروجی WebP در این مرورگر پشتیبانی نمی‌شود.')),'image/webp',quality);
 });}
 async function optimize(file,options={}){
   const maxBytes=Math.min(LIMIT-1,Math.max(1,Number(options.maxBytes)||LIMIT-1));
   if(!(file instanceof Blob)||!TYPES.includes(file.type)||!file.size||file.size>MAX_INPUT)
     throw new Error('فقط JPG، PNG یا WebP تا ۲۰ مگابایت پذیرفته می‌شود.');
   const image=await decode(file),originalWidth=image.naturalWidth,originalHeight=image.naturalHeight;
   const canvas=document.createElement('canvas');
   const context=canvas.getContext('2d',{alpha:true});
   if(!context)throw new Error('مرورگر امکان پردازش تصویر ندارد.');
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
   const maxDimension=Math.max(300,Math.min(2800,Number(options.maxDimension)||2800));
   const choices=[...new Set([2800,2200,1800,1500,1250,1050,900,750,620,500,390,300].map(n=>Math.min(n,maxDimension)))];
   for(const longest of choices){
     const scale=Math.min(1,longest/Math.max(originalWidth,originalHeight));
     const w=Math.max(1,Math.round(originalWidth*scale)),h=Math.max(1,Math.round(originalHeight*scale));
     if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;context.drawImage(image,0,0,w,h);}
     for(const quality of [0.94,0.86,0.77,0.67,0.56,0.44,0.32,0.23]){
       const blob=await blobFor(canvas,quality);
       if(blob.size>0&&blob.size<=maxBytes){
         return {blob,width:w,height:h,originalWidth,originalHeight,originalBytes:file.size,
           bytes:blob.size,quality,qualityWarning:quality<0.5||scale<0.5};
       }
     }
   }
   throw new Error('حجم تصویر بدون افت کیفیت شدید به کمتر از ۱۰۰ کیلوبایت نرسید. فایل ساده‌تر یا کوچک‌تری انتخاب کنید.');
 }
 function describe(result){if(!result)return '';
   return 'WebP نهایی: '+(result.bytes/1024).toFixed(1)+' کیلوبایت ('+result.bytes+' بایت) — '+result.width+'×'+result.height+' پیکسل'+(result.qualityWarning?' — قبل از ارسال کیفیت را با دقت بررسی کنید.':'');
 }
 window.AESHImage=Object.freeze({optimize,describe,MAX_BYTES:LIMIT});
})();
