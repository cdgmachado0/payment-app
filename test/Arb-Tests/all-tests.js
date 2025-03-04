const { ethers } = require("ethers");
const assert = require('assert');
const { parseEther, formatEther } = ethers.utils;
require('dotenv').config();

const { err } = require('../errors.js'); 

const { 
    balanceOfOZL, 
    transferOZL, 
    withdrawShareOZL, 
    getVarsForHelpers,
    sendETH,
    enableWithdrawals,
    deploy,
    getOzelIndex,
    addTokenToDatabase,
    getRegulatorCounter,
    getTestingNumber,
    replaceForModVersion,
    queryTokenDatabase,
    removeTokenFromDatabase,
    getAccData,
    sendETHWithAlias
} = require('../../scripts/helpers-arb.js');

const { 
    usdtAddrArb,
    defaultSlippage,
    nullAddr,
    deadAddr,
    crvTricrypto,
    diamondABI,
    usxAddr,
    dForcePoolAddr,
    ops,
    protocolFee,
    tokensDatabaseL1,
    usdcAddr,
    crv2PoolAddr
} = require('../../scripts/state-vars.js');



let accountDetails;
let FRAX, MIM, USDT, USDC;
let callerAddr, caller2Addr;
let ozelIndex, newOzelIndex;
let balance, OZLbalanceFirstUser, OZLbalanceSecondUser, totalOZLusers;
let deployedDiamond;
let preYvCrvBalance, currYvCrvBalance;
let toTransfer;
let evilAmount, evilSwapDetails;
let accounts, signers, regulatorCounter, higherIndex;
let receipt;
let iface, abi;
let selector, balanceWETH, balanceUSDT, balanceMIM;
let yvCrvTri, testingNum, balanceUSDC, balanceTri;
let ozlDiamond, owner;
let addFlag, tokenSwap;

/**
 * DURATION of all tests: 2:47 mins
 */



/**
 * Since Curve doesn't have testnets, sendETH() sends ETH directly to
 * exchangeToAccountToken() which would simulate an Arbitrum L1 > L2 tx where
 * sendToArb() in L1 in ozPayMe would send the ETH to OZLFacet in L2.
*/
describe('Integration testing', async function () {
    this.timeout(1000000);

    before( async () => {
        const deployedVars = await deploy();
        ({
            deployedDiamond, 
            WETH,
            USDT,
            WBTC,
            USDC,
            MIM,
            FRAX,
            crvTri,
            callerAddr, 
            caller2Addr,
            ozlFacet,
            yvCrvTri
        } = deployedVars);
    
        getVarsForHelpers(deployedDiamond, ozlFacet);
        accountDetails = getAccData(callerAddr, tokensDatabaseL1.fraxAddr, defaultSlippage);

        ozlDiamond = await hre.ethers.getContractAt(diamondABI, deployedDiamond.address);
        await ozlDiamond.setAuthorizedCaller(callerAddr, true, ops);
    });

    
    /**
     * Since Curve doesn't have testnets, sendETH() sends ETH directly to
     * exchangeToAccountToken() which would simulate an Arbitrum L1 > L2 tx where
     * sendToArb() in L1 in ozPayMe would send the ETH to OZLFacet in L2,
     * 
     * Meant to be run as one test.
    */

    describe('1st user, 1st transfer', async () => {
        it('should convert ETH to token (FRAX)', async () => {
            receipt = await sendETH(accountDetails); 
            assert(formatEther(await FRAX.balanceOf(callerAddr)) > 0);
        });

        it('should initiate the Ozel index', async () => {
            ozelIndex = await getOzelIndex();
            assert.equal(Number(formatEther(ozelIndex)), 12000000);
        });

        it('should allocate 1st user with OZL tokens', async () => {
            assert.equal(await balanceOfOZL(callerAddr), 100.0);
        });

        it('should allocate OZLDiamond with yvCrvTricrypto tokens', async () => {
            preYvCrvBalance = formatEther(await yvCrvTri.balanceOf(deployedDiamond.address));
            assert(preYvCrvBalance > 0);
        });
    });

    describe('2nd user, 1st transfer', async () => {
        it('should convert ETH to token (WBTC)', async () => {
            accountDetails = getAccData(caller2Addr, tokensDatabaseL1.wbtcAddr, defaultSlippage);

            await sendETH(accountDetails); 
            assert(formatEther(await FRAX.balanceOf(callerAddr)) > 0);
        });

        it('should re-calculate the Ozel index', async () => {
            ozelIndex = await getOzelIndex();
            assert.equal(Number(formatEther(ozelIndex)), 6000000);
        });

        it('should distribute OZL tokens equally between users', async () => {
            assert.equal(await balanceOfOZL(callerAddr), 50.0);
            assert.equal(await balanceOfOZL(caller2Addr), 50.0);
        });

        it('should add more yvCrvTricrypto tokens to OZLDiamond', async () => {
            currYvCrvBalance = formatEther(await yvCrvTri.balanceOf(deployedDiamond.address));
            assert(currYvCrvBalance > preYvCrvBalance);
        });
    });

    describe('1st user, 2nd transfer', async () => {
        it('should convert ETH to token (MIM)', async () => {
            accountDetails = getAccData(callerAddr, tokensDatabaseL1.mimAddr, defaultSlippage);

            await sendETH(accountDetails);
            balanceMIM = await MIM.balanceOf(callerAddr);
            assert(formatEther(balanceMIM) > 0);

            //Cleans up by sending all MIM to another user
            await MIM.transfer(caller2Addr, balanceMIM);
        });
        
        it('should decrease the Ozel index to its lowest level', async () => {
            newOzelIndex = await getOzelIndex();
            assert(newOzelIndex < ozelIndex);
        });

        it('should leave the first user with more OZL tokens than 2nd user', async () => {
            OZLbalanceFirstUser = await balanceOfOZL(callerAddr);
            OZLbalanceSecondUser = await balanceOfOZL(caller2Addr);
            assert(OZLbalanceFirstUser > OZLbalanceSecondUser);

            totalOZLusers = OZLbalanceFirstUser + OZLbalanceSecondUser;
            assert(totalOZLusers <= 100 && totalOZLusers >= 99.9);
        });

        it("should increase yvCrvTricrypto's balance on OZLDiamond", async () => {
            preYvCrvBalance = currYvCrvBalance;
            currYvCrvBalance = formatEther(await yvCrvTri.balanceOf(deployedDiamond.address));
            assert(currYvCrvBalance > preYvCrvBalance);
        });
    });

    describe("1st user's transfer of OZL tokens", async () => {
        it('should transfer half of OZL tokens to 2nd user', async () => {
            await transferOZL(caller2Addr, parseEther((OZLbalanceFirstUser / 2).toString()));            
            OZLbalanceFirstUser = await balanceOfOZL(callerAddr);
            OZLbalanceSecondUser = await balanceOfOZL(caller2Addr);
            assert(OZLbalanceSecondUser > OZLbalanceFirstUser);

            totalOZLusers = OZLbalanceFirstUser + OZLbalanceSecondUser;
            assert(totalOZLusers <= 100 && totalOZLusers >= 99.9);
        });
    });

    describe("1st user's OZL withdrawal", async () => {
        it("should have a balance of the dapp's fees on token (USDC)", async () => {
            await enableWithdrawals(true);
            accountDetails = getAccData(callerAddr, tokensDatabaseL1.usdcAddr, defaultSlippage);
            await withdrawShareOZL(accountDetails, callerAddr, parseEther((await balanceOfOZL(callerAddr)).toString()));
            balance = await USDC.balanceOf(callerAddr);
            assert(balance > 0);
        });

        it('should leave 2nd user with all OZL tokens', async () => {
            OZLbalanceFirstUser = await balanceOfOZL(callerAddr);
            OZLbalanceSecondUser = await balanceOfOZL(caller2Addr);
            ozelIndex = await getOzelIndex();

            assert.equal(OZLbalanceFirstUser, 0);
            assert.equal(OZLbalanceSecondUser, 100.0);
        });
    });

    describe('1st user, 3rd and 4th transfers', async () => {
        it('should leave the 2nd user with more OZL tokens', async() => {
            await sendETH(accountDetails);
            OZLbalanceFirstUser = await balanceOfOZL(callerAddr);
            OZLbalanceSecondUser = await balanceOfOZL(caller2Addr);
            assert(OZLbalanceSecondUser > OZLbalanceFirstUser);

            totalOZLusers = OZLbalanceFirstUser + OZLbalanceSecondUser;
            assert(totalOZLusers <= 100 && totalOZLusers >= 99.9);
        });

        it('should leave the 1st user with more OZL tokens after 2nd transfer 1/3', async () => {
            toTransfer = await balanceOfOZL(caller2Addr) / 3;
            await transferOZL(callerAddr, parseEther(toTransfer.toString()), 1);
            OZLbalanceFirstUser = await balanceOfOZL(callerAddr);
            OZLbalanceSecondUser = await balanceOfOZL(caller2Addr);
            assert(OZLbalanceFirstUser > OZLbalanceSecondUser);

            totalOZLusers = OZLbalanceFirstUser + OZLbalanceSecondUser;
            assert(totalOZLusers <= 100 && totalOZLusers >= 99.9);

        });
    });

    describe('2nd user withdraws 1/3 OZL tokens', async () => {
        it("should have a balance of the dapp's fees on account token (USDT)", async () => {
            accountDetails = getAccData(caller2Addr, tokensDatabaseL1.usdtAddr, defaultSlippage);
            await withdrawShareOZL(accountDetails, caller2Addr, parseEther(toTransfer.toString()), 1);
            balance = await USDT.balanceOf(caller2Addr);
            assert(balance > 0);
        });

        it('leave 1st user with more OZL tokens', async () => {
            OZLbalanceFirstUser = await balanceOfOZL(callerAddr);
            OZLbalanceSecondUser = await balanceOfOZL(caller2Addr);
            assert(OZLbalanceFirstUser > OZLbalanceSecondUser);

            totalOZLusers = OZLbalanceFirstUser + OZLbalanceSecondUser;
            assert(totalOZLusers <= 100 && totalOZLusers >= 99.9);
        });

        it('should leave OZLDiamond with a reduction on yvCrvTricrypto tokens', async () => {
            preYvCrvBalance = currYvCrvBalance;
            currYvCrvBalance = formatEther(await yvCrvTri.balanceOf(deployedDiamond.address));
            assert(currYvCrvBalance < preYvCrvBalance);
        });
    });
});



/**
 * Specific unit-tests for certain functions within Arbitrum contracts.
 */
describe('Unit testing', async function () {
    this.timeout(1000000);

    before( async () => {
        const deployedVars = await deploy();
        ({
            deployedDiamond, 
            WETH,
            USDT,
            WBTC,
            USDC,
            MIM,
            FRAX,
            crvTri,
            callerAddr, 
            caller2Addr,
            ozlFacet,
            yvCrvTri,
            USX
        } = deployedVars);
    
        ([ signer1, signer2 ] = await hre.ethers.getSigners());
        
        getVarsForHelpers(deployedDiamond, ozlFacet);
        accountDetails = getAccData(callerAddr, tokensDatabaseL1.fraxAddr, defaultSlippage);

        ozlDiamond = await hre.ethers.getContractAt(diamondABI, deployedDiamond.address);
        await ozlDiamond.setAuthorizedCaller(callerAddr, true, ops);
        evilAmount = parseEther('1000');
    });

    describe('OZLFacet', async () => {
        describe('exchangeToAccountToken()', async () => {
            it('should get in accountPayments the exact amount of ETH sent to the account', async () => {
                await sendETH(accountDetails);
                const payments = await ozlDiamond.getAccountPayments(deadAddr);
                assert.equal(formatEther(payments), 10);
            });

            it('should fail with user as address(0)', async () => {
                accountDetails = getAccData(nullAddr, tokensDatabaseL1.fraxAddr, defaultSlippage);
                await assert.rejects(async () => {
                    await sendETH(accountDetails);
                }, {
                    name: 'Error',
                    message: (await err()).zeroAddress 
                });
            });
    
            it('should fail with account token as address(0)', async () => {
                accountDetails = getAccData(callerAddr, nullAddr, defaultSlippage);
                await assert.rejects(async () => {
                    await sendETH(accountDetails);
                }, {
                    name: 'Error',
                    message: (await err()).zeroAddress 
                });
            });
    
            it('should fail with slippage as 0', async () => {
                accountDetails = getAccData(callerAddr, tokensDatabaseL1.fraxAddr, 0);
                await assert.rejects(async () => {
                    await sendETH(accountDetails);
                }, {
                    name: 'Error',
                    message: (await err()).zeroSlippage 
                });
            });
    
            it('should fail when account token is not in database', async () => {
                accountDetails = getAccData(callerAddr, deadAddr, defaultSlippage);
                await assert.rejects(async () => {
                    await sendETH(accountDetails);
                }, {
                    name: 'Error',
                    message: (await err(deadAddr)).tokenNotFound 
                });
            });
    
            it('should fail when msg.value is equal to 0', async () => {
                accountDetails = getAccData(callerAddr, tokensDatabaseL1.usdcAddr, defaultSlippage);
                await assert.rejects(async () => {
                    await sendETH(accountDetails, 'no value');
                }, {
                    name: 'Error',
                    message: (await err()).zeroMsgValue 
                });
            });

            it('should not allow a swap in normal condition with the l1Check disabled / exchangeToAccountToken() - changeL1Check()', async () => {
                accountDetails = getAccData(callerAddr, tokensDatabaseL1.usdcAddr, defaultSlippage);
                await ozlDiamond.changeL1Check(false);
                ops.value = parseEther('1');

                await assert.rejects(async () => {
                    await ozlDiamond.exchangeToAccountToken(accountDetails, parseEther('1'), deadAddr, ops);
                }, {
                    name: 'Error',
                    message: (await err(tokensDatabaseL1.usdcAddr)).tokenNotFound 
                });

                //Clean up
                await ozlDiamond.changeL1Check(true);
            });

            /**
             * This is test is for bridging is eliminated from the system, so the token checks are done exclusively for L2 addresses
             */
            it('should allow a swap after disabling the l1Check and only adding an l2Address (without l1Address) / exchangeToAccountToken() - changeL1Check()', async () => {
                tokenSwap = [
                    1,
                    0,
                    usdtAddrArb,
                    usdcAddr,
                    crv2PoolAddr
                ];
                token = [ tokensDatabaseL1.usdcAddr, usdcAddr ];
                await removeTokenFromDatabase(tokenSwap, token);

                token[0] = nullAddr;
                await addTokenToDatabase(tokenSwap, token);
                await ozlDiamond.changeL1Check(false);

                accountDetails = getAccData(callerAddr, usdcAddr, defaultSlippage);
                ops.value = parseEther('1');
                await ozlDiamond.exchangeToAccountToken(accountDetails, parseEther('1'), deadAddr, ops);

                //Clean up
                await ozlDiamond.changeL1Check(true);
                await removeTokenFromDatabase(tokenSwap, token);
                token[0] = tokensDatabaseL1.usdcAddr;
                await addTokenToDatabase(tokenSwap, token);
            });

            it('shoud not allow an authorized user to call the function through ozDiamond / exchangeToAccountToken()', async () => {
                data = getAccData(callerAddr, tokensDatabaseL1.fraxAddr, defaultSlippage);
                amount = parseEther('1');
                ops.value = amount;
                const [ signer1, signer2 ] = await hre.ethers.getSigners();

                await assert.rejects(async () => {
                    await ozlDiamond.connect(signer2).exchangeToAccountToken(data, amount, deadAddr, ops);
                }, {
                    name: 'Error',
                    message: (await err(caller2Addr)).notAuthorized 
                });

                //Clean up
                if (ops.value) delete ops.value;
            });
        });

        describe('withdrawUserShare()', async () => {
            beforeEach(async () => await enableWithdrawals(true));

            it('should fail with user as address(0)', async () => {
                accountDetails = getAccData(nullAddr, tokensDatabaseL1.fraxAddr, defaultSlippage);
                await assert.rejects(async () => {
                    await withdrawShareOZL(accountDetails, callerAddr, parseEther((await balanceOfOZL(callerAddr)).toString()));
                }, {
                    name: 'Error',
                    message: (await err()).zeroAddress 
                });
            });
    
            it('should fail with account token as address(0)', async () => {
                accountDetails = getAccData(callerAddr, nullAddr, defaultSlippage);
                await assert.rejects(async () => {
                    await withdrawShareOZL(accountDetails, callerAddr, parseEther((await balanceOfOZL(callerAddr)).toString()));
                }, {
                    name: 'Error',
                    message: (await err()).zeroAddress 
                });
            });
    
            it('should fail with account slippage as 0', async () => {
                accountDetails = getAccData(callerAddr, tokensDatabaseL1.fraxAddr, 0);
                await assert.rejects(async () => {
                    await withdrawShareOZL(accountDetails, callerAddr, parseEther((await balanceOfOZL(callerAddr)).toString()));
                }, {
                    name: 'Error',
                    message: (await err()).zeroSlippage 
                });
            });
    
            it('should fail when account token is not in database', async () => {
                accountDetails = getAccData(callerAddr, deadAddr, defaultSlippage);
                await assert.rejects(async () => {
                    await withdrawShareOZL(accountDetails, callerAddr, parseEther((await balanceOfOZL(callerAddr)).toString()));
                }, {
                    name: 'Error',
                    message: (await err(deadAddr)).tokenNotFound 
                });
            });

            it('should fail with receiver as address(0)', async () => {
                accountDetails = getAccData(callerAddr, tokensDatabaseL1.fraxAddr, defaultSlippage);
                await assert.rejects(async () => {
                    await withdrawShareOZL(accountDetails, nullAddr, parseEther((await balanceOfOZL(callerAddr)).toString()));
                }, {
                    name: 'Error',
                    message: (await err()).zeroAddress 
                });
            });

            it('should fail with shares set as 0', async () => {
                await assert.rejects(async () => {
                    await withdrawShareOZL(accountDetails, callerAddr, 0);
                }, {
                    name: 'Error',
                    message: (await err()).zeroShares 
                });
            });
        });

        describe('addTokenToDatabase() / removeTokenFromDatabase()', async () => {
            beforeEach(async () => {
                //dForcePool --> USX: 0 / USDT: 2 / USDC: 1
                tokenSwap = [
                    2,
                    0,
                    usdtAddrArb,
                    usxAddr,
                    dForcePoolAddr
                ];

                token = [ tokensDatabaseL1.usxAddr, usxAddr ];
                if (!addFlag) await addTokenToDatabase(tokenSwap, token);
            });

            afterEach(() => addFlag = true);

            it('should allow the owner to add a new token (USX) to database / addTokenToDatabase()', async () => {
                balanceUSX = await USX.balanceOf(callerAddr);
                assert.equal(formatEther(balanceUSX), 0);
                
                accountDetails = getAccData(callerAddr, tokensDatabaseL1.usxAddr, defaultSlippage);
                await sendETH(accountDetails);
                
                balanceUSX = await USX.balanceOf(callerAddr);
                assert(formatEther(balanceUSX) > 0)
        
                doesExist = await queryTokenDatabase(usxAddr);
                assert(doesExist);
            });

            it('should not allow an unauthorized user to add a new token to database / addTokenToDatabase()', async () => {
                tokenSwap[3] = deadAddr;
                token = token.map(token => token = deadAddr);

                await assert.rejects(async () => {
                    await addTokenToDatabase(tokenSwap, token, 1);
                }, {
                    name: 'Error',
                    message: (await err(2)).notAuthorized 
                });
            });

            it('should allow the owner to remove a token (USX) from the database / removeTokenFromDatabase()', async () => {
                doesExist = await queryTokenDatabase(usxAddr);
                assert(doesExist);

                token[0] = tokensDatabaseL1.usxAddr;
                token[1] = usxAddr;
                await removeTokenFromDatabase(tokenSwap, token);
                doesExist = await queryTokenDatabase(usxAddr);
                assert(!doesExist);
            });

            it('should not allow an unauthorized user to remove a token (USX) from the database / removeTokenFromDatabase()', async () => {
                await assert.rejects(async () => {
                    await removeTokenFromDatabase(tokenSwap, token, 1);
                }, {
                    name: 'Error',
                    message: (await err(2)).notAuthorized 
                });
            });

            it('should not allow to add a new token with an L1 address when the l1Check has been disabled / addTokenToDatabase() - changeL1Check()', async () => {
                await ozlDiamond.changeL1Check(false);

                tokenSwap = [
                    1,
                    0,
                    usdtAddrArb,
                    usdcAddr,
                    crv2PoolAddr
                ];
                token = [ tokensDatabaseL1.usdcAddr, usdcAddr ];
                await removeTokenFromDatabase(tokenSwap, token);
                
                await assert.rejects(async () => {
                    await addTokenToDatabase(tokenSwap, token);
                }, {
                    name: 'Error',
                    message: (await err(token[0])).l1TokenDisabled 
                });

                //Clean up
                await ozlDiamond.changeL1Check(true);
                await addTokenToDatabase(tokenSwap, token);
            });
        });
    });

    describe('ozExecutorFacet', async () => { 
        it('shout not allow an unauthorized user to run the function / updateExecutorState()', async () => {
            await assert.rejects(async () => {
                await ozlDiamond.updateExecutorState(evilAmount, deadAddr, 1, ops);
            }, {
                name: 'Error',
                message: (await err(callerAddr)).notAuthorized
            });
        });

        it('shout not allow an unauthorized user to run the function / executeFinalTrade()', async () => {
            evilSwapDetails = [0, 0, deadAddr, deadAddr, deadAddr];
            await assert.rejects(async () => {
                await ozlDiamond.executeFinalTrade(evilSwapDetails, 0, deadAddr, 2, ops);
            }, {
                name: 'Error',
                message: (await err(callerAddr)).notAuthorized
            });
        });

        it('shout not allow an unauthorized user to run the function / modifyPaymentsAndVolumeExternally()', async () => {
            await assert.rejects(async () => {
                await ozlDiamond.modifyPaymentsAndVolumeExternally(caller2Addr, evilAmount, 5, ops);
            }, {
                name: 'Error',
                message: (await err(callerAddr)).notAuthorized
            });
        });

        it('shout not allow an unauthorized user to run the function / transferUserAllocation()', async () => {
            await assert.rejects(async () => {
                await ozlDiamond.transferUserAllocation(deadAddr, deadAddr, evilAmount, evilAmount, 6, ops);
            }, {
                name: 'Error',
                message: (await err(callerAddr)).notAuthorized
            });
        });
    });

    describe('oz4626Facet', async () => { 
        it('shout not allow an unauthorized user to run the function / deposit()', async () => {
            await assert.rejects(async () => {
                await ozlDiamond.deposit(evilAmount, deadAddr, 0, ops);
            }, {
                name: 'Error',
                message: (await err(callerAddr)).notAuthorized
            });
        });

        it('shout not allow an unauthorized user to run the function / redeem()', async () => {
            await assert.rejects(async () => {
                await ozlDiamond.redeem(evilAmount, caller2Addr, caller2Addr, 3, ops);
            }, {
                name: 'Error',
                message: (await err(callerAddr)).notAuthorized
            });
        });
    });

    describe('oz20Facet', async () => { 
        it('shout not allow an unauthorized user to run the function / burn()', async () => {
            await assert.rejects(async () => {
                await ozlDiamond.burn(caller2Addr, evilAmount, 4, ops);
            }, {
                name: 'Error',
                message: (await err(callerAddr)).notAuthorized
            });
        });
    });

    describe('ozLoupeFacet', async () => {
        beforeEach(async () => {
            accountDetails = getAccData(callerAddr, tokensDatabaseL1.usdcAddr, defaultSlippage);
            await sendETH(accountDetails);
        });

        it('should get the amount in USD of Assets Under Management / getAUM()', async () => {
            const [ wethUM, valueUM]  = await ozlDiamond.getAUM(); 
            assert(formatEther(valueUM) > 0);
        });

        it('should get the total volume in ETH / getTotalVolumeInETH()', async () => {
            totalVolume = await ozlDiamond.getTotalVolumeInETH();
            assert(formatEther(totalVolume) > 0);
        });

        it('should get the total volume in USD / getTotalVolumeInUSD()', async () => {
            totalVolume = await ozlDiamond.getTotalVolumeInUSD();
            assert(formatEther(totalVolume) > 0);
        });

        it('should get the Ozel balance in ETH and USD / getOzelBalances()', async () => {
            const [ wethUserShare, usdUserShare ] = await ozlDiamond.getOzelBalances(callerAddr);
            assert(formatEther(wethUserShare) > 0);
            assert(formatEther(usdUserShare) > 0);
        });

        it("should get the protocol's fee / getProtocolFee()", async () => {
            const fee = await ozlDiamond.getProtocolFee();
            assert.equal(Number(fee), protocolFee);
        });

        it('should return the owner of the account / getUserByL1Account()', async () => {
            const owner = await ozlDiamond.getUserByL1Account(deadAddr);
            assert.equal(owner, callerAddr);
        });
    });

    describe('ozCutFacet', async () => {
        it('shout not allow an external user to call the function / setAuthorizedCaller()', async () => {
            await assert.rejects(async () => {
                await ozlDiamond.connect(signer2).setAuthorizedCaller(callerAddr, true, ops);
            }, {
                name: 'Error',
                message: (await err(2)).notAuthorized
            });
        });

        it('should allow the owner to add a new caller and run exchangeToAccountToken() / setAuthorizedCaller()', async () => {
            const caller2AliasAddr = '0x81aa7970c51812dc3a010c7d01b50e0d17dc8ad9';
            let value = parseEther('1');
            ops.value = value;
            ops.to = caller2AliasAddr;
            await signer1.sendTransaction(ops);
            delete ops.to;
            delete ops.value;
            value = parseEther('0.1');

            await assert.rejects(async () => {
                await sendETH(accountDetails, 1);
            }, {
                name: 'Error',
                message: (await err(caller2Addr)).notAuthorized
            });

            await ozlDiamond.setAuthorizedCaller(caller2Addr, true, ops);

            await hre.network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [caller2AliasAddr],
            });

            const caller2Alias = await hre.ethers.provider.getSigner(caller2AliasAddr);

            ops.value = value;
            await ozlDiamond.connect(caller2Alias).exchangeToAccountToken(accountDetails, value, deadAddr, ops);
            
            await hre.network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [caller2AliasAddr],
            });

            //Clean up
            delete ops.value;
        });
    });
});



/**
 * The test from below tests the stabilizing mechanism performed on updateIndex()
 * and balanceOf() which involves the main variable (Ozel Index) and its stabilizing
 * variables. 
 * 
 * It uses the ModExecutorFacet contract with hard-coded values in order to represent
 * a point in the future where the mechanism kicks in. 
 * 
 * The two main differences from the real implementation on ozExecutorFacet is on
 * line 133, 136 140 (from the Mod version) that uses much lower values in order to
 * show the workings of the mechanism.
 */
describe('Ozel Index', async function () { 
    this.timeout(100000000000000000000);

    before( async () => {
        const deployedVars = await deploy(); 
        ({
            deployedDiamond, 
            WETH,
            USDT,
            WBTC,
            USDC,
            MIM,
            FRAX,
            crvTri,
            callerAddr, 
            caller2Addr,
            ozlFacet,
            yvCrvTri
        } = deployedVars);
    
        getVarsForHelpers(deployedDiamond, ozlFacet);
        accountDetails = getAccData(callerAddr, tokensDatabaseL1.fraxAddr, defaultSlippage);

        abi = ['function updateExecutorState(uint256 amount_, address user_, uint256 lockNum_) external payable'];
        iface = new ethers.utils.Interface(abi);
        selector = iface.getSighash('updateExecutorState');

        ozlDiamond = await hre.ethers.getContractAt(diamondABI, deployedDiamond.address);
        signers = await hre.ethers.getSigners();

        for (let i=0; i < 4; i++) {
            await ozlDiamond.setAuthorizedCaller(await signers[i].getAddress(), true, ops);
        }
    });


    it('should successfully stabilize the index for OZL balances calculations / UpdateIndexV1 & balanceOf()', async () => {
        await replaceForModVersion('UpdateIndexV1', false, selector, accountDetails, false, true);
        
        accountDetails[1] = tokensDatabaseL1.usdcAddr;
        accounts = await hre.ethers.provider.listAccounts();

        for (let i=5; i < accounts.length; i++) {
            await signers[i].sendTransaction({
                to: accounts[4],
                value: parseEther('9999')
            });
        }

        const bal4 = formatEther(await signers[4].getBalance());

        for (let i=0; i < 4; i++) {
            const balQ = bal4 / 4;
            await signers[4].sendTransaction({
                to: accounts[i],
                value: parseEther(i === 3 ? (balQ - 1).toString() : balQ.toString())
            });
        }

        console.log('.');
        console.log('*** stabilization happens in tx #16 ***');
        console.log('calculating...');
        
        for (let i=0, j=0; i < 19; i++, j++) { 
            console.log('.');
            console.log(`tx #${i}`);

            if (j == 4) j = 0;
            accountDetails[0] = await signers[j].getAddress();

            if (j == 0) {
                await sendETH(accountDetails, j, 'ozel index test');
            } else {
                await sendETHWithAlias(accountDetails, j, ops, ozlDiamond);
            }

            ozelIndex = formatEther(await getOzelIndex());
            if (i === 0) higherIndex = ozelIndex;

            console.log('Ozel Index: ', ozelIndex); 

            a = await balanceOfOZL(accounts[0]); 
            console.log('OZL bal #0: ', a);
            b = await balanceOfOZL(accounts[1]);
            console.log('OZL bal #1: ', b);
            c = await balanceOfOZL(accounts[2]);
            console.log('OZL bal #2: ', c);
            d = await balanceOfOZL(accounts[3]);
            console.log('OZL bal #3: ', d);
            
            const total = a + b + c + d;
            console.log('TOTAL: ', total);

            regulatorCounter = await getRegulatorCounter();

            assert(total <= 100 && total >= 99.85);
            assert(ozelIndex > 0 && Number(ozelIndex) <= Number(higherIndex));
            assert(regulatorCounter < 2 && regulatorCounter >= 0);
        }
        delete ops.value;
    });
});



/**
 * It tests the anti-slippage system designed with try/catch blocks on the contracts
 * OZLFacet and ozExecutorFacet.
 * 
 * It uses the functions from TestingFunctions.sol
 */
describe('Anti-slippage system', async function () {
    this.timeout(1000000);

    before( async () => {
        const deployedVars = await deploy();
        ({
            deployedDiamond, 
            WETH,
            USDT,
            WBTC,
            USDC,
            MIM,
            FRAX,
            crvTri,
            callerAddr, 
            caller2Addr,
            ozlFacet,
            yvCrvTri
        } = deployedVars);
    
        getVarsForHelpers(deployedDiamond, ozlFacet);
        accountDetails = getAccData(callerAddr, tokensDatabaseL1.usdtAddr, defaultSlippage);

        abi = ['function exchangeToAccountToken(bytes,uint256,address) external payable'];
        iface = new ethers.utils.Interface(abi);
        selector = iface.getSighash('exchangeToAccountToken');

        ozlDiamond = await hre.ethers.getContractAt(diamondABI, deployedDiamond.address);
        await ozlDiamond.setAuthorizedCaller(callerAddr, true, ops);
    });

    describe('Modified OZLFacet', async () => {

        /** 
         * Changed the first slippage for type(uint).max in _swapsForBaseToken 
         * in order to provoke all trades to fail (due to slippage) and invoke
         * the last resort mechanism (send WETH back to user)
         */ 
        it('should replace swapsUserToken for V1 / SwapsForUserTokenV1', async () => {            
            ({ testingNum, balance: balanceWETH } = await replaceForModVersion('SwapsForUserTokenV1', true, selector, accountDetails, true));
            assert(formatEther(balanceWETH) > 0);  
            assert.equal(testingNum, 23);
        });


        /**
         * Added a condition so it failes the first attempt due to slippage
         * but makes the trade in the second.
         */
        it('should replace swapsUserToken for V2 / SwapsForUserTokenV2', async () => {            
            ({ testingNum, balance: balanceUSDT } = await replaceForModVersion('SwapsForUserTokenV2', true, selector, accountDetails));
            assert.equal(testingNum, 23);
            assert(balanceUSDT / 10 ** 6 > 0);

        });

        /**
         * Added a 2nd testVar that causes the 3rd swap attempt to fail. The 2nd
         * swap exchanged half of amountIn to token, and due to the failure on
         * the 3rd swap, the other half of amountIn was sent as WETH back to the user.
         */
        it('should replace swapsUserToken for V3 / SwapsForUserTokenV3', async () => {            
            balanceUSDTpre = (await USDT.balanceOf(callerAddr)) / 10 ** 6;
            balanceWETHpre = formatEther(await WETH.balanceOf(callerAddr));

            ({ testingNum, balance: balanceWETH } = await replaceForModVersion('SwapsForUserTokenV3', false, selector, accountDetails, true));
            balanceWETH = formatEther(balanceWETH);
            halfInitialTransferInUSDT = 255000 / 2;
            halfInitialTransferInWETH = 100 / 2;

            halfInitialTransferInUSDTWithSlippage = halfInitialTransferInUSDT + (halfInitialTransferInUSDT / defaultSlippage);

            balanceUSDTpost = (await USDT.balanceOf(callerAddr)) / 10 ** 6;
            balanceUSDTdiff = balanceUSDTpost - balanceUSDTpre;
            balanceWETHdiff = balanceWETH - balanceWETHpre;

            assert.equal(testingNum, 23);
            assert(
                balanceUSDTdiff > 0 && 
                ( balanceUSDTdiff < halfInitialTransferInUSDT || 
                    balanceUSDTdiff > halfInitialTransferInUSDT && balanceUSDTdiff < halfInitialTransferInUSDTWithSlippage )
            );
            assert(balanceWETHdiff > 0 && balanceWETHdiff < halfInitialTransferInWETH);
        });

        /**
         * Changed the slipppage amount for a type(uint).max condition so depositing
         * the dapp's fees failes and stores the fees into its own variable, which
         * are attempted to be deposited once again through any main action from
         * the app (deposit - withdraw).
         */
        it('should add failed fees to its own variable / DepositFeesInDeFiV1', async () => {            
            ({ testingNum } = await replaceForModVersion('DepositFeesInDeFiV1', false, selector, accountDetails));
            assert.equal(testingNum, 23);
        });

        /**
         * It deposits -in DeFi- the failedFees that weren't deposited in the prior test.
         */
        it('should deposit any failed fees found in the failedFees variable / DepositFeesInDeFiV1', async () => {            
            await replaceForModVersion('DepositFeesInDeFiV1', false, selector, accountDetails);
            receipt = await sendETH(accountDetails);
            assert.equal(getTestingNumber(receipt, true), 24);

            //Reverts to the original _depositFeesInDeFi()
            await replaceForModVersion(ozlFacet, false, selector, accountDetails, false, true);
        });
    });


    describe('Modified ozExecutorFacet', async () => {
        before( async () => {
            abi = ['function executeFinalTrade((int128 tokenIn, int128 tokenOut, address baseToken, address token, address pool) swapDetails_, uint256 userSlippage_, address user_, uint256 lockNum_) external payable'];
            iface = new ethers.utils.Interface(abi);
            selector = iface.getSighash('executeFinalTrade');
            accountDetails = getAccData(callerAddr, tokensDatabaseL1.usdcAddr, defaultSlippage);

            balanceUSDT = await USDT.balanceOf(callerAddr);
            balanceUSDC = await USDC.balanceOf(callerAddr);
            if (Number(balanceUSDT) > 0) await USDT.transfer(deadAddr, balanceUSDT);
            if (Number(balanceUSDC) > 0) await USDC.transfer(deadAddr, balanceUSDC);
        });

        /**
         * Changed slippage to type(uint).max in order to fail all trades and activate the last path
         */
        it("should send the funds to the user in their account token's swap's baseToken / ExecutorFacetV1", async () => {            
            balanceUSDT = await USDT.balanceOf(callerAddr);
            assert.equal(balanceUSDT / 10 ** 8, 0);

            ({ testingNum, balance: balanceUSDT } = await replaceForModVersion('ExecutorFacetV1', false, selector, accountDetails, false));
            balanceUSDC = (await USDC.balanceOf(callerAddr)) / 10 ** 8;
            assert.equal(testingNum, 23);
            
            assert(balanceUSDT / 10 ** 8 > 0);
            assert.equal(balanceUSDC, 0);

            //Clean up
            await USDT.transfer(caller2Addr, balanceUSDT);
        });

        /**
         * Added an slippage condition so it fails the 1st attempt and activates the slippage mechanism.
         * All funds are in account token through two swaps
         */
        it('should send the account token to the user in the 2nd loop iteration / ExecutorFacetV2', async () => {            
            balanceUSDC = (await USDC.balanceOf(callerAddr)) / 10 ** 8;
            assert.equal(balanceUSDC, 0);

            ({ testingNum, balance: balanceUSDC } = await replaceForModVersion('ExecutorFacetV2', false, selector, accountDetails, 3));
            assert.equal(testingNum, 23);

            balanceUSDC = await USDC.balanceOf(callerAddr);
            assert(balanceUSDC / 10 ** 8 > 0);
            await USDC.transfer(caller2Addr, balanceUSDC);
        });


        /**
         * Fails the 1st and 3rd swapping attempts so half of the user's funds are traded in account token
         * and the other half in the baseToken.
         */
        it('should divide the funds between baseToken and account token / ExecutorFacetV3', async () => {            
            balanceUSDC = (await USDC.balanceOf(callerAddr)) / 10 ** 8;
            assert(balanceUSDC < 0.000001);

            balanceUSDT = (await USDT.balanceOf(callerAddr)) / 10 ** 8;
            assert.equal(balanceUSDT, 0);

            ({ testingNum, balance: balanceUSDC, receipt } = await replaceForModVersion('ExecutorFacetV3', false, selector, accountDetails, 5));
            assert.equal(testingNum, 23);

            testingNum = getTestingNumber(receipt, true);
            assert.equal(testingNum, 24);

            balanceUSDT = await USDT.balanceOf(callerAddr);
            assert(balanceUSDC / 10 ** 8 > 0);
            assert(balanceUSDT / 10 ** 8 > 0);
        }); 


        /**
         * Changed slippage to type(uint).max in order to fail all trades and activate the last path
         * (2nd leg for non-BTC-2Pool coins)
         */
        it('should swap the funds to account token only / ExecutorFacetV4', async () => {   
            accountDetails = getAccData(callerAddr, tokensDatabaseL1.mimAddr, defaultSlippage);
            
            ({ testingNum, balance: balanceUSDT } = await replaceForModVersion('ExecutorFacetV4', false, selector, accountDetails, false));
            assert.equal(testingNum, 23);
            assert(balanceUSDT > 0);
            await USDT.transfer(caller2Addr, balanceUSDT);
        });


        /**
         * Added an slippage condition so it fails the 1st attempt and activates the slippage mechanism.
         * All funds are in account token through two swaps (2nd leg for non-BTC-2Pool coins)
         */
        it('should send account token to the user in the 2nd loop iteration / ExecutorFacetV5', async () => {
            accountDetails = getAccData(callerAddr, tokensDatabaseL1.mimAddr, defaultSlippage);
            
            balanceMIM = formatEther(await MIM.balanceOf(callerAddr));
            assert.equal(balanceMIM, 0);

            ({ testingNum, balance: balanceMIM } = await replaceForModVersion('ExecutorFacetV5', false, selector, accountDetails, 3));
            assert.equal(testingNum, 23);
            assert(formatEther(balanceMIM) > 0);

            await MIM.transfer(caller2Addr, balanceMIM);
        });


        /**
         * Fails the 1st and 3rd swapping attempts so half of the user's funds are traded in account token
         * and the other half in the baseToken.
         */
        it('should divide the funds between baseToken and account token / ExecutorFacetV6', async () => {            
            accountDetails = getAccData(callerAddr, tokensDatabaseL1.mimAddr, defaultSlippage);
            balanceMIM = formatEther(await MIM.balanceOf(callerAddr));
            assert.equal(balanceMIM, 0);

            balanceUSDT = (await USDT.balanceOf(callerAddr)) / 10 ** 6;
            assert.equal(balanceUSDT, 0);

            ({ testingNum, balance: balanceMIM } = await replaceForModVersion('ExecutorFacetV6', false, selector, accountDetails, 3));
            assert.equal(testingNum, 23);
            assert(formatEther(balanceMIM) > 0);

            balanceUSDT = (await USDT.balanceOf(callerAddr)) / 10 ** 6;
            assert(balanceUSDT > 0);
        });
    });
});



/**
 * Tests the anti-slippage system used in RevenueFacet.sol
 */
describe('My Revenue', async function() {
    this.timeout(1000000);

    before( async () => {
        const deployedVars = await deploy(1);
        ({
            deployedDiamond, 
            WETH,
            USDT,
            WBTC,
            USDC,
            MIM,
            FRAX,
            crvTri,
            callerAddr, 
            caller2Addr,
            ozlFacet,
            yvCrvTri
        } = deployedVars);
    
        getVarsForHelpers(deployedDiamond, ozlFacet);
        accountDetails = getAccData(callerAddr, tokensDatabaseL1.fraxAddr, defaultSlippage);

        abi = ['function checkForRevenue() external payable'];
        iface = new ethers.utils.Interface(abi);
        selector = iface.getSighash('checkForRevenue');
        tricryptoCrv = await hre.ethers.getContractAt('IERC20', crvTricrypto);

        //Clean up from past tests
        balanceUSDC = await USDC.balanceOf(callerAddr);
        await USDC.transfer(deadAddr, balanceUSDC);

        ozlDiamond = await hre.ethers.getContractAt(diamondABI, deployedDiamond.address);
        await ozlDiamond.setAuthorizedCaller(callerAddr, true, ops);

        balanceWETH = await WETH.balanceOf(callerAddr);
        await WETH.transfer(deadAddr, balanceWETH);
    });

    afterEach(() => feesVaultFlag = true);


    it('should send the accrued revenue to the deployer in USDC / ComputeRevenueV1', async () => {
        balanceUSDC = await USDC.balanceOf(callerAddr) / 10 ** 6;
        assert.equal(balanceUSDC, 0);

        await replaceForModVersion('ComputeRevenueV1', false, selector, accountDetails);        
        receipt = await sendETH(accountDetails);

        testingNum = getTestingNumber(receipt);
        assert.equal(testingNum, 23);

        balanceUSDC = await USDC.balanceOf(callerAddr);
        assert(balanceUSDC / 10 ** 6 > 0);

        //Clean up
        await USDC.transfer(deadAddr, balanceUSDC); 
    }); 

    it('should send the accrued revenue to the deployer in tricrypto / ComputeRevenueV2', async () => {
        balanceTri = formatEther(await tricryptoCrv.balanceOf(callerAddr));
        assert.equal(balanceTri, 0);

        await replaceForModVersion('ComputeRevenueV2', false, selector, accountDetails, false, true);
       
        if (!feesVaultFlag) await sendETH(accountDetails);
        receipt = await sendETH(accountDetails);
        testingNum = getTestingNumber(receipt);
        assert.equal(testingNum, 23);

        balanceTri = await tricryptoCrv.balanceOf(callerAddr);
        assert(formatEther(balanceTri) > 0);

        //Clean up
        await tricryptoCrv.transfer(deadAddr, balanceTri);
    });

    it('should send the accrued revenue to the deployer in USDC in two txs / ComputeRevenueV3', async () => {
        balanceUSDC = await USDC.balanceOf(callerAddr) / 10 ** 6;
        assert.equal(balanceUSDC, 0);

        await replaceForModVersion('ComputeRevenueV3', false, selector, accountDetails, false, true);
        
        if (!feesVaultFlag) await sendETH(accountDetails);
        receipt = await sendETH(accountDetails);
        testingNum = getTestingNumber(receipt);
        assert.equal(testingNum, 23);

        balanceUSDC = await USDC.balanceOf(callerAddr);
        assert(balanceUSDC / 10 ** 6 > 0);

        //Clean up
        await USDC.transfer(deadAddr, balanceUSDC);
    });

    it('should send the accrued revenue to the deployer in tricrypto and WETH / ComputeRevenueV4', async () => {
        balanceWETH = await WETH.balanceOf(callerAddr);
        assert.equal(formatEther(balanceWETH), 0);
        balanceTri = await tricryptoCrv.balanceOf(callerAddr);
        assert.equal(formatEther(balanceTri), 0);

        await replaceForModVersion('ComputeRevenueV4', false, selector, accountDetails);
        
        if (!feesVaultFlag) await sendETH(accountDetails);
        receipt = await sendETH(accountDetails);
        testingNum = getTestingNumber(receipt);
        assert.equal(testingNum, 23);

        balanceWETH = await WETH.balanceOf(callerAddr);
        assert(formatEther(balanceWETH) > 0);
        balanceTri = await tricryptoCrv.balanceOf(callerAddr);
        assert(formatEther(balanceTri) > 0);

        //Clean up
        await WETH.transfer(deadAddr, balanceWETH);
    });

    it('should send the accrued revenue to deployer in WETH / SwapWETHforRevenueV1', async () => {
        balanceWETH = await WETH.balanceOf(callerAddr);
        assert.equal(formatEther(balanceWETH), 0); 

        if (!feesVaultFlag) await sendETH(accountDetails);
        ({ a, testingNum } = await replaceForModVersion('SwapWETHforRevenueV1', false, selector, accountDetails));
        assert.equal(testingNum, 23);

        balanceWETH = await WETH.balanceOf(callerAddr);
        assert(formatEther(balanceWETH) > 0);

        //Clean up
        await WETH.transfer(deadAddr, balanceWETH);
    });

    it('should send the accrued revenue to deployer in revenueToken (USDC) at the 2nd attempt / SwapWETHforRevenueV2', async () => {
        balanceUSDC = await USDC.balanceOf(callerAddr);
        assert.equal(balanceUSDC / 10 ** 6, 0);

        if (!feesVaultFlag) await sendETH(accountDetails);
        await replaceForModVersion('SwapWETHforRevenueV2', false, selector, accountDetails);
        receipt = await sendETH(accountDetails);
        testingNum = getTestingNumber(receipt);
        assert.equal(testingNum, 23);

        balanceUSDC = await USDC.balanceOf(callerAddr);
        assert(balanceUSDC / 10 ** 6 > 0);

        //Clean up
        await USDC.transfer(deadAddr, balanceUSDC);
    });

    it('should send the accrued revenue to deployer in both USDC and WETH / SwapWETHforRevenueV3', async () => {
        balanceUSDC = await USDC.balanceOf(callerAddr);
        assert.equal(balanceUSDC / 10 ** 6, 0);

        balanceWETH = await WETH.balanceOf(callerAddr);
        assert.equal(formatEther(balanceWETH), 0); 

        if (!feesVaultFlag) await sendETH(accountDetails);
        ({ testingNum } = await replaceForModVersion('SwapWETHforRevenueV3', false, selector, accountDetails));
        assert.equal(testingNum, 23);

        balanceUSDC = await USDC.balanceOf(callerAddr);
        assert(balanceUSDC / 10 ** 6 > 0);

        balanceWETH = await WETH.balanceOf(callerAddr);
        assert(formatEther(balanceWETH) > 0);
    });

    it('should not call filterRevenueCheck / _filterRevenueCheck()', async () => {
        await replaceForModVersion('FilterRevenueCheckV1', false, selector, accountDetails, false, true);
        owner = await ozlDiamond.owner();
        assert.equal(owner, callerAddr);
    });
});