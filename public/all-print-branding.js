(function(){
  'use strict';

  try{
    if(typeof LOGO_DATA_URI==='undefined' || !LOGO_DATA_URI) return;

    const logo=String(LOGO_DATA_URI);
    const STYLE_ID='neas-all-print-branding';
    const BRAND_MARK='data-neas-print-brand="1"';

    function brandHtml(input){
      let html=String(input==null?'':input);
      if(!html || !/<html[\s>]/i.test(html)) return html;
      if(html.includes(STYLE_ID) || html.includes(BRAND_MARK)) return html;

      // Only touch generated printable documents, not ordinary pop-up pages.
      if(!/@page|window\.print\s*\(/i.test(html)) return html;

      const hasTimesheetLogo=/class=["'][^"']*att-logo/i.test(html);
      const hasBonusLogo=/class=["'][^"']*bonus-print-brand/i.test(html);
      const hasHeaderLogo=/<header[\s>][\s\S]*?<img[^>]+alt=["']North East Auto Services["']/i.test(html);
      const useExisting=hasTimesheetLogo||hasBonusLogo||hasHeaderLogo;

      const css=`<style id="${STYLE_ID}">
        .neas-print-brand{height:48px;display:flex;justify-content:flex-end;align-items:flex-start;margin:0 0 6px 0;page-break-inside:avoid;break-inside:avoid;}
        .neas-print-brand img{display:block;max-width:170px;max-height:44px;width:auto;height:auto;object-fit:contain;}
        .att-title-row{position:relative;padding-right:185px!important;min-height:50px;}
        .att-title-row .att-logo{display:block!important;position:absolute!important;right:10px!important;left:auto!important;top:5px!important;max-width:165px!important;max-height:42px!important;width:auto!important;height:auto!important;object-fit:contain!important;margin:0!important;}
        .bonus-print-brand{position:relative!important;padding-right:185px!important;min-height:52px!important;}
        .bonus-print-brand img{display:block!important;position:absolute!important;right:0!important;left:auto!important;top:0!important;max-width:170px!important;max-height:44px!important;width:auto!important;height:auto!important;object-fit:contain!important;margin:0!important;}
        header{position:relative;}
        header img[alt="North East Auto Services"]{display:block!important;position:absolute!important;right:0!important;left:auto!important;top:0!important;max-width:170px!important;max-height:48px!important;width:auto!important;height:auto!important;object-fit:contain!important;margin:0!important;}
        header:has(img[alt="North East Auto Services"]){padding-right:185px!important;min-height:58px;}
        @media print{.neas-print-brand{display:flex!important;}}
      </style>`;

      if(/<\/head>/i.test(html)) html=html.replace(/<\/head>/i,css+'</head>');
      else html=css+html;

      if(!useExisting){
        const brand=`<div class="neas-print-brand" ${BRAND_MARK}><img src="${logo}" alt="North East Auto Services"></div>`;
        if(/<body[^>]*>/i.test(html)) html=html.replace(/<body[^>]*>/i,m=>m+brand);
        else html=brand+html;
      }
      return html;
    }

    // Brand the standard Shiftboard print/download document builder.
    if(typeof selectedReportHtml==='function'){
      const originalSelectedReportHtml=selectedReportHtml;
      selectedReportHtml=function(selector,title,orientation){
        return brandHtml(originalSelectedReportHtml(selector,title,orientation));
      };
    }

    // Live Sales, PIN lists and any other custom print pop-ups write their own
    // complete HTML. Intercept only printable HTML and add/reposition the logo.
    const originalOpen=window.open.bind(window);
    window.open=function(){
      const child=originalOpen.apply(window,arguments);
      if(!child) return child;
      try{
        const doc=child.document;
        if(doc && typeof doc.write==='function'){
          const originalWrite=doc.write.bind(doc);
          doc.write=function(){
            const parts=Array.prototype.slice.call(arguments).map(function(part){
              return brandHtml(part);
            });
            return originalWrite.apply(doc,parts);
          };
        }
      }catch(_e){}
      return child;
    };
  }catch(err){
    console.error('All-print branding setup failed:',err);
  }
})();
