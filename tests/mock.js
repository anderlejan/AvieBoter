// Fake WebView2 host for headless UI tests.
(function(){
  const listeners=[]; let bots=[]; const settings={theme:'storm',fontPercent:100,startInTray:false,startBotsWithApp:true,closeAction:'tray',showNotesButton:true,notifyImPopup:true,notifyImSound:true,notifyLocalPopup:false,notifyLocalSound:false,recentSlurls:[],ui:{},lastBot:'',lastSection:'overview'};
  let notes={version:2,notes:[]};
  window.__calls=[];
  window.__upd={current:'1.4.3',hud:'1.4.0',check:true,auto:true,lastCheck:null,status:'',available:null,botsOnline:false};
  window.__pushUpdate = u => { window.__upd=u; listeners.forEach(f => f({data:{type:'update', update:u}})); };
  window.__pushOpen = (bot, section) => listeners.forEach(f => f({data:{type:'open', bot, section}}));
  function reply(id,ok,v,err){ setTimeout(()=>listeners.forEach(f=>f({data:{id,ok,v,err}})),5); }
  window.chrome={webview:{addEventListener:(t,f)=>listeners.push(f), postMessage:(m)=>{
    window.__calls.push(m.m);
    const a=m.a||[];
    switch(m.m){
      case 'init': return reply(m.id,true,{version:'1.4.3',settings,bots,dataDir:'C:\\data',botExeFound:true,update:window.__upd,notesConfig:null});
      case 'update.check': window.__upd=Object.assign({},window.__upd,{available:{version:'1.5.0',page:'https://example.invalid/r'},lastCheck:new Date().toISOString()}); return reply(m.id,true,window.__upd);
      case 'hud.update': window.__hudUpd=a[0]; return reply(m.id,true,{way:'silent',person:a[0],bots:['Passenger'],through:'Passenger',answer:'added 1',neverOnline:[]});
      case 'update.install': window.__installed=true; return reply(m.id,true,null);
      case 'state': return reply(m.id,true,bots);
      case 'bot.save': { const o=a[0]; let b=bots.find(x=>x.id===o.id); if(!b){ b={id:'b'+(bots.length+1),state:'stopped',status:null,ramMb:0,cpu:0,hasPassword:!!a[1]}; bots.push(b);} Object.assign(b,o,{id:b.id}); return reply(m.id,true,{id:b.id}); }
      case 'bot.start': { const b=bots.find(x=>x.id===a[0]); b.state='online'; b.ramMb=120; b.cpu=0.4; b.startedAt=new Date().toISOString(); b.onlineSince=b.startedAt; b.botUuid='11111111-2222-3333-4444-555555555555';
        b.status={online:true,name:'Test Bot',uuid:b.botUuid,region:'Ahern',x:120.5,y:33,z:22,sitting:true,seatName:'Jeep',seatId:'a5af0b84-db98-a727-438f-272cac90dc21'}; setTimeout(()=>listeners.forEach(f=>f({data:{type:'state',bots}})),20); return reply(m.id,true,null); }
      case 'bot.run': { window.__runs=(window.__runs||[]).concat([[a[1]].concat(a[2]||[])]);
        const G='99999999-0000-0000-0000-000000000001', R='99999999-0000-0000-0000-0000000000aa', Z='00000000-0000-0000-0000-000000000000';
        if (a[1]==='CompanionGroupInvites') return reply(m.id,true,{ok:true,reply:JSON.stringify(window.__invAnswered?[]:[{group:'99999999-0000-0000-0000-000000000003',session:'s',from:'Inviter Resident',message:'Inviter Resident has invited you to join a group: Fun Club. There is no cost to join this group.',t:1764000000}])});
        if (a[1]==='CompanionGroupInviteAnswer') { window.__invAnswered=a[2][1]; return reply(m.id,true,{ok:true,reply:a[2][1]==='accept'?'accepted':'declined'}); }
        if (a[1]==='CompanionGroupList') return reply(m.id,true,{ok:true,reply:JSON.stringify({active:G,groups:[{id:G,name:'Harbour Riders',active:true,notices:true,profile:true,canInvite:true,canEject:true,canNotice:true,canRoles:true,canRemoveRoles:true},{id:'99999999-0000-0000-0000-000000000002',name:'Sunset Dance Club',active:false,notices:false,profile:true,canInvite:false,canEject:false,canNotice:false,canRoles:false,canRemoveRoles:false}]})});
        if (a[1]==='CompanionGroupDetail') return reply(m.id,true,{ok:true,reply:JSON.stringify({memberCount:2,roles:[{id:Z,name:'Everyone',title:'Member'},{id:R,name:'Officers',title:'Officer'}],titles:[{role:Z,title:'Member',selected:true},{role:R,title:'Officer',selected:false}],members:[{id:'aaaa-1',name:'Some One',title:'Member',online:'Online',owner:false,roles:[Z]},{id:'bbbb-2',name:'Main Resident',title:'Officer',online:'11/20/2026',owner:true,roles:[Z,R]}]})});
        return reply(m.id,true,{ok:true,reply: a[1]==='Nearme'?'{"x":"Some One"}':'ok',raw:''}); }
      case 'bot.log': return reply(m.id,true,a[1]>0?[]:[{seq:1,t:'12:00:00',x:'Client service ~ Login status: Success',k:'out'},{seq:2,t:'12:00:01',x:'Warn: something failed',k:'out'}]);
      case 'bot.chat': return reply(m.id,true,a[1]>0?[]:[{seq:1,t:Date.now()-60000,kind:'local',from:'Some One',fromId:'aaaa',text:'hello bot',out:false},{seq:2,t:Date.now(),kind:'im',from:'Main Resident',fromId:'bbbb',text:'private hi',out:false}]);
      case 'bot.sendChat': window.__sent=a; return reply(m.id,true,null);
      case 'seats.save': { const b=bots.find(x=>x.id===a[0]); b.seats=b.seats||[]; let s=b.seats.find(x=>x.id===a[1]); if(!s){ s={id:'s'+(b.seats.length+1),uses:0}; b.seats.push(s);} s.name=a[2]||('Seat '+b.seats.length); s.uuid=a[3]; return reply(m.id,true,s.id); }
      case 'seats.delete': { const b=bots.find(x=>x.id===a[0]); b.seats=b.seats.filter(x=>x.id!==a[1]); return reply(m.id,true,null); }
      case 'seats.sit': { const b=bots.find(x=>x.id===a[0]); const s=(b.seats||[]).find(x=>x.id===a[1]); if(s) s.uses++; window.__sat=a; return reply(m.id,true,{ok:true,reply:'seated'}); }
      case 'bot.pairCode': return reply(m.id,true,'SLB1|uuid|secret|Test');
      case 'hud.script': return reply(m.id,true,'// lsl');
      case 'bot.radar': return reply(m.id,true,[{uuid:'aaaa-1',name:'Some One',region:'Ahern',x:122,y:35,z:22,dist:2.4,sitting:false,precise:true,born:'1/5/2015'},{uuid:'bbbb-2',name:'Main Resident',region:'Ahern',x:150,y:80,z:0,dist:57,sitting:false,precise:false,born:'11/10/2026'},{uuid:'cccc-3',name:'Far Away',region:'Morris',x:10,y:200,z:0,dist:180,sitting:true,precise:false}]);
      case 'bot.events': return reply(m.id,true,[{t:Date.now(),type:'arrive',uuid:'aaaa-1',name:'Some One',region:'Ahern',extra:''},{t:Date.now()-60000,type:'hud',uuid:'bbbb-2',name:'Main Resident',region:'Ahern',extra:'0.7.0'},{t:Date.now()-120000,type:'region',uuid:'',name:'Test Bot',region:'Ahern',extra:'3 avatars here'}]);
      case 'people.add': { const b=bots.find(x=>x.id===a[0]); b.masters=(b.masters||[]).concat([a[1]]); window.__people=a[1]; setTimeout(()=>listeners.forEach(f=>f({data:{type:'state',bots}})),5); return reply(m.id,true,{restartNeeded:true}); }
      case 'bot.youngAlert': window.__young=a[1]; return reply(m.id,true,null);
      case 'hud.send': window.__hudSent=(window.__hudSent||[]).concat([a[1]]); return reply(m.id,true,null);
      case 'notes.get': return reply(m.id,true,notes);
      case 'notes.save': notes={version:2,notes:a[0]}; return reply(m.id,true,null);
      case 'addRecentSlurl': return reply(m.id,true,[a[0]]);
      case 'bot.outfits': return reply(m.id,true,['Casual','Party dress']);
      case 'bot.wear': { const b=bots.find(x=>x.id===a[0]); b.recentOutfits=[a[1]]; window.__worn=a[1]; return reply(m.id,true,{ok:true,reply:'worn My Outfits/'+a[1]}); }
      case 'setting': window.__settings=(window.__settings||[]).concat([a]); return reply(m.id,true,null);
      default: return reply(m.id,true,null);
    }
  }}};
})();
