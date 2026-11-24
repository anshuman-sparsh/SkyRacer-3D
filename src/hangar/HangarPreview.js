import * as THREE from 'three';
import { HoverCraft } from '../entities/HoverCraft.js';
import { disposeObject3D } from '../utils/Memory.js';
import { boundedPixelRatio, readQualityProfile, sizeRenderer } from '../core/QualityProfile.js';

export class HangarPreview {
    constructor(host, { createRenderer = options => new THREE.WebGLRenderer(options),
        getQuality = () => readQualityProfile(window, globalThis.navigator ?? {}),
        observe = globalThis.ResizeObserver } = {}) {
        this.createRenderer=createRenderer; this.getQuality=getQuality;
        this.host=host; this.renderer=null; this.craft=null; this.frame=0;
        this.pointerId=null;
        this.dragging=false; this.angle=0.35; this.lastX=0;
        this.onDown=e=>{
            if(this.pointerId!==null || (e.pointerType==='mouse' && e.button!==0))return;
            this.pointerId=e.pointerId;this.dragging=true;this.lastX=e.clientX;
            try{host.setPointerCapture?.(e.pointerId);}catch{/* A canceled drag remains safe. */}
        };
        this.onMove=e=>{if(this.dragging && e.pointerId===this.pointerId){this.angle+=(e.clientX-this.lastX)*0.009;this.lastX=e.clientX;}};
        this.onUp=e=>{if(e.pointerId===this.pointerId)this.stopDragging();};
        host.addEventListener('pointerdown',this.onDown);
        host.addEventListener('pointermove',this.onMove);
        host.addEventListener('pointerup',this.onUp);
        host.addEventListener('pointercancel',this.onUp);
        host.addEventListener('lostpointercapture',this.onUp);
        window.addEventListener('pointerup',this.onUp);
        window.addEventListener('pointercancel',this.onUp);
        this.observer=typeof observe==='function'?new observe(()=>this.resize()):null;
        this.observer?.observe(host);
    }
    open(id) {
        if (!this.renderer) {
            try {
                this.renderer=this.createRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
                this.renderer.outputColorSpace=THREE.SRGBColorSpace;
                this.host.appendChild(this.renderer.domElement);
                this.scene=new THREE.Scene();
                this.camera=new THREE.PerspectiveCamera(38,1,.1,100);
                this.camera.position.set(6,4.7,8.5);
                this.camera.lookAt(0,0,0);
                this.scene.add(new THREE.HemisphereLight(0xb7eaff,0x17202e,2.2));
                const light=new THREE.DirectionalLight(0xffffff,2.6);
                light.position.set(3,7,5); this.scene.add(light);
                this.craft=new HoverCraft();
                this.craft.position.set(0,0,0);
                this.craft.groundAnchor.visible=false;
                this.craft.rotation.y=Math.PI;
                this.scene.add(this.craft);
            } catch {
                this.disposeRenderer();
                this.host.classList.add('is-fallback');
                return;
            }
        }
        this.host.classList.remove('is-fallback');
        this.setAircraft(id);
        this.resize();
        this.lastFrame=0;
        this.tick=(time)=>{
            if(!this.renderer || document.hidden)return;
            // Idle showroom rotation needs 30 Hz; direct dragging stays responsive.
            if(!this.dragging && this.lastFrame && time-this.lastFrame<1000/30){
                this.frame=requestAnimationFrame(this.tick);return;
            }
            if(!this.dragging)this.angle+=this.lastFrame?Math.min((time-this.lastFrame)/1000,.05)*.19:0;
            this.lastFrame=time;
            this.craft.rotation.y=Math.PI+this.angle;
            this.renderer.render(this.scene,this.camera);
            this.frame=requestAnimationFrame(this.tick);
        };
        cancelAnimationFrame(this.frame);
        this.frame=requestAnimationFrame(this.tick);
    }
    setAircraft(id){this.craft?.setAppearance(id);}
    resize() {
        if (!this.renderer)return;
        const width=Math.max(this.host.clientWidth,1),height=Math.max(this.host.clientHeight,1);
        const quality=this.getQuality();
        sizeRenderer(this.renderer,width,height,
            boundedPixelRatio(width,height,window.devicePixelRatio,quality.maxPixelRatio,750000));
        this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    }
    close(){this.disposeRenderer();}
    stopDragging(){
        const id=this.pointerId;this.pointerId=null;this.dragging=false;
        try{if(id!==null && this.host.hasPointerCapture?.(id))this.host.releasePointerCapture(id);}catch{}
    }
    disposeRenderer(){
        cancelAnimationFrame(this.frame);this.frame=0;this.lastFrame=0;
        this.stopDragging();
        if(this.craft){this.scene?.remove(this.craft);disposeObject3D(this.craft);this.craft=null;}
        if(this.renderer){this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();this.renderer=null;}
        this.scene=null;this.camera=null;this.tick=null;
    }
    dispose(){
        this.disposeRenderer();
        this.host.removeEventListener('pointerdown',this.onDown);
        this.host.removeEventListener('pointermove',this.onMove);
        this.host.removeEventListener('pointerup',this.onUp);
        this.host.removeEventListener('pointercancel',this.onUp);
        this.host.removeEventListener('lostpointercapture',this.onUp);
        window.removeEventListener('pointerup',this.onUp);
        window.removeEventListener('pointercancel',this.onUp);
        this.observer?.disconnect();
    }
}
