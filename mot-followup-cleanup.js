(function(){
  'use strict';
  if(document.querySelector('script[data-mot-followup-cleanup-loader]')) return;
  var s=document.createElement('script');
  s.src='./public/mot-followup-cleanup.js?v=1';
  s.async=false;
  s.setAttribute('data-mot-followup-cleanup-loader','1');
  (document.head||document.documentElement).appendChild(s);
})();
