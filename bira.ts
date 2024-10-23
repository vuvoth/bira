// @eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nochec
import { DWalletClient, SuiHTTPTransport } from '@dwallet-network/dwallet.js/client';
import { Ed25519Keypair } from '@dwallet-network/dwallet.js/keypairs/ed25519';
import { approveAndSign, createDWallet, createPartialUserSignedMessages } from "@dwallet-network/dwallet.js/signature-mpc";

import { requestSuiFromFaucetV0 as requestDwltFromFaucetV0 } from '@dwallet-network/dwallet.js/faucet';


import { txBytesToSign, getUTXO } from './btcTx'
import { fromB64 } from '@dwallet-network/dwallet.js/utils';


import * as bitcoin from 'bitcoinjs-lib';

import { sha256 } from "@noble/hashes/sha256";


import "dotenv/config"
import axios from 'axios';
import { createPure } from '@dwallet-network/dwallet.js/dist/cjs/builder/pure';

const PK = process.env.PK


const keyArray = Uint8Array.from(Array.from(fromB64(PK as string)));

const keyPair = Ed25519Keypair.fromSecretKey(keyArray);


const client = new DWalletClient({
	transport: new SuiHTTPTransport({
		// url: 'http://fullnode.alpha.devnet.dwallet.cloud:9000',
		url: 'https://fullnode.alpha.testnet.dwallet.cloud',
		WebSocketConstructor: WebSocket as never,
	}),
});

const TESTNET = bitcoin.networks.testnet


function GetWallet() {

	let dwalletId = process.env.DWALLET_ID;
	let dwalletCapId = process.env.DWALLET_CAP_ID;
	let dkgOutputBase64 = process.env.DKG;
	let serectKeyShareBase64 = process.env.SK_SHARE;
	let dkgOutput = Array.from(fromB64(dkgOutputBase64 as string));
	let secretKeyShare = Array.from(fromB64(serectKeyShareBase64 as string))
	return {
		dwalletId: dwalletId as string,
		dwalletCapId: dwalletCapId as string,
		dkgOutput,
		secretKeyShare
	}
}



async function main() {
	const { dwalletId, dwalletCapId, dkgOutput, secretKeyShare } = GetWallet()
	const dwallet = await client.getObject({ id: dwalletId as string, options: { showContent: true } });

	console.log(dwallet);
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
		// The recipient address is also a bitcoin testnet address. 
		// You can generate it in the same way we created the dWallet's 
		// address by providing it's own key pair.
		const recipientAddress = 'tb1q96dckqd5dgf7094whlr2zs9hyep36jg8a7uquz';
		const amount = 300; // Put any number you want to send in satoshis

		// Get the UTXO for the sender address
		const { utxo, txid, vout, satoshis } = await getUTXO(address);

	
		const psbt = new bitcoin.Psbt({ network: TESTNET });

		// Add the input UTXO
		psbt.addInput({
			hash: txid,
			index: vout,
			witnessUtxo: {
				script: output,
				value: BigInt(satoshis),
			},
		});

		// Add the recipient output
		psbt.addOutput({
			address: recipientAddress,
			value: BigInt(amount),
		});

		// Calculate change and add change output if necessary
		const fee = 10 // 1000 satoshis is a simple fee. Choose the value you want to spend
		const change = satoshis - amount - fee;

		// Sending the rest to the back to the sender
		if (change > 0) {
			psbt.addOutput({
				address,
				value: BigInt(change),
			});
		}

		const tx = bitcoin.Transaction.fromBuffer(psbt.data.getTransaction());

		const signingScript = bitcoin.payments.p2pkh({ hash: output.slice(2) }).output!;
		console.log("Signing script:", signingScript.toString());

		const bytesToSign = txBytesToSign(tx, 0, signingScript as Buffer, satoshis, bitcoin.Transaction.SIGHASH_ALL);

		// We calculate the hash to sign manually because the dWallet Network doesn't support this bitcoin hashing algorithm yet.
		// This will be fixed in the following issue: https://github.com/dwallet-labs/dwallet-network/issues/161.
		const hashToSign = sha256(bytesToSign);
		const signMessagesIdSHA256 = await createPartialUserSignedMessages(dwalletId, dkgOutput, new Uint8Array(secretKeyShare!), [hashToSign], "SHA256", keyPair, client);
		const sigSHA256 = await approveAndSign(dwalletCapId, signMessagesIdSHA256!, [hashToSign], dwalletId, 'SHA256', keyPair, client);

		
		const dWalletSig = Buffer.from(sigSHA256[0] as any);

		// To put the signature in the transaction, we get the calculated witness and set it as the input witness
		const witness = bitcoin.payments.p2wpkh({
			output: output,
			pubkey: dWalletPubkey,
			signature: bitcoin.script.signature.encode(dWalletSig, bitcoin.Transaction.SIGHASH_ALL),
		}).witness!;

		// Set the witness of the first input (in our case we only have one)
		tx.setWitness(0, witness);

		const txHex = tx.toHex();
		// Broadcast the transaction
		const broadcastUrl = `https://blockstream.info/testnet/api/tx`;
		try {
			const response = await axios.post(broadcastUrl, txHex);
		  console.log('Transaction Broadcasted:', response.data);
		  return 0;
		} catch (error) {
		  console.error('Error broadcasting transaction:', error);
		  return 0;
		}
	}

}


main().then(() => { })
