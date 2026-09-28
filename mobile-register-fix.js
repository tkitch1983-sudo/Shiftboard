(function(){
  'use strict';
  if(document.querySelector('script[data-mobile-register-fix-loader]')) return;
  var s=document.createElement('script');
  s.src='./public/mobile-register-fix.js?v=1';
  s.async=false;
  s.setAttribute('data-mobile-register-fix-loader','1');
  (document.head||document.documentElement).appendChild(s);
})();
