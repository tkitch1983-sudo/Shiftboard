(function(){
  'use strict';
  if(document.querySelector('script[data-mot-import-delete-loader]')) return;
  var s=document.createElement('script');
  s.src='./public/mot-import-delete.js?v=1';
  s.async=false;
  s.setAttribute('data-mot-import-delete-loader','1');
  (document.head||document.documentElement).appendChild(s);
})();
