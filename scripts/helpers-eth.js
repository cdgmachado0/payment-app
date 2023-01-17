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
    fraxAddr,
    proxyABIeth,
    opsL2,
    mimAddr,
    wbtcAddr
} = require('./state-vars.js');



async function deployContract(contractName, constrArgs, signer = null) {
    let signer1;
    let var1, var2, var3, var4, var5;

    if (!signer) {
        [ signer1 ] = await hre.ethers.getSigners();
        signer = signer1;
    }

    const Contract = await hre.ethers.getContractFactory(contractName);

    switch(contractName) {
        case 'UpgradeableBeacon':
            contract = await Contract.connect(signer).deploy(constrArgs, ops);
            break;
        case 'ozUpgradeableBeacon':
        case 'ozERC1967Proxy':
        case 'RolesAuthority':
        case 'FakeOZL':
        case 'ProxyFactory':
            let gas = ops;
            ([ var1, var2 ] = constrArgs);
            if (contractName === 'FakeOZL') gas = opsL2;
            contract = await Contract.connect(signer).deploy(var1, var2, gas);
            break;
        case 'ozERC1967Proxy':
            ([ var1, var2, var3 ] = constrArgs);
            contract = await Contract.connect(signer).deploy(var1, var2, var3, ops);
            break;
        case 'StorageBeacon':
            ([ var1, var2, var3, var4 ] = constrArgs);
            contract = await Contract.connect(signer).deploy(var1, var2, var3, var4, ops);
            break;
        case 'ozPayMe':
        case 'ozPayMeNoRedeem':
        case 'ImplementationMock':
        case 'FaultyOzPayMe':
        case 'FaultyOzPayMe2':
        case 'FaultyOzPayMe3':
            ([ var1, var2, var3, var4, var5, var6 ] = constrArgs);
            contract = await Contract.connect(signer).deploy(var1, var2, var3, var4, var5, var6, ops);
            break;
        default:
            contract = await Contract.connect(signer).deploy(ops);
    }

    await contract.deployed();
    console.log(`${contractName} deployed to: `, contract.address);

    return [
        contract.address,
        contract
    ];
}


async function getArbitrumParams(manualRedeem = false) {
    const maxGas = !manualRedeem ? 3000000 : 10;
    const gasPriceBid = ethers.BigNumber.from(200000000n); 

    return [
        gasPriceBid,
        maxGas
    ];
}


async function activateOzBeaconProxy(proxyAddr) {
    const proxy = await hre.ethers.getContractAt(['function sendToArb(uint256)'], proxyAddr);
    await proxy.sendToArb(parseEther('0.1'), ops);
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
    iface = new ethers.utils.Interface([`function sendToArb(${isEvil ? '(address,address,uint256,string),uint256,uint256,address)' : 'uint256)'}`]); 
    let execData;
    if (isEvil) {
        execData = iface.encodeFunctionData('sendToArb', evilParams);
    } else {
        execData = iface.encodeFunctionData('sendToArb', [ethers.FixedNumber.from('0.1')]); 
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


function getInitSelectors() {
    const iface = new ethers.utils.Interface(proxyABIeth);
    const selectors = [];
    const methods = [
        'initialize',
        'changeAccountToken',
        'changeAccountSlippage',
        'getAccountDetails',
        'changeAccountTokenNSlippage'
    ];

    for (let i=0; i < methods.length; i++) {
        selectors.push(iface.getSighash(methods[i]));
    }
    
    return selectors;
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

async function sendETH(receiver, amount) {
    const [ signer ] = await hre.ethers.getSigners();
    await signer.sendTransaction({to: receiver, value: parseEther(amount.toString())});
    const balance = await hre.ethers.provider.getBalance(receiver);
    return balance;
}

async function createProxy(factory, accountDetails) {
    const tx = await factory.createNewProxy(accountDetails, ops);
    const receipt = await tx.wait();
    return receipt.logs[0].address;
}


async function deploySystem(type, signerAddr) { 

    let constrArgs = [ myReceiver, getFakeOZLVars() ];

    //Deploys the fake OZL on arbitrum testnet 
    const [ ozDiamondAddr ] = await deployContract('FakeOZL', constrArgs);
    // const ozDiamondAddr = '0xAdc0DC1af7DF5ff763a6ce132f62B967b57E0951';


    //Calculate fees on L1 > L2 arbitrum tx
    const [ gasPriceBid, maxGas ] = await getArbitrumParams();

    // Deploys Emitter
    const [ emitterAddr, emitter ] = await deployContract('Emitter');

    //Deploys ozPayMe in mainnet
    constrArgs = [
        pokeMeOpsAddr,
        gelatoAddr,
        inbox,
        emitterAddr,
        ozDiamondAddr,
        maxGas
    ];

    const [ ozPaymeAddr ] = await deployContract(type === 'Pessimistically' ? 'ozPayMeNoRedeem' : 'ozPayMe', constrArgs);

    //Deploys StorageBeacon
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
        fraxAddr,
        mimAddr,
        wbtcAddr
    ];

    constrArgs = [
        eMode,
        tokensDatabase,
        getInitSelectors(),
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
    constrArgs = [ pokeMeOpsAddr, beaconAddr ]; 

    const [ proxyFactoryAddr ] = await deployContract(
        type === 'Pessimistically_v2' ? 'FaultyProxyFactory' : 'ProxyFactory', constrArgs
    );

    //Deploys ozERC1967Proxy (proxy from Proxy Factory)
    constrArgs = [
        proxyFactoryAddr,
        '0x'
    ];

    const [ ozERC1967proxyAddr ] = await deployContract('ozERC1967Proxy', constrArgs);
    const proxyFactory = await hre.ethers.getContractAt(factoryABI, ozERC1967proxyAddr);
    await proxyFactory.initialize(ops);

    //Deploys Auth
    constrArgs = [
        signerAddr,
        beaconAddr
    ];

    const [ rolesAuthorityAddr, rolesAuthority ] = await deployContract('RolesAuthority', constrArgs);
    await beacon.setAuth(rolesAuthorityAddr);

    //Set ERC1967Proxy to role 1 and gives it authority to call the functions in StorageBeacon
    await rolesAuthority.setUserRole(ozERC1967proxyAddr, 1, true);

    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0xcb05ce19', true); //saveUserToDetails(address,(address,address,uint256,string))
    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0xf2034a69', true); //saveTaskId(address proxy_, bytes32 id_)
    await rolesAuthority.setRoleCapability(1, storageBeaconAddr, '0x0854b85f', true);
    console.log('.');

    return [
        beacon,
        beaconAddr,
        ozERC1967proxyAddr, 
        storageBeacon,
        storageBeaconAddr,
        emitter,
        emitterAddr,
        ozDiamondAddr,
        eMode,
        proxyFactoryAddr,
        maxGas
    ];

}




module.exports = {
    deployContract,
    getArbitrumParams,
    activateOzBeaconProxy,
    deploySystem,
    getEventParam,
    activateProxyLikeOps,
    compareTopicWith,
    compareEventWithVar,
    compareTopicWith2,
    getFakeOZLVars,
    getInitSelectors,
    sendETH,
    createProxy
};