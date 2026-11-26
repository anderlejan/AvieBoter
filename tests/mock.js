// Fake WebView2 host for headless UI tests.
(function(){
  const listeners=[]; let bots=[]; window.__pushState=()=>listeners.forEach(f=>f({data:{type:'state',bots:JSON.parse(JSON.stringify(bots))}})); const settings={theme:'storm',fontPercent:100,startInTray:false,startBotsWithApp:true,closeAction:'tray',showNotesButton:true,notifyImPopup:true,notifyImSound:true,notifyLocalPopup:false,notifyLocalSound:false,recentSlurls:[],ui:{},lastBot:'',lastSection:'overview'};
  let notes={version:2,notes:[]};
  window.__calls=[];
  window.__upd={current:'1.12.0',hud:'1.7.2',check:true,auto:true,lastCheck:null,status:'',available:null,botsOnline:false};
  window.__pushUpdate = u => { window.__upd=u; listeners.forEach(f => f({data:{type:'update', update:u}})); };
  window.__pushOpen = (bot, section) => listeners.forEach(f => f({data:{type:'open', bot, section}}));
  function reply(id,ok,v,err){ setTimeout(()=>listeners.forEach(f=>f({data:{id,ok,v,err}})),5); }
  window.chrome={webview:{addEventListener:(t,f)=>listeners.push(f), postMessage:(m)=>{
    window.__calls.push(m.m);
    const a=m.a||[];
    switch(m.m){
      case 'init': return reply(m.id,true,{version:'1.12.0',settings,bots,dataDir:'C:\\data',botExeFound:true,update:window.__upd,notesConfig:null});
      case 'update.check': window.__upd=Object.assign({},window.__upd,{available:{version:'1.5.0',page:'https://example.invalid/r'},lastCheck:new Date().toISOString()}); return reply(m.id,true,window.__upd);
      case 'hud.update': window.__hudUpd=a[0]; return reply(m.id,true,{way:'silent',person:a[0],bots:['Passenger'],through:'Passenger',answer:'added 1',neverOnline:[]});
      case 'update.install': window.__installed=true; return reply(m.id,true,null);
      case 'state': return reply(m.id,true,bots);
      case 'bot.save': { const o=a[0]; window.__lastSave=o; let b=bots.find(x=>x.id===o.id); if(!b){ b={id:'b'+(bots.length+1),state:'stopped',status:null,ramMb:0,cpu:0,hasPassword:!!a[1]}; bots.push(b);} Object.assign(b,o,{id:b.id}); return reply(m.id,true,{id:b.id}); }
      case 'bot.start': { const b=bots.find(x=>x.id===a[0]); b.state='online'; b.ramMb=120; b.cpu=0.4; b.startedAt=new Date().toISOString(); b.onlineSince=b.startedAt; b.botUuid='11111111-2222-3333-4444-555555555555';
        b.unread=5; b.unreadBy={im:2,local:3}; b.status={online:true,name:'Test Bot',uuid:b.botUuid,region:'Ahern',x:120.5,y:33,z:22,sitting:true,seatName:'Jeep',seatId:'a5af0b84-db98-a727-438f-272cac90dc21'}; setTimeout(()=>listeners.forEach(f=>f({data:{type:'state',bots}})),20); return reply(m.id,true,null); }
      case 'outfit.image': return reply(m.id,true,(window.__pics||{})[a[1]]||null);
      case 'outfit.setImage': { window.__pics=window.__pics||{}; if(a[2]) window.__pics[a[1]]=a[2]; else delete window.__pics[a[1]]; return reply(m.id,true,null); }
      case 'bot.run': { window.__runs=(window.__runs||[]).concat([[a[1]].concat(a[2]||[])]);
        const G='99999999-0000-0000-0000-000000000001', R='99999999-0000-0000-0000-0000000000aa', Z='00000000-0000-0000-0000-000000000000';
        if (a[1]==='CompanionInvList') { const f=(a[2]||[])[0]||''; const T='tttt-trash';
          const top={id:'root',parent:'',path:[{id:'root',name:'Inventory'}],trash:T,folders:[{id:'fa',name:'Animations',type:'Animation'},{id:'fb',name:'Body Parts',type:'BodyPart'},{id:'fo1',name:'Clothes',type:'None'},{id:'fl',name:'Landmarks',type:'Landmark'},{id:'fm',name:'My Outfits',type:'MyOutfits'},{id:'fn',name:'Notecards',type:'Notecard'},{id:'fo2',name:'Objects',type:'Object'},{id:'fs',name:'Scripts',type:'LSLText'},{id:T,name:'Trash',type:'Trash'}],items:[{id:'it1',name:'Hello card',kind:'Notecard',asset:'Notecard',worn:'',copy:true,mod:true,trans:true},{id:'is1',name:'Bell',kind:'Sound',asset:'Sound',worn:'',copy:true,mod:true,trans:true},{id:'ia1',name:'Dance',kind:'Animation',asset:'Animation',worn:'',copy:true,mod:true,trans:true},{id:'ip1',name:'Sunset photo',kind:'Snapshot',asset:'Texture',worn:'',copy:true,mod:true,trans:true},{id:'il1',name:'Home spot',kind:'Landmark',asset:'Landmark',worn:'',copy:true,mod:true,trans:true},{id:'it2',name:'Red hat',kind:'Object',asset:'Object',worn:'Skull',copy:true,mod:true,trans:false}]};
          const fo1={id:'fo1',parent:'root',path:[{id:'root',name:'Inventory'},{id:'fo1',name:'Clothes'}],trash:T,folders:[],items:[{id:'it3',name:'Blue shirt',kind:'Wearable',asset:'Clothing',worn:'worn',copy:true,mod:true,trans:true}]};
          const tr={id:T,parent:'root',path:[{id:'root',name:'Inventory'},{id:T,name:'Trash'}],trash:T,folders:[],items:[{id:'it9',name:'Old box',kind:'Object',asset:'Object',worn:'',copy:true,mod:true,trans:true}]};
          return reply(m.id,true,{ok:true,reply:JSON.stringify(f==='fo1'?fo1:f===T?tr:top)}); }
        if (a[1]==='CompanionInvWorn') return reply(m.id,true,{ok:true,reply:JSON.stringify({attachments:[{id:'it2',name:'Red hat',point:'Skull'}],wearables:[{id:'it3',name:'Blue shirt',type:'Shirt'}]})});
        if (a[1]==='CompanionInvSearch') return reply(m.id,true,{ok:true,reply:JSON.stringify({complete:true,hits:[{isFolder:false,folder:'fo1',folderName:'Clothes',item:{id:'it3',name:'Blue shirt',kind:'Wearable',asset:'Clothing',worn:'worn',copy:true,mod:true,trans:true}}]})});
        if (a[1]==='CompanionOutfitList') return reply(m.id,true,{ok:true,reply:JSON.stringify({folder:'mo',outfits:[{id:'11111111-0000-0000-0000-000000000001',name:'Beach',count:5,current:true},{id:'11111111-0000-0000-0000-000000000002',name:'Party',count:7,current:false},{id:'11111111-0000-0000-0000-000000000003',name:'Winter',count:9,current:false},{id:'11111111-0000-0000-0000-000000000004',name:'Formal',count:6,current:false},{id:'11111111-0000-0000-0000-000000000005',name:'Explorer',count:8,current:false}]})});
        if (a[1]==='CompanionOutfitSave') { window.__osave=a[2]; return reply(m.id,true,{ok:true,reply:"saved '"+a[2][0]+"': 7 of 7 things"}); }
        if (a[1]==='CompanionMenusToHud') { window.__mhud=(window.__mhud||[]).concat([a[2][0]]); return reply(m.id,true,{ok:true,reply:a[2][0]==='off'?'off':'on'}); }
        if (a[1]==='CompanionTaskDo') { window.__task=(window.__task||[]).concat([a[2]]); const ac=a[2][0];
          if (ac==='read') return reply(m.id,true,{ok:true,reply:'// opens and closes the lid when touched\ninteger open;\n\ndefault\n{\n    touch_start(integer n)\n    {\n        open = !open;\n        llSetLocalRot(llEuler2Rot(<0, 0, open * PI_BY_TWO>));\n        llSay(0, llList2String(["Closed.", "Open!"], open));\n    }\n}\n'});
          if (ac==='save') return reply(m.id,true,{ok:true,reply:JSON.stringify({saved:true,messages:a[2][3].includes('oops')?['(3, 1) : ERROR : Syntax error']:[]})});
          return reply(m.id,true,{ok:true,reply:'done '+ac}); }
        if (a[1]==='CompanionInvNew') { window.__invnew=a[2]; return reply(m.id,true,{ok:true,reply:JSON.stringify({id:'new1',name:a[2][2],note:''})}); }
        if (a[1]==='CompanionInvSave') { window.__invsave=a[2]; return reply(m.id,true,{ok:true,reply:JSON.stringify({saved:true,messages:[]})}); }
        if (a[1]==='CompanionNearby') return reply(m.id,true,{ok:true,reply:JSON.stringify({sitting:10,region:'Ahern',range:20,total:7,objects:[{lid:10,id:'o-10',name:'Jeep',desc:'',owner:'z',ownerName:'Example Owner',mine:false,dist:1.2,touch:true,sit:true,copy:false,modify:false,sale:false,price:0,seated:true,temp:false},{lid:11,id:'o-11',name:'Bench',desc:'Wooden',owner:'x',ownerName:'Someone Else',mine:false,dist:2.1,touch:false,sit:true,copy:false,modify:false,sale:false,price:0,seated:false,temp:false},{lid:12,id:'o-12',name:'Box of the bot',desc:'',owner:'b',ownerName:'Test Bot',mine:true,dist:3.4,touch:true,sit:false,copy:true,modify:true,sale:false,price:0,seated:false,temp:false},{lid:13,id:'o-13',name:'Vendor',desc:'',owner:'y',ownerName:'Shop Owner',mine:false,dist:9,touch:true,sit:false,copy:false,modify:false,sale:true,price:10,seated:false,temp:false},{lid:14,id:'o-14',name:'Dance Ball',desc:'',owner:'w',ownerName:'Club Owner',mine:false,dist:14.6,touch:true,sit:false,copy:false,modify:false,sale:false,price:0,seated:false,temp:false},{lid:15,id:'o-15',name:'Palm tree',desc:'',owner:'w',ownerName:'Club Owner',mine:false,dist:18.2,touch:false,sit:false,copy:true,modify:false,sale:false,price:0,seated:false,temp:false},{lid:16,id:'o-16',name:'Welcome sign',desc:'',owner:'w',ownerName:'Club Owner',mine:false,dist:19.4,touch:true,sit:false,copy:false,modify:false,sale:false,price:0,seated:false,temp:true}]})});
        if (a[1]==='CompanionObjectDo') { window.__obj=(window.__obj||[]).concat([a[2]]); const ac=a[2][0];
          if (ac==='info') return reply(m.id,true,{ok:true,reply:JSON.stringify({name:'Bench',desc:'Wooden',id:'o-11',owner:'Someone Else',creator:'Maker',ownerPerms:'modify, copy',nextPerms:'copy',everyoneCopy:false,sale:'Not',price:0,created:'2026-01-02',prims:3,scripted:true,pos:'1, 2, 3'})});
          if (ac==='contents') return reply(m.id,true,{ok:true,reply:JSON.stringify([{id:'t1',name:'sit script',kind:'LSL',mod:true,copy:true},{id:'t2',name:'sit pose',kind:'Animation',mod:true,copy:true},{id:'t3',name:'Readme',kind:'Notecard',mod:true,copy:true}])});
          return reply(m.id,true,{ok:true,reply:'done '+ac}); }
        if (a[1]==='CompanionMenus') return reply(m.id,true,{ok:true,reply:JSON.stringify(!window.__menusOn?[]:[{id:1,t:1,kind:'menu',object:'Vendor',owner:'Shop Owner',message:'Choose a colour',buttons:['Red','Green','Blue','Back','Next']},{id:2,t:2,kind:'permission',object:'Dance ball',owner:'Club',message:'',buttons:[],perms:['TriggerAnimation'],debit:false},{id:3,t:3,kind:'text',object:'Greeter',owner:'Someone',message:'Your name?',buttons:[]}])});
        if (a[1]==='CompanionMenuAnswer') { window.__ans=(window.__ans||[]).concat([a[2]]); return reply(m.id,true,{ok:true,reply:'answered '+a[2][1]}); }
        if (a[1]==='CompanionInvDo') { window.__inv=(window.__inv||[]).concat([a[2]]); return reply(m.id,true,{ok:true,reply:a[2][0]==='read'?'Line one\nLine two':a[2][0]==='sound'?'T2dnUw==':a[2][0]==='image'?'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==':'done '+a[2][0]}); }
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
      case 'places.save': settings.savedPlaces=[{name:a[0],slurl:a[1]}].concat(settings.savedPlaces||[]); return reply(m.id,true,settings.savedPlaces);
      case 'places.delete': settings.savedPlaces=(settings.savedPlaces||[]).filter(p=>p.slurl!==a[0]); return reply(m.id,true,settings.savedPlaces);
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
