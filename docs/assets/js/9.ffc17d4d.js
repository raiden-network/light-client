(window.webpackJsonp=window.webpackJsonp||[]).push([[9],{361:function(e,t,n){"use strict";n.r(t);var a=n(42),s=Object(a.a)({},(function(){var e=this,t=e.$createElement,n=e._self._c||t;return n("ContentSlotsDistributor",{attrs:{"slot-key":e.$parent.slotKey}},[n("h1",{attrs:{id:"connecting"}},[n("a",{staticClass:"header-anchor",attrs:{href:"#connecting"}},[e._v("#")]),e._v(" Connecting")]),e._v(" "),n("p",[e._v("The SDK provides out of the box support for the deployed networks on "),n("code",[e._v("Görli")]),e._v(", "),n("code",[e._v("Ropsten")]),e._v(", and "),n("code",[e._v("Rinkeby")]),e._v(".")]),e._v(" "),n("p",[e._v("If you need to use the SDK on a private network, or a custom deployment you can find more information in the following "),n("RouterLink",{attrs:{to:"/private-chain/"}},[e._v("guide")]),e._v(".")],1),e._v(" "),n("h2",{attrs:{id:"raiden-light-client-test-environment"}},[n("a",{staticClass:"header-anchor",attrs:{href:"#raiden-light-client-test-environment"}},[e._v("#")]),e._v(" Raiden Light Client test environment")]),e._v(" "),n("p",[e._v("For development purposes, the Light Client uses a standalone environment. The dApp deployment "),n("a",{attrs:{href:"https://lightclient.raiden.network/",target:"_blank",rel:"noopener noreferrer"}},[e._v("lightclient.raiden.network"),n("OutboundLink")],1),e._v(" and the development version served by 'pnpm run serve' also conforms to this configuration.")]),e._v(" "),n("p",[e._v("This environment uses:")]),e._v(" "),n("ul",[n("li",[e._v("A specific version of "),n("a",{attrs:{href:"https://github.com/raiden-network/raiden/commit/ea7025739b460f940c26616ca1fccdb739b218ed",target:"_blank",rel:"noopener noreferrer"}},[e._v("Raiden"),n("OutboundLink")],1)]),e._v(" "),n("li",[e._v("A matrix transport server - "),n("code",[e._v("https://transport.demo001.env.raiden.network")])]),e._v(" "),n("li",[e._v("A PFS server - "),n("code",[e._v("https://pfs.demo001.env.raiden.network")])])]),e._v(" "),n("p",[e._v("You can find the raiden version tagged on Docker Hub under "),n("code",[e._v("raidennetwork/raiden:demoenv001")]),e._v(". To pull the image you need to run the following:")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[e._v("docker pull raidennetwork/raiden:demoenv001\n")])])]),n("p",[e._v("The transport server does not participate in the matrix federation. For this reason, you have to explicitly specify it when starting raiden. You can use the following flag:")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[e._v("--matrix-server"),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),e._v("https://transport.demo001.env.raiden.network\n")])])]),n("p",[e._v("Similarly, you also have to specify the path-finding server:")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[e._v("--pathfinding-service-address https://pfs.demo001.env.raiden.network\n")])])]),n("h2",{attrs:{id:"running-a-raiden-node-in-the-test-environment"}},[n("a",{staticClass:"header-anchor",attrs:{href:"#running-a-raiden-node-in-the-test-environment"}},[e._v("#")]),e._v(" Running a Raiden node in the test environment")]),e._v(" "),n("p",[e._v("You can easily run a python node in the test environment by using Docker. To get the supported Raiden version from "),n("a",{attrs:{href:"https://hub.docker.com/r/raidennetwork/raiden",target:"_blank",rel:"noopener noreferrer"}},[e._v("Docker Hub"),n("OutboundLink")],1),e._v(" you need to run the following command:")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[e._v("docker pull raidennetwork/raiden:demoenv001\n")])])]),n("p",[e._v("The test environment uses the "),n("strong",[e._v("Görli")]),e._v(" testnet. For the purposes of this guide, we assume that a "),n("a",{attrs:{href:"https://geth.ethereum.org/docs/",target:"_blank",rel:"noopener noreferrer"}},[e._v("geth"),n("OutboundLink")],1),e._v(" node runs locally on your computer. If you use a different ethereum client or RPC provider, please adjust accordingly.")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[e._v("geth --goerli console --cache"),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),n("span",{pre:!0,attrs:{class:"token number"}},[e._v("512")]),e._v(" --port "),n("span",{pre:!0,attrs:{class:"token number"}},[e._v("30303")]),e._v(" --rpc --rpcapi eth,net,web3,txpool --rpccorsdomain "),n("span",{pre:!0,attrs:{class:"token string"}},[e._v('"*"')]),e._v(" --rpcaddr "),n("span",{pre:!0,attrs:{class:"token string"}},[e._v('"0.0.0.0"')]),e._v("\n")])])]),n("h3",{attrs:{id:"using-docker-run"}},[n("a",{staticClass:"header-anchor",attrs:{href:"#using-docker-run"}},[e._v("#")]),e._v(" Using docker run")]),e._v(" "),n("p",[e._v("You can start the container, by using the following command:")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[e._v("docker run --rm -it "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --network"),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),e._v("host "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --mount "),n("span",{pre:!0,attrs:{class:"token assign-left variable"}},[e._v("src")]),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),e._v("/path/to/keystore,target"),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),e._v("/keystore,type"),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),e._v("bind "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    raidennetwork/raiden:demoenv001 "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --keystore-path /keystore "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --network-id "),n("span",{pre:!0,attrs:{class:"token number"}},[e._v("5")]),e._v(" "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --environment-type development "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --eth-rpc-endpoint http://127.0.0.1:8545 "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --accept-disclaimer "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --matrix-server"),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),e._v("https://transport.demo001.env.raiden.network "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --pathfinding-service-address https://pfs.demo001.env.raiden.network "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --api-address "),n("span",{pre:!0,attrs:{class:"token string"}},[e._v('"http://0.0.0.0:5001"')]),e._v("\n")])])]),n("p",[e._v("We use "),n("code",[e._v("--network=host")]),e._v(" if the ethereum node runs locally on the host machine, to provide access to it from the container.")]),e._v(" "),n("h3",{attrs:{id:"running-the-python-client-from-source"}},[n("a",{staticClass:"header-anchor",attrs:{href:"#running-the-python-client-from-source"}},[e._v("#")]),e._v(" Running the python client from source")]),e._v(" "),n("p",[e._v("If you want to use raiden from source code you can start by cloning the raiden repository, and checkout the suggested commit:")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[n("span",{pre:!0,attrs:{class:"token function"}},[e._v("git")]),e._v(" clone https://github.com/raiden-network/raiden\n"),n("span",{pre:!0,attrs:{class:"token builtin class-name"}},[e._v("cd")]),e._v(" raiden\n"),n("span",{pre:!0,attrs:{class:"token function"}},[e._v("git")]),e._v(" checkout 2e741dfdf4bfa564dec760abd5e3d8b2c9d30715\n")])])]),n("p",[e._v("Then you need to create a virtual environment using python 3.7 and activate it:")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[e._v("python3.7 -m venv .venv\n"),n("span",{pre:!0,attrs:{class:"token builtin class-name"}},[e._v("source")]),e._v(" .venv/bin/activate\n")])])]),n("p",[e._v("Before starting Raiden, you need to install its dependencies. You can install them by running:")]),e._v(" "),n("div",{staticClass:"language- extra-class"},[n("pre",{pre:!0,attrs:{class:"language-text"}},[n("code",[e._v("make install-dev\n")])])]),n("p",[e._v("After the installation, you can start Raiden by running:")]),e._v(" "),n("div",{staticClass:"language-bash extra-class"},[n("pre",{pre:!0,attrs:{class:"language-bash"}},[n("code",[e._v("raiden --keystore-path ~/.keystore "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --log-config raiden:INFO "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --api-address "),n("span",{pre:!0,attrs:{class:"token string"}},[e._v('"http://0.0.0.0:5001"')]),e._v(" "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --eth-rpc-endpoint http://localhost:8545 "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --accept-disclaimer "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --network-id "),n("span",{pre:!0,attrs:{class:"token number"}},[e._v("5")]),e._v(" "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --environment-type development "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --routing-mode"),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),e._v("pfs "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --matrix-server"),n("span",{pre:!0,attrs:{class:"token operator"}},[e._v("=")]),e._v("https://transport.demo001.env.raiden.network "),n("span",{pre:!0,attrs:{class:"token punctuation"}},[e._v("\\")]),e._v("\n    --pathfinding-service-address https://pfs.demo001.env.raiden.network \n\n")])])]),n("p",[e._v("After you get your node running, you will be able to receive token transfers from the Light Client dApp and SDK.")])])}),[],!1,null,null,null);t.default=s.exports}}]);