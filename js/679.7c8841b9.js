"use strict";(globalThis["webpackChunkraiden_dapp"]=globalThis["webpackChunkraiden_dapp"]||[]).push([[679],{50572:(e,t,i)=>{i.d(t,{Z:()=>l});var r=i(59312),n=i(57102),o=i(77382);const{mapGetters:s,mapMutations:a}=(0,o._p)("userSettings");let d=class extends n.w3{constructor(){super(...arguments),this.linkingFailed=!1,this.linkingInProgress=!1}get canLink(){return!0}get providerOptions(){return{}}created(){this.checkCorrectMixinUsage(),this.loadSavedProviderOptions()}checkCorrectMixinUsage(){if(void 0===this.providerFactory)throw new Error("Incorrect usage of mixin. Missing definition of provider to use.")}loadSavedProviderOptions(){const e=this.getEthereumProviderOptions()(this.providerFactory.providerName);for(const[t,i]of Object.entries(e))this[t]=i}saveProviderOptions(){this.saveEthereumProviderOptions({providerName:this.providerFactory.providerName,providerOptions:this.providerOptions})}async link(){if(!this.canLink||this.linkingInProgress)throw new Error("Can not link now!");this.linkingFailed=!1,this.linkingInProgress=!0;try{const e=await this.providerFactory.link(this.providerOptions);this.saveProviderOptions(),this.emitLinkEstablished(e)}catch{this.linkingFailed=!0}finally{this.linkingInProgress=!1}}emitLinkEstablished(e){return e}emitCancel(){}};(0,r.__decorate)([(0,n.y1)("linkEstablished")],d.prototype,"emitLinkEstablished",null),(0,r.__decorate)([(0,n.y1)("cancel")],d.prototype,"emitCancel",null),d=(0,r.__decorate)([(0,n.wA)({methods:{...s(["getEthereumProviderOptions"]),...a(["saveEthereumProviderOptions"])}})],d);const l=d},55373:(e,t,i)=>{i.d(t,{Z:()=>y});var r=function(){var e=this,t=e.$createElement,i=e._self._c||t;return i("raiden-dialog",{staticClass:"ethereum-provider-base-dialog",attrs:{width:"472",visible:!0},on:{close:e.emitCancel}},[i("v-card-title",{staticClass:"ethereum-provider-base-dialog__header"},[e._v(e._s(e.header))]),i("v-card-text",[e.description?i("p",{staticClass:"ethereum-provider-base-dialog__description"},[e._v(" "+e._s(e.description)+" ")]):e._e(),e.linkingInProgress?e._e():e._t("default"),e.linkingInProgress?i("spinner"):e._e(),e.linkingFailed?i("v-alert",{staticClass:"ethereum-provider-base-dialog__error text-left font-weight-light",attrs:{color:"error",icon:"warning"}},[e._v(" "+e._s(e.errorMessage)+" ")]):e._e()],2),i("v-card-actions",[i("action-button",{attrs:{"data-cy":"ethereum-provider-base-dialog__button",enabled:e.buttonEnabled,text:e.$t("connection-manager.dialogs.base.link-button"),width:"200px"},on:{click:e.emitLink}})],1)],1)},n=[],o=i(59312),s=i(57102),a=i(52291),d=i(7674),l=i(98071);let c=class extends s.w3{get buttonEnabled(){return this.canLink&&!this.linkingInProgress}emitCancel(){}emitLink(){}};(0,o.__decorate)([(0,s.fI)({type:String,required:!0})],c.prototype,"header",void 0),(0,o.__decorate)([(0,s.fI)({type:String})],c.prototype,"description",void 0),(0,o.__decorate)([(0,s.fI)({type:Boolean,required:!0})],c.prototype,"canLink",void 0),(0,o.__decorate)([(0,s.fI)({type:Boolean,required:!0})],c.prototype,"linkingInProgress",void 0),(0,o.__decorate)([(0,s.fI)({type:Boolean,required:!0})],c.prototype,"linkingFailed",void 0),(0,o.__decorate)([(0,s.fI)({type:String,required:!0})],c.prototype,"errorMessage",void 0),(0,o.__decorate)([(0,s.y1)("cancel")],c.prototype,"emitCancel",null),(0,o.__decorate)([(0,s.y1)("link")],c.prototype,"emitLink",null),c=(0,o.__decorate)([(0,s.wA)({components:{ActionButton:a.Z,RaidenDialog:d.Z,Spinner:l.Z}})],c);const p=c,g=p;var h=i(79917),v=i(43453),u=i.n(v),_=i(42664),k=i(23399),m=(0,h.Z)(g,r,n,!1,null,null,null);const y=m.exports;u()(m,{VAlert:_.Z,VCardActions:k.h7,VCardText:k.ZB,VCardTitle:k.EB})},13679:(e,t,i)=>{i.r(t),i.d(t,{default:()=>u});var r=function(){var e=this,t=e.$createElement,i=e._self._c||t;return i("ethereum-provider-base-dialog",{attrs:{header:e.$t("connection-manager.dialogs.injected-provider.header"),description:e.$t("connection-manager.dialogs.injected-provider.description"),"can-link":e.canLink,"linking-in-progress":e.linkingInProgress,"linking-failed":e.linkingFailed,"error-message":e.$t("connection-manager.dialogs.injected-provider.error-message")},on:{link:e.link,cancel:e.emitCancel}})},n=[],o=i(59312),s=i(57102),a=i(55373),d=i(50572),l=i(77801);let c=class extends((0,s.Wr)(d.Z)){constructor(){super(...arguments),this.providerFactory=l.Ec}};c=(0,o.__decorate)([(0,s.wA)({components:{EthereumProviderBaseDialog:a.Z}})],c);const p=c,g=p;var h=i(79917),v=(0,h.Z)(g,r,n,!1,null,null,null);const u=v.exports}}]);