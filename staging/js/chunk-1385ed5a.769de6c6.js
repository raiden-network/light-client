(window["webpackJsonp"]=window["webpackJsonp"]||[]).push([["chunk-1385ed5a"],{"0527":function(t,e,n){"use strict";var o=function(){var t=this,e=t.$createElement,n=t._self._c||e;return n("div",{staticClass:"spinner",class:{"spinner--blocking":!t.inline}},[n("div",{staticClass:"spinner__circle",style:t.style})])},r=[],a=n("9ab4"),c=n("60a3");function i(t){return i="function"===typeof Symbol&&"symbol"===typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"===typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},i(t)}function u(t,e){if(!(t instanceof e))throw new TypeError("Cannot call a class as a function")}function s(t,e){for(var n=0;n<e.length;n++){var o=e[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(t,o.key,o)}}function l(t,e,n){return e&&s(t.prototype,e),n&&s(t,n),t}function f(t,e){if("function"!==typeof e&&null!==e)throw new TypeError("Super expression must either be null or a function");t.prototype=Object.create(e&&e.prototype,{constructor:{value:t,writable:!0,configurable:!0}}),e&&p(t,e)}function p(t,e){return p=Object.setPrototypeOf||function(t,e){return t.__proto__=e,t},p(t,e)}function d(t){var e=v();return function(){var n,o=_(t);if(e){var r=_(this).constructor;n=Reflect.construct(o,arguments,r)}else n=o.apply(this,arguments);return b(this,n)}}function b(t,e){return!e||"object"!==i(e)&&"function"!==typeof e?y(t):e}function y(t){if(void 0===t)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return t}function v(){if("undefined"===typeof Reflect||!Reflect.construct)return!1;if(Reflect.construct.sham)return!1;if("function"===typeof Proxy)return!0;try{return Date.prototype.toString.call(Reflect.construct(Date,[],(function(){}))),!0}catch(t){return!1}}function _(t){return _=Object.setPrototypeOf?Object.getPrototypeOf:function(t){return t.__proto__||Object.getPrototypeOf(t)},_(t)}var h=function(t){f(n,t);var e=d(n);function n(){return u(this,n),e.apply(this,arguments)}return l(n,[{key:"style",get:function(){return{width:"".concat(this.size,"px"),height:"".concat(this.size,"px"),borderWidth:"".concat(this.width,"px")}}}]),n}(c["e"]);Object(a["b"])([Object(c["d"])({type:Boolean,default:!1})],h.prototype,"inline",void 0),Object(a["b"])([Object(c["d"])({type:Number,default:120})],h.prototype,"size",void 0),Object(a["b"])([Object(c["d"])({type:Number,default:7})],h.prototype,"width",void 0),h=Object(a["b"])([Object(c["a"])({})],h);var g=h,O=g,w=(n("9a5d"),n("2877")),m=Object(w["a"])(O,o,r,!1,null,"4d07af13",null);e["a"]=m.exports},"248b":function(t,e,n){"use strict";n.r(e);var o=function(){var t=this,e=t.$createElement,o=t._self._c||e;return o("div",{staticClass:"backup-state"},[o("v-row",{attrs:{"no-gutters":""}},[o("v-col",{staticClass:"backup-state__description",attrs:{cols:"12"}},[t._v(" "+t._s(t.$t("backup-state.description"))+" ")])],1),o("v-list",{staticClass:"backup-state__buttons"},[o("v-tooltip",{attrs:{color:"#ea6464",bottom:""},scopedSlots:t._u([{key:"activator",fn:function(e){var r=e.on;return[o("div",t._g({},t.isConnected?null:r),[o("v-list-item",{staticClass:"backup-state__buttons__download-state",attrs:{disabled:!t.isConnected},on:{click:function(e){t.downloadState=!0}}},[o("div",{staticClass:"backup-state__buttons__download-state__icon",class:{"backup-state__buttons__download-state__icon disabled-icon":!t.isConnected}},[o("v-img",{attrs:{src:n("e038")}})],1),o("v-list-item-content",[o("div",{staticClass:"backup-state__buttons__download-state__title"},[t._v(" "+t._s(t.$t("backup-state.download"))+" ")])])],1)],1)]}}])},[o("span",[t._v(t._s(t.$t("backup-state.disabled-download")))])]),o("v-tooltip",{attrs:{color:"#ea6464",bottom:""},scopedSlots:t._u([{key:"activator",fn:function(e){var r=e.on;return[o("div",t._g({},t.isConnected?r:null),[o("v-list-item",{staticClass:"backup-state__buttons__upload-state",on:{click:function(e){t.uploadState=!0}}},[o("div",{staticClass:"backup-state__buttons__upload-state__icon",class:{"backup-state__buttons__upload-state__icon disabled-icon":t.isConnected}},[o("v-img",{attrs:{src:n("3549")}})],1),o("v-list-item-content",[o("div",{staticClass:"backup-state__buttons__upload-state__title"},[t._v(" "+t._s(t.$t("backup-state.upload"))+" ")])])],1)],1)]}}])},[o("span",[t._v(t._s(t.$t("backup-state.disabled-upload")))])])],1),o("download-state-dialog",{attrs:{visible:t.downloadState},on:{cancel:function(e){t.downloadState=!1}}}),o("upload-state-dialog",{attrs:{visible:t.uploadState},on:{cancel:function(e){t.uploadState=!1}}})],1)},r=[],a=n("9ab4"),c=n("60a3"),i=n("2f62"),u=function(){var t=this,e=t.$createElement,o=t._self._c||e;return o("raiden-dialog",{staticClass:"download-state",attrs:{visible:t.visible},on:{close:t.cancel}},[o("v-card-title",[t._v(" "+t._s(t.$t("backup-state.download"))+" ")]),o("v-card-text",[o("v-row",{attrs:{align:"center",justify:"center","no-gutters":""}},[o("v-col",{attrs:{cols:"6"}},[o("v-img",{staticClass:"download-state__warning",attrs:{src:n("afb7")}})],1),o("v-col",{attrs:{cols:"12"}},[t._v(" "+t._s(t.$t("backup-state.download-warning"))+" ")])],1)],1),o("v-card-actions",[o("action-button",{attrs:{enabled:"","full-width":"",text:t.$t("backup-state.download-button")},on:{click:function(e){return t.getAndDownloadState()}}})],1)],1)},s=[],l=n("4795"),f=n.n(l),p=n("66bc"),d=n("750b"),b=n("152b");function y(t){return y="function"===typeof Symbol&&"symbol"===typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"===typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},y(t)}function v(t,e,n,o,r,a,c){try{var i=t[a](c),u=i.value}catch(s){return void n(s)}i.done?e(u):Promise.resolve(u).then(o,r)}function _(t){return function(){var e=this,n=arguments;return new Promise((function(o,r){var a=t.apply(e,n);function c(t){v(a,o,r,c,i,"next",t)}function i(t){v(a,o,r,c,i,"throw",t)}c(void 0)}))}}function h(t,e){if(!(t instanceof e))throw new TypeError("Cannot call a class as a function")}function g(t,e){for(var n=0;n<e.length;n++){var o=e[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(t,o.key,o)}}function O(t,e,n){return e&&g(t.prototype,e),n&&g(t,n),t}function w(t,e){if("function"!==typeof e&&null!==e)throw new TypeError("Super expression must either be null or a function");t.prototype=Object.create(e&&e.prototype,{constructor:{value:t,writable:!0,configurable:!0}}),e&&m(t,e)}function m(t,e){return m=Object.setPrototypeOf||function(t,e){return t.__proto__=e,t},m(t,e)}function j(t){var e=C();return function(){var n,o=D(t);if(e){var r=D(this).constructor;n=Reflect.construct(o,arguments,r)}else n=o.apply(this,arguments);return S(this,n)}}function S(t,e){return!e||"object"!==y(e)&&"function"!==typeof e?k(t):e}function k(t){if(void 0===t)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return t}function C(){if("undefined"===typeof Reflect||!Reflect.construct)return!1;if(Reflect.construct.sham)return!1;if("function"===typeof Proxy)return!0;try{return Date.prototype.toString.call(Reflect.construct(Date,[],(function(){}))),!0}catch(t){return!1}}function D(t){return D=Object.setPrototypeOf?Object.getPrototypeOf:function(t){return t.__proto__||Object.getPrototypeOf(t)},D(t)}var P=function(t){w(n,t);var e=j(n);function n(){return h(this,n),e.apply(this,arguments)}return O(n,[{key:"cancel",value:function(){}},{key:"getAndDownloadState",value:function(){var t=_(f.a.mark((function t(){var e,n,o,r,a,c;return f.a.wrap((function(t){while(1)switch(t.prev=t.next){case 0:return this.navigateToHome(),t.next=3,this.$raiden.getState();case 3:e=t.sent,n=JSON.stringify(e),o="raiden_lc_state_".concat((new Date).toISOString(),".json"),r=new File([n],o,{type:"application/json"}),a=URL.createObjectURL(r),c=document.createElement("a"),c.href=a,c.download=o,c.style.display="none",document.body.appendChild(c),c.click(),setTimeout((function(){URL.revokeObjectURL(a),document.body.removeChild(c)}),0);case 15:case"end":return t.stop()}}),t,this)})));function e(){return t.apply(this,arguments)}return e}()}]),n}(Object(c["c"])(b["a"]));Object(a["b"])([Object(c["d"])({required:!0,type:Boolean,default:!1})],P.prototype,"visible",void 0),Object(a["b"])([Object(c["b"])()],P.prototype,"cancel",null),P=Object(a["b"])([Object(c["a"])({components:{RaidenDialog:p["a"],ActionButton:d["a"]}})],P);var z=P,R=z,x=(n("2597"),n("2877")),E=n("6544"),T=n.n(E),$=n("99d9"),V=n("62ad"),L=n("adda"),I=n("0fd9"),A=Object(x["a"])(R,u,s,!1,null,"eb26b892",null),B=A.exports;T()(A,{VCardActions:$["a"],VCardText:$["b"],VCardTitle:$["c"],VCol:V["a"],VImg:L["a"],VRow:I["a"]});var U=function(){var t=this,e=t.$createElement,n=t._self._c||e;return n("raiden-dialog",{staticClass:"upload-state",attrs:{visible:t.visible},on:{close:t.cancel}},[n("v-card-title",[t._v(t._s(t.$t("backup-state.upload")))]),t.dropzoneErrorMessage?n("v-card-text",[n("v-row",{staticClass:"upload-state__error",attrs:{justify:"center","no-gutters":""}},[t._v(" "+t._s(t.$t("backup-state.upload-error"))+" ")])],1):t.uploadingStateProgress?n("v-card-actions",[n("spinner")],1):n("v-card-actions",[n("div",{staticClass:"upload-state__dropzone",class:{"upload-state__dropzone active-dropzone":t.activeDropzone},on:{dragenter:t.onDropzoneEnter,dragleave:t.onDropzoneLeave,dragover:function(t){t.preventDefault()},drop:t.onDropzoneDrop}},[n("v-row",{staticClass:"upload-state__dropzone__icon",attrs:{justify:"center","no-gutters":""}},[n("v-icon",{staticClass:"upload-state__dropzone__icon--inactive-dropzone",class:{"upload-state__dropzone__icon--active-dropzone":t.activeDropzone},attrs:{size:"90px"}},[t._v(" mdi-upload ")])],1),n("v-row",{staticClass:"upload-state__dropzone__description",attrs:{justify:"center","no-gutters":""}},[t._v(" "+t._s(t.$t("backup-state.upload-drag-and-drop"))+" ")]),n("v-row",{staticClass:"upload-state__dropzone__description",attrs:{justify:"center","no-gutters":""}},[t._v(" "+t._s(t.$t("backup-state.upload-divider"))+" ")]),n("v-row",{staticClass:"upload-state__dropzone__button"},[n("input",{ref:"stateInput",attrs:{type:"file",hidden:""},on:{change:t.onFileSelect}}),n("action-button",{attrs:{enabled:!t.activeDropzone,ghost:"",text:t.$t("backup-state.upload-button")},on:{click:function(e){return t.$refs.stateInput.click()}}})],1)],1)])],1)},F=[],J=n("0527");function M(t){return M="function"===typeof Symbol&&"symbol"===typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"===typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},M(t)}function N(t,e){if(!(t instanceof e))throw new TypeError("Cannot call a class as a function")}function q(t,e){for(var n=0;n<e.length;n++){var o=e[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(t,o.key,o)}}function H(t,e,n){return e&&q(t.prototype,e),n&&q(t,n),t}function W(t,e){if("function"!==typeof e&&null!==e)throw new TypeError("Super expression must either be null or a function");t.prototype=Object.create(e&&e.prototype,{constructor:{value:t,writable:!0,configurable:!0}}),e&&G(t,e)}function G(t,e){return G=Object.setPrototypeOf||function(t,e){return t.__proto__=e,t},G(t,e)}function K(t){var e=Y();return function(){var n,o=Z(t);if(e){var r=Z(this).constructor;n=Reflect.construct(o,arguments,r)}else n=o.apply(this,arguments);return Q(this,n)}}function Q(t,e){return!e||"object"!==M(e)&&"function"!==typeof e?X(t):e}function X(t){if(void 0===t)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return t}function Y(){if("undefined"===typeof Reflect||!Reflect.construct)return!1;if(Reflect.construct.sham)return!1;if("function"===typeof Proxy)return!0;try{return Date.prototype.toString.call(Reflect.construct(Date,[],(function(){}))),!0}catch(t){return!1}}function Z(t){return Z=Object.setPrototypeOf?Object.getPrototypeOf:function(t){return t.__proto__||Object.getPrototypeOf(t)},Z(t)}var tt=function(t){W(n,t);var e=K(n);function n(){var t;return N(this,n),t=e.apply(this,arguments),t.dragCount=0,t.activeDropzone=!1,t.dropzoneErrorMessage=!1,t.uploadingStateProgress=!1,t}return H(n,[{key:"cancel",value:function(){}},{key:"onDropzoneEnter",value:function(t){t.preventDefault(),this.dragCount++,this.activeDropzone=!0}},{key:"onDropzoneLeave",value:function(t){t.preventDefault(),this.dragCount--,this.dragCount<=0&&(this.activeDropzone=!1)}},{key:"onDropzoneDrop",value:function(t){var e,n;if(t.preventDefault(),this.activeDropzone=!1,null===(e=t.dataTransfer)||void 0===e?void 0:e.files){var o=null===(n=t.dataTransfer)||void 0===n?void 0:n.files;this.uploadState(o)}}},{key:"onFileSelect",value:function(t){if(t.target.files){var e=t.target.files;this.uploadState(e)}}},{key:"dropzoneError",value:function(){var t=this;this.uploadingStateProgress=!1,this.dropzoneErrorMessage=!0,setTimeout((function(){t.dropzoneErrorMessage=!1}),2e3)}},{key:"uploadState",value:function(t){var e=this;t.length>1&&this.dropzoneError();var n=new FileReader;n.onload=function(t){var n=t.target;if(t.target)try{e.uploadingStateProgress=!0;var o=n.result;JSON.parse(String(o)),e.$store.commit("backupState",o),setTimeout((function(){e.uploadingStateProgress=!1,e.cancel()}),1e3)}catch(r){e.dropzoneError()}},n.readAsText(t[0])}}]),n}(c["e"]);Object(a["b"])([Object(c["d"])({required:!0,type:Boolean,default:!1})],tt.prototype,"visible",void 0),Object(a["b"])([Object(c["b"])()],tt.prototype,"cancel",null),tt=Object(a["b"])([Object(c["a"])({components:{RaidenDialog:p["a"],ActionButton:d["a"],Spinner:J["a"]}})],tt);var et=tt,nt=et,ot=(n("a172"),n("132d")),rt=Object(x["a"])(nt,U,F,!1,null,"6ee17aab",null),at=rt.exports;function ct(t){return ct="function"===typeof Symbol&&"symbol"===typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"===typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},ct(t)}function it(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(t);e&&(o=o.filter((function(e){return Object.getOwnPropertyDescriptor(t,e).enumerable}))),n.push.apply(n,o)}return n}function ut(t){for(var e=1;e<arguments.length;e++){var n=null!=arguments[e]?arguments[e]:{};e%2?it(Object(n),!0).forEach((function(e){st(t,e,n[e])})):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):it(Object(n)).forEach((function(e){Object.defineProperty(t,e,Object.getOwnPropertyDescriptor(n,e))}))}return t}function st(t,e,n){return e in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function lt(t,e){if(!(t instanceof e))throw new TypeError("Cannot call a class as a function")}function ft(t,e){if("function"!==typeof e&&null!==e)throw new TypeError("Super expression must either be null or a function");t.prototype=Object.create(e&&e.prototype,{constructor:{value:t,writable:!0,configurable:!0}}),e&&pt(t,e)}function pt(t,e){return pt=Object.setPrototypeOf||function(t,e){return t.__proto__=e,t},pt(t,e)}function dt(t){var e=vt();return function(){var n,o=_t(t);if(e){var r=_t(this).constructor;n=Reflect.construct(o,arguments,r)}else n=o.apply(this,arguments);return bt(this,n)}}function bt(t,e){return!e||"object"!==ct(e)&&"function"!==typeof e?yt(t):e}function yt(t){if(void 0===t)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return t}function vt(){if("undefined"===typeof Reflect||!Reflect.construct)return!1;if(Reflect.construct.sham)return!1;if("function"===typeof Proxy)return!0;try{return Date.prototype.toString.call(Reflect.construct(Date,[],(function(){}))),!0}catch(t){return!1}}function _t(t){return _t=Object.setPrototypeOf?Object.getPrototypeOf:function(t){return t.__proto__||Object.getPrototypeOf(t)},_t(t)}T()(rt,{VCardActions:$["a"],VCardText:$["b"],VCardTitle:$["c"],VIcon:ot["a"],VRow:I["a"]});var ht=function(t){ft(n,t);var e=dt(n);function n(){var t;return lt(this,n),t=e.apply(this,arguments),t.downloadState=!1,t.uploadState=!1,t}return n}(c["e"]);ht=Object(a["b"])([Object(c["a"])({components:{DownloadStateDialog:B,UploadStateDialog:at},computed:ut({},Object(i["c"])(["isConnected"]))})],ht);var gt=ht,Ot=gt,wt=(n("81b8"),n("88605")),mt=n("da13"),jt=n("5d23"),St=n("3a2f"),kt=Object(x["a"])(Ot,o,r,!1,null,"5a9a62f0",null);e["default"]=kt.exports;T()(kt,{VCol:V["a"],VImg:L["a"],VList:wt["a"],VListItem:mt["a"],VListItemContent:jt["b"],VRow:I["a"],VTooltip:St["a"]})},2597:function(t,e,n){"use strict";var o=n("48ae"),r=n.n(o);r.a},3549:function(t,e,n){t.exports=n.p+"img/state_upload.dea399eb.png"},"41fd":function(t,e,n){},"48ae":function(t,e,n){},"507f":function(t,e,n){},"81b8":function(t,e,n){"use strict";var o=n("bcd0"),r=n.n(o);r.a},"9a5d":function(t,e,n){"use strict";var o=n("507f"),r=n.n(o);r.a},a172:function(t,e,n){"use strict";var o=n("41fd"),r=n.n(o);r.a},bcd0:function(t,e,n){},e038:function(t,e,n){t.exports=n.p+"img/state_download.fc1f0473.png"}}]);