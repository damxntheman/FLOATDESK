import test from 'node:test';
import assert from 'node:assert/strict';

test('iPhone Mode reveals Mac apps only after explicit approval and launches by ID', async (t) => {
  const globals = ['document','window','location','navigator','sessionStorage','WebSocket'];
  const descriptors = globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis,name)]);
  t.after(() => {
    for (const [name, desc] of descriptors) {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete globalThis[name];
    }
  });
  const els = new Map();
  function el() {
    return {
      disabled:false,hidden:true,textContent:'',srcObject:null,style:{},controls:true,children:[],
      listeners:{},append(...children){this.children.push(...children)},
      replaceChildren(...children){this.children=[...children]},
      addEventListener(type,listener){this.listeners[type]=listener},
      click(){return this.listeners.click?.()},
      play(){return Promise.resolve()},
      pause(){}
    };
  }
  const ids = [
    'create','join','share','stopShare','stop','pip','refresh','video',
    'status','code','joinCode','touchPad','controlStatus','approveControl','revokeControl',
    'requestControl','releaseControl','expandView','exitView','immersiveToolbar',
    'previewSource','hostPreview','hostPreviewNote','toggleHostPreview',
    'iphoneModePanel','appsGrid','appAccessStatus','appLaunchStatus',
    'requestApps','releaseApps','approveApps','revokeApps','openDesktop'
  ];
  ids.forEach(id=>els.set(id,el()));
  const stored = new Map();
  const sent = [];
  let socket;
  class FakeSocket {
    static OPEN=1; static CONNECTING=0; static CLOSED=3;
    readyState=1;
    constructor(){socket=this}
    send(text){sent.push(JSON.parse(text))}
  }
  const setup = {
    document:{
      getElementById(id){return els.get(id)},
      createElement(){return el()},
      body:{classList:{toggle(){}}},
      addEventListener(){}
    },
    window:{addEventListener(){}},
    location:{protocol:'https:',host:'mac.invalid:8788'},
    navigator:{},
    sessionStorage:{
      getItem(k){return stored.get(k)||null},
      setItem(k,v){stored.set(k,v)},
      removeItem(k){stored.delete(k)}
    },
    WebSocket:FakeSocket
  };
  for(const [name,val] of Object.entries(setup))
    Object.defineProperty(globalThis,name,{value:val,configurable:true,writable:true});
  await import('../public/client.js');
  const find=id=>els.get(id);
  async function receive(data) {
    socket.onmessage({data:JSON.stringify(data)});
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(find('iphoneModePanel').hidden,true);
  await receive({type:'joined',code:'ABCDEFGH',token:'phone-token'});
  assert.equal(find('iphoneModePanel').hidden,false);
  assert.equal(find('requestApps').disabled,false);
  assert.equal(find('openDesktop').disabled,true,'no desktop stream means no view transition');
  find('requestApps').click();
  assert.equal(sent.at(-1).type,'app-access-request');
  assert.equal(sent.some(x=>x.type==='app-list'),false);
  await receive({type:'app-access-state',state:'requested'});
  assert.equal(find('requestApps').disabled,true);
  await receive({type:'app-access-state',state:'active'});
  assert.equal(sent.at(-1).type,'app-list','phone requests catalog only after Mac consent');
  const id='a'.repeat(24);
  await receive({type:'app-list-result',apps:[
    {id,name:'Finder'},
    {id:'b'.repeat(24),name:'<img src=x onerror=alert(1)>'},
    {id:'../../bin/sh',name:'Not allowed'}
  ]});
  assert.equal(find('appsGrid').children.length,2,'rejects invalid app IDs');
  assert.equal(find('appsGrid').children[1].children[1].textContent,'<img src=x onerror=alert(1)>',
    'app names inserted safely as plain text, never HTML');
  find('appsGrid').children[0].click();
  assert.deepEqual(sent.at(-1),{type:'app-launch',id});
  assert.match(find('appLaunchStatus').textContent,/Opening Finder/);
  await receive({type:'app-launch-result',id,name:'Finder'});
  assert.match(find('appLaunchStatus').textContent,/opened on your Mac/);
  await receive({type:'app-access-state',state:'off',message:'Permission expired'});
  assert.equal(find('appsGrid').children.length,1);
  assert.equal(find('requestApps').disabled,false);
  const current=sent.length;
  find('appsGrid').children[0].click?.();
  assert.equal(sent.length,current,'no launch capability after revocation');
  assert.equal(stored.size,1,'app revocation retains authorized pairing');
});
