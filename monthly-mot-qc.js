(function(){
  'use strict';
  // Production is currently served from the repository root, while the
  // implementation is kept in /public for the Cloudflare Pages build.
  // Mirror the established Shiftboard deployment pattern by loading the
  // public implementation from this root-level entry point.
  if(document.querySelector('script[data-monthly-mot-qc-impl]')) return;
  const script=document.createElement('script');
  script.src='./public/monthly-mot-qc.js?v=1';
  script.async=false;
  script.setAttribute('data-monthly-mot-qc-impl','1');
  (document.head||document.documentElement).appendChild(script);
})();
