import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/managers/InputManager.js';
function target() {
    const listeners=new Map();const capture=new Set();
    return {listeners,classList:{add(){},remove(){}},style:{},
        addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
        removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
        emit(name,event){for(const fn of listeners.get(name)??[])fn(event);},
        setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id)};
}
function setup(t) {
    const before=globalThis.window,win=target(),surface=target(),boost=target();globalThis.window=win;
    const input=new InputManager(win,{touchSurface:surface,boostButton:boost});
    t.after(()=>{input.destroy();globalThis.window=before;});return {win,surface,boost,input};
}
const pointer=(id,x=0,y=0)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
const key=code=>({code,target:{closest:()=>null},preventDefault(){}});

test('steering and boost use independent fingers; coalesced positions retain existing axes',t=>{
    const {input,win,surface,boost}=setup(t);
    surface.emit('pointerdown',pointer(1,50,50));boost.emit('pointerdown',pointer(2));
    win.emit('pointermove',{...pointer(1,55,45),getCoalescedEvents:()=>[pointer(1,94,6)]});
    input.update(.05);assert.ok(input.state.steer>0.6);assert.ok(input.state.pitch>0.6);assert.equal(input.state.boost,true);
    win.emit('pointerup',pointer(2));assert.equal(input.state.boost,false);assert.equal(input.controlPointerId,1);
    win.emit('pointercancel',pointer(1));input.update(.05);assert.ok(input.state.steer<.3);
});

test('releasing Space, Shift, or pointer never cancels another held boost source',t=>{
    const {input,win,boost}=setup(t);
    win.emit('keydown',key('Space'));win.emit('keydown',key('ShiftLeft'));boost.emit('pointerdown',pointer(2));
    win.emit('keyup',key('Space'));assert.equal(input.state.boost,true);
    win.emit('pointerup',pointer(2));assert.equal(input.state.boost,true);
    win.emit('keyup',key('ShiftLeft'));assert.equal(input.state.boost,false);
    win.emit('keydown',key('KeyA'));win.emit('keydown',key('ArrowLeft'));win.emit('keyup',key('KeyA'));
    assert.equal(input.state.moveLeft,true);win.emit('keyup',key('ArrowLeft'));assert.equal(input.state.moveLeft,false);
});

test('capture failure, pointer loss, orientation and blur cannot leave steering or boost stuck',t=>{
    const {input,win,surface,boost}=setup(t);
    surface.setPointerCapture=boost.setPointerCapture=()=>{throw Error('detached');};
    surface.emit('pointerdown',pointer(1));boost.emit('pointerdown',pointer(2));
    win.emit('pointermove',pointer(1,44,-44));input.update(.05);
    win.emit('pointercancel',pointer(1));win.emit('pointerup',pointer(2));assert.equal(input.state.boost,false);
    surface.emit('pointerdown',pointer(3));boost.emit('pointerdown',pointer(4));win.emit('keydown',key('KeyW'));
    input.cancelPointers();assert.equal(input.controlPointerId,null);assert.equal(input.state.steer,0);
    assert.equal(input.state.moveUp,true,'orientation cancels fingers without dropping keyboard sources');
    win.emit('blur',{});assert.equal(input.state.moveUp,false);assert.equal(input.state.boost,false);
});

test('context menus/selection are suppressed only on game surfaces and destroy removes listeners',t=>{
    const {input,win,surface,boost}=setup(t);let prevented=0;
    surface.emit('contextmenu',{preventDefault(){prevented++;}});
    surface.emit('selectstart',{preventDefault(){prevented++;}});
    boost.emit('contextmenu',{preventDefault(){prevented++;}});assert.equal(prevented,3);
    input.destroy();
    for(const element of [win,surface,boost])for(const listeners of element.listeners.values())assert.equal(listeners.size,0);
});
