const hdr=document.getElementById('hdr');
if(hdr) addEventListener('scroll',()=>hdr.classList.toggle('scrolled',scrollY>40),{passive:true});
const mb=document.getElementById('menuBtn'),mob=document.getElementById('mobile');
if(mb&&mob){
  mb.addEventListener('click',()=>mob.style.display=mob.style.display==='flex'?'none':'flex');
  mob.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>mob.style.display='none'));
}
document.querySelectorAll('.faq-q').forEach(q=>q.addEventListener('click',()=>{
  const it=q.parentElement,open=it.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('open'));
  if(!open)it.classList.add('open');
}));
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.1});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
