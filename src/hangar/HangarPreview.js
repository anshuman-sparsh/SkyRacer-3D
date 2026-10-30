import * as THREE from 'three';
import { HoverCraft } from '../entities/HoverCraft.js';
import { disposeObject3D } from '../utils/Memory.js';

export class HangarPreview {
    constructor(host) {
        this.host=host; this.renderer=null; this.craft=null; this.frame=0;
        this.dragging=false; this.angle=0.35; this.lastX=0;
        this.onDown=e=>{this.dragging=true;this.lastX=e.clientX;host.setPointerCapture?.(e.pointerId);};
        this.onMove=e=>{if(this.dragging){this.angle+=(e.clientX-this.lastX)*0.009;this.lastX=e.clientX;}};
        this.onUp=()=>{this.dragging=false;};
        host.addEventListener('pointerdown',this.onDown);
        host.addEventListener('pointermove',this.onMove);
        host.addEventListener('pointerup',this.onUp);
        host.addEventListener('pointercancel',this.onUp);
    }
    open(id) {
        if (!this.renderer) {
            try {
                this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
                this.renderer.outputColorSpace=THREE.SRGBColorSpace;
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
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
            if(!this.renderer)return;
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
        this.renderer.setSize(width,height,false);
        this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    }
    close(){cancelAnimationFrame(this.frame);this.frame=0;this.lastFrame=0;}
    disposeRenderer(){
        this.close();
        if(this.craft){this.scene?.remove(this.craft);disposeObject3D(this.craft);this.craft=null;}
        if(this.renderer){this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();this.renderer=null;}
    }
    dispose(){
        this.disposeRenderer();
        this.host.removeEventListener('pointerdown',this.onDown);
        this.host.removeEventListener('pointermove',this.onMove);
        this.host.removeEventListener('pointerup',this.onUp);
        this.host.removeEventListener('pointercancel',this.onUp);
    }
}
