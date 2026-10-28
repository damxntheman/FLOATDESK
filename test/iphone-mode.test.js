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
    'requestApps','releaseApps','approveApps','revokeApps','openDesktop',
    'iphoneModeHome', 'terminalPanel', 'terminalTranscript', 'terminalForm', 'terminalCommand',
    'terminalStatus', 'requestTerminal', 'releaseTerminal', 'approveTerminal', 'revokeTerminal',
    'closeTerminal', 'runTerminalCommand', 'cmdHelp', 'cmdDate', 'cmdUptime', 'cmdSystem',
    'filesPanel','filesGrid','filesStatus','filesRootLabel','filesFolderPath','filesLimitNote',
    'chooseFiles','revokeFiles','requestFiles','releaseFiles','closeFiles','filesUp',
    'openFinderDesktop', 'probeCompanion', 'companionStatus', 'inspectNativeHost',
    'nativeHostStatus', 'nativeHostServices'
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
  assert.equal(find('probeCompanion').disabled,true,'only Mac host can probe native companion');
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
    {id,name:'Finder',experience:'mobile-files'},
    {id:'b'.repeat(24),name:'<img src=x onerror=alert(1)>'},
    {id:'c'.repeat(24),name:'Terminal',experience:'mobile-terminal-preview'},
    {id:'../../bin/sh',name:'Not allowed'}
  ]});
  assert.equal(find('appsGrid').children.length,3,'rejects invalid app IDs');
  assert.equal(find('appsGrid').children[1].children[1].textContent,'<img src=x onerror=alert(1)>',
    'app names inserted safely as plain text, never HTML');
  const prior=sent.length;
  find('appsGrid').children[0].click();
  assert.equal(find('filesPanel').hidden,false,'Finder opens phone-native Files view');
  assert.equal(find('iphoneModeHome').hidden,true);
  assert.equal(sent.length,prior,'no automatic Mac app launch or folder access');
  find('requestFiles').click();
  assert.deepEqual(sent.at(-1),{type:'files-request'});
  await receive({type:'files-state',state:'requested'});
  assert.equal(find('chooseFiles').disabled,true,'remote viewer cannot open Mac picker');
  await receive({type:'files-state',state:'selecting'});
  await receive({type:'files-state',state:'active'});
  await receive({type:'files-root',label:'Projects'});
  assert.deepEqual(sent.at(-1),{type:'files-list',folder:'.'});
  assert.equal(find('filesRootLabel').textContent,'Projects');
  await receive({type:'files-list-result',folder:'',entries:[
    {name:'Music',kind:'folder'},
    {name:'private.txt',kind:'file'},
    {name:'<img onerror=alert(1)>',kind:'file'}
  ],truncated:false});
  assert.equal(find('filesGrid').children.length,3);
  assert.equal(find('filesGrid').children[1].disabled,true,'file content is not accessible');
  assert.equal(find('filesGrid').children[2].children[1].textContent,'<img onerror=alert(1)>');
  find('filesGrid').children[0].click();
  assert.deepEqual(sent.at(-1),{type:'files-list',folder:'Music'});
  await receive({type:'files-list-result',folder:'Music',entries:[{name:'mix.flp',kind:'file'}],truncated:false});
  assert.equal(find('filesFolderPath').textContent,'/Music');
  find('filesUp').click();
  assert.deepEqual(sent.at(-1),{type:'files-list',folder:'.'});
  await receive({type:'files-list-result',folder:'',entries:[],truncated:false});
  find('openFinderDesktop').click();
  assert.deepEqual(sent.at(-1),{type:'app-launch',id},'Finder desktop fallback is explicit');
  await receive({type:'app-launch-result',id,name:'Finder'});
  assert.match(find('appLaunchStatus').textContent,/opened on your Mac/);
  await receive({type:'files-state',state:'off',message:'Revoked'});
  assert.equal(find('filesGrid').children.length,1,'revoke clears folder metadata');
  assert.equal(find('filesUp').disabled,true);
  find('closeFiles').click();
  assert.equal(find('filesPanel').hidden,true);
  assert.equal(find('iphoneModeHome').hidden,false);
  // The canonical Terminal tile opens a phone-native Preview instead of
  // launching Terminal.app in the desktop. Diagnostics remain separately gated.
  const beforeTerminal=sent.length;
  find('appsGrid').children[2].click();
  assert.equal(find('terminalPanel').hidden,false);
  assert.equal(find('iphoneModeHome').hidden,true);
  assert.equal(sent.length,beforeTerminal,'opening phone UI does not issue Mac commands');
  assert.equal(find('terminalCommand').disabled,true);
  find('requestTerminal').click();
  assert.deepEqual(sent.at(-1),{type:'terminal-request'});
  await receive({type:'terminal-state',state:'requested'});
  assert.equal(find('terminalCommand').disabled,true);
  await receive({type:'terminal-state',state:'active'});
  assert.equal(find('terminalCommand').disabled,false);
  find('terminalCommand').value='ls';
  const beforeUnsafe=sent.length;
  find('terminalForm').listeners.submit({preventDefault(){}});
  assert.equal(sent.length,beforeUnsafe,'unsupported shell commands are blocked in UI');
  find('terminalCommand').value='uptime';
  find('terminalForm').listeners.submit({preventDefault(){}});
  assert.deepEqual(sent.at(-1),{type:'terminal-command',command:'uptime'});
  await receive({type:'terminal-output',lines:['Mac uptime: 1d 3h 5m']});
  assert.match(find('terminalTranscript').children.at(-1).textContent,/Mac uptime:/);
  await receive({type:'terminal-state',state:'off'});
  assert.equal(find('terminalCommand').disabled,true);
  assert.equal(find('terminalTranscript').children.length,1,'revocation clears diagnostics output');
  find('closeTerminal').click();
  assert.equal(find('terminalPanel').hidden,true);
  assert.equal(find('iphoneModeHome').hidden,false);
  await receive({type:'app-access-state',state:'off',message:'Permission expired'});
  assert.equal(find('appsGrid').children.length,1);
  assert.equal(find('requestApps').disabled,false);
  const current=sent.length;
  find('appsGrid').children[0].click?.();
  assert.equal(sent.length,current,'no launch capability after revocation');
  assert.equal(stored.size,1,'app revocation retains authorized pairing');
});
