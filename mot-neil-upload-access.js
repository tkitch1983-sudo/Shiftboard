(function(){
  'use strict';
  if(document.querySelector('script[data-mot-neil-upload-access-loader]')) return;
  var s=document.createElement('script');
  s.src='./public/mot-neil-upload-access.js?v=1';
  s.async=false;
  s.setAttribute('data-mot-neil-upload-access-loader','1');
  (document.head||document.documentElement).appendChild(s);
})();
