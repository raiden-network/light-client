"use strict";(globalThis["webpackChunkraiden_dapp"]=globalThis["webpackChunkraiden_dapp"]||[]).push([[229],{24332:(t,e,s)=>{s.d(e,{Z:()=>m});s(62001);var i=s(23413),n=s(93206),o=s(64171);const c=t=>{const{touchstartX:e,touchendX:s,touchstartY:i,touchendY:n}=t,o=.5,c=16;t.offsetX=s-e,t.offsetY=n-i,Math.abs(t.offsetY)<o*Math.abs(t.offsetX)&&(t.left&&s<e-c&&t.left(t),t.right&&s>e+c&&t.right(t)),Math.abs(t.offsetX)<o*Math.abs(t.offsetY)&&(t.up&&n<i-c&&t.up(t),t.down&&n>i+c&&t.down(t))};function a(t,e){const s=t.changedTouches[0];e.touchstartX=s.clientX,e.touchstartY=s.clientY,e.start&&e.start(Object.assign(t,e))}function h(t,e){const s=t.changedTouches[0];e.touchendX=s.clientX,e.touchendY=s.clientY,e.end&&e.end(Object.assign(t,e)),c(e)}function l(t,e){const s=t.changedTouches[0];e.touchmoveX=s.clientX,e.touchmoveY=s.clientY,e.move&&e.move(Object.assign(t,e))}function r(t){const e={touchstartX:0,touchstartY:0,touchendX:0,touchendY:0,touchmoveX:0,touchmoveY:0,offsetX:0,offsetY:0,left:t.left,right:t.right,up:t.up,down:t.down,start:t.start,move:t.move,end:t.end};return{touchstart:t=>a(t,e),touchend:t=>h(t,e),touchmove:t=>l(t,e)}}function u(t,e,s){const i=e.value,n=i.parent?t.parentElement:t,c=i.options||{passive:!0};if(!n)return;const a=r(e.value);n._touchHandlers=Object(n._touchHandlers),n._touchHandlers[s.context._uid]=a,(0,o.XP)(a).forEach((t=>{n.addEventListener(t,a[t],c)}))}function d(t,e,s){const i=e.value.parent?t.parentElement:t;if(!i||!i._touchHandlers)return;const n=i._touchHandlers[s.context._uid];(0,o.XP)(n).forEach((t=>{i.removeEventListener(t,n[t])})),delete i._touchHandlers[s.context._uid]}const v={inserted:u,unbind:d},p=v;var f=s(67437),g=s(17878);const m=i.Z.extend({name:"v-switch",directives:{Touch:p},props:{inset:Boolean,loading:{type:[Boolean,String],default:!1},flat:{type:Boolean,default:!1}},computed:{classes(){return{...n.Z.options.computed.classes.call(this),"v-input--selection-controls v-input--switch":!0,"v-input--switch--flat":this.flat,"v-input--switch--inset":this.inset}},attrs(){return{"aria-checked":String(this.isActive),"aria-disabled":String(this.isDisabled),role:"switch"}},validationState(){return this.hasError&&this.shouldValidate?"error":this.hasSuccess?"success":null!==this.hasColor?this.computedColor:void 0},switchData(){return this.setTextColor(this.loading?void 0:this.validationState,{class:this.themeClasses})}},methods:{genDefaultSlot(){return[this.genSwitch(),this.genLabel()]},genSwitch(){const{title:t,...e}=this.attrs$;return this.$createElement("div",{staticClass:"v-input--selection-controls__input"},[this.genInput("checkbox",{...this.attrs,...e}),this.genRipple(this.setTextColor(this.validationState,{directives:[{name:"touch",value:{left:this.onSwipeLeft,right:this.onSwipeRight}}]})),this.$createElement("div",{staticClass:"v-input--switch__track",...this.switchData}),this.$createElement("div",{staticClass:"v-input--switch__thumb",...this.switchData},[this.genProgress()])])},genProgress(){return this.$createElement(f.b0,{},[!1===this.loading?null:this.$slots.progress||this.$createElement(g.Z,{props:{color:!0===this.loading||""===this.loading?this.color||"primary":this.loading,size:16,width:2,indeterminate:!0}})])},onSwipeLeft(){this.isActive&&this.onChange()},onSwipeRight(){this.isActive||this.onChange()},onKeydown(t){(t.keyCode===o.Do.left&&this.isActive||t.keyCode===o.Do.right&&!this.isActive)&&this.onChange()}}})},76785:(t,e,s)=>{s.r(e),s.d(e,{default:()=>S});var i=function(){var t=this,e=t.$createElement,s=t._self._c||e;return s("div",{staticClass:"settings"},[s("v-list",{attrs:{"two-line":"",subheader:""}},[s("v-list-item",[s("v-list-item-content",[s("v-list-item-title",[t._v(" "+t._s(t.$t("settings.raiden-account.title"))+" ")]),s("v-list-item-subtitle",[t._v(" "+t._s(t.$t("settings.raiden-account.description"))+" ")])],1),s("v-list-item-action",[s("v-switch",{model:{value:t.useRaidenAccountModel,callback:function(e){t.useRaidenAccountModel=e},expression:"useRaidenAccountModel"}})],1)],1)],1)],1)},n=[],o=s(59312),c=s(57102),a=s(77382);const{mapState:h,mapMutations:l}=(0,a._p)("userSettings");let r=class extends c.w3{get useRaidenAccountModel(){return this.useRaidenAccount}set useRaidenAccountModel(t){t?this.enableRaidenAccount():this.disableRaidenAccount()}};r=(0,o.__decorate)([(0,c.wA)({computed:{...h(["useRaidenAccount"])},methods:{...l(["enableRaidenAccount","disableRaidenAccount"])}})],r);const u=r,d=u;var v=s(79917),p=s(43453),f=s.n(p),g=s(50948),m=s(19021),w=s(6546),b=s(3950),_=s(24332),A=(0,v.Z)(d,i,n,!1,null,"3588b810",null);const S=A.exports;f()(A,{VList:g.Z,VListItem:m.Z,VListItemAction:w.Z,VListItemContent:b.km,VListItemSubtitle:b.oZ,VListItemTitle:b.V9,VSwitch:_.Z})}}]);