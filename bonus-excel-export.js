(function(){
'use strict';
if(document.querySelector('script[data-shiftboard-bonus-excel-core]'))return;
const s=document.createElement('script');
s.setAttribute('data-shiftboard-bonus-excel-core','1');
s.src='./public/bonus-excel-export.js?v=1';
s.async=false;
(document.head||document.documentElement).appendChild(s);
})();
