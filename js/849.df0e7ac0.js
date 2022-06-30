"use strict";(globalThis["webpackChunkraiden_dapp"]=globalThis["webpackChunkraiden_dapp"]||[]).push([[849],{97266:(e,t,s)=>{s.r(t),s.d(t,{default:()=>_});var n=function(){var e=this,t=e.$createElement,s=e._self._c||t;return s("div",{staticClass:"open-channel",attrs:{"data-cy":"open-channel"}},[s("channel-open-action",{attrs:{"dialog-title":e.$t("open-channel.title"),"show-progress-in-dialog":""},on:{completed:e.onOpenChannelCompleted},scopedSlots:e._u([{key:"default",fn:function(t){var n=t.runAction,a=t.confirmButtonLabel;return[s("channel-action-form",{attrs:{"token-address":e.tokenAddress,"partner-address":e.partnerAddress,"token-amount":e.depositAmount,"confirm-button-label":a,"run-action":n,"token-amount-editable":"","limit-to-token-balance":"","sticky-button":""}})]}}])})],1)},a=[],o=s(59312),i=s(57102),r=s(80310),p=s(5733),c=s(31034),d=s(6395);const h={title:"open-channel.steps.open.title",description:"open-channel.steps.open.description",active:!1,completed:!1,failed:!1},l={title:"open-channel.steps.transfer.title",description:"open-channel.steps.transfer.description",active:!1,completed:!1,failed:!1},u={title:"open-channel.steps.deposit.title",description:"open-channel.steps.deposit.description",active:!1,completed:!1,failed:!1};let m=class extends((0,i.Wr)(d.Z)){constructor(){super(...arguments),this.openStep=Object.assign({},h),this.transferStep=Object.assign({},l),this.depositStep=Object.assign({},u),this.withDeposit=!1}get confirmButtonLabel(){return this.$t("open-channel.open-button")}get steps(){return this.withDeposit?[this.openStep,this.transferStep,this.depositStep]:[this.openStep]}resetStepsState(){this.openStep=Object.assign({},h),this.transferStep=Object.assign({},l),this.depositStep=Object.assign({},u)}handleOpenEvents(e){switch(e.type){case c.GM.OPENED:this.openStep.completed=!0,this.openStep.active=!1,this.transferStep.active=!0;break;case c.GM.CONFIRMED:this.transferStep.completed=!0,this.transferStep.active=!1,this.depositStep.active=!0;break;case c.GM.DEPOSITED:this.depositStep.completed=!0,this.depositStep.active=!1;break;default:break}}async handleAction(e){this.withDeposit=e.tokenAmount.gt(p._Y),this.openStep.active=!0,await this.$raiden.openChannel(e.tokenAddress,e.partnerAddress,e.tokenAmount,this.handleOpenEvents)}};m=(0,o.__decorate)([i.wA],m);const k=m,S=k;var f,b,A=s(79917),v=(0,A.Z)(S,f,b,!1,null,null,null);const g=v.exports;var O=s(55093),C=s(28341);let w=class extends((0,i.Wr)(O.Z)){constructor(){super(...arguments),this.tokenAddress="",this.partnerAddress="",this.depositAmount=""}async created(){await this.parseTokenRouteParameter(),this.parsePartnerRouteParameter(),this.parseDepositQueryParameter()}onOpenChannelCompleted(){this.navigateToSelectTransferTarget(this.tokenAddress)}async parseTokenRouteParameter(){const{token:e}=this.$route.params;e&&C.Z.checkAddressChecksum(e)?this.tokenAddress=e:this.navigateToHome()}parsePartnerRouteParameter(){const{partner:e}=this.$route.params;e&&C.Z.checkAddressChecksum(e)?this.partnerAddress=e:this.navigateToTokenSelect()}parseDepositQueryParameter(){const{deposit:e}=this.$route.query;e&&(this.depositAmount=e)}};w=(0,o.__decorate)([(0,i.wA)({components:{ChannelActionForm:r.Z,ChannelOpenAction:g}})],w);const T=w,y=T;var P=(0,A.Z)(y,n,a,!1,null,"825f8b98",null);const _=P.exports}}]);