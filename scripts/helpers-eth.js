const { hexDataLength } = require('@ethersproject/bytes');
const {
    L1ToL2MessageGasEstimator,
} = require('@arbitrum/sdk/dist/lib/message/L1ToL2MessageGasEstimator')
const { ethers } = require('ethers');
const { 
    hexStripZeros, 
    defaultAbiCoder: abiCoder,
    parseEther,
    formatEther,
    formatUnits
} = ethers.utils;

const { 
    pokeMeOpsAddr,
    usdtAddrArb,
    usdcAddr,
    inbox,
    l2ProviderTestnet,
    wethAddr,
    gelatoAddr,
    ETH,
    swapRouterUniAddr,
    poolFeeUni,
    chainlinkAggregatorAddr,
    l1ProviderTestnet,
    factoryABI,
    myReceiver,
    ops,
    fraxAddr
} = require('./state-vars.js');




//** Remember that LibCommon is deployed here and on helpers-arb when it should one deployment for mainnet */
async function deployContract(contractName, constrArgs) {
    let Contract;
    
    if (contractName === 'StorageBeacon') {
        const [ libCommonAddr ] = await deployContract('LibCommon');
        Contract = await hre.ethers.getContractFactory(contractName, {
            libraries: {
                LibCommon: libCommonAddr
            }
        });
    } else {
        Contract = await hre.ethers.getContractFactory(contractName);
    }

    switch(contractName) {
        case 'UpgradeableBeacon':
            contract = await Contract.deploy(constrArgs);
            break;
        case 'ozUpgradeableBeacon':
        case 'ozERC1967Proxy':
        case 'RolesAuthority':
        case 'FakeOZL':
            ([ var1, var2 ] = constrArgs);
            contract = await Contract.deploy(var1, var2);
            break;
        case 'ozERC1967Proxy':
            ([ var1, var2, var3 ] = constrArgs);
            contract = await Contract.deploy(var1, var2, var3);
            break;
        case 'StorageBeacon':
            ([ var1, var2, var3, var4 ] = constrArgs);
            contract = await Contract.deploy(var1, var2, var3, var4);
            break;
        default:
            contract = await Contract.deploy();
    }

    await contract.deployed();
    console.log(`${contractName} deployed to: `, contract.address);

    return [
        contract.address,
        contract
    ];
}

const autoRedeem2 = ethers.BigNumber.from(69073611260000000n); //*********/ minimum of 0.06907361126 ETH has to be sent
//check this again ^ 
//do a test if autoRedeem is higher than address(this).balance


async function getArbitrumParams(manualRedeem = false) {
    const maxGas = !manualRedeem ? 3000000 : 10;
    const gasPriceBid = ethers.BigNumber.from(200000000n); 

    return [
        gasPriceBid,
        maxGas
    ];
}


async function activateOzBeaconProxy(proxyAddr) {
    const proxy = await hre.ethers.getContractAt(['function sendToArb()'], proxyAddr);
    await proxy.sendToArb(ops);
}


function getEventParam(receipt) {
    return hexStripZeros(receipt.logs[0].topics[2]);
}


async function activateProxyLikeOps(proxy, taskCreator, isEvil, evilParams) { 
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [pokeMeOpsAddr],
    });

    const opsSigner = await hre.ethers.provider.getSigner(pokeMeOpsAddr);
    let iface = new ethers.utils.Interface(['function checker()']);
    const resolverData = iface.encodeFunctionData('checker');
    const ops = await hre.ethers.getContractAt('IOps', pokeMeOpsAddr);
    const resolverHash = await ops.connect(opsSigner).getResolverHash(proxy, resolverData);

    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [pokeMeOpsAddr],
    });

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [gelatoAddr],
    });

    const gelatoSigner = await hre.ethers.provider.getSigner(gelatoAddr); 
    iface = new ethers.utils.Interface([`function sendToArb(${isEvil ? 'tuple(uint256 maxSubmissionCost, uint256 gasPriceBid, uint256 autoRedeem) varConfig_, tuple(address user, address userToken, uint256 userSlippage) userDetails_)' : ')'}`]); 
    let execData;
    if (isEvil) {
        execData = iface.encodeFunctionData('sendToArb', evilParams);
    } else {
        execData = iface.encodeFunctionData('sendToArb');
    }

    const tx = await ops.connect(gelatoSigner).exec(0, ETH, taskCreator, false, false, resolverHash, proxy, execData);
    const receipt = await tx.wait();

    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [gelatoAddr],
    });

    return receipt;
}

function compareTopicWith(value, receipt) { 
    if (receipt.events) {
        for (let i=0; i < receipt.events.length; i++) {
            for (let j=0; j < receipt.events[i].topics.length; j++) {
                let topic = hexStripZeros(receipt.events[i].topics[j]);
                if (parseInt(topic) === parseInt(value)) return true;
            }
        }
        return false;
    } else {
        return false;
    }
}

function compareTopicWith2(signature, value, receipt) { 
    if (receipt.logs) {
        for (let i=0; i < receipt.logs.length; i++) {
            for (let j=0; j < receipt.logs[i].topics.length; j++) {
                if (receipt.logs[i].topics[j] === signature) {
                    let topic = hexStripZeros(receipt.logs[i].topics[j + 1]);
                    if (parseInt(topic) === parseInt(value)) return true;
                }
            }
        }
        return false;
    } else {
        return false;
    }
}


async function compareEventWithVar(receipt, variable) {
    for (let i=0; i < receipt.events.length;) {
        let { data } = receipt.events[i];
        let extraVar;

        if (data.length === 66) {
            extraVar = abiCoder.decode(['uint'], data);
            if (Number(extraVar[0]) === variable) {
                return true;
            } 
        }
        i++;
        if (i === receipt.events.length) return false;
    }
}


function getFakeOZLVars() {
    const totalVolumeInUSD = parseEther('500');
    const totalVolumeInETH = parseEther('400');
    const wethUM = parseEther('300');
    const valueUM = parseEther('200');
    const ozlBalance = parseEther('100');
    const wethUserShare = parseEther('220');
    const usdUserShare = parseEther('150');

    return [
        totalVolumeInUSD,
        totalVolumeInETH,
        wethUM,
        valueUM,
        ozlBalance,
        wethUserShare,
        usdUserShare
    ];
}


async function deploySystem(type, userDetails, signerAddr) {

    let constrArgs = [ myReceiver, getFakeOZLVars() ];

    //Deploys the fake OZL on arbitrum testnet 
    const [ fakeOZLaddr ] = await deployContract('FakeOZL', constrArgs);

    //Calculate fees on L1 > L2 arbitrum tx
    const [ gasPriceBid, maxGas ] = await getArbitrumParams();

    // Deploys Emitter
    const [ emitterAddr, emitter ] = await deployContract('Emitter');

    //Deploys ozPayMe in mainnet
    const [ ozPaymeAddr ] = await deployContract(type === 'Pessimistically' ? 'ozPayMeNoRedeem' : 'ozPayMe');

    //Deploys StorageBeacon
    const fxConfig = [
        inbox, 
        pokeMeOpsAddr,
        fakeOZLaddr,
        emitterAddr,
        gelatoAddr, 
        ETH,
        maxGas
    ];

    const eMode = [
        swapRouterUniAddr,
        chainlinkAggregatorAddr,
        poolFeeUni,
        wethAddr,
        usdcAddr
    ];


    const tokensDatabase = [
        usdtAddrArb,
        usdcAddr,
        fraxAddr
    ];

    constrArgs = [
        fxConfig,
        eMode,
        tokensDatabase,
        gasPriceBid
    ]; 

    const [ storageBeaconAddr, storageBeacon ] = await deployContract('StorageBeacon', constrArgs);

    //Deploys UpgradeableBeacon
    constrArgs = [
        ozPaymeAddr,
        storageBeaconAddr
    ];

    const [ beaconAddr, beacon ] = await deployContract('ozUpgradeableBeacon', constrArgs); 
    await storageBeacon.storeBeacon(beaconAddr);
    await emitter.storeBeacon(beaconAddr);

    //Deploys ProxyFactory
    const [ proxyFactoryAddr ] = await deployContract('ProxyFactory');

    //Deploys ozERC1967Proxy (proxy from Proxy Factory)
    constrArgs = [
        proxyFactoryAddr,
        '0x'
    ];

    const [ ozERC1967proxyAddr ] = await deployContract('ozERC1967Proxy', constrArgs);
    const proxyFactory = await hre.ethers.getContractAt(factoryABI, ozERC1967proxyAddr);
    await proxyFactory.initialize(beaconAddr);

    //Deploys Auth
    constrArgs = [
        signerAddr,
        beaconAddr
    ];

    const [ rolesAuthorityAddr, rolesAuthority ] = await deployContract('RolesAuthority', constrArgs);
    await beacon.setAuth(rolesAuthorityAddr);

    //Set ERC1967Proxy to role 1 and gives it authority to call the functions in StorageBeacon
    await rolesAuthority.setUserRole(ozERC1967proxyAddr, 1, true);

    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0x74e0ea7a', true); //issueUserID(UserConfig memory userDetails_)
    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0x68e540e5', true); //saveUserProxy(address sender_, address proxy_)
    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0xf2034a69', true); //saveTaskId(address proxy_, bytes32 id_)
    console.log('.');

    return [
        beacon,
        beaconAddr,
        ozERC1967proxyAddr, 
        storageBeacon,
        storageBeaconAddr,
        emitter,
        emitterAddr,
        fakeOZLaddr,
        eMode
    ];

}


async function storeVarsInHelpers(factory) {
    proxyFactory = factory;
}



module.exports = {
    deployContract,
    getArbitrumParams,
    activateOzBeaconProxy,
    deploySystem,
    getEventParam,
    activateProxyLikeOps,
    compareTopicWith,
    storeVarsInHelpers,
    compareEventWithVar,
    compareTopicWith2,
    getFakeOZLVars
};