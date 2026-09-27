(function(){
  'use strict';
  if(document.querySelector('script[data-mot-safety-sync-loader]')) return;
  var s=document.createElement('script');
  s.src='./public/mot-safety-sync.js?v=2';
  s.async=false;
  s.setAttribute('data-mot-safety-sync-loader','1');
  (document.head||document.documentElement).appendChild(s);
})();
