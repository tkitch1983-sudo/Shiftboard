(function(){
  'use strict';
  if(document.querySelector('script[data-mot-qc-register-loader]')) return;
  var s=document.createElement('script');
  s.src='./public/mot-qc-register.js?v=1';
  s.async=false;
  s.setAttribute('data-mot-qc-register-loader','1');
  (document.head||document.documentElement).appendChild(s);
})();
