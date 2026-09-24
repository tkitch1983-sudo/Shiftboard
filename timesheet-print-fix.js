(function(){
  'use strict';

  try{
    if(typeof selectedReportHtml!=='function') return;

    const originalSelectedReportHtml=selectedReportHtml;
    selectedReportHtml=function(selector,title,orientation){
      let html=originalSelectedReportHtml(selector,title,orientation);
      if(!html || selector!=='#timesheet-output') return html;

      const printCss=`
        .att-sheet{border:2px solid #000!important;}
        .att-title-row{border-bottom:2px solid #000!important;}
        .att-meta-row{border-bottom:2px solid #000!important;}
        .att-meta-row .site-tag{font-size:19px!important;font-weight:800!important;letter-spacing:.04em!important;text-transform:uppercase;}
        .att-table th,.att-table td{border:2px solid #000!important;}
        .att-other-info{border-top:2px solid #000!important;}
        .att-footnote{border-top:2px solid #000!important;}
        .att-table tbody td:nth-last-child(3),
        .att-table tbody td:nth-last-child(3) .report-field-value{font-weight:700!important;}
      `;

      return html.replace('</style>',printCss+'</style>');
    };
  }catch(err){
    console.error('Timesheet print styling fix failed:',err);
  }
})();
