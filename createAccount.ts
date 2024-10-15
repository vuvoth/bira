// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nochec

import { DWalletClient, SuiHTTPTransport } from '@dwallet-network/dwallet.js/client';
import { Ed25519Keypair } from '@dwallet-network/dwallet.js/keypairs/ed25519';
import { createDWallet } from "@dwallet-network/dwallet.js/signature-mpc";


import { requestSuiFromFaucetV0 as requestDwltFromFaucetV0 } from '@dwallet-network/dwallet.js/faucet';



import { fromB64 } from '@dwallet-network/dwallet.js/utils';


import { sha256 } from "@noble/hashes/sha256";

// Importing the bitcoin lib
import * as bitcoin from 'bitcoinjs-lib';


import "dotenv/config"

const PK = process.env.PK


// const client = new DWalletClient({ url: 'https://fullnode.alpha.testnet.dwallet.cloud' });

const keyArray = Uint8Array.from(Array.from(fromB64(PK as string)));

const keyPair = Ed25519Keypair.fromSecretKey(keyArray);



const client = new DWalletClient({
	transport: new SuiHTTPTransport({
		url: "https://fullnode.alpha.testnet.dwallet.cloud",
	}),
});

const TESTNET =  bitcoin.networks.testnet

console.log(keyPair.toSuiAddress())

async function fund() {
	const response = await requestDwltFromFaucetV0({
		// connect to Testnet
		host: 'http://faucet.alpha.testnet.dwallet.cloud/gas',
		recipient: keyPair.toSuiAddress(),
	});

	console.log(response);

}

async function main() {
	const dkg = await createDWallet(keyPair, client);
  
  
	const dwallet = await client.getObject({ id: dkg?.dwalletId as string, options: { showContent: true } });
	if (dwallet?.data?.content?.dataType == 'moveObject') {
		// Get the dWallet's public key
		// @ts-ignore
		const dWalletPubkey = Buffer.from(dwallet?.data?.content?.fields['public_key']);

		// Getting the Bitcoin Testnet address and the output 
		const address = bitcoin.payments.p2wpkh({ pubkey: dWalletPubkey, network: TESTNET }).address!;
		const output = bitcoin.payments.p2wpkh({ pubkey: dWalletPubkey, network: TESTNET }).output!;

		console.log("The Bitcoin Testnet address of the dWallet is", address);
		console.log("The Bitcoin Testnet output of the dWallet is", output);


		// The rest of the code will be shown in the next steps 
	}

}

main().then(() => { })
