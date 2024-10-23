// @eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nochec
import { DWalletClient, SuiHTTPTransport } from '@dwallet-network/dwallet.js/client';
import { Ed25519Keypair } from '@dwallet-network/dwallet.js/keypairs/ed25519';

import {
    createDWallet,
    getOrCreateEncryptionKey,
    storeEncryptionKey,
    setActiveEncryptionKey,
    EncryptionKeyScheme,
    createActiveEncryptionKeysTable,
    createPartialUserSignedMessages,
    approveAndSign
} from "@dwallet-network/dwallet.js/signature-mpc";


import { requestSuiFromFaucetV0 as requestDwltFromFaucetV0 } from '@dwallet-network/dwallet.js/faucet';


import { txBytesToSign, getUTXO } from './btcTx'
import { fromB64 } from '@dwallet-network/dwallet.js/utils';


import * as bitcoin from 'bitcoinjs-lib';

import { sha256 } from "@noble/hashes/sha256";


import "dotenv/config"
import axios from 'axios';

const PK = process.env.PK


const keyArray = Uint8Array.from(Array.from(fromB64(PK as string)));

const keyPair = Ed25519Keypair.fromSecretKey(keyArray);



// const client = new DWalletClient({
// 	transport: new SuiHTTPTransport({
// 		url: "https://fullnode.alpha.testnet.dwallet.cloud",
// 	}),
// });

  const client = new DWalletClient({
        transport: new SuiHTTPTransport({
            // url: 'http://fullnode.alpha.devnet.dwallet.cloud:9000',
            url: 'https://fullnode.alpha.testnet.dwallet.cloud',
            WebSocketConstructor: WebSocket as never,
        }),
    });
const TESTNET = bitcoin.networks.testnet

// console.log(keyPair.toSuiAddress())

async function fund() {
	const response = await requestDwltFromFaucetV0({
		// connect to Testnet
		host: 'http://faucet.alpha.testnet.dwallet.cloud/gas',
		recipient: keyPair.toSuiAddress(),
	});

	console.log(response);

}


async function createMyWallet() {

    const encryptionKeysTable = await createActiveEncryptionKeysTable(client, keyPair);
    let activeEncryptionKeysTableID = encryptionKeysTable.objectId;
    let encryptionKeyObj = await getOrCreateEncryptionKey(keyPair, client, activeEncryptionKeysTableID,);

    const pubKeyRef = await storeEncryptionKey(
        encryptionKeyObj.encryptionKey,
        EncryptionKeyScheme.Paillier,
        keyPair,
        client,
    );
    await setActiveEncryptionKey(
        client,
        keyPair,
        pubKeyRef?.objectId!,
        activeEncryptionKeysTableID,
    );
  const dkg = await createDWallet(keyPair, client, encryptionKeyObj.encryptionKey, encryptionKeyObj.objectID);


  console.log(dkg);
  console.log(`PK=${PK}`)
  console.log(`DWALLET_ID=${dkg?.dwalletID}`);
  console.log(`DWALLET_CAP_ID=${dkg?.dwalletCapID}`);
  console.log(`DKG=${Buffer.from(dkg?.decentralizedDKGOutput as any[]).toString('base64')}`);
  console.log(`SK_SHARE=${Buffer.from(dkg?.secretKeyShare as any[]).toString('base64')}`);
}



createMyWallet().then(() => {})
