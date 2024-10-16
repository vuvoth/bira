// @eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nochec
import { DWalletClient, SuiHTTPTransport } from '@dwallet-network/dwallet.js/client';
import { Ed25519Keypair } from '@dwallet-network/dwallet.js/keypairs/ed25519';
import { approveAndSign, createDWallet, createSignMessages } from "@dwallet-network/dwallet.js/signature-mpc";

import * as varuint from 'varuint-bitcoin'
import { requestSuiFromFaucetV0 as requestDwltFromFaucetV0 } from '@dwallet-network/dwallet.js/faucet';



import { fromB64 } from '@dwallet-network/dwallet.js/utils';


import { sha256 } from "@noble/hashes/sha256";

// Importing the bitcoin lib

import * as bitcoin from 'bitcoinjs-lib';


// @ts-ignore
import { BufferWriter } from 'bitcoinjs-lib/src/bufferutils';

import "dotenv/config"
import axios from 'axios';

const PK = process.env.PK


// const client = new DWalletClient({ url: 'https://fullnode.alpha.testnet.dwallet.cloud' });

const keyArray = Uint8Array.from(Array.from(fromB64(PK as string)));

const keyPair = Ed25519Keypair.fromSecretKey(keyArray);



const client = new DWalletClient({
	transport: new SuiHTTPTransport({
		url: "https://fullnode.alpha.testnet.dwallet.cloud",
	}),
});

const TESTNET = bitcoin.networks.testnet

console.log(keyPair.toSuiAddress())

async function fund() {
	const response = await requestDwltFromFaucetV0({
		// connect to Testnet
		host: 'http://faucet.alpha.testnet.dwallet.cloud/gas',
		recipient: keyPair.toSuiAddress(),
	});

	console.log(response);

}

function varSliceSize(someScript: Buffer): number {
  const length = someScript.length;
  console.log(varuint)
	return varuint.encodingLength(length) + length;
}

function txBytesToSign(
	tx: bitcoin.Transaction,
	inIndex: number,
	prevOutScript: Buffer,
	value: number,
	hashType: number,
): Buffer {
	const ZERO: Buffer = Buffer.from(
		'0000000000000000000000000000000000000000000000000000000000000000',
		'hex',
	);

	let tbuffer: Buffer = Buffer.from([]);
	let bufferWriter: BufferWriter;

	let hashOutputs = ZERO;
	let hashPrevouts = ZERO;
	let hashSequence = ZERO;

	if (!(hashType & bitcoin.Transaction.SIGHASH_ANYONECANPAY)) {
		tbuffer = Buffer.allocUnsafe(36 * tx.ins.length);
		bufferWriter = new BufferWriter(tbuffer, 0);

		tx.ins.forEach(txIn => {
			bufferWriter.writeSlice(txIn.hash);
			bufferWriter.writeUInt32(txIn.index);
		});

		hashPrevouts = Buffer.from(sha256(sha256(tbuffer)));
	}

	if (
		!(hashType & bitcoin.Transaction.SIGHASH_ANYONECANPAY) &&
		(hashType & 0x1f) !== bitcoin.Transaction.SIGHASH_SINGLE &&
		(hashType & 0x1f) !== bitcoin.Transaction.SIGHASH_NONE
	) {
		tbuffer = Buffer.allocUnsafe(4 * tx.ins.length);
		bufferWriter = new BufferWriter(tbuffer, 0);

		tx.ins.forEach(txIn => {
			bufferWriter.writeUInt32(txIn.sequence);
		});

		hashSequence = Buffer.from(sha256(sha256(tbuffer)));
	}

	if (
		(hashType & 0x1f) !== bitcoin.Transaction.SIGHASH_SINGLE &&
		(hashType & 0x1f) !== bitcoin.Transaction.SIGHASH_NONE
	) {
		const txOutsSize = tx.outs.reduce((sum, output) => {
			return sum + 8 + varSliceSize(output.script as Buffer);
		}, 0);

		tbuffer = Buffer.allocUnsafe(txOutsSize);
		bufferWriter = new BufferWriter(tbuffer, 0);

		tx.outs.forEach(out => {
			bufferWriter.writeUInt64(out.value);
			bufferWriter.writeVarSlice(out.script);
		});

		hashOutputs = Buffer.from(sha256(sha256(tbuffer)));
	} else if (
		(hashType & 0x1f) === bitcoin.Transaction.SIGHASH_SINGLE &&
		inIndex < tx.outs.length
	) {
		const output = tx.outs[inIndex];

		tbuffer = Buffer.allocUnsafe(8 + varSliceSize(output.script as Buffer));
		bufferWriter = new BufferWriter(tbuffer, 0);
		bufferWriter.writeUInt64(output.value);
		bufferWriter.writeVarSlice(output.script);

		hashOutputs = Buffer.from(sha256(sha256(tbuffer)));
	}

	tbuffer = Buffer.allocUnsafe(156 + varSliceSize(prevOutScript));
	bufferWriter = new BufferWriter(tbuffer, 0);

	const input = tx.ins[inIndex];
	bufferWriter.writeInt32(tx.version);
	bufferWriter.writeSlice(hashPrevouts);
	bufferWriter.writeSlice(hashSequence);
	bufferWriter.writeSlice(input.hash);
	bufferWriter.writeUInt32(input.index);
	bufferWriter.writeVarSlice(prevOutScript);
	bufferWriter.writeUInt64(value);
	bufferWriter.writeUInt32(input.sequence);
	bufferWriter.writeSlice(hashOutputs);
	bufferWriter.writeUInt32(tx.locktime);
	bufferWriter.writeUInt32(hashType);

	return tbuffer;
}
// Getting the unspent transaction output for a given address
async function getUTXO(address: string): Promise<{ utxo: any; txid: string; vout: number; satoshis: number; }> {
	const utxoUrl = `https://blockstream.info/testnet/api/address/${address}/utxo`;
	const { data: utxos } = await axios.get(utxoUrl);

	if (utxos.length === 0) {
		throw new Error('No UTXOs found for this address');
	}

	// Taking the first unspent transaction. 
	// You can change and return them all and to choose or to use more than one input.
	const utxo = utxos[0];
	const txid = utxo.txid;
	const vout = utxo.vout;
	const satoshis = utxo.value;

	return { utxo: utxo, txid: txid, vout: vout, satoshis: satoshis }
}


function GetWallet() {

  let dwalletId = process.env.DWALLET_ID;
  let dwalletCapId = process.env.DWALLET_CAP_ID;
  let dkgOutputBase64 = process.env.DKG;
  let dkgOutput = Array.from(fromB64(dkgOutputBase64 as string));
  
  return {
    dwalletId: dwalletId as string,
    dwalletCapId: dwalletCapId as string,
    dkgOutput,
  }
}


async function createMyWallet() {

  const dkg = await createDWallet(keyPair, client);
  
  console.log(dkg?.dwalletId, dkg?.dwalletCapId, Buffer.from(dkg?.dkgOutput).toString('base64'));
}

async function main() {
  const {dwalletId, dwalletCapId, dkgOutput} = GetWallet()
	const dwallet = await client.getObject({ id: dwalletId as string, options: { showContent: true } });
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
		const recipientAddress = 'tb1qq9vszma8lcnj22s8p9j98gyhw93pf4d0tcmm5n';
		const amount = 500; // Put any number you want to send in satoshis

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
		const fee = 150; // 1000 satoshis is a simple fee. Choose the value you want to spend
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
		const signMessagesIdSHA256 = await createSignMessages(dwalletId, dkgOutput, [hashToSign], "SHA256", keyPair, client);
		const sigSHA256 = await approveAndSign(dwalletCapId, signMessagesIdSHA256!, [hashToSign], keyPair, client);

		const dWalletSig = Buffer.from(sigSHA256?.signatures[0]!);

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
		} catch (error) {
			console.error('Error broadcasting transaction:', error);
		}
	}

}


// createMyWallet().then(() => {})
main().then(() => { })
