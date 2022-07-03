// TonWeb is JavaScript SDK (Web and NodeJS) for TON

const TonWeb = require("tonweb");

// For calculations in the blockchain, we use BigNumber (BN.js). https://github.com/indutny/bn.js
// Don't use regular {Number} for coins, etc., it has not enough size and there will be loss of accuracy.

const BN = TonWeb.utils.BN;

// Blockchain does not operate with fractional numbers like `0.5`.
// `toNano` function converts TON to nanoton - smallest unit.
// 1 TON = 10^9 nanoton; 1 nanoton = 0.000000001 TON;
// So 0.5 TON is 500000000 nanoton

const toNano = TonWeb.utils.toNano;
const fromNano = TonWeb.utils.fromNano;

const init = async () => {
    const providerUrl = 'https://testnet.toncenter.com/api/v2/jsonRPC'; // TON HTTP API url. Use this url for testnet
    const apiKey = '6283e3289b031abaccff45dad6da451fd41adeb3367f44af184bf778bf3085b8'; // Obtain your API key in https://t.me/tontestnetapibot
    const tonweb = new TonWeb(new TonWeb.HttpProvider(providerUrl, {apiKey})); // Initialize TON SDK

    //----------------------------------------------------------------------
    // PARTIES
    // The payment channel is established between two participants A and B.
    // Each has own secret key, which he does not reveal to the other.

    // New secret key can be generated by `tonweb.utils.newSeed()`
    // tonweb.utils.newSeed(); // Uint8Array

    const seedA = TonWeb.utils.base64ToBytes('WFIYBf/byhLQuybaeEwhyFM7YFbcWxOoCfviff+B1K8='); // A's private (secret) key
    const keyPairA = tonweb.utils.keyPairFromSeed(seedA); // Obtain key pair (public key and private key)

    const seedB = TonWeb.utils.base64ToBytes('mQbes5CpgWSb2++4WG/sbhPWlFBJQH8gtxtmTxh5/Uo='); // B's private (secret) key
    const keyPairB = tonweb.utils.keyPairFromSeed(seedB); // Obtain key pair (public key and private key)

    // if you are new to cryptography then the public key is like a login, and the private key is like a password.
    // Login can be shared with anyone, password cannot be shared with anyone.

    // With a key pair, you can create a wallet.
    // Note that this is just an object, we are not deploying anything to the blockchain yet.
    // Transfer some amount of test coins to this wallet address (from your wallet app).
    // To check you can use blockchain explorer https://testnet.tonscan.org/address/<WALLET_ADDRESS>

    console.log()
    const walletA = tonweb.wallet.create({
        publicKey: keyPairA.publicKey
    });
    const walletAddressA = await walletA.getAddress(); // address of this wallet in blockchain
    console.log('walletAddressA = ', walletAddressA.toString(true, true, true));

    const walletB = tonweb.wallet.create({
        publicKey: keyPairB.publicKey
    });
    const walletAddressB = await walletB.getAddress(); // address of this wallet in blockchain
    console.log('walletAddressB = ', walletAddressB.toString(true, true, true));

    const walletBalanceA = await tonweb.getBalance(walletAddressA.toString(true, true, true))
    const walletBalanceB = await tonweb.getBalance(walletAddressB.toString(true, true, true))


    console.log()
    console.log('Original walletA balance: ',fromNano(walletBalanceA));
    console.log('Original walletB balance: ',fromNano(walletBalanceB));
    console.log()


    //----------------------------------------------------------------------
    // PREPARE PAYMENT CHANNEL

    // The parties agree on the configuration of the payment channel.
    // They share information about the payment channel ID, their public keys, their wallet addresses for withdrawing coins, initial balances.
    // They share this information off-chain, for example via a websocket.

    const channelInitState = {
        balanceA: toNano('9'), // A's initial balance in Toncoins. Next A will need to make a top-up for this amount
        balanceB: toNano('16'), // B's initial balance in Toncoins. Next B will need to make a top-up for this amount
        seqnoA: new BN(0), // initially 0
        seqnoB: new BN(0)  // initially 0
    };

    const channelConfig = {
        channelId: new BN(130),//new BN(~~(Date.now() / 1000)), // Channel ID, for each new channel there must be a new ID
        addressA: walletAddressA, // A's funds will be withdrawn to this wallet address after the channel is closed
        addressB: walletAddressB, // B's funds will be withdrawn to this wallet address after the channel is closed
        initBalanceA: channelInitState.balanceA,
        initBalanceB: channelInitState.balanceB
    }

    // Each on their side creates a payment channel object with this configuration

    const channelA = tonweb.payments.createChannel({
        ...channelConfig,
        isA: true,
        myKeyPair: keyPairA,
        hisPublicKey: keyPairB.publicKey,
    });
    const channelAddress = await channelA.getAddress(); // address of this payment channel smart-contract in blockchain
    console.log('channelAddress=', channelAddress.toString(true, true, true));

    const channelB = tonweb.payments.createChannel({
        ...channelConfig,
        isA: false,
        myKeyPair: keyPairB,
        hisPublicKey: keyPairA.publicKey,
    });

    if ((await channelB.getAddress()).toString() !== channelAddress.toString()) {
        throw new Error('Channels address not same');
    }

    // Interaction with the smart contract of the payment channel is carried out by sending messages from the wallet to it.
    // So let's create helpers for such sends.

    const fromWalletA = channelA.fromWallet({
        wallet: walletA,
        secretKey: keyPairA.secretKey
    });

    const fromWalletB = channelB.fromWallet({
        wallet: walletB,
        secretKey: keyPairB.secretKey
    });


    //----------------------------------------------------------------------
    // DEPLOY PAYMENT CHANNEL FROM WALLET A

    // Wallet A must have a balance.
    // 0.05 TON is the amount to execute this transaction on the blockchain. The unused portion will be returned.
    // After this action, a smart contract of our payment channel will be created in the blockchain.

    await fromWalletA.deploy().send(toNano('0.05'));

    // To check you can use blockchain explorer https://testnet.tonscan.org/address/<CHANNEL_ADDRESS>
    // We can also call get methods on the channel (it's free) to get its current data.


    // wait for state from Channel
    async function getStateDeploy() {
        console.log("Getting state after deploy...")

        didntGotState = true

        while (didntGotState) {
            try {
                const stateDeploy = await channelA.getChannelState();
                console.log("Got state!", stateDeploy)
                didntGotState = false
                return stateDeploy
            } catch {
                await new Promise((resolve) => setTimeout(() => resolve(), 5000))
            }
        }
    }

    let state = await getStateDeploy()
    console.log(state)


    // console.log(await channelA.getChannelState());
    let data = await channelA.getData();
    console.log('balanceA = ', data.balanceA.toString())
    console.log('balanceB = ', data.balanceB.toString())
    console.log('seqnoA', data.seqnoA.toString())
    console.log('seqnoB', data.seqnoA.toString())


    // TOP UP
    // Now each parties must send their initial balance from the wallet to the channel contract.

    // await fromWalletA
    //     .topUp({coinsA: channelInitState.balanceA, coinsB: new BN(0)})
    //     .send(channelInitState.balanceA.add(toNano('0.1'))); // +0.05 TON to network fees
    //
    // await fromWalletB
    //     .topUp({coinsA: new BN(0), coinsB: channelInitState.balanceB})
    //     .send(channelInitState.balanceB.add(toNano('0.05'))); // +0.05 TON to network fees

    // to check, call the get method - the balances should change

    // INIT
    // After everyone has done top-up, we can initialize the channel from any wallet

    await fromWalletA.init(channelInitState).send(toNano('0.06'));

    // await (async function repeat() {
    //     try {
    //         const state = await channelA.getChannelState();
    //         console.log(state)
    //     } catch (error) {
    //         setTimeout(() => {
    //             repeat()
    //         }, 1000)
    //     }
    // })()

    // wait for state from Channel
    async function getStateInit() {
        console.log("Getting state after Init...")

        didntGotState = true

        while (didntGotState) {
            try {
                const stateInit = await channelA.getChannelState();
                console.log("Got state:", stateInit)
                let data = await channelA.getData();
                console.log('balanceA = ', data.balanceA.toString())
                console.log('balanceB = ', data.balanceB.toString())
                if (stateInit === TonWeb.payments.PaymentChannel.STATE_OPEN) {
                    console.log("Got state!", stateInit)
                    didntGotState = false
                    return stateInit
                }
                await new Promise((resolve) => setTimeout(() => resolve(), 5000))
            } catch {
                await new Promise((resolve) => setTimeout(() => resolve(), 5000))
            }
        }
    }

    state = await getStateInit();
    console.log(state);




    // to check, call the get method - `state` should change to `TonWeb.payments.PaymentChannel.STATE_OPEN`

    //----------------------------------------------------------------------
    // FIRST OFFCHAIN TRANSFER - A sends 0.1 TON to B

    // A creates new state - subtracts 0.1 from A's balance, adds 0.1 to B's balance, increases A's seqno by 1
    data = await channelA.getData();
    BalA = data.balanceA.toString();
    BalB = data.balanceB.toString();
    segA = data.seqnoA.toString();
    segB = data.seqnoB.toString();

    console.log('balanceA = ', BalA);
    console.log('balanceB = ', BalB);
    console.log('seqnoA', segA);
    console.log('seqnoB', segB);


    // changeSum(5000);

    let amount = changeSum(5000);
    const int_finalBalanceA = new BN(BalA).sub(toNano(amount));
    const int_finalBalanceB = new BN(BalB).add(toNano(amount));

    function changeSum(currentSum) {
        let time = '60000';
        let payment = (currentSum/time);
        let timerId = setInterval(function() {
            if (currentSum > 0) {

                currentSum = currentSum - payment;

            }
            else if (currentSum == 0) {
                clearInterval(timerId);

            }
            console.log(currentSum);
        }, 60000);

    }

    const channelState1 = {
        balanceA: toNano(int_finalBalanceA.toString()),
        balanceB: toNano(int_finalBalanceB.toString()),
        seqnoA: new BN(segA) + new BN(1),
        seqnoB: new BN(segB) + new BN(1)
    };

    // A signs this state and send signed state to B (e.g. via websocket)

    const signatureA1 = await channelA.signState(channelState1);

    // B checks that the state is changed according to the rules, signs this state, send signed state to A (e.g. via websocket)

    if (!(await channelB.verifyState(channelState1, signatureA1))) {
        throw new Error('Invalid A signature');
    }
    const signatureB1 = await channelB.signState(channelState1);

    //----------------------------------------------------------------------
    // SECOND OFFCHAIN TRANSFER - A sends 0.2 TON to B

    // A creates new state - subtracts 0.2 from A's balance, adds 0.2 to B's balance, increases A's seqno by 1

    // const channelState2 = {
    //     balanceA: toNano('0.7'),
    //     balanceB: toNano('2.3'),
    //     seqnoA: new BN(2),
    //     seqnoB: new BN(0)
    // };
    //
    // // A signs this state and send signed state to B (e.g. via websocket)
    //
    // const signatureA2 = await channelA.signState(channelState2);
    //
    // // B checks that the state is changed according to the rules, signs this state, send signed state to A (e.g. via websocket)
    //
    // if (!(await channelB.verifyState(channelState2, signatureA2))) {
    //     throw new Error('Invalid A signature');
    // }
    // const signatureB2 = await channelB.signState(channelState2);
    //
    // //----------------------------------------------------------------------
    // // THIRD OFFCHAIN TRANSFER - B sends 1.1 TON TO A
    //
    // // B creates new state - subtracts 1.1 from B's balance, adds 1.1 to A's balance, increases B's seqno by 1
    //
    // const channelState3 = {
    //     balanceA: toNano('1.8'),
    //     balanceB: toNano('1.2'),
    //     seqnoA: new BN(2),
    //     seqnoB: new BN(1)
    // };
    //
    // // B signs this state and send signed state to A (e.g. via websocket)
    //
    // const signatureB3 = await channelB.signState(channelState3);
    //
    // // A checks that the state is changed according to the rules, signs this state, send signed state to B (e.g. via websocket)
    //
    // if (!(await channelA.verifyState(channelState3, signatureB3))) {
    //     throw new Error('Invalid B signature');
    // }
    // const signatureA3 = await channelA.signState(channelState3);

    //----------------------------------------------------------------------
    // So they can do this endlessly.
    // Note that a party can make its transfers (from itself to another) asynchronously without waiting for the action of the other side.
    // Party must increase its seqno by 1 for each of its transfers and indicate the last seqno and balance of the other party that it knows.

    //----------------------------------------------------------------------
    // CLOSE PAYMENT CHANNEL

    // The parties decide to end the transfer session.
    // If one of the parties disagrees or is not available, then the payment channel can be emergency terminated using the last signed state.
    // That is why the parties send signed states to each other off-chain.
    // But in our case, they do it by mutual agreement.

    // First B signs closing message with last state, B sends it to A (e.g. via websocket)

    const signatureCloseB = await channelB.signClose(channelState1);

    // A verifies and signs this closing message and include B's signature

    // A sends closing message to blockchain, payments channel smart contract
    // Payment channel smart contract will send funds to participants according to the balances of the sent state.

    if (!(await channelA.verifyClose(channelState1, signatureCloseB))) {
        throw new Error('Invalid B signature');
    }

    await fromWalletA.close({
        ...channelState1,
        hisSignature: signatureCloseB
    }).send(toNano('0.06'));


    // wait for state from Channel
    async function getStateFinal() {
        console.log("Getting state after Close...")

        didntGotState = true

        while (didntGotState) {
            try {
                const stateInit = await channelA.getChannelState();
                console.log("Got state:", stateInit)
                let data = await channelA.getData();
                console.log('balanceA = ', data.balanceA.toString())
                console.log('balanceB = ', data.balanceB.toString())
                segA = data.seqnoA.toString();
                segB = data.seqnoB.toString();
                console.log('seqnoA', segA);
                console.log('seqnoB', segB);
                if (stateInit === 0) {
                    console.log("Got state!", stateInit)
                    didntGotState = false
                    return stateInit
                }
                await new Promise((resolve) => setTimeout(() => resolve(), 5000))
            } catch {
                await new Promise((resolve) => setTimeout(() => resolve(), 5000))
            }
        }
    }

    state = await getStateFinal()
    console.log(state)

    data = await channelA.getData();
    BalA = data.balanceA.toString();
    BalB = data.balanceB.toString();
    segA = data.seqnoA.toString();
    segB = data.seqnoB.toString();

    console.log('balanceA = ', BalA);
    console.log('balanceB = ', BalB);
    console.log('seqnoA', segA);
    console.log('seqnoB', segB);

    console.log('End')
    }

init();